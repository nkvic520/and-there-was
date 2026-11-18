import { assert, type AssetRequest, type CanvasSize, type ImageProvider } from '@and-there-was/scene';
import { openAIError, ProviderError } from './provider-error';

export interface ImageArchive { request(value:unknown):void; response(value:unknown):void }
export interface ImageGenerator {
  readonly id: string;
  readonly provider: ImageProvider;
  readonly configured: boolean;
  generate(request:AssetRequest, references:Buffer[], signal:AbortSignal, archive:ImageArchive, viewport?:CanvasSize):Promise<Buffer>;
}

export function imagePrompt(request: AssetRequest, viewport?: CanvasSize): string {
  if (request.role !== 'background' || !viewport) return request.prompt;
  const { width, height } = viewport;
  const orientation = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
  return request.prompt + `\nThe world canvas is ${width}x${height} CSS pixels (${orientation}, width/height ${(width / height).toFixed(3)}). Compose an edge-to-edge environment in that aspect ratio. Keep important scenery near the center and let the edges crop naturally when the device rotates. No frames or lettering.`;
}

export async function requestImage(provider: ImageProvider, modelId: string, endpoint: string, body: Record<string,unknown>,
  apiKey:string, parent:AbortSignal, archive:ImageArchive, send:typeof fetch) {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(180000)]);
  archive.request({provider:modelId, endpoint, body});
  let raw = '', status:number|null = null, usage:unknown = null;
  try {
    const response = await send(endpoint, {method:'POST', redirect:'error', signal,
      headers:{Authorization:'Bearer '+apiKey, 'Content-Type':'application/json'}, body:JSON.stringify(body)});
    status = response.status;
    assert(response.body, 'Image provider returned an empty response');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        bytes += part.value?.byteLength ?? 0;
        assert(bytes <= 24 * 1024 * 1024, 'Image response exceeds the size limit');
        raw += decoder.decode(part.value,{stream:!part.done});
        if (part.done) break;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!response.ok) {
      if (provider === 'openai') throw openAIError(status, raw, apiKey);
      throw new Error('Seedream HTTP '+status+' '+raw.slice(0,500));
    }
    const value = JSON.parse(raw);
    usage = value.usage ?? null;
    assert(Array.isArray(value.data) && value.data.length === 1, 'Image provider must return one image');
    const encoded = value.data[0]?.b64_json;
    assert(typeof encoded === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(encoded),'Invalid base64 image response');
    return Buffer.from(encoded,'base64');
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = signal.aborted ? '图片生成超时或中断，可以重试。' : error instanceof Error ? error.message : String(error);
    throw new Error(message.replaceAll(apiKey,'[REDACTED]'));
  } finally {
    archive.response({provider:modelId, endpoint, status, body:raw.replaceAll(apiKey,'[REDACTED]'), usage});
  }
}
