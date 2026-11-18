import { assert } from '@and-there-was/scene';

// Both scene providers send SSE. Preserve the original wire response, including
// partial/error bodies, while keeping a key split between chunks out of storage.
export async function readModelStream(response: Response, key: string, trace: {raw: string},
  onData: (data: string) => void, archive?: (chunk: string) => void) {
  assert(response.body, 'The model returned an empty response');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, buffer = '', pending = '', lastFlush = Date.now();
  function flush(final = false) {
    let end = final ? pending.length : Math.max(0, pending.length - key.length + 1);
    for (let i = pending.indexOf(key); i >= 0 && i < end; i = pending.indexOf(key, i + key.length)) {
      if (i + key.length > end) { end = i; break; }
    }
    if (end) { archive?.(pending.slice(0, end).replaceAll(key, '[REDACTED]')); pending = pending.slice(end); lastFlush = Date.now(); }
  }
  function frame(value: string) {
    const data = value.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (data) onData(data);
  }
  try {
    while (true) {
      const part = await reader.read();
      bytes += part.value?.byteLength ?? 0;
      assert(bytes <= 8 * 1024 * 1024, 'Model response limit exceeded');
      const text = decoder.decode(part.value, {stream: !part.done});
      trace.raw += text; pending += text;
      if (pending.length >= 4096 || Date.now() - lastFlush >= 500) flush();
      if (response.ok) {
        buffer += text;
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          frame(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
        }
      }
      if (part.done) break;
    }
    if (response.ok && buffer.trim()) frame(buffer);
  } finally {
    flush(true);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
