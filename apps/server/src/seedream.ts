import {assert,type AssetRequest,type CanvasSize} from '@and-there-was/scene';

import { imagePrompt, requestImage, type ImageGenerator, type ImageArchive } from './image-provider';
export type { ImageGenerator } from './image-provider';

export class SeedreamGenerator implements ImageGenerator {
  readonly provider = 'seedream';
  readonly id:string;
  readonly configured:boolean;
  private endpoint:string;
  constructor(private options:{apiKey:string;model?:string;baseUrl?:string;size?:string;fetchImpl?:typeof fetch}){
    this.id=`seedream/${options.model??'doubao-seedream-5-5-261028'}`;
    this.configured=Boolean(options.apiKey.trim());
    this.endpoint=(options.baseUrl??'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/,'')+'/images/generations';
    const u=new URL(this.endpoint);
    assert(!u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))),'Image endpoint requires HTTPS');
  }
  async generate(request:AssetRequest,references:Buffer[],parent:AbortSignal,archive:ImageArchive,viewport?:CanvasSize){
    assert(this.configured,'请先在服务端 .env 配置 SEEDREAM_API_KEY 并重启服务。');
    const body={model:this.options.model??'doubao-seedream-5-5-261028',prompt:imagePrompt(request, viewport),size:this.options.size??'2K',response_format:'b64_json',output_format:'png',background:request.role==='character'?'transparent':'opaque',watermark:false,...(references.length?{image:references.map(b=>'data:image/png;base64,'+b.toString('base64'))}:{})};
    return requestImage(this.provider, this.id, this.endpoint, body, this.options.apiKey, parent, archive, this.options.fetchImpl ?? fetch);
  }
}
