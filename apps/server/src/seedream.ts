import {assert,type AssetRequest} from '@and-there-was/scene';

export interface ImageGenerator {
  readonly id:string;
  readonly configured:boolean;
  generate(request:AssetRequest,references:Buffer[],signal:AbortSignal,archive:{request(value:unknown):void;response(value:unknown):void}):Promise<Buffer>;
}
export class SeedreamGenerator implements ImageGenerator {
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
  async generate(request:AssetRequest,references:Buffer[],parent:AbortSignal,archive:{request(value:unknown):void;response(value:unknown):void}){
    assert(this.configured,'请先在服务端 .env 配置 SEEDREAM_API_KEY 并重启服务。');
    const body={model:this.options.model??'doubao-seedream-5-5-261028',prompt:request.prompt,size:this.options.size??'2K',response_format:'b64_json',output_format:'png',background:request.role==='character'?'transparent':'opaque',watermark:false,...(references.length?{image:references.map(b=>'data:image/png;base64,'+b.toString('base64'))}:{})};
    const redact=(s:string)=>s.replaceAll(this.options.apiKey,'[REDACTED]');
    archive.request({provider:this.id,endpoint:this.endpoint,body});
    const signal=AbortSignal.any([parent,AbortSignal.timeout(180000)]);
    let raw='',status:number|null=null;
    try{
      const response=await(this.options.fetchImpl??fetch)(this.endpoint,{method:'POST',headers:{Authorization:`Bearer ${this.options.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      status=response.status;assert(response.body,'Seedream 返回空响应');
      const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;
      try{while(true){const p=await reader.read();bytes+=p.value?.length??0;assert(bytes<=24*1024*1024,'图片响应过大');raw+=decoder.decode(p.value,{stream:!p.done});if(p.done)break;}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(!response.ok)throw new Error(`Seedream HTTP ${status}：${raw.slice(0,500)}`);
      const value=JSON.parse(raw);
      assert(Array.isArray(value.data)&&value.data.length===1&&typeof value.data[0].b64_json==='string','Seedream 未返回单张 base64 图片');
      const encoded=value.data[0].b64_json;
      assert(/^[A-Za-z0-9+/=\s]+$/.test(encoded),'无效的图片编码');
      return Buffer.from(encoded,'base64');
    }catch(error){throw new Error(redact(signal.aborted?'图片生成超时或中断，可以重试。':error instanceof Error?error.message:String(error)));}
    finally{archive.response({provider:this.id,status,body:redact(raw)});}
  }
}
export function configuredImageGenerator(){return new SeedreamGenerator({apiKey:process.env.SEEDREAM_API_KEY??'',baseUrl:process.env.SEEDREAM_BASE_URL,model:process.env.SEEDREAM_MODEL,size:process.env.SEEDREAM_SIZE});}
