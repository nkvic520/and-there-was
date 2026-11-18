import {beforeAll,afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../../apps/server/src/app';
import {DeepSeekGenerator} from '../../apps/server/src/deepseek';
import {SeedreamGenerator,type ImageGenerator} from '../../apps/server/src/seedream';
import {createEngine,executePackage} from '@and-there-was/scene/sandbox';
import {addCalendarMonths,hashBytes,type Candidate,type SceneAsset,type AssetRequest,type ArtSelection,type WorldSnapshot} from '@and-there-was/scene';
import {imageReply} from '../helpers/images';
import {streamReply} from '../helpers/interactive';

const png=readFileSync('fixtures/library/rabbit.png'), request:AssetRequest={id:'new_art',name:'测试插画',role:'character',prompt:'画一只兔子'};
let engine:Awaited<ReturnType<typeof createEngine>>, instances:Awaited<ReturnType<typeof createApp>>[]=[], directories:string[]=[];
beforeAll(async()=>{engine=await createEngine();});
afterEach(async()=>{
  for(const s of instances)await s.app.close();instances=[];
  for(const dir of directories){if(!resolve(dir).startsWith(resolve(tmpdir())+'\\and-there-was-images-')&&!resolve(dir).startsWith(resolve(tmpdir())+'/and-there-was-images-'))throw new Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}directories=[];
});
function fakeImages(onRequest?:(v:Record<string,unknown>)=>void) {
  return new SeedreamGenerator({apiKey:'private-test-image-key',fetchImpl:async(_url,init)=>{onRequest?.(JSON.parse(String(init?.body)));return Response.json({data:[{b64_json:png.toString('base64')}]});}});
}
async function setup(options:Partial<Parameters<typeof createApp>[0]>={}){
  const dir=options.dataDir??mkdtempSync(join(tmpdir(),'and-there-was-images-'));if(!options.dataDir)directories.push(dir);
  const instance=await createApp({...options,dataDir:dir});instances.push(instance);return instance;
}
async function waitFor(s:Awaited<ReturnType<typeof setup>>,turnId:string,status:string){
  for(let i=0;i<200;i++){const t=s.store.turn(turnId);if(t.status===status)return t;if(t.status==='failed'&&status!=='failed')throw new Error(s.store.attempt(t.attempt_id!).error!);await new Promise(r=>setTimeout(r,10));}throw new Error('Timed out');
}
async function commit(s:Awaited<ReturnType<typeof setup>>,c:Candidate){
  const output=await executePackage(engine,c.package,c.baseline.state,{migrate:true,previousProtocol:c.previousProtocol});
  return await s.service.trial({attemptId:c.attemptId,packageHash:c.packageHash,baseVersionId:c.baseVersionId,baseRevision:c.baseRevision,ok:true,output}) as WorldSnapshot;
}
const model=(reply:()=>string)=>new DeepSeekGenerator({apiKey:'private-test-text-key',fetchImpl:async()=>new Response(streamReply(reply()))});

it('normalizes orientation, strips metadata, preserves original bytes and serves same-origin images',async()=>{
  const s=await setup(),world=s.store.createWorld('animated');
  const original=await sharp({create:{width:240,height:400,channels:3,background:'#ff8844'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const response=await s.app.inject({method:'POST',url:`/api/worlds/${world.worldId}/images`,payload:{name:'我的画',role:'character',dataBase64:original.toString('base64')}});
  expect(response.statusCode).toBe(201);const a=response.json<SceneAsset>();
  expect([a.width,a.height]).toEqual([400,240]);expect(a.originalHash).toBe(hashBytes(original));expect(s.store.readBytes(a.originalHash)).toEqual(original);
  const meta=await sharp(s.store.readBytes(a.hash)).metadata();expect(meta.orientation).toBeUndefined();expect(meta.exif).toBeUndefined();
  const served=await s.app.inject(`/api/images/${a.hash}`);expect(served.headers['content-type']).toContain('image/png');expect(hashBytes(served.rawPayload)).toBe(a.hash);
  const download=await s.app.inject(`/api/images/${a.imageId}/original`);expect(download.rawPayload).toEqual(original);expect(download.headers['content-disposition']).toContain('.jpg');
  expect((await s.app.inject('/api/images/'+'0'.repeat(64))).statusCode).toBe(404);
});
it('rejects active formats, malformed images, pixel bombs and excessive uploads without saving them',async()=>{
  const s=await setup(),world=s.store.createWorld();
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>'),Buffer.from('not an image'),Buffer.alloc(8*1024*1024+1),await sharp({create:{width:4097,height:4097,channels:3,background:'#fff'}}).png().toBuffer()]) {
    await expect(s.images.add(bytes,{name:'bad',role:'character',source:'upload',credit:'test'},world.worldId)).rejects.toThrow();
  }
  expect(s.images.list(world.worldId).filter(a=>a.source==='upload')).toHaveLength(0);
});
it('uses uploaded artwork without image-model calls, and restores the same sprite/package after restart',async()=>{
  let calls=0;const s=await setup({imageGenerator:fakeImages(()=>calls++)}),world=s.store.createWorld('animated');
  const a=await s.images.add(png,{name:'上传验收图',role:'character',source:'upload',credit:'Kenney CC0 test'},world.worldId);
  const selection:ArtSelection={artSource:'library',assetIds:[a.imageId]},id=randomUUID(),turn=s.service.submit(world.worldId,id,'使用选中的素材',selection);
  expect(s.service.submit(world.worldId,id,'使用选中的素材',selection).id).toBe(turn.id);
  expect(()=>s.service.submit(world.worldId,id,'使用选中的素材',{...selection,assetIds:[]})).toThrow(/different text or images/);
  const ready=await waitFor(s,turn.id,'trial'),c=s.service.candidate(ready.attempt_id!),snapshot=await commit(s,c);
  expect(snapshot.operations[0]).toMatchObject({kind:'sprite',asset:a.id});expect(calls).toBe(0);
  const unknown=structuredClone(c.package);unknown.files['scene.js']=unknown.files['scene.js'].replace(a.id,'missing');
  const {sha256}=await import('@and-there-was/scene');unknown.hashes['scene.js']=await sha256(unknown.files['scene.js']);
  await expect(executePackage(engine,unknown,snapshot.state)).rejects.toThrow(/Unknown sprite asset/);
  await s.app.close();instances=instances.filter(i=>i!==s);const reopened=await setup({dataDir:s.store.directory});
  expect(reopened.store.world(world.worldId)).toEqual(snapshot);expect(reopened.store.readBytes(a.originalHash)).toEqual(png);
  expect(reopened.service.records(world.worldId).turns).toHaveLength(1);
});
it('prevents cross-world and forged image manifests',async()=>{
  const s=await setup(),a=s.store.createWorld(),b=s.store.createWorld();
  const img=await s.images.add(png,{name:'private',role:'character',source:'upload',credit:'test'},a.worldId);
  expect(()=>s.images.available(b.worldId,{assetIds:[img.imageId]})).toThrow(/不属于/);
  const pkg={assets:[img]} as Candidate['package'];expect(()=>s.images.verify(pkg,b.worldId)).toThrow(/belong/);
  expect(()=>s.images.verify({...pkg,assets:[{...img,source:'free'}]},a.worldId)).toThrow(/manifest/);
});
it('cooperates across text and image adapters, archives both requests, commits and reuses art on behavior changes',async()=>{
  let textCalls=0,imageCalls=0;
  const s=await setup({generator:model(()=>{textCalls++;return imageReply('animated',textCalls===1?[]:['new_art'],textCalls===1?[{...request,role:'background'}]:[]);}),imageGenerator:fakeImages(()=>imageCalls++)});
  const world=s.store.createWorld('animated'),selection:ArtSelection={artSource:'seedream',viewport:{width:1440,height:900}};
  const t=s.service.submit(world.worldId,randomUUID(),'小兔子',selection);const c=s.service.candidate((await waitFor(s,t.id,'trial')).attempt_id!);await commit(s,c);
  expect(c.package.assets[0].source).toBe('seedream');expect(imageCalls).toBe(1);
  const jobs=s.service.records(world.worldId).imageJobs as Record<string,string>[];expect(jobs).toHaveLength(1);
  expect(JSON.parse(s.store.read(jobs[0].request_hash)).body).toMatchObject({size:'2K', prompt:expect.stringContaining('1440x900 CSS pixels (landscape')});
  expect(s.store.read(jobs[0].request_hash)).toContain('b64_json');expect(s.store.read(jobs[0].response_hash)).toContain('b64_json');
  expect(s.store.read(jobs[0].request_hash)+s.store.read(jobs[0].response_hash)).not.toContain('private-test-image-key');
  const t2=s.service.submit(world.worldId,randomUUID(),'跳慢一点',selection);const c2=s.service.candidate((await waitFor(s,t2.id,'trial')).attempt_id!);await commit(s,c2);
  expect(c2.package.assets).toEqual(c.package.assets);expect(imageCalls).toBe(1);
  s.store.prune(addCalendarMonths(new Date(),4));
  expect(s.service.records(world.worldId).turns).toHaveLength(0);expect(s.service.records(world.worldId).imageJobs).toHaveLength(0);
  expect(s.store.readBytes(c.package.assets[0].hash)).toBeTruthy();expect(()=>s.store.read(jobs[0].request_hash)).toThrow(/not found/);
});
it('requires consent for the particular uploaded reference and never forwards free library images',async()=>{
  let received:Record<string,unknown>|undefined;
  const s=await setup({imageGenerator:fakeImages(v=>received=v)}),world=s.store.createWorld();
  const a=await s.images.add(png,{name:'upload',role:'character',source:'upload',credit:'test'},world.worldId),free=s.images.list(world.worldId).find(a=>a.source==='free')!;
  const run=(asset:SceneAsset,selection:ArtSelection)=>s.images.resolve([{...request,references:[asset.id]}],[asset],selection,world.worldId,'test-attempt',new AbortController().signal);
  await expect(run(a,{artSource:'seedream',assetIds:[a.imageId]})).rejects.toThrow(/未获准/);
  await expect(run(a,{artSource:'seedream',allowUploadReferences:true})).rejects.toThrow(/未获准/);
  await expect(run(free,{artSource:'seedream',allowUploadReferences:true,assetIds:[free.imageId]})).rejects.toThrow(/未获准/);
  expect(received).toBeUndefined();
  await run(a,{artSource:'seedream',allowUploadReferences:true,assetIds:[a.imageId]});
  expect(received?.image).toEqual(['data:image/png;base64,'+s.store.readBytes(a.hash).toString('base64')]);
  expect(s.store.readBytes(a.originalHash)).toEqual(png);
});
it('reuses an already generated image while repairing a failed script',async()=>{
  let calls=0,textCalls=0;
  const s=await setup({generator:model(()=>{textCalls++;const value=JSON.parse(imageReply('animated',textCalls===1?[]:['new_art'],textCalls===1?[request]:[]));if(textCalls===1)value.script=value.script.replace('"new_art"','"wrong_alias"');return JSON.stringify(value);}),imageGenerator:fakeImages(()=>calls++)}),world=s.store.createWorld('animated');
  const turn=s.service.submit(world.worldId,randomUUID(),'repair',{artSource:'seedream'}),c=s.service.candidate((await waitFor(s,turn.id,'trial')).attempt_id!);
  await expect(executePackage(engine,c.package,{}, {migrate:true})).rejects.toThrow('Unknown sprite asset');
  await s.service.trial({attemptId:c.attemptId,packageHash:c.packageHash,baseVersionId:c.baseVersionId,baseRevision:c.baseRevision,ok:false,error:"Unknown sprite asset 'wrong_alias', use 'new_art'"});
  s.service.retry(turn.id);const fixed=s.service.candidate((await waitFor(s,turn.id,'trial')).attempt_id!);await commit(s,fixed);
  expect(calls).toBe(1);expect(fixed.package.assets).toEqual(c.package.assets);
});
it('rejects image requests in library mode and more than two generated images before invoking provider',async()=>{
  let calls=0;const s=await setup({imageGenerator:fakeImages(()=>calls++)}),world=s.store.createWorld();
  await expect(s.images.resolve([request],[],{artSource:'library'},world.worldId,'test',new AbortController().signal)).rejects.toThrow(/不会调用/);
  await expect(s.images.resolve([request,request,request],[],{artSource:'seedream'},world.worldId,'test',new AbortController().signal)).rejects.toThrow(/最多/);expect(calls).toBe(0);
});
it('keeps the last valid scene when image generation fails and records a diagnostic',async()=>{
  let calls=0;const s=await setup({generator:model(()=>imageReply('animated',[],[{...request,id:'new_'+calls}])),imageGenerator:{id:'test/images',provider:'seedream',configured:true,generate:async(_r,_refs,_s,archive)=>{archive.response({error:'broken image'});if(calls++)throw new Error('image failed');return png;}}}),world=s.store.createWorld('animated');
  const first=s.service.submit(world.worldId,randomUUID(),'first',{artSource:'seedream'}),saved=await commit(s,s.service.candidate((await waitFor(s,first.id,'trial')).attempt_id!));
  const next=s.service.submit(world.worldId,randomUUID(),'second',{artSource:'seedream'});await waitFor(s,next.id,'failed');
  expect(s.store.world(world.worldId)).toEqual(saved);expect(s.service.records(world.worldId).attempts.at(-1)?.error).toContain('image failed');
  expect(s.service.records(world.worldId).imageJobs.at(-1)).toMatchObject({status:'failed'});
});
it('rejects changed image bytes at the commit gate and preserves the old snapshot',async()=>{
  const s=await setup(),world=s.store.createWorld('animated'),free=s.images.list(world.worldId)[0];
  const t=s.service.submit(world.worldId,randomUUID(),'使用选中的素材',{artSource:'library',assetIds:[free.imageId]});
  const c=s.service.candidate((await waitFor(s,t.id,'trial')).attempt_id!);
  writeFileSync(join(s.store.directory,'artifacts',free.hash),'corrupted');
  await expect(commit(s,c)).rejects.toThrow(/hash mismatch/);expect(s.store.world(world.worldId)).toEqual(world);
});
it('expires unused uploads while retaining current artwork and the bundled library',async()=>{
  const s=await setup(),world=s.store.createWorld('storybook'),unused=await s.images.add(await sharp(png).resize(80).png().toBuffer(),{name:'unused',role:'character',source:'upload',credit:'test'},world.worldId);
  s.store.prune(addCalendarMonths(new Date(),4));
  expect(s.images.list(world.worldId)).toHaveLength(9);expect(()=>s.store.readBytes(unused.originalHash)).toThrow(/not found/);
  expect(s.images.list(world.worldId).every(a=>a.source==='free')).toBe(true);
});
it('redacts provider failures, rejects missing configuration and cancels pending image requests',async()=>{
  const archives:unknown[]=[];
  const archive={request:(v:unknown)=>archives.push(v),response:(v:unknown)=>archives.push(v)};
  const failed=new SeedreamGenerator({apiKey:'secret-image-key',fetchImpl:async()=>new Response('secret-image-key',{status:401})});
  await expect(failed.generate(request,[],new AbortController().signal,archive)).rejects.toThrow('[REDACTED]');expect(JSON.stringify(archives)).not.toContain('secret-image-key');
  await expect(new SeedreamGenerator({apiKey:''}).generate(request,[],new AbortController().signal,archive)).rejects.toThrow('SEEDREAM_API_KEY');
  const controller=new AbortController(),pending=new SeedreamGenerator({apiKey:'test',fetchImpl:async(_url,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});
  const call=pending.generate(request,[],controller.signal,archive);controller.abort();await expect(call).rejects.toThrow(/中断/);
});
it('times out the entire image pipeline without creating a partial version',async()=>{
  const slow:ImageGenerator={id:'test/slow',provider:'seedream',configured:true,generate:async(_r,_refs,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}))};
  const s=await setup({generator:model(()=>imageReply('animated',[],[request])),imageGenerator:slow,generationTimeoutMs:40}),world=s.store.createWorld('animated');
  const t=s.service.submit(world.worldId,randomUUID(),'wait',{artSource:'seedream'});await waitFor(s,t.id,'failed');expect(s.store.world(world.worldId)).toEqual(world);expect(s.service.records(world.worldId).attempts[0].error).toContain('超时');
});

it('binds uploaded references to the named provider and preserves legacy Seedream consent',async()=>{
  let count=0;
  const imageGenerator:ImageGenerator={id:'openai/test-image',provider:'openai',configured:true,generate:async()=>{count++;return png;}};
  const s=await setup({imageGenerator}),world=s.store.createWorld('animated');
  const a=await s.images.add(png,{name:'Synthetic test',role:'character',source:'upload',credit:'fixture'},world.worldId);
  const selected={assetIds:[a.imageId],allowUploadReferences:true};
  const generate=(selection:ArtSelection)=>s.images.resolve([{...request,references:[a.id]}],[a],selection,world.worldId,'example',new AbortController().signal);
  for(const selection of [{...selected,artSource:'seedream' as const},{...selected,artSource:'ai' as const,referenceProvider:'seedream' as const},{...selected,artSource:'ai' as const}]) {
    await expect(generate(selection)).rejects.toThrow(/未获准/);
  }
  expect(count).toBe(0);
  const [saved]=await generate({...selected,artSource:'ai',referenceProvider:'openai'});
  expect(saved).toMatchObject({source:'openai',credit:'openai/test-image'});
  expect(s.service.records(world.worldId).imageJobs[0]).toMatchObject({generator_id:'openai/test-image'});
  const legacy={...a,source:'seedream' as const};
  await expect(s.images.resolve([{...request,references:[legacy.id]}],[legacy],{artSource:'ai'},world.worldId,'example',new AbortController().signal)).rejects.toThrow(/未获准/);
  expect(count).toBe(1);
});

it('reuses a paid first image when the second fails, and applies real-record retention to an OpenAI world',async()=>{
  let plans=0;
  const calls:string[]=[];
  const bg:AssetRequest={...request,id:'forest',role:'background',name:'Forest'};
  const actor:AssetRequest={...request,id:'fox'};
  const planner=model(()=>{plans++;return imageReply('animated',['forest','fox'],plans===1?[bg,actor]:[actor]);});
  const generator={id:'openai/test-scene',generate:planner.generate.bind(planner)};
  const s=await setup({generator,imageGenerator:{id:'openai/test-image',provider:'openai',configured:true,generate:async r=>{
    calls.push(r.id);if(calls.length===2)throw new Error('temporary failure');return png;
  }}});
  const world=s.store.createWorld('animated');
  const t=s.service.submit(world.worldId,randomUUID(),'森林',{artSource:'ai'});
  await waitFor(s,t.id,'failed');expect(s.store.world(world.worldId)).toEqual(world);
  s.service.retry(t.id);const c=s.service.candidate((await waitFor(s,t.id,'trial')).attempt_id!);const saved=await commit(s,c);
  expect(calls).toEqual(['forest','fox','fox']);expect(c.package.assets.map(a=>a.id)).toEqual(['forest','fox']);
  s.store.prune(addCalendarMonths(new Date(),4));const records=s.service.records(world.worldId);
  expect(records.turns).toEqual([]);expect(records.imageJobs).toEqual([]);expect(records.snapshot).toEqual(saved);
  expect(s.store.json(saved.packageHash!)).toEqual(c.package);
});

it('expires a fixture submission retried on a real provider after restarting the instance', async()=>{
  const first=await setup(), directory=first.store.directory, world=first.store.createWorld('animated');
  const t=first.service.submit(world.worldId,randomUUID(),'自由创作',{artSource:'library'});
  await waitFor(first,t.id,'failed');expect(first.store.turn(t.id).expires_at).toBeNull();
  await first.app.close();instances=instances.filter(s=>s!==first);
  const planner=model(()=>imageReply());
  const next=await setup({dataDir:directory,generator:{id:'openai/test',generate:planner.generate.bind(planner)}});
  next.service.retry(t.id);await commit(next,next.service.candidate((await waitFor(next,t.id,'trial')).attempt_id!));
  expect(next.store.turn(t.id).expires_at).toBe(addCalendarMonths(new Date(t.created_at),3).toISOString());
  next.store.prune(addCalendarMonths(new Date(),4));
  expect(next.service.records(world.worldId).turns).toHaveLength(0);
});
