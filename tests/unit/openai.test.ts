import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePackage, type WorldSnapshot } from '@and-there-was/scene';
import { configuredProviders } from '../../apps/server/src/providers';
import type { GenerationContext } from '../../apps/server/src/generator';
import { OpenAIScene } from '../../apps/server/src/openai-scene';
import { OpenAIImage } from '../../apps/server/src/openai-image';
import { imageReply } from '../helpers/images';
import { responsesWire } from '../helpers/openai';

const key = 'synthetic-only-secret';
const world:WorldSnapshot = {worldId:'w',versionId:'v',parentVersionId:null,mode:'animated',revision:0,
  state:{},operations:[],packageHash:null,createdAt:'2026-11-18T00:00:00Z'};
const assets = {artSource:'ai' as const};
function trace() {
  const requests:unknown[]=[], responses:unknown[]=[], chunks:string[]=[];
  const context:GenerationContext={signal:new AbortController().signal,artSelection:assets, uiLocale:'zh-CN',
    request:v=>requests.push(v),response:v=>responses.push(v),chunk:s=>chunks.push(s)};
  return {requests,responses,chunks,context};
}

it('prefers the OpenAI project key for both roles, respects explicit fixtures and restores legacy configuration when removed',()=>{
  const legacy={DEEPSEEK_API_KEY:'text-key',SEEDREAM_API_KEY:'image-key'};
  for(const mode of ['auto','deepseek',undefined]) {
    const both=configuredProviders({...legacy,GENERATOR_MODE:mode,OPENAI_API_KEY:key});
    expect([both.generator.id,both.imageGenerator.id]).toEqual(['openai/gpt-6.2-sol','openai/gpt-image-2.5-sunburst']);
    expect(configuredProviders({...legacy,GENERATOR_MODE:mode}).imageGenerator.id).toContain('seedream/');
    expect(configuredProviders({...legacy,GENERATOR_MODE:mode}).generator.id).toContain('deepseek/');
  }
  const custom=configuredProviders({OPENAI_API_KEY:key,OPENAI_TEXT_MODEL:'test-scene',OPENAI_IMAGE_MODEL:'test-image'});
  expect([custom.generator.id,custom.imageGenerator.id]).toEqual(['openai/test-scene','openai/test-image']);
  for(const env of [{}, {GENERATOR_MODE:'fixture',OPENAI_API_KEY:key,...legacy}]) {
    const sample=configuredProviders(env);
    expect(sample.generator.id).toMatch(/^fixture\//);expect(sample.imageGenerator.configured).toBe(false);
  }
});

it('archives a complete Responses stream, decodes its variable schema and uses the same scene validator', async()=>{
  const t=trace(),wire=responsesWire(imageReply());
  const generator=new OpenAIScene({apiKey:key,fetchImpl:async(url,init)=>{
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer '+key);
    const body=JSON.parse(String(init?.body));
    expect(body).toMatchObject({model:'gpt-6.2-sol',store:false,stream:true,text:{format:{strict:true,type:'json_schema'}}});
    expect(JSON.parse(body.input).language.target).toBe('zh-CN');
    const bytes=new TextEncoder().encode(wire);
    return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=29)c.enqueue(bytes.slice(i,i+29));c.close();}}));
  }});
  const pkg=await generator.generate('有一个球',world,t.context);
  expect((await validatePackage(pkg)).schemaVersion).toBe(4);
  expect(t.chunks.join('')).toBe(wire);
  expect(t.responses[0]).toMatchObject({adapter:generator.id,complete:true,responseId:'resp_synthetic',usage:{input_tokens:120,output_tokens:230}});
  expect(JSON.stringify(t)).not.toContain(key);
});

describe('an unsuccessful OpenAI request leaves an inspectable diagnostic',()=>{
  it.each([
    [429, 'credit_balance_exhausted','provider_quota'],
    [429, 'insufficient_quota','provider_quota'],
    [403, 'model_not_found','provider_access'],
    [400, 'content_policy_violation','provider_refusal']
  ] as const)('classifies HTTP %s / %s and redacts echoed credentials',async(status,code,reason)=>{
    const t=trace(),generator=new OpenAIScene({apiKey:key,fetchImpl:async()=>Response.json({error:{code,message:key}},{status})});
    await expect(generator.generate('有一个球',world,t.context)).rejects.toMatchObject({reason});
    expect(t.responses[0]).toMatchObject({complete:false,status});
    expect(JSON.stringify(t)).not.toContain(key);
  });
  it.each(['response.failed','response.incomplete','response.refusal.done','unfinished'])('rejects %s without a partial package',async type=>{
    const t=trace(),generator=new OpenAIScene({apiKey:key,fetchImpl:async()=>new Response('data: '+JSON.stringify({type})+'\n\n')});
    await expect(generator.generate('有一个球',world,t.context)).rejects.toThrow();
    expect(t.responses).toHaveLength(1);
  });
});

it('uses Images generations for new artwork and Images edits for authorized reference bytes',async()=>{
  const png=readFileSync('fixtures/library/rabbit.png');
  const t=trace(),seen:{url:string;body:Record<string,unknown>}[]=[];
  const generator=new OpenAIImage({apiKey:key,fetchImpl:async(url,init)=>{
    seen.push({url:String(url),body:JSON.parse(String(init?.body))});
    return Response.json({data:[{b64_json:png.toString('base64')}],usage:{total_tokens:125}});
  }});
  const request={id:'actor',name:'Rabbit',role:'character' as const,prompt:'A small rabbit.'};
  await expect(generator.generate(request,[],t.context.signal,t.context)).resolves.toEqual(png);
  await generator.generate({...request,role:'background'},[png],t.context.signal,t.context);
  expect(seen[0]).toMatchObject({url:'https://api.openai.com/v1/images/generations',body:{quality:'medium',n:1,output_format:'png',background:'transparent'}});
  expect(seen[0].body).not.toHaveProperty('images');
  expect(seen[1]).toMatchObject({url:'https://api.openai.com/v1/images/edits',body:{background:'opaque',images:[{image_url:'data:image/png;base64,'+png.toString('base64')}]}});
  expect(t.responses[1]).toMatchObject({provider:generator.id,usage:{total_tokens:125}});
  expect(JSON.stringify(t.requests)).not.toContain(key);
});
