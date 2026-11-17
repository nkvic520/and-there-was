import { expect, it } from 'vitest';
import { DeepSeekGenerator, PROMPT_VERSION } from '../../apps/server/src/deepseek';
import { validatePackage, type WorldSnapshot } from '@and-there-was/scene';
import type { GenerationContext } from '../../apps/server/src/generator';
import { interactivePackage, modelReply, streamReply } from '../helpers/interactive';

const baseline: WorldSnapshot = { worldId: 'world', versionId: 'version', parentVersionId: null, revision: 0, packageHash: null, state: {}, operations: [], createdAt: new Date().toISOString() };
function trace() {
  const requests: unknown[] = [], chunks: string[] = [], responses: unknown[] = [];
  const context: GenerationContext = { signal: new AbortController().signal, request: v => requests.push(v), chunk: v => chunks.push(v), response: v => responses.push(v) };
  return { requests, chunks, responses, context };
}
it('sends the exact prompt and current package, decodes split UTF-8 SSE, and archives wire response/usage without the key', async () => {
  const t = trace(); t.context.previousPackage = await interactivePackage();
  t.context.previousFailure = { error: 'previous runtime failure', content: 'previous model response' };
  let sent: Record<string, any> = {}, auth = '';
  const wire = streamReply(await modelReply());
  const generator = new DeepSeekGenerator({ apiKey: 'test-secret-token', fetchImpl: async (_url, init) => {
    sent = JSON.parse(String(init?.body)); auth = new Headers(init?.headers).get('authorization')!;
    const encoded = new TextEncoder().encode(wire);
    return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7)); controller.close(); } }), { status: 200 });
  } });
  const pkg = await generator.generate('有一道光', baseline, t.context);
  expect(await validatePackage(pkg)).toBeTruthy(); expect(auth).toBe('Bearer test-secret-token');
  expect(sent.response_format).toEqual({ type: 'json_object' }); expect(sent.messages[1].content).toContain('有一道光');
  expect(JSON.parse(sent.messages[1].content).previousPackage).toEqual(t.context.previousPackage);
  expect(JSON.parse(sent.messages[1].content).previousFailure).toEqual(t.context.previousFailure);
  expect(t.requests[0]).toMatchObject({ promptVersion: PROMPT_VERSION, body: sent }); expect(t.chunks.join('')).toBe(wire);
  expect(t.responses[0]).toMatchObject({ complete: true, finishReason: 'stop', usage: { prompt_tokens: 10, completion_tokens: 20 } });
  expect(JSON.stringify(t)).not.toContain('test-secret-token');
});
it.each(['length', 'content_filter'])('rejects %s output while preserving its exact partial response', async finish => {
  const t = trace(), wire = streamReply('{"unfinished":', finish);
  const generator = new DeepSeekGenerator({ apiKey: 'test-key', fetchImpl: async () => new Response(wire) });
  await expect(generator.generate('test', baseline, t.context)).rejects.toThrow('未完整结束');
  expect(t.responses[0]).toMatchObject({ body: wire, finishReason: finish });
});
it('retains malformed/truncated streams and HTTP errors rather than publishing a package', async () => {
  for (const response of [new Response(streamReply('{}', 'stop', false)), new Response('data: {broken}\n\n'), new Response('{"error":"test-key"}', { status: 401 })]) {
    const t = trace(), generator = new DeepSeekGenerator({ apiKey: 'test-key', fetchImpl: async () => response });
    await expect(generator.generate('test', baseline, t.context)).rejects.toThrow();
    expect(t.responses).toHaveLength(1); expect(t.chunks.length).toBeGreaterThan(0); expect(JSON.stringify(t)).not.toContain('test-key');
  }
});
it('cancels the network on timeout and archives the interrupted attempt', async () => {
  const t = trace();
  const generator = new DeepSeekGenerator({ apiKey: 'test-key', timeoutMs: 20, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  await expect(generator.generate('test', baseline, t.context)).rejects.toThrow('超时或已中断');
  expect(t.responses[0]).toMatchObject({ complete: false, body: '' });
});
it('redacts a credential echoed across persisted stream fragment boundaries', async () => {
  const t = trace(), encoder = new TextEncoder();
  const generator = new DeepSeekGenerator({ apiKey: 'test-secret-token', fetchImpl: async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode('x'.repeat(4090) + 'test-sec'));
    controller.enqueue(encoder.encode('ret-token')); controller.close();
  } }), { status: 401 }) });
  await expect(generator.generate('test', baseline, t.context)).rejects.toThrow('HTTP 401');
  expect(t.chunks.join('')).toBe('x'.repeat(4090) + '[REDACTED]');
  expect(JSON.stringify(t.responses)).not.toContain('test-secret-token');
});
