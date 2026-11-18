import { assert, type AssetRequest, type CanvasSize } from '@and-there-was/scene';
import { imagePrompt, requestImage, type ImageGenerator, type ImageArchive } from './image-provider';

function backgroundSize(model: string, viewport?: CanvasSize): string {
  if (!viewport) return '1024x1024';
  const ratio = Math.max(1 / 3, Math.min(3, viewport.width / viewport.height));
  if (!model.startsWith('gpt-image-2')) {
    if (ratio > Math.sqrt(1.5)) return '1536x1024';
    if (ratio < 1 / Math.sqrt(1.5)) return '1024x1536';
    return '1024x1024';
  }
  // Request approximately one megapixel, aligned to the model's 16-pixel grid.
  const aspect = Math.max(ratio, 1 / ratio);
  const short = 16 * Math.round(64 / Math.sqrt(aspect));
  const long = 16 * Math.round(short * aspect / 16);
  return ratio >= 1 ? `${long}x${short}` : `${short}x${long}`;
}

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
  async generate(request:AssetRequest, references:Buffer[], signal:AbortSignal, archive:ImageArchive, viewport?:CanvasSize) {
    assert(this.configured, 'OPENAI_API_KEY is missing');
    const endpoint = 'https://api.openai.com/v1/images/' + (references.length ? 'edits' : 'generations');
    const body = {model:this.model, prompt:imagePrompt(request, viewport), size:backgroundSize(this.model, request.role === 'background' ? viewport : undefined), quality:'medium', n:1,
      output_format:'png', background:request.role === 'character' ? 'transparent' : 'opaque',
      ...(references.length ? {images:references.map(bytes => ({image_url:'data:image/png;base64,'+bytes.toString('base64')}))} : {})};
    return requestImage(this.provider, this.id, endpoint, body, this.options.apiKey.trim(), signal, archive, this.options.fetchImpl ?? fetch);
  }
}
