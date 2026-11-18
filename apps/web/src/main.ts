import { Application } from 'pixi.js';
import { addCalendarMonths, canonical, type Candidate, type DrawOperation, type ScenePackage, type WorldSnapshot, type TrialResult, type WorldMode, type MotionCues, type SceneAsset } from '@and-there-was/scene';
import { runIsolated } from './runtime';
import { InteractionQueue, clientId } from './interactions';
import { Presentation } from './presentation';
import { Textures } from './textures';
import { artPicker } from './art-picker';
import { assetName, clearLabel, label, languagePicker, localize, translate, uiLocale, type Message } from './i18n';
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
const packages = new Map<string, ScenePackage>();
async function loadPackage(hash: string) { let pkg = packages.get(hash); if (!pkg) { pkg = await artifact<ScenePackage>(hash); packages.set(hash, pkg); } return pkg; }
function showFatal(error: unknown) {
  root.replaceChildren();
  const message = document.createElement('p'); message.className = 'fatal';
  console.error(error);
  label(message, 'fatal');
  const retry = document.createElement('button'); label(retry, 'reopen'); retry.onclick = () => location.reload();
  root.append(message, retry, languagePicker());
}
async function inspect(worldId: string) {
  root.className = 'inspector';
  const header = document.createElement('header'), title = document.createElement('h1'), back = document.createElement('a');
  label(title, 'archive'); label(back, 'backCanvas'); back.href = `/w/${worldId}`;
  header.append(title, back, languagePicker()); root.append(header);
  const description = document.createElement('p'); label(description, 'retentionNote'); root.append(description);
  const records = await api<{ snapshot: WorldSnapshot; turns: Record<string, unknown>[]; attempts: Record<string, unknown>[]; versions: WorldSnapshot[]; events: unknown[]; chunks?: unknown[]; interactions?: unknown[]; retention?: unknown; playback?: unknown; images?:SceneAsset[]; imageJobs?:Record<string,unknown>[] }>(`/api/worlds/${worldId}/records`);
  function section(key: Message | null, content: unknown, open = false, args?: { name: string }) {
    const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
    if (key) label(summary, key, args); else summary.textContent = args?.name ?? '';
    pre.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2); details.open = open; details.append(summary, pre); root.append(details);
  }
  section('currentState', records.snapshot, true); section('submissions', records.turns, true);
  section('progress', { mode: records.snapshot.mode ?? 'animated', playback: records.playback });
  const gallery=document.createElement('div');gallery.className='asset-grid archive-images';
  for(const asset of records.images??[]) {
    const card=document.createElement('figure'), img=document.createElement('img'), caption=document.createElement('figcaption'), original=document.createElement('a');
    img.src=`/api/images/${asset.hash}`;img.alt=asset.name;img.loading='lazy';
    const name = document.createElement('span'), credit = document.createElement('span'), key = assetName(asset);
    if (key) { label(name, key); img.dataset.i18nAlt = key; img.alt = translate(key); }
    else name.textContent = asset.name;
    if (asset.source === 'upload') label(credit, 'myArt'); else credit.textContent = asset.credit;
    caption.append(name, ' · ', credit);
    original.href=`/api/images/${asset.imageId}/original`;label(original, 'original');original.setAttribute('download','');
    card.append(img,caption,original);gallery.append(card);
  }
  root.append(gallery);section('imageSources',records.images??[]);
  for(const job of records.imageJobs??[]) {
    section('imageJobs',job);
    for(const field of ['request_hash','response_hash']) if(typeof job[field]==='string') {
      const link=document.createElement('a');link.href=`/api/artifacts/${job[field]}`;link.target='_blank';link.rel='noopener';label(link, field === 'request_hash' ? 'imageRequest' : 'imageResponse');root.append(link,document.createElement('br'));
    }
  }
  // A current work remains inspectable after its originating turn has expired.
  if (records.snapshot.packageHash) {
    const pkg = await artifact<ScenePackage>(records.snapshot.packageHash);
    section('currentPackage', { packageHash: records.snapshot.packageHash, ...pkg, files: Object.keys(pkg.files) });
    for (const [name, content] of Object.entries(pkg.files)) section('currentFile', content, false, { name });
  }
  for (const attempt of records.attempts) {
    section('attempt', attempt, false, { name: String(attempt.id) });
    for (const [field, label] of [['request_hash', 'request'], ['response_hash', 'response'], ['result_hash', 'trial']] as const) if (typeof attempt[field] === 'string') section(label, await artifact(attempt[field]));
    if (typeof attempt.package_hash === 'string') {
      const pkg = await artifact<ScenePackage>(attempt.package_hash);
      section('manifest', { ...pkg, files: Object.keys(pkg.files) });
      for (const [name, content] of Object.entries(pkg.files)) section(null, content, name === 'scene.js', { name });
    }
  }
  section('chunks', records.chunks ?? []); section('taps', records.interactions ?? []);
  section('versions', records.versions); section('timeline', records.events); section('retention', records.retention);
}

