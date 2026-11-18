import { assert, type AssetRequest } from '@and-there-was/scene';
import { requestImage, type ImageGenerator, type ImageArchive } from './image-provider';

export class OpenAIImage implements ImageGenerator {
  readonly provider = 'openai';
  readonly id: string;
  readonly configured: boolean;
  private model: string;
  constructor(private options:{apiKey:string; model?:string; fetchImpl?:typeof fetch}) {
    this.model = options.model ?? 'gpt-image-2.5-sunburst';
    this.id = 'openai/'+this.model;
    this.configured = Boolean(options.apiKey.trim());
  }
  async generate(request:AssetRequest, references:Buffer[], signal:AbortSignal, archive:ImageArchive) {
    assert(this.configured, 'OPENAI_API_KEY is missing');
    const endpoint = 'https://api.openai.com/v1/images/' + (references.length ? 'edits' : 'generations');
    const body = {model:this.model, prompt:request.prompt, size:'1024x1024', quality:'medium', n:1,
      output_format:'png', background:request.role === 'character' ? 'transparent' : 'opaque',
      ...(references.length ? {images:references.map(bytes => ({image_url:'data:image/png;base64,'+bytes.toString('base64')}))} : {})};
    return requestImage(this.provider, this.id, endpoint, body, this.options.apiKey.trim(), signal, archive, this.options.fetchImpl ?? fetch);
  }
}
