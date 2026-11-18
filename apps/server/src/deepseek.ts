import { assert, utf8Size, type WorldSnapshot } from '@and-there-was/scene';
import type { Generator, GenerationContext, GenerationResult } from './generator';
import { sceneBrief, sceneResult } from './scene-generation';
import { readModelStream } from './model-stream';
export { PROMPT_VERSION, SCENE_PROMPT } from './scene-prompt';

export interface DeepSeekOptions { apiKey: string; baseUrl?: string; model?: string; timeoutMs?: number; maxTokens?: number; fetchImpl?: typeof fetch }
export class DeepSeekGenerator implements Generator {
  readonly id: string;
  readonly endpoint: string;
  readonly model: string;
  constructor(private options: DeepSeekOptions) {
    this.model = options.model ?? 'deepseek-flash';
    this.endpoint = `${(options.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '')}/chat/completions`;
    const url = new URL(this.endpoint);
    assert(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Model endpoint requires HTTPS (local test servers may use HTTP)');
    assert(!url.username && !url.password && !url.search && !url.hash, 'Invalid model endpoint');
    this.id = `deepseek/${this.model}`;
  }
  async generate(text: string, baseline: WorldSnapshot, context?: GenerationContext): Promise<GenerationResult> {
    assert(this.options.apiKey.trim(), '请在服务端 .env 配置 DEEPSEEK_API_KEY，然后重启服务。');
    const brief = sceneBrief(text, baseline, context);
    const body = {
      model: this.model, messages: [{ role: 'system', content: brief.instructions }, { role: 'user', content: brief.input }],
      // The live API rejects JSON output together with safety_check=high.
      // Keep its default checks; every package still passes our schema/runtime gate.
      thinking: { type: 'disabled' }, temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: this.options.maxTokens ?? 16384, stream: true, stream_options: { include_usage: true }
    };
    context?.request({ adapter: this.id, promptVersion: brief.promptVersion, endpoint: this.endpoint, body });
    const signal = AbortSignal.any([AbortSignal.timeout(this.options.timeoutMs ?? 120000), ...(context ? [context.signal] : [])]);
    const trace = { raw: '' };
    let content = '', finishReason = '', done = false, status: number | undefined, usage: unknown, responseId: string | undefined;
    const redact = (value: string) => value.replaceAll(this.options.apiKey, '[REDACTED]');
    const consume = (data: string) => {
      if (data.trim() === '[DONE]') { done = true; return; }
      const value = JSON.parse(data);
      if (value.error) throw new Error(`DeepSeek: ${value.error.message ?? 'stream error'}`);
      responseId ??= value.id;
      if (value.usage) usage = value.usage;
      const choice = value.choices?.[0];
      if (choice?.delta?.refusal) throw new Error('模型拒绝生成这次内容，请换一种表达。');
      if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
      assert(utf8Size(content) <= 192 * 1024, 'Generated content limit exceeded');
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    };
    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      status = response.status;
      await readModelStream(response, this.options.apiKey, trace, consume, context?.chunk);
      if (!response.ok) throw new Error(`DeepSeek HTTP ${status}：${trace.raw.slice(0, 500)}`);
      assert(done && finishReason === 'stop', `模型输出未完整结束（${finishReason || 'stream interrupted'}），可以重试。`);
      assert(content.trim(), '模型返回空 JSON，可以重试。');
      return await sceneResult(JSON.parse(content), text, brief, context);
    } catch (error) {
      throw new Error(redact(signal.aborted ? '模型请求超时或已中断，可以重试。' : error instanceof Error ? error.message : String(error)));
    } finally {
      context?.response({ adapter: this.id, endpoint: this.endpoint, status: status ?? null, responseId: responseId ?? null, body: redact(trace.raw), content: redact(content), finishReason, complete: done, usage: usage ?? null });
    }
  }
}
