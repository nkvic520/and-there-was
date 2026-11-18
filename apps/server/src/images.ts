import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {assert,usesImageModel,addCalendarMonths,canonical,validateAssets,type SceneAsset,type AssetRequest,type ArtSelection,type ImageRole,type ScenePackage} from '@and-there-was/scene';
import {Store,HttpError,now} from './store';
import type {ImageGenerator} from './image-provider';
import {SeedreamGenerator} from './seedream';

export class Images {
  constructor(readonly store:Store,readonly generator:ImageGenerator=new SeedreamGenerator({apiKey:''})){}
  async initialize(){
    this.store.db.prepare("UPDATE image_jobs SET status='interrupted',error='服务已重启，图片生成中断。' WHERE status='generating'").run();
    const path=resolve('fixtures/library/catalog.json');if(!existsSync(path))return;
    const items=JSON.parse(readFileSync(path,'utf8')) as {id:string;file:string;name:string;role:ImageRole;credit:string;sourceUrl:string}[];
    for(const item of items){
      if(this.store.db.prepare('SELECT 1 FROM images WHERE id=?').get(item.id))continue;
      assert(/^[\w-]+\.png$/.test(item.file),'Unsafe bundled image path');
      await this.add(readFileSync(resolve('fixtures/library',item.file)),{...item,source:'free',imageId:item.id},null);
    }
  }
  list(worldId:string):SceneAsset[]{
    this.store.world(worldId);
    return(this.store.db.prepare('SELECT metadata FROM images WHERE world_id=? OR world_id IS NULL ORDER BY created_at,id').all(worldId) as {metadata:string}[]).map(r=>JSON.parse(r.metadata));
  }
  async add(bytes:Buffer,info:{name:string;role:ImageRole;source:SceneAsset['source'];credit:string;sourceUrl?:string;imageId?:string},worldId:string|null):Promise<SceneAsset>{
    if(worldId)this.store.world(worldId);
    assert(bytes.length>0&&bytes.length<=(info.source==='openai'||info.source==='seedream'?16:8)*1024*1024,'图片超过大小限制');
    assert(typeof info.name==='string'&&info.name.trim().length>0&&info.name.length<=120,'请给作品起一个名字（120 字以内）');
    assert(['character','background','illustration'].includes(info.role),'Invalid image role');
    const input=sharp(bytes,{limitInputPixels:16_777_216,animated:false});
    const meta=await input.metadata();
    assert(['png','jpeg','webp'].includes(meta.format??'')&&(!meta.pages||meta.pages===1),'仅支持静态 PNG、JPEG、WebP 图片');
    const {data,info:normalized}=await input.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
    const imageId=info.imageId??randomUUID();
    const asset:SceneAsset={id:imageId,imageId,hash:this.store.put(data,'image/png'),originalHash:this.store.put(bytes,`image/${meta.format}`),mediaType:'image/png',width:normalized.width,height:normalized.height,name:info.name.trim(),role:info.role,source:info.source,credit:info.credit,...(info.sourceUrl?{sourceUrl:info.sourceUrl}:{})};
    validateAssets([asset]);
    this.store.db.prepare('INSERT INTO images(id,world_id,metadata,created_at,expires_at) VALUES (?,?,?,?,?)').run(imageId,worldId,canonical(asset),now(),worldId?addCalendarMonths(new Date(),3).toISOString():null);
    return asset;
  }
  available(worldId:string,selection:ArtSelection,previous?:ScenePackage,failedAssets:SceneAsset[]=[], turnId?:string){
    const catalog=this.list(worldId),selected=selection.assetIds??[];
    if(selected.some(id=>!catalog.some(a=>a.imageId===id)))throw new HttpError(400,'所选素材不属于当前世界');
    const images=selected.length?catalog.filter(a=>selected.includes(a.imageId)):usesImageModel(selection.artSource)?[]:catalog.filter(a=>a.source==='free');
    const map=new Map((previous?.assets??[]).map(a=>[a.id,a]));
    for(const a of failedAssets){this.verify({assets:[a]} as ScenePackage,worldId);if(!map.has(a.id))map.set(a.id,a);}
    if (turnId) {
      // A paid image can survive even when a later image, plan, or trial failed.
      const rows = this.store.db.prepare(`SELECT j.asset_alias, i.metadata FROM image_jobs j
        JOIN attempts a ON a.id=j.attempt_id JOIN images i ON i.id=j.image_id AND i.world_id=j.world_id
        WHERE a.turn_id=? AND j.world_id=? AND j.status='completed' AND j.asset_alias IS NOT NULL
        ORDER BY a.seq DESC, j.rowid DESC`).all(turnId,worldId) as {asset_alias:string; metadata:string}[];
      for (const row of rows) if (!map.has(row.asset_alias)) map.set(row.asset_alias,{...JSON.parse(row.metadata),id:row.asset_alias});
    }
    for(const a of images)if(!map.has(a.id))map.set(a.id,a);
    return Array.from(map.values());
  }
  verify(pkg:ScenePackage,worldId:string){
    for(const a of pkg.assets){
      const row=this.store.db.prepare('SELECT world_id,metadata FROM images WHERE id=?').get(a.imageId) as {world_id:string|null;metadata:string}|undefined;
      assert(row&&(row.world_id===null||row.world_id===worldId),'Image does not belong to world');
      const saved=JSON.parse(row.metadata) as SceneAsset;
      assert(canonical({...a,id:saved.id})===canonical(saved),'Image manifest does not match saved file');
      this.store.readBytes(a.hash);this.store.readBytes(a.originalHash);
    }
  }
  async resolve(requests:AssetRequest[],available:SceneAsset[],selection:ArtSelection,worldId:string,attemptId:string,signal:AbortSignal){
    assert(Array.isArray(requests)&&requests.length<=2,'每轮最多生成两张新图片');
    assert(!requests.length||usesImageModel(selection.artSource),'免费素材模式不会调用图片模型');
    const referenceProvider = selection.referenceProvider ?? (selection.artSource === 'seedream' ? 'seedream' : undefined);
    const uploadAllowed = selection.allowUploadReferences && referenceProvider === this.generator.provider;
    const seen=new Set(available.map(a=>a.id));
    for(const r of requests){
      assert(r&&typeof r.id==='string'&&/^[\w-]{1,80}$/.test(r.id)&&!seen.has(r.id),'New image ID must be unique');seen.add(r.id);
      assert(typeof r.name==='string'&&r.name.length<=120&&typeof r.prompt==='string'&&r.prompt.length>0&&r.prompt.length<=3000&&['character','background','illustration'].includes(r.role),'Invalid image request');
      assert(r.references===undefined||Array.isArray(r.references)&&r.references.length<=2,'Too many image references');
      for(const id of r.references??[]){const a=available.find(a=>a.id===id);assert(a,'Unknown image reference');assert(a.source===this.generator.provider||a.source==='upload'&&uploadAllowed&&selection.assetIds?.includes(a.imageId),'该素材未获准发送给图片模型');}
    }
    const produced:SceneAsset[]=[];
    for(const r of requests){
      signal.throwIfAborted();const jobId=randomUUID();
      this.store.db.prepare("INSERT INTO image_jobs(id,world_id,attempt_id,status,created_at,expires_at,generator_id,asset_alias) VALUES (?,?,?,'generating',?,?,?,?)").run(jobId,worldId,attemptId,now(),addCalendarMonths(new Date(),3).toISOString(),this.generator.id,r.id);
      this.store.event(worldId,'image.generating',{attemptId,imageJobId:jobId,name:r.name});
      try{
        const refs=(r.references??[]).map(id=>this.store.readBytes(available.find(a=>a.id===id)!.hash));
        const bytes=await this.generator.generate(r,refs,signal,{
          request:value=>{if(!signal.aborted)this.store.db.prepare('UPDATE image_jobs SET request_hash=? WHERE id=?').run(this.store.putJson(value),jobId);},
          response:value=>{if(this.store.db.open)this.store.db.prepare('UPDATE image_jobs SET response_hash=? WHERE id=?').run(this.store.putJson(value),jobId);}
        }, r.role === 'background' ? selection.viewport : undefined);
        signal.throwIfAborted();const image=await this.add(bytes,{name:r.name,role:r.role,source:this.generator.provider,credit:this.generator.id},worldId);
        this.store.db.prepare("UPDATE image_jobs SET status='completed',image_id=? WHERE id=?").run(image.imageId,jobId);
        produced.push({...image,id:r.id});
      }catch(error){if(this.store.db.open)this.store.db.prepare("UPDATE image_jobs SET status='failed',error=? WHERE id=?").run(error instanceof Error?error.message:String(error),jobId);throw error;}
    }
    return produced;
  }
}
