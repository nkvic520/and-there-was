import { assert, canonical, record, sha256, utf8Size, type WorldSnapshot } from '@and-there-was/scene';
import { FixtureGenerator, type Generator, type GenerationContext, type GenerationResult } from './generator';
import { isLocale, locales } from '@and-there-was/scene/languages';
import { namesLanguage, requestedStoryLocale } from './language-request';
import { firstStoryLocale, savedStoryLocale } from './story-language';
import { ART_PROMPT } from './art-prompt';

import { PROMPT_VERSION, SCENE_PROMPT } from './scene-prompt';
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
    const saved = savedStoryLocale(baseline) ?? null;
    const uiLocale = context?.uiLocale ?? 'zh-CN';
    const defaultLocale = saved ?? firstStoryLocale(text, uiLocale);
    const requested = requestedStoryLocale(text, defaultLocale);
    const target = requested ?? defaultLocale;
    const language = {
      target, saved, supported: locales,
      previousStoryText: baseline.operations.filter(op => op.kind === 'text').map(op => ({ id: op.id, text: op.text }))
    };
    const languageInstruction = `\nFor this particular artwork the target storyLocale is "${target}". Write all on-page text and new artwork names in that language. Use language.previousStoryText as the source for continuing or translating the work. Double-check that the title and narration identify the same character as the source. A change to another target requires an explicit language request quoted from the child as languageChangeQuote.`;
    const body = {
      model: this.model, messages: [{ role: 'system', content: SCENE_PROMPT + (context?.artSelection?.artSource ? ART_PROMPT : '') + languageInstruction }, { role: 'user', content: canonical({ language, worldMode: baseline.mode ?? 'animated', request: text, snapshot: baseline, previousPackage: context?.previousPackage ?? null, previousFailure: context?.previousFailure ?? null, ...(context?.artSelection?.artSource ? {artSelection:context.artSelection,availableAssetIds:context.availableAssets?.map(a=>a.id)??[],availableAssets:context.availableAssets??[]} : {}) }) }],
      // The live API rejects JSON output together with safety_check=high.
      // Keep its default checks; every package still passes our schema/runtime gate.
      thinking: { type: 'disabled' }, temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: this.options.maxTokens ?? 16384, stream: true, stream_options: { include_usage: true }
    };
    context?.request({ adapter: this.id, promptVersion: PROMPT_VERSION+(context?.artSelection?.artSource?'+images-4/2026-11-18.i18n':''), endpoint: this.endpoint, body });
    const signal = AbortSignal.any([AbortSignal.timeout(this.options.timeoutMs ?? 120000), ...(context ? [context.signal] : [])]);
    let raw = '', rawBytes = 0, buffer = '', pendingArchive = '', lastArchive = Date.now(), content = '', finishReason = '', done = false, status: number | undefined, usage: unknown, responseId: string | undefined;
    const redact = (value: string) => value.replaceAll(this.options.apiKey, '[REDACTED]');
    const flushArchive = (final = false) => {
      // Keep a suffix so a credential echoed across network chunks is never
      // persisted as two individually unrecognizable fragments.
      let end = final ? pendingArchive.length : Math.max(0, pendingArchive.length - this.options.apiKey.length + 1);
      for (let start = pendingArchive.indexOf(this.options.apiKey); start >= 0; start = pendingArchive.indexOf(this.options.apiKey, start + this.options.apiKey.length)) {
        if (start < end && start + this.options.apiKey.length > end) { end = start; break; }
      }
      if (end) { context?.chunk(redact(pendingArchive.slice(0, end))); pendingArchive = pendingArchive.slice(end); lastArchive = Date.now(); }
    };
    const consume = (frame: string) => {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return;
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
      assert(response.body, '模型返回了空响应');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read();
          const text = decoder.decode(part.value, { stream: !part.done });
          raw += text; rawBytes += utf8Size(text); pendingArchive += text;
          // Streaming envelopes can be far larger than the actual scene script.
          assert(rawBytes <= 8 * 1024 * 1024, 'Model response limit exceeded');
          if (pendingArchive.length >= 4096 || Date.now() - lastArchive >= 500) flushArchive();
          if (response.ok) {
            buffer += text;
            let boundary: RegExpExecArray | null;
            while ((boundary = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, boundary.index)); buffer = buffer.slice(boundary.index + boundary[0].length); }
          }
          if (part.done) break;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!response.ok) throw new Error(`DeepSeek HTTP ${status}：${raw.slice(0, 500)}`);
      if (buffer.trim()) consume(buffer);
      assert(done && finishReason === 'stop', `模型输出未完整结束（${finishReason || 'stream interrupted'}），可以重试。`);
      assert(content.trim(), '模型返回空 JSON，可以重试。');
      const value: unknown = JSON.parse(content);
      assert(record(value) && record(value.protocol) && typeof value.script === 'string' && record(value.view), 'Model must return protocol, script and view');
      assert(isLocale(value.storyLocale), 'Model must return a supported storyLocale');
      if (requested) assert(value.storyLocale === requested, 'The scene must use the explicitly requested story language');
      if (value.storyLocale !== target) {
        const quote = value.languageChangeQuote;
        assert(typeof quote === 'string' && text.includes(quote) && namesLanguage(quote, value.storyLocale), 'Changing the story language requires a quoted request from this turn');
      }
      const files = { 'protocol.json': JSON.stringify(value.protocol), 'scene.js': value.script, 'view.json': JSON.stringify(value.view) };
      const hashes: Record<string, string> = {};
      for (const [name, text] of Object.entries(files)) hashes[name] = await sha256(text);
      assert([2,3,4].includes(Number(value.protocol.schemaVersion)), 'Unsupported generated SDK');
      if (context?.artSelection?.artSource) assert(value.protocol.schemaVersion === 4 && Array.isArray(value.assetIds) && Array.isArray(value.assetRequests), '图片世界需要 SDK 4 和素材清单');
      return { storyLocale: value.storyLocale, formatVersion: 1, sdkVersion: value.protocol.schemaVersion as 2 | 3 | 4, entry: 'scene.js', files, hashes, assets: [], ...(value.assetIds !== undefined ? {assetIds:value.assetIds as string[]} : {}), ...(value.assetRequests !== undefined ? {assetRequests:value.assetRequests as GenerationResult['assetRequests']} : {}) };
    } catch (error) {
      throw new Error(redact(signal.aborted ? '模型请求超时或已中断，可以重试。' : error instanceof Error ? error.message : String(error)));
    } finally {
      flushArchive(true);
      context?.response({ adapter: this.id, endpoint: this.endpoint, status: status ?? null, responseId: responseId ?? null, body: redact(raw), content: redact(content), finishReason, complete: done, usage: usage ?? null });
    }
  }
}

export function configuredGenerator(): Generator {
  const mode = process.env.GENERATOR_MODE ?? 'fixture';
  if (mode === 'fixture') return new FixtureGenerator();
  assert(mode === 'deepseek', 'GENERATOR_MODE must be fixture or deepseek');
  return new DeepSeekGenerator({ apiKey: process.env.DEEPSEEK_API_KEY ?? '', baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL });
}
