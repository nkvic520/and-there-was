import type { ArtSelection, SceneAsset } from '@and-there-was/scene';
type Api = <T>(path:string,body?:unknown)=>Promise<T>;
export async function artPicker(worldId:string, mount:HTMLElement, api:Api) {
  const health = await api<{imagesConfigured:boolean;mode:string}>('/api/health');
  const key = `art:${worldId}`;
  let selection:ArtSelection = {artSource:health.imagesConfigured && health.mode==='deepseek'?'seedream':'library',assetIds:[],allowUploadReferences:false};
  try { const saved=JSON.parse(localStorage.getItem(key)??'null'); if(saved && ['seedream','library'].includes(saved.artSource)) selection=saved; } catch { /* A previous tab's invalid preferences are optional. */ }
  let assets:SceneAsset[]=[];
  const trigger=document.createElement('button'); trigger.type='button'; trigger.id='art-trigger'; trigger.className='art-trigger'; mount.append(trigger);
  const dialog=document.createElement('dialog'); dialog.className='art-picker'; dialog.setAttribute('aria-label','画面素材');
  dialog.innerHTML=`<div class="art-heading"><div><h2>画面从哪里来？</h2><p>可以画一个新世界，也可以让自己的作品动起来。</p></div><button type="button" class="art-close" aria-label="完成素材选择">完成</button></div>
    <div class="art-options"><label><input type="radio" name="art-source" value="seedream" /> <strong>AI 画图</strong><span>Seedream 画角色与场景</span></label><label><input type="radio" name="art-source" value="library" /> <strong>素材／我的作品</strong><span>使用免费素材或上传图片</span></label></div>
    <p class="art-note"></p><p class="art-help">选中的图片会随下一句话加入世界。没有选图时，AI 会画新图；素材模式会从免费素材库挑选。</p>
    <div class="asset-grid" aria-label="可用素材"></div>
    <form class="upload-form"><h3>上传小朋友的作品</h3><p>原样保存。透明 PNG 适合角色；带纸张背景的画也可以作为整页作品。</p><label>选择图片<input type="file" accept="image/png,image/jpeg,image/webp" required /></label><div class="upload-fields"><label>作品名字<input name="name" maxlength="120" placeholder="例如：我画的小龙" required /></label><label>用作<select name="role"><option value="character">角色／贴纸</option><option value="background">背景</option><option value="illustration">整页画作</option></select></label><button type="submit">上传作品</button></div><small>PNG、JPEG、WebP，最大 8 MB。不自动改画或去掉纸张背景。</small></form>
    <label class="reference-consent" hidden><input type="checkbox" /> 允许把选中的上传作品发给 Seedream 作为参考图</label><p class="art-feedback" role="status"></p>`;
  document.body.append(dialog);
  const grid=dialog.querySelector<HTMLElement>('.asset-grid')!, note=dialog.querySelector<HTMLElement>('.art-note')!, feedback=dialog.querySelector<HTMLElement>('.art-feedback')!, consent=dialog.querySelector<HTMLLabelElement>('.reference-consent')!, consentInput=consent.querySelector<HTMLInputElement>('input')!;
  function save() {
    if(selection.artSource!=='seedream' || !assets.some(a=>a.source==='upload' && selection.assetIds?.includes(a.imageId))) selection.allowUploadReferences=false;
    localStorage.setItem(key,JSON.stringify(selection));
    trigger.textContent=`${selection.artSource==='seedream'?'✦ AI 画图':'▧ 素材／我的作品'}${selection.assetIds?.length?` · ${selection.assetIds.length} 张`:''} ▾`;
    for(const radio of dialog.querySelectorAll<HTMLInputElement>('[name="art-source"]')) radio.checked=radio.value===selection.artSource;
    note.textContent=selection.artSource==='seedream'?(health.imagesConfigured?'新图片由 Seedream 生成；已有角色只改动作时会复用图片。':'尚未配置图片模型，请在服务端配置后再使用。'): '免费素材来自 Kenney（CC0）；上传的作品不会发送给图片模型。';
    consent.hidden=selection.artSource!=='seedream' || !assets.some(a=>a.source==='upload' && selection.assetIds?.includes(a.imageId));
    consentInput.checked=!!selection.allowUploadReferences;
  }
  async function refresh() {
    assets=await api<SceneAsset[]>(`/api/worlds/${worldId}/images`);
    selection.assetIds=(selection.assetIds??[]).filter(id=>assets.some(a=>a.imageId===id));
    grid.replaceChildren();
    for(const asset of assets) {
      const label=document.createElement('label'); label.className='asset-card';
      const box=document.createElement('input'); box.type='checkbox'; box.value=asset.imageId; box.checked=selection.assetIds.includes(asset.imageId); box.setAttribute('aria-label',asset.name);
      const img=document.createElement('img'); img.src=`/api/images/${asset.hash}`; img.alt=''; img.loading='lazy';
      const name=document.createElement('span'); name.textContent=asset.name;
      const credit=document.createElement('small'); credit.textContent=asset.source==='free'?'Kenney · CC0':asset.source==='upload'?'我的作品':'Seedream';
      box.onchange=()=> { const ids=new Set(selection.assetIds); if(box.checked)ids.add(asset.imageId);else ids.delete(asset.imageId); if(ids.size>16){box.checked=false;feedback.textContent='一次最多选择 16 张图片';return;} selection.assetIds=[...ids];selection.allowUploadReferences=false;save(); };
      label.append(box,img,name,credit);grid.append(label);
    }
    save();
  }
  for(const radio of dialog.querySelectorAll<HTMLInputElement>('[name="art-source"]')) radio.onchange=()=>{selection.artSource=radio.value as ArtSelection['artSource']; selection.allowUploadReferences=false;save();};
  consentInput.onchange=()=>{selection.allowUploadReferences=consentInput.checked;save();};
  dialog.querySelector<HTMLButtonElement>('.art-close')!.onclick=()=>dialog.close();
  trigger.onclick=()=>{dialog.showModal();void refresh().catch(error=>{feedback.textContent=String(error);});};
  const form=dialog.querySelector<HTMLFormElement>('.upload-form')!, fileInput=form.querySelector<HTMLInputElement>('[type="file"]')!, name=form.querySelector<HTMLInputElement>('[name="name"]')!;
  fileInput.onchange=()=>{if(!name.value)name.value=(fileInput.files?.[0]?.name??'').replace(/\.[^.]+$/,'').slice(0,120);};
  form.onsubmit=event=>{
    event.preventDefault(); const file=fileInput.files?.[0]; if(!file)return;
    const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;feedback.textContent='正在保存作品…';
    void (async()=>{
      if(file.size>8*1024*1024)throw new Error('图片最大 8 MB');
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('图片无法读取'));r.readAsDataURL(file);});
      const asset=await api<SceneAsset>(`/api/worlds/${worldId}/images`,{name:name.value,role:form.querySelector<HTMLSelectElement>('[name="role"]')!.value,dataBase64:data});
      selection.artSource='library';selection.assetIds=[...(selection.assetIds??[]).slice(0,15),asset.imageId];selection.allowUploadReferences=false;
      await refresh();form.reset();feedback.textContent='作品已保存并选中，回到画布写一句话就能使用。';
    })().catch(error=>{feedback.textContent=error instanceof Error?error.message:String(error);}).finally(()=>{button.disabled=false;});
  };
  await refresh();
  return {selection:()=>structuredClone(selection)};
}
