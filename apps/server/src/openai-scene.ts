import { assert, record, utf8Size, type WorldSnapshot } from '@and-there-was/scene';
import { locales } from '@and-there-was/scene/languages';
import type { Generator, GenerationContext } from './generator';
import { sceneBrief, sceneResult } from './scene-generation';
import { readModelStream } from './model-stream';
import { openAIError, ProviderError } from './provider-error';

const string = { type: 'string' };
const strings = { type: 'array', items: string };
// The keys of a world's state and events are authored by the child and model.
// Use JSON strings for these documents inside the strictly typed API envelope.
// The same local validator checks the decoded documents for both providers.
const format = {
  type: 'json_schema', name: 'scene_package', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['storyLocale','languageChangeQuote','protocolJson','script','viewJson','assetIds','assetRequests'],
    properties: {
      storyLocale: {type:'string', enum:locales}, languageChangeQuote: {type:['string','null']},
      protocolJson: string, script: string, viewJson: string, assetIds: {...strings,maxItems:16},
      assetRequests: {type:'array', maxItems:2, items:{type:'object', additionalProperties:false,
        required:['id','name','role','prompt','references'],
        properties:{id:string, name:string, role:{type:'string', enum:['character','background','illustration']}, prompt:string, references:{...strings,maxItems:2}}}}
    }
  }
};
const wireInstructions = '\nAPI output format: serialize the protocol and view objects described above into the protocolJson and viewJson strings. Return script as plain JavaScript source. Use null for an absent languageChangeQuote and empty arrays for unused assetIds, assetRequests or references.';

export class OpenAIScene implements Generator {
  readonly id: string;
  readonly model: string;
  constructor(private options: {apiKey:string; model?:string; timeoutMs?:number; fetchImpl?:typeof fetch}) {
    this.model = options.model ?? 'gpt-6.2-sol';
    this.id = 'openai/' + this.model;
  }
  async generate(text: string, baseline: WorldSnapshot, context?: GenerationContext) {
    const key = this.options.apiKey.trim();
    assert(key, 'OPENAI_API_KEY is missing');
    const brief = sceneBrief(text, baseline, context);
    const endpoint = 'https://api.openai.com/v1/responses';
    const body = {model:this.model, instructions:brief.instructions + wireInstructions, input:brief.input,
      text:{format}, ...(this.model.startsWith('gpt-6.2-sol') ? {reasoning:{effort:'low'}} : {}), max_output_tokens:16384, store:false, stream:true};
    context?.request({adapter:this.id, promptVersion:brief.promptVersion+'/responses-v1', endpoint, body});
    const signal = AbortSignal.any([AbortSignal.timeout(this.options.timeoutMs ?? 120000), ...(context ? [context.signal] : [])]);
    const trace = {raw:''};
    let failure:Error | undefined;
    let status: number | null = null, responseId: string | null = null, usage: unknown = null;
    let content = '', completed = false, finishReason = '';
    try {
      const response = await (this.options.fetchImpl ?? fetch)(endpoint, {method:'POST', redirect:'error', signal,
        headers:{Authorization:'Bearer '+key, 'Content-Type':'application/json'}, body:JSON.stringify(body)});
      status = response.status;
      await readModelStream(response, key, trace, data => {
        if (data === '[DONE]') return;
        const event = JSON.parse(data);
        responseId ??= event.response?.id ?? null;
        if (event.type === 'response.output_text.delta') content += event.delta;
        if (event.type === 'response.refusal.done' || event.type === 'response.refusal.delta') failure = new ProviderError('provider_refusal','OpenAI declined this request');
        if (event.type === 'response.incomplete' || event.type === 'response.failed' || event.type === 'error') {
          finishReason = event.response?.incomplete_details?.reason ?? event.type;
          usage = event.response?.usage ?? null;
          failure ??= event.response?.error || event.type === 'error'
            ? openAIError(status!, JSON.stringify({error:event.response?.error ?? event}), key)
            : new Error('OpenAI response did not complete: '+finishReason);
        }
        if (event.type === 'response.completed') {
          const result = event.response;
          assert(result?.status === 'completed' && Array.isArray(result.output), 'Incomplete OpenAI response');
          const parts = result.output.filter((item: {type:string}) => item.type === 'message').flatMap((item: {content:unknown[]}) => item.content);
          if (parts.some((part: {type:string}) => part.type === 'refusal')) failure = new ProviderError('provider_refusal','OpenAI declined this request');
          content = parts.filter((part: {type:string}) => part.type === 'output_text').map((part: {text:string}) => part.text).join('');
          completed = !failure; finishReason = result.status; usage = result.usage ?? null;
        }
        assert(utf8Size(content) <= 192 * 1024, 'Generated content limit exceeded');
      }, context?.chunk);
      if (!response.ok) throw openAIError(response.status, trace.raw, key);
      if (failure) throw failure;
      assert(completed && content.trim(), 'OpenAI response ended without a completed scene');
      assert(!content.includes(key), 'Unexpected credential in model output');
      const envelope:unknown = JSON.parse(content);
      assert(record(envelope) && typeof envelope.protocolJson === 'string' && typeof envelope.viewJson === 'string', 'Missing scene documents');
      return await sceneResult({...envelope, protocol:JSON.parse(envelope.protocolJson), view:JSON.parse(envelope.viewJson)}, text, brief, context);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = signal.aborted ? 'OpenAI scene request timed out or was interrupted' : error instanceof Error ? error.message : String(error);
      throw new Error(message.replaceAll(key,'[REDACTED]'));
    } finally {
      context?.response({adapter:this.id, endpoint, status, responseId, body:trace.raw.replaceAll(key,'[REDACTED]'),
        content:content.replaceAll(key,'[REDACTED]'), finishReason, complete:completed, usage});
    }
  }
}
