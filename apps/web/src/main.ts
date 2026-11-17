import { Application, Graphics, Container } from 'pixi.js';
import { canonical, type Candidate, type DrawOperation, type ScenePackage, type WorldSnapshot, type TrialResult } from '@and-there-was/scene';
import { runIsolated } from './runtime';
import './style.css';

const root = document.querySelector<HTMLElement>('#app')!;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json()).error ?? `请求失败 ${response.status}`);
  return response.json();
}
async function artifact<T>(hash: string): Promise<T> {
  const response = await fetch(`/api/artifacts/${hash}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('保存的内容暂时无法读取');
  return JSON.parse(await response.text());
}
function showFatal(error: unknown) {
  root.replaceChildren();
  const message = document.createElement('p'); message.className = 'fatal';
  message.textContent = `暂时没能打开这个世界。${error instanceof Error ? error.message : String(error)}`;
  const retry = document.createElement('button'); retry.textContent = '重新打开'; retry.onclick = () => location.reload();
  root.append(message, retry);
}
async function inspect(worldId: string) {
  root.className = 'inspector';
  const header = document.createElement('header'), title = document.createElement('h1'), back = document.createElement('a');
  title.textContent = '世界档案'; back.textContent = '回到画布 ↗'; back.href = `/w/${worldId}`;
  header.append(title, back); root.append(header);
  const description = document.createElement('p'); description.textContent = '样例模式 · 原文、生成产物和每次生效的状态都留在这里。'; root.append(description);
  const records = await api<{ snapshot: WorldSnapshot; turns: Record<string, unknown>[]; attempts: Record<string, unknown>[]; versions: WorldSnapshot[]; events: unknown[] }>(`/api/worlds/${worldId}/records`);
  function section(label: string, content: unknown, open = false) {
    const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
    summary.textContent = label; pre.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2); details.open = open; details.append(summary, pre); root.append(details);
  }
  section('当前世界状态', records.snapshot, true); section('提交文字与轮次', records.turns, true);
  for (const attempt of records.attempts) {
    section(`生成尝试 · ${attempt.id}`, attempt);
    for (const [field, label] of [['request_hash', '生成请求'], ['response_hash', '原始响应'], ['result_hash', '试跑结果']] as const) if (typeof attempt[field] === 'string') section(label, await artifact(attempt[field]));
    if (typeof attempt.package_hash === 'string') {
      const pkg = await artifact<ScenePackage>(attempt.package_hash);
      section('产物清单与文件哈希', { ...pkg, files: Object.keys(pkg.files) });
      for (const [name, content] of Object.entries(pkg.files)) section(name, content, name === 'scene.js');
    }
  }
  section('世界版本', records.versions); section('事件时间线', records.events);
}

async function playground() {
  root.innerHTML = `<section class="playground" aria-label="创作画布"><div id="canvas" aria-label="空画布"></div><div class="composer-wrap"><p id="status" role="status" aria-live="polite"></p><form id="composer"><label class="sr-only" for="thought">你想让这里有什么？</label><input id="thought" name="thought" placeholder="你想让这里有什么？" autocomplete="off" maxlength="2000" enterkeyhint="done" /><button id="send" type="submit" aria-label="发送" disabled><span aria-hidden="true">↑</span></button></form><button id="retry" class="text-button" hidden>再试一次</button></div></section>`;
  const input = document.querySelector<HTMLInputElement>('#thought')!, send = document.querySelector<HTMLButtonElement>('#send')!, form = document.querySelector<HTMLFormElement>('#composer')!;
  const status = document.querySelector<HTMLElement>('#status')!, retry = document.querySelector<HTMLButtonElement>('#retry')!, host = document.querySelector<HTMLElement>('#canvas')!;
  let composing = false, failedTurn: string | undefined, worldId = location.pathname.match(/^\/w\/([\w-]+)$/)?.[1];
  const renderer = new Application();
  await renderer.init({ resizeTo: host, background: '#ffffff', antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2), preference: 'webgl' });
  host.append(renderer.canvas); renderer.canvas.setAttribute('aria-label', '世界画布');
  const scene = new Container(); renderer.stage.addChild(scene);
  let current: WorldSnapshot;
  function draw(operations: DrawOperation[]) {
    for (const child of scene.removeChildren()) child.destroy();
    const size = Math.min(host.clientWidth, host.clientHeight), offsetX = (host.clientWidth - size) / 2, offsetY = (host.clientHeight - size) / 2;
    for (const op of operations) {
      const graphic = new Graphics().ellipse(offsetX + op.x * size, offsetY + op.y * size, op.radiusX * size, op.radiusY * size).fill({ color: op.color, alpha: op.alpha });
      scene.addChild(graphic);
    }
    host.dataset.operationCount = String(operations.length);
  }
  new ResizeObserver(() => { if (current) draw(current.operations); }).observe(host);
  if (!worldId) {
    current = await api<WorldSnapshot>('/api/worlds', {}); worldId = current.worldId;
    history.replaceState(null, '', `/w/${worldId}`);
  } else current = await api<WorldSnapshot>(`/api/worlds/${worldId}`);
  const localWorldId = worldId;
  document.title = '就有了 · 一个小小的世界';
  async function applySnapshot(snapshot: WorldSnapshot) {
    if (snapshot.packageHash) {
      const pkg = await artifact<ScenePackage>(snapshot.packageHash);
      const restored = await runIsolated(pkg, snapshot.state, snapshot.packageHash);
      if (canonical(restored.state) !== canonical(snapshot.state) || canonical(restored.operations) !== canonical(snapshot.operations)) throw new Error('恢复结果与保存快照不一致');
    }
    if (snapshot.revision < current.revision) return;
    current = snapshot; draw(snapshot.operations);
    root.dataset.versionId = snapshot.versionId; root.dataset.worldId = snapshot.worldId; root.dataset.revision = String(snapshot.revision);
  }
  await applySnapshot(current);
  const processed = new Set<string>();
  let pendingReceipt: TrialResult | undefined;
  async function persistReceipt() {
    if (!pendingReceipt) return;
    const receipt = pendingReceipt;
    await api('/api/trials', receipt);
    if (pendingReceipt === receipt) pendingReceipt = undefined;
  }
  async function trial(attemptId: string) {
    if (processed.has(attemptId)) return;
    processed.add(attemptId);
    const candidate = await api<Candidate>(`/api/attempts/${attemptId}/candidate`);
    status.textContent = '正在让它出现…';
    const receipt: TrialResult = { attemptId, packageHash: candidate.packageHash, baseVersionId: candidate.baseVersionId, baseRevision: candidate.baseRevision, ok: true };
    try {
      receipt.output = await runIsolated(candidate.package, candidate.baseline.state, candidate.packageHash);
      const restored = await runIsolated(candidate.package, receipt.output.state, candidate.packageHash);
      if (canonical(restored.state) !== canonical(receipt.output.state) || canonical(restored.operations) !== canonical(receipt.output.operations)) throw new Error('候选场景无法从快照无损恢复');
    }
    catch (error) { receipt.ok = false; receipt.error = error instanceof Error ? error.message : String(error); }
    pendingReceipt = receipt;
    await persistReceipt();
  }
  let eventWork = Promise.resolve();
  const stream = new EventSource(`/api/worlds/${localWorldId}/events`);
  stream.onmessage = message => {
    const event = JSON.parse(message.data) as { kind: string; payload: { attemptId?: string; turnId?: string; versionId?: string; error?: string } };
    eventWork = eventWork.then(async () => {
      if (event.kind === 'candidate.ready' && event.payload.attemptId) {
        // Replayed events can describe attempts already finalized; query current status.
        const records = await api<{ attempts: { id: string; status: string }[] }>(`/api/worlds/${localWorldId}/records`);
        if (records.attempts.some(a => a.id === event.payload.attemptId && a.status === 'trial')) await trial(event.payload.attemptId);
      } else if (event.kind === 'version.committed') {
        const snapshot = await api<WorldSnapshot>(`/api/worlds/${localWorldId}`);
        if (snapshot.versionId !== current.versionId) await applySnapshot(snapshot);
        status.textContent = ''; failedTurn = undefined; retry.hidden = true;
      } else if (event.kind === 'attempt.failed') {
        const records = await api<{ turns: { id: string; status: string }[] }>(`/api/worlds/${localWorldId}/records`);
        if (records.turns.find(t => t.id === event.payload.turnId)?.status === 'failed') {
          status.textContent = '这次没有变出来，可以改一句或再试一次。'; failedTurn = event.payload.turnId; retry.hidden = false;
        }
      }
    }).catch(error => { status.textContent = `暂时没连上，正在重新连接…`; console.error(error); });
  };
  stream.onerror = () => { status.textContent = '连接中，眼前的世界会留在这里…'; };
  stream.onopen = () => { if (status.textContent?.startsWith('连接中')) status.textContent = ''; void persistReceipt().catch(() => {}); };
  // A lost POST response does not require waiting for an SSE reconnection.
  const receiptTimer = setInterval(() => { void persistReceipt().catch(() => {}); }, 2000);
  window.addEventListener('pagehide', () => { stream.close(); clearInterval(receiptTimer); }, { once: true });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; send.disabled = !input.value.trim(); });
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && !composing && event.keyCode !== 229) event.preventDefault(); });
  const outboxKey = `outbox:${worldId}`;
  async function flushSubmission() {
    const stored = localStorage.getItem(outboxKey);
    if (!stored) return;
    await api(`/api/worlds/${localWorldId}/turns`, JSON.parse(stored));
    localStorage.removeItem(outboxKey);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing || !input.value.trim()) return;
    if (localStorage.getItem(outboxKey)) { status.textContent = '上一句话还在发送，请稍等一下。'; return; }
    const clientSubmissionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(outboxKey, JSON.stringify({ text: input.value, clientSubmissionId }));
    status.textContent = '收到啦，等一下…'; input.value = ''; send.disabled = true; retry.hidden = true;
    void flushSubmission().catch(() => { status.textContent = '这句话已经记住，连上后会继续发送。'; });
  });
  retry.onclick = () => { if (failedTurn) { retry.hidden = true; status.textContent = '再试一次…'; void api(`/api/turns/${failedTurn}/retry`, {}).catch(() => { retry.hidden = false; status.textContent = '暂时没连上，请稍后重试。'; }); } };
  const outboxTimer = setInterval(() => { void flushSubmission().catch(() => {}); }, 2000);
  window.addEventListener('pagehide', () => clearInterval(outboxTimer), { once: true });
  await flushSubmission().catch(() => {});
}

const inspectMatch = location.pathname.match(/^\/inspect\/([\w-]+)$/);
void (inspectMatch ? inspect(inspectMatch[1]) : playground()).catch(showFatal);