async function playground() {
  root.className = 'world-page';
  root.innerHTML = `<section class="playground" data-i18n-aria="canvas">
    <div id="canvas"></div>
    <button id="menu-toggle" type="button" popovertarget="world-menu" aria-controls="world-menu" data-i18n-aria="worldMenu">
      <span class="menu-icon" aria-hidden="true"></span></button>
    <nav id="world-menu" popover data-i18n-aria="worldMenu">
      <header><strong data-i18n="brand"></strong><span id="mode-label"></span></header>
      <a id="new-world" href="/"><span aria-hidden="true">＋</span><span data-i18n="newWorld"></span></a>
      <a id="world-history"><span aria-hidden="true">↺</span><span data-i18n="history"></span></a>
      <button id="pause" type="button" hidden></button>
      <div class="menu-language"><span data-i18n="language"></span></div>
    </nav>
    <div class="composer-wrap">
      <p id="status" role="status" aria-live="polite"></p>
      <button id="retry" type="button" class="text-button" data-i18n="retry" hidden></button>
      <button id="continue" class="continue-button" type="button" aria-controls="writing-panel" hidden>
        <span class="speech-icon" aria-hidden="true"></span><span data-i18n="keepWriting"></span></button>
      <div id="writing-panel" hidden>
        <form id="composer"><label class="sr-only" for="thought" data-i18n="thought"></label>
          <input id="thought" name="thought" data-i18n-placeholder="thought" autocomplete="off" maxlength="2000" enterkeyhint="done">
          <button id="send" type="submit" data-i18n-aria="send" disabled><span aria-hidden="true">↑</span></button></form>
        <div class="composer-tools">
          <nav class="world-modes" data-i18n-aria="modes">
            <a href="/?mode=animated" data-mode="animated" data-i18n="animated"></a>
            <a href="/?mode=storybook" data-mode="storybook" data-i18n="storybook"></a>
          </nav>
          <button id="fold" type="button" data-i18n-aria="hideComposer" hidden><span aria-hidden="true">⌄</span></button>
        </div>
      </div>
    </div></section>`;
  const menu = root.querySelector<HTMLElement>('#world-menu')!;
  menu.querySelector('.menu-language')!.append(languagePicker());
  localize(root);
  const panel = root.querySelector<HTMLElement>('#writing-panel')!, resume = root.querySelector<HTMLButtonElement>('#continue')!;
  const fold = root.querySelector<HTMLButtonElement>('#fold')!, modes = root.querySelector<HTMLElement>('.world-modes')!;
  const pause = document.querySelector<HTMLButtonElement>('#pause')!, modeLabel = document.querySelector<HTMLElement>('#mode-label')!;
  const input = document.querySelector<HTMLInputElement>('#thought')!, send = document.querySelector<HTMLButtonElement>('#send')!, form = document.querySelector<HTMLFormElement>('#composer')!;
  const status = document.querySelector<HTMLElement>('#status')!, retry = document.querySelector<HTMLButtonElement>('#retry')!, host = document.querySelector<HTMLElement>('#canvas')!;
  let composing = false, failedTurn: string | undefined, worldId = location.pathname.match(/^\/w\/([\w-]+)$/)?.[1];
  function writing(open: boolean) {
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = !open;
    resume.hidden = open;
    resume.setAttribute('aria-expanded', String(open));
    if (!open && hadFocus) resume.focus({ preventScroll: true });
  }
  resume.onclick = () => { writing(true); input.focus({ preventScroll: true }); };
  fold.onclick = () => { writing(false); resume.focus({ preventScroll: true }); };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing && !composing && !fold.hidden) {
      event.preventDefault(); fold.click();
    }
  });
  // Some mobile browsers resize only the visual viewport when the keyboard opens.
  const viewport = window.visualViewport;
  const dock = root.querySelector<HTMLElement>('.composer-wrap')!;
  function placeDock() {
    const bottom = viewport?.scale === 1 ? Math.max(0, document.documentElement.clientHeight - viewport.height - viewport.offsetTop) : 0;
    dock.style.setProperty('--keyboard-inset', bottom + 'px');
  }
  viewport?.addEventListener('resize', placeDock);
  viewport?.addEventListener('scroll', placeDock);
  placeDock();
  const renderer = new Application();
  await renderer.init({ resizeTo: host, background: '#ffffff', antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2), preference: 'webgl' });
  host.append(renderer.canvas); renderer.canvas.dataset.i18nAria = 'canvas'; renderer.canvas.setAttribute('aria-label', translate('canvas'));
  let current: WorldSnapshot;
  let interactions: InteractionQueue | undefined;
  const presentation = new Presentation(renderer, host, id => interactions?.enqueue(id));
  const textures = new Textures();
  let firstDisplay = true, presentedHash: string | null | undefined;
  let checkpointing = false;
  function draw(operations: DrawOperation[], bindings = current?.bindings ?? []) {
    presentation.set(operations, bindings, current.mode ?? 'animated', firstDisplay); firstDisplay = false;
    pause.hidden = !presentation.animated; label(pause, presentation.paused ? 'play' : 'pause');
  }
  if (!worldId) {
    const mode: WorldMode = new URLSearchParams(location.search).get('mode') === 'storybook' ? 'storybook' : 'animated';
    current = await api<WorldSnapshot>('/api/worlds', { mode }); worldId = current.worldId;
    history.replaceState(null, '', `/w/${worldId}`);
  } else current = await api<WorldSnapshot>(`/api/worlds/${worldId}`);
  const localWorldId = worldId;
  menu.querySelector<HTMLAnchorElement>('#world-history')!.href = `/inspect/${localWorldId}`;
  const art = await artPicker(localWorldId,root.querySelector<HTMLElement>('.composer-tools')!,api);
  const mode = current.mode ?? 'animated'; root.dataset.mode = mode;
  label(modeLabel, mode);
  if (art.fixture) { input.dataset.i18nPlaceholder = 'sampleHint'; input.placeholder = translate('sampleHint'); }
  const selectedMode = modes.querySelector<HTMLAnchorElement>(`[data-mode="${mode}"]`)!;
  selectedMode.setAttribute('aria-current', 'page');
  selectedMode.onclick = event => event.preventDefault();
  async function applySnapshot(snapshot: WorldSnapshot, force = false, committedTurn = false) {
    if (interactions?.pending && !force) return;
    let view = { background: '#ffffff', layout: '' }, prepared:Awaited<ReturnType<Textures['prepare']>>|undefined, pkg:ScenePackage|undefined;
    if (snapshot.packageHash) {
      pkg = await loadPackage(snapshot.packageHash);
      view = JSON.parse(pkg.files['view.json']);
      const restored = await runIsolated(pkg, snapshot.state, snapshot.packageHash);
      if (canonical(restored.state) !== canonical(snapshot.state) || canonical(restored.operations) !== canonical(snapshot.operations) || canonical(restored.bindings ?? []) !== canonical(snapshot.bindings ?? [])) throw new Error('恢复结果与保存快照不一致');
      prepared=await textures.prepare(pkg);
    }
    if (snapshot.revision < current.revision) return;
    if (snapshot.packageHash !== presentedHash) {
      const saved = await api<{ packageHash:string | null; elapsedMs:number; paused:boolean; cues:MotionCues }>(`/api/worlds/${localWorldId}/playback`);
      presentation.restore(saved.packageHash === snapshot.packageHash ? saved.elapsedMs : 0, saved.paused,saved.packageHash === snapshot.packageHash ? saved.cues : {});
      presentedHash = snapshot.packageHash;
    }
    renderer.renderer.background.color = view.background;
    presentation.setArtwork(prepared ?? new Map(), pkg?.assets ?? [], view.layout === 'viewport'); textures.activate(pkg);
    const newWork = firstDisplay || committedTurn || snapshot.packageHash !== current.packageHash;
    modes.hidden = !!snapshot.packageHash;
    fold.hidden = !snapshot.packageHash;
    if (newWork && !input.value && !composing) writing(!snapshot.packageHash);
    current = snapshot; draw(snapshot.operations);
    root.dataset.versionId = snapshot.versionId; root.dataset.worldId = snapshot.worldId; root.dataset.revision = String(snapshot.revision);
    void checkpoint().catch(() => {});
  }
  await applySnapshot(current);
  async function checkpoint(keepalive = false) {
    if (!presentation.animated || checkpointing) return;
    checkpointing = true;
    try {
      const response = await fetch(`/api/worlds/${localWorldId}/playback`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:current.versionId,elapsedMs:presentation.elapsedMs,paused:presentation.paused,cues:presentation.motionCues}),keepalive });
      if (!response.ok) throw new Error('Animation checkpoint not saved');
    }
    finally { checkpointing=false; }
  }
  pause.onclick = () => { presentation.pause(!presentation.paused); label(pause, presentation.paused ? 'play' : 'pause'); menu.hidePopover(); void checkpoint().catch(() => {}); };
  const clockTimer = setInterval(() => { void checkpoint().catch(() => {}); }, 2000);
  document.addEventListener('visibilitychange', () => { if(document.hidden) void checkpoint(true).catch(() => {}); });
  window.addEventListener('pagehide', () => { clearInterval(clockTimer); void checkpoint(true).catch(() => {}); }, {once:true});
  interactions = new InteractionQueue({ worldId: localWorldId, snapshot: () => current, load: loadPackage, api,
    accept: snapshot => applySnapshot(snapshot, true), preview: (snapshot, count) => { draw(snapshot.operations, snapshot.bindings); root.dataset.pendingEvents = String(count); }, status: message => label(status, message) });
  // Resolve any lost acknowledgement before replaying queued local events after reload.
  void interactions.flush().then(() => interactions!.preview()).catch(() => interactions!.preview());
  const processed = new Set<string>();
  let pendingReceipt: TrialResult | undefined;
  let receiptPosting = false;
  async function persistReceipt() {
    if (!pendingReceipt || receiptPosting) return;
    receiptPosting = true;
    const receipt = pendingReceipt;
    let rebase = false;
    try { await api('/api/trials', receipt); }
    catch (error) {
      if (error instanceof Error && ['Stale world baseline', 'Trial receipt does not match candidate'].includes(error.message)) {
        if (pendingReceipt === receipt) pendingReceipt = undefined;
        processed.delete(receipt.attemptId); rebase = true;
      } else throw error;
    } finally { receiptPosting = false; }
    if (pendingReceipt === receipt) pendingReceipt = undefined;
    if (rebase) await trial(receipt.attemptId);
  }
  async function trial(attemptId: string) {
    if (processed.has(attemptId)) return;
    processed.add(attemptId);
    try {
    await interactions!.flush();
    const candidate = await api<Candidate>(`/api/attempts/${attemptId}/candidate`);
    label(status, 'making');
    const receipt: TrialResult = { attemptId, packageHash: candidate.packageHash, baseVersionId: candidate.baseVersionId, baseRevision: candidate.baseRevision, ok: true };
    try {
      receipt.output = await runIsolated(candidate.package, candidate.baseline.state, candidate.packageHash, { migrate: true, previousProtocol: candidate.previousProtocol });
      await textures.prepare(candidate.package);
      const restored = await runIsolated(candidate.package, receipt.output.state, candidate.packageHash);
      if (canonical(restored.state) !== canonical(receipt.output.state) || canonical(restored.operations) !== canonical(receipt.output.operations) || canonical(restored.bindings ?? []) !== canonical(receipt.output.bindings ?? [])) throw new Error('候选场景无法从快照无损恢复');
    }
    catch (error) { receipt.ok = false; receipt.error = error instanceof Error ? error.message : String(error); }
    pendingReceipt = receipt;
    await persistReceipt();
    } catch (error) { if (!pendingReceipt) processed.delete(attemptId); throw error; }
  }
  async function resumeCandidates() {
    if (pendingReceipt) return;
    const activity = await api<{ attempts: { id: string; status: string }[] }>(`/api/worlds/${localWorldId}/activity`);
    for (const attempt of activity.attempts) if (attempt.status === 'trial') await trial(attempt.id);
  }
  let eventWork = Promise.resolve();
  const stream = new EventSource(`/api/worlds/${localWorldId}/events`);
  stream.onmessage = message => {
    const event = JSON.parse(message.data) as { kind: string; payload: { attemptId?: string; turnId?: string; versionId?: string; reason?: string; name?:string } };
    eventWork = eventWork.then(async () => {
      if (event.kind === 'image.generating') {
        const activity=await api<{attempts:{id:string;status:string}[]}>(`/api/worlds/${localWorldId}/activity`);
        if(activity.attempts.some(a=>a.id===event.payload.attemptId&&a.status==='generating')) label(status, event.payload.name ? 'drawing' : 'making', { name: event.payload.name ?? '' });
      } else if (event.kind === 'candidate.ready' && event.payload.attemptId) {
        // Replayed events can describe attempts already finalized; query current status.
        const records = await api<{ attempts: { id: string; status: string }[] }>(`/api/worlds/${localWorldId}/activity`);
        if (records.attempts.some(a => a.id === event.payload.attemptId && a.status === 'trial')) await trial(event.payload.attemptId);
      } else if (event.kind === 'version.committed' || event.kind === 'interaction.committed') {
        const snapshot = await api<WorldSnapshot>(`/api/worlds/${localWorldId}`);
        if (snapshot.versionId !== current.versionId) await applySnapshot(snapshot, false, event.kind === 'version.committed');
        // Playing the existing scene must not dismiss a failed generation's retry.
        if (event.kind === 'version.committed') { clearLabel(status); failedTurn = undefined; retry.hidden = true; }
      } else if (event.kind === 'attempt.failed') {
        const records = await api<{ turns: { id: string; status: string }[] }>(`/api/worlds/${localWorldId}/activity`);
        if (records.turns.find(t => t.id === event.payload.turnId)?.status === 'failed') {
          const messages: Record<string, Message> = {unsupported_sample:'fixtureFailed', provider_quota:'quota', provider_access:'providerAccess', provider_refusal:'refused'};
          label(status, messages[event.payload.reason ?? ''] ?? 'failed'); failedTurn = event.payload.turnId; retry.hidden = false;
        }
      }
    }).catch(error => { label(status, 'connecting'); console.error(error); });
  };
  stream.onerror = () => { label(status, 'connecting'); };
  stream.onopen = () => { if (status.dataset.i18n === 'connecting') clearLabel(status); void persistReceipt().catch(() => {}); };
  // A lost POST response does not require waiting for an SSE reconnection.
  const receiptTimer = setInterval(() => { void persistReceipt().catch(() => {}); void interactions!.flush().catch(() => {}); void resumeCandidates().catch(() => {}); }, 2000);
  window.addEventListener('pagehide', () => { stream.close(); clearInterval(receiptTimer); }, { once: true });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; send.disabled = !input.value.trim(); });
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && !composing && event.keyCode !== 229) event.preventDefault(); });
  const outboxKey = `outbox:${worldId}`;
  async function flushSubmission() {
    const stored = localStorage.getItem(outboxKey);
    if (!stored) return;
    const value = JSON.parse(stored);
    if (value.expiresAt && value.expiresAt <= new Date().toISOString()) { localStorage.removeItem(outboxKey); label(status, 'expired'); return; }
    await interactions!.flush();
    await api(`/api/worlds/${localWorldId}/turns`, { text: value.text, clientSubmissionId: value.clientSubmissionId, uiLocale: value.uiLocale, ...(value.artSelection??{}) });
    localStorage.removeItem(outboxKey);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing || !input.value.trim()) return;
    if (localStorage.getItem(outboxKey)) { label(status, 'sending'); return; }
    const clientSubmissionId = clientId();
    const artSelection = { ...art.selection(), viewport: { width: host.clientWidth, height: host.clientHeight } };
    localStorage.setItem(outboxKey, JSON.stringify({ text: input.value, clientSubmissionId, uiLocale: uiLocale(), artSelection, expiresAt: addCalendarMonths(new Date(), 3).toISOString() }));
    art.submitted();
    label(status, 'received'); input.value = ''; send.disabled = true; retry.hidden = true;
    void flushSubmission().catch(() => { label(status, 'offline'); });
  });
  retry.onclick = () => { if (failedTurn) { retry.hidden = true; label(status, 'retrying'); void api(`/api/turns/${failedTurn}/retry`, {}).catch(() => { retry.hidden = false; label(status, 'retryLater'); }); } };
  const outboxTimer = setInterval(() => { void flushSubmission().catch(() => {}); }, 2000);
  window.addEventListener('pagehide', () => clearInterval(outboxTimer), { once: true });
  await flushSubmission().catch(() => {});
}

const inspectMatch = location.pathname.match(/^\/inspect\/([\w-]+)$/);
void (inspectMatch ? inspect(inspectMatch[1]) : playground()).catch(showFatal);
