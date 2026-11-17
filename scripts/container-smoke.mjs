import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {readFileSync} from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
// The smoke client uses the same sandbox as the browser, in a separate process.
// tsx is a CI/dev dependency, never part of the production container.
const { executePackage } = await import('tsx/esm/api').then(async ({ tsImport }) => tsImport('../packages/scene/src/sandbox.ts', import.meta.url));
const RELEASE_SYNC = (await import('@jitl/quickjs-wasmfile-release-sync')).default;
const suffix = randomUUID().slice(0, 8), image = `and-there-was-test:${suffix}`, container = `and-there-was-test-${suffix}`, volume = `${container}-data`;
function docker(...args) { const result = spawnSync('docker', args, { stdio: 'inherit', windowsHide: true }); if (result.error || result.status !== 0) throw result.error ?? new Error(`docker ${args[0]} failed`); }
let running = false, volumeCreated = false;
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:3180/api/health')).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)); }
  throw new Error('Container did not become ready');
}
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:3180${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text()); return response.json();
}
try {
  docker('build', '-t', image, '.'); docker('volume', 'create', volume); volumeCreated = true;
  docker('run', '-d', '--name', container, '-p', '127.0.0.1:3180:3000', '-v', `${volume}:/data`, image); running = true; await ready();
  const engine = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC), savedWorlds = [];
  for (const kind of [undefined, 'animated', 'storybook', 'images-animated', 'images-storybook']) {
  const withImages=kind?.startsWith('images-'),mode=kind?.replace('images-','');
  const world = await api('/api/worlds', mode ? {mode} : {});
  const upload=withImages ? await api(`/api/worlds/${world.worldId}/images`,{name:'容器上传验收图',role:'character',dataBase64:readFileSync('fixtures/library/rabbit.png').toString('base64')}) : undefined;
  const turn = await api(`/api/worlds/${world.worldId}/turns`, { text: withImages?'使用选中的素材':'有一个球', clientSubmissionId: randomUUID(),...(withImages?{artSource:'library',assetIds:[upload.imageId,'free_forest']}:{}) });
  let attempt;
  for (let i = 0; i < 100; i++) { const records = await api(`/api/worlds/${world.worldId}/records`); attempt = records.attempts.find(a => a.turn_id === turn.id && a.status === 'trial'); if (attempt) break; await new Promise(r => setTimeout(r, 100)); }
  if (!attempt) throw new Error('No candidate');
  const candidate = await api(`/api/attempts/${attempt.id}/candidate`);
  const output = await executePackage(engine, candidate.package, candidate.baseline.state, {migrate:true});
  const snapshot = await api('/api/trials', { attemptId: candidate.attemptId, packageHash: candidate.packageHash, baseVersionId: candidate.baseVersionId, baseRevision: candidate.baseRevision, ok: true, output });
  if (mode === 'animated') await api(`/api/worlds/${world.worldId}/playback`,{versionId:snapshot.versionId,elapsedMs:4321,paused:true});
  savedWorlds.push({world,snapshot,output,mode:kind,images:candidate.package.assets,playback:await api(`/api/worlds/${world.worldId}/playback`)});
  }
  docker('restart', container); await ready();
  for (const {world,snapshot,output,mode,images,playback} of savedWorlds) {
  const restored = await api(`/api/worlds/${world.worldId}`);
  if (!isDeepStrictEqual(restored, snapshot)) throw new Error('Container restart changed the saved world');
  if (!isDeepStrictEqual(await api(`/api/worlds/${world.worldId}/playback`),playback)) throw new Error('Playback did not restore');
  const response = await fetch(`http://127.0.0.1:3180/api/artifacts/${snapshot.packageHash}`);
  if (!response.ok) throw new Error('Saved package missing');
  const restoredOutput = await executePackage(engine, JSON.parse(await response.text()), restored.state);
  if (!isDeepStrictEqual(restoredOutput.state, output.state) || !isDeepStrictEqual(restoredOutput.operations, output.operations)) throw new Error('Restored code/state mismatch');
  for(const asset of images) {
    const imageResponse=await fetch(`http://127.0.0.1:3180/api/images/${asset.hash}`);
    if(!imageResponse.ok || createHash('sha256').update(Buffer.from(await imageResponse.arrayBuffer())).digest('hex')!==asset.hash)throw new Error('Image did not restore');
    const original=await fetch(`http://127.0.0.1:3180/api/images/${asset.imageId}/original`);
    if(!original.ok || createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex')!==asset.originalHash)throw new Error('Original image did not restore');
  }
  console.log(JSON.stringify({ result: 'passed', mode:mode ?? 'legacy', worldId: world.worldId, versionId: snapshot.versionId, packageHash: snapshot.packageHash }));
  }
} finally {
  if (running) docker('rm', '-f', container);
  if (volumeCreated) docker('volume', 'rm', volume);
}
