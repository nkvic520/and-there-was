import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, type ScenePackage, type WorldSnapshot, type ArtSelection, type SceneAsset, type AssetRequest } from '@and-there-was/scene';
export type GenerationResult = ScenePackage & { assetIds?: string[]; assetRequests?: AssetRequest[] };
export interface GenerationContext {
  artSelection?: ArtSelection;
  availableAssets?: SceneAsset[];
  previousPackage?: ScenePackage;
  previousFailure?: { error: string; package?: ScenePackage; content?: string };
  signal: AbortSignal;
  request(value: unknown): void;
  chunk(text: string): void;
  response(value: unknown): void;
}
export interface Generator {
  readonly id: string;
  generate(text: string, baseline: WorldSnapshot, context?: GenerationContext): Promise<GenerationResult>;
}
export class FixtureGenerator implements Generator {
  readonly id = 'fixture/ball-v3';
  async generate(text: string, baseline?: WorldSnapshot, context?: GenerationContext): Promise<ScenePackage> {
    if (text.trim()==='使用选中的素材' && baseline?.mode && context?.availableAssets?.length) {
      const selected=context.availableAssets.filter(a=>context.artSelection?.assetIds?.includes(a.imageId));
      const assets=(selected.length?selected:[context.availableAssets[0]]).slice(0,4), mode=baseline.mode;
      const protocol={schemaVersion:4,mode,stateSchema:{type:'object',properties:{taps:{type:'integer',minimum:0,maximum:100000}},required:['taps'],additionalProperties:false},events:mode==='animated'?{tap:{type:'object',properties:{},additionalProperties:false}}:{}};
      const files={'protocol.json':JSON.stringify(protocol),'view.json':JSON.stringify({coordinates:'normalized',background:'#fcfaf5',mode}),
        'scene.js':`export function migrate(sdk){const s=sdk.getState();sdk.setState({taps:s.taps||0});}
export function mount(sdk){const images=${JSON.stringify(assets.map(a=>a.id))};const s=sdk.getState();images.forEach((asset,i)=>{const id='art_'+i;sdk.node({id,kind:'sprite',asset,x:images.length===1?.5:.3+(i%2)*.4,y:images.length<=2?.5:.3+Math.floor(i/2)*.4,width:images.length===1?.65:.35,height:images.length===1?.65:.35${mode==='animated'?",motionKey:String(s.taps),motions:[{duration:2,loop:'pingpong',frames:[{at:0,y:-.03},{at:1,y:.03}]},{duration:.7,loop:'once',frames:[{at:0,scaleX:1,scaleY:1},{at:.4,scaleX:1.1,scaleY:1.1},{at:1,scaleX:1,scaleY:1}]}]":""}});${mode==='animated'?"sdk.onTap(id,'tap',{});":""}});}
export function onEvent(sdk){const s=sdk.getState();s.taps=Math.min(100000,s.taps+1);sdk.setState(s);}`};
      const hashes:Record<string,string>={};for(const [name,content]of Object.entries(files))hashes[name]=await sha256(content);
      return {formatVersion:1,sdkVersion:4,entry:'scene.js',files,hashes,assets};
    }
    if (text.trim() !== '有一个球') throw new Error('样例暂时只支持「有一个球」，可以改好再发送。');
    const files: Record<string, string> = {}, hashes: Record<string, string> = {};
    for (const name of ['protocol.json', 'scene.js', 'view.json']) {
      files[name] = await readFile(resolve('fixtures/ball', name), 'utf8');
      hashes[name] = await sha256(files[name]);
    }
    if (baseline?.mode) {
      const protocol = JSON.parse(files['protocol.json']); protocol.schemaVersion = 3; protocol.mode = baseline.mode;
      files['protocol.json'] = JSON.stringify(protocol);
      files['scene.js'] = await readFile(resolve('fixtures', `${baseline.mode === 'animated' ? 'animated' : 'storybook'}-ball`, 'scene.js'), 'utf8');
      files['view.json'] = JSON.stringify({coordinates:'normalized',background:baseline.mode === 'storybook' ? '#fcfaf5' : '#ffffff',mode:baseline.mode});
      for (const [name,content] of Object.entries(files)) hashes[name] = await sha256(content);
      return { formatVersion:1,sdkVersion:3,entry:'scene.js',files,hashes,assets:[] };
    }
    return { formatVersion: 1, sdkVersion: 1, entry: 'scene.js', files, hashes, assets: [] };
  }
}
