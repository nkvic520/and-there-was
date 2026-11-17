import { afterEach, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addCalendarMonths, canonical, sha256, type Candidate, type WorldSnapshot, type InteractionReceipt } from '@and-there-was/scene';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import { createApp } from '../../apps/server/src/app';
import type { Generator, GenerationContext } from '../../apps/server/src/generator';
import { interactivePackage } from '../helpers/interactive';

let engine: Awaited<ReturnType<typeof createEngine>>;
let instances: Awaited<ReturnType<typeof createApp>>[] = [], directories: string[] = [];
beforeAll(async () => { engine = await createEngine(); });
afterEach(async () => {
  for (const instance of instances) await instance.app.close(); instances = [];
  for (const directory of directories) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '/and-there-was-interactive-') && !resolve(directory).startsWith(resolve(tmpdir()) + '\\and-there-was-interactive-')) throw new Error('Unsafe cleanup');
    rmSync(directory, { recursive: true, force: true });
  } directories = [];
});
async function setup(existing?: string, generator?: Generator) {
  const directory = existing ?? mkdtempSync(join(tmpdir(), 'and-there-was-interactive-')); if (!existing) directories.push(directory);
  const app = await createApp({ dataDir: directory, generator: generator ?? { id: 'deepseek/test-double', generate: text => interactivePackage(text.includes('upgrade')) } });
  instances.push(app); return app;
}
async function candidate(s: Awaited<ReturnType<typeof setup>>, worldId: string, text = 'private marker') {
  const turn = s.service.submit(worldId, randomUUID(), text);
  for (let i = 0; i < 100; i++) { const row = s.store.turn(turn.id); if (row.status === 'trial') return s.service.candidate(row.attempt_id!); await new Promise(r => setTimeout(r, 10)); }
  throw new Error('No candidate');
}
async function receipt(c: Candidate) { return { attemptId: c.attemptId, packageHash: c.packageHash, baseVersionId: c.baseVersionId, baseRevision: c.baseRevision, ok: true, output: await executePackage(engine, c.package, c.baseline.state, { migrate: true, previousProtocol: c.previousProtocol }) }; }
async function tap(s: Awaited<ReturnType<typeof setup>>, state: WorldSnapshot): Promise<InteractionReceipt> {
  const pkg = s.store.json<Awaited<ReturnType<typeof interactivePackage>>>(state.packageHash!);
  return { clientEventId: randomUUID(), versionId: state.versionId, revision: state.revision, targetId: 'light', output: await executePackage(engine, pkg, state.state, { event: { name: 'light.tapped', payload: {} } }) };
}
it('persists two taps, restarts, reveals a door on the third, and migrates new required state without losing progress', async () => {
  let s = await setup(); const empty = s.store.createWorld();
  let state = await s.service.trial(await receipt(await candidate(s, empty.worldId))) as WorldSnapshot;
  const first = await tap(s, state); state = await s.service.interact(empty.worldId, first) as WorldSnapshot;
  expect(await s.service.interact(empty.worldId, first)).toEqual(state);
  state = await s.service.interact(empty.worldId, await tap(s, state)) as WorldSnapshot;
  expect(state.state).toEqual({ taps: 2, door: false });
  const baseline = canonical(state), dir = s.store.directory;
  await s.app.close(); instances = instances.filter(value => value !== s); s = await setup(dir);
  expect(canonical(s.store.world(empty.worldId))).toBe(baseline);
  state = await s.service.interact(empty.worldId, await tap(s, state)) as WorldSnapshot;
  expect(state.state).toEqual({ taps: 3, door: true }); expect(state.operations.some(op => op.id === 'door')).toBe(true);
  state = await s.service.trial(await receipt(await candidate(s, empty.worldId, 'upgrade'))) as WorldSnapshot;
  expect(state.state).toEqual({ taps: 3, door: true, color: '#ffc233' });
  expect(s.service.records(empty.worldId).interactions).toHaveLength(3);
});
it('rebases a candidate onto interactions that occurred during generation without regenerating or resetting state', async () => {
  const s = await setup(), world = s.store.createWorld();
  let state = await s.service.trial(await receipt(await candidate(s, world.worldId))) as WorldSnapshot;
  const c = await candidate(s, world.worldId, 'upgrade'), stale = await receipt(c);
  state = await s.service.interact(world.worldId, await tap(s, state)) as WorldSnapshot;
  await expect(s.service.trial(stale)).rejects.toThrow('Stale world baseline');
  expect(s.store.attempt(c.attemptId).status).toBe('trial');
  const rebased = s.service.candidate(c.attemptId); expect(rebased.packageHash).toBe(c.packageHash);
  const saved = await s.service.trial(await receipt(rebased)) as WorldSnapshot;
  expect(saved.state.taps).toBe(1); expect(saved.state.color).toBe('#ffc233');
});
it('rolls back a failed event, archives its diagnostic, and rejects stale event output', async () => {
  const s = await setup(), world = s.store.createWorld();
  const state = await s.service.trial(await receipt(await candidate(s, world.worldId))) as WorldSnapshot;
  const bad = { ...(await tap(s, state)), error: 'VM interrupted' }; delete bad.output;
  expect(await s.service.interact(world.worldId, bad)).toEqual({ failed: true }); expect(s.store.world(world.worldId)).toEqual(state);
  const invalid = await tap(s, state); invalid.output!.state = { injected: true };
  expect(await s.service.interact(world.worldId, invalid)).toEqual({ failed: true });
  expect(await s.service.interact(world.worldId, invalid)).toEqual({ failed: true });
  expect(s.store.world(world.worldId)).toEqual(state);
  const old = await tap(s, state); await s.service.interact(world.worldId, await tap(s, state));
  await expect(s.service.interact(world.worldId, old)).rejects.toThrow('Stale interaction baseline');
  expect(s.service.records(world.worldId).interactions).toHaveLength(3);
  expect(s.service.records(world.worldId).interactions[1]).toMatchObject({ error: expect.stringContaining('Invalid scene state') });
});
it('passes the failed code and diagnostic into an explicit retry and preserves both attempts', async () => {
  const contexts: GenerationContext[] = [], good = await interactivePackage(), bad = structuredClone(good);
  bad.files['scene.js'] = 'export function mount(){throw new Error("broken model code")}'; bad.hashes['scene.js'] = await sha256(bad.files['scene.js']);
  const s = await setup(undefined, { id: 'deepseek/test-double', generate: async (_text, _snapshot, context) => { contexts.push(context!); context?.response({ content: 'archived model text' }); return contexts.length === 1 ? bad : good; } });
  const world = s.store.createWorld(), c = await candidate(s, world.worldId);
  await expect(receipt(c)).rejects.toThrow('broken model code');
  await s.service.trial({ attemptId: c.attemptId, packageHash: c.packageHash, baseVersionId: c.baseVersionId, baseRevision: c.baseRevision, ok: false, error: 'broken model code' });
  s.service.retry(c.turnId);
  for (let i = 0; i < 100 && s.store.turn(c.turnId).status !== 'trial'; i++) await new Promise(r => setTimeout(r, 10));
  const retry = s.service.candidate(s.store.turn(c.turnId).attempt_id!);
  const saved = await s.service.trial(await receipt(retry)) as WorldSnapshot;
  expect(saved.state.taps).toBe(0);
  expect(contexts[1].previousFailure).toEqual({ error: 'broken model code', package: bad, content: 'archived model text' });
  expect(s.service.records(world.worldId).attempts.map(a => a.status)).toEqual(['failed', 'committed']);
});
it('retains an expired baseline while an unexpired interaction still references it', async () => {
  const s = await setup(), world = s.store.createWorld();
  const baseline = await s.service.trial(await receipt(await candidate(s, world.worldId))) as WorldSnapshot;
  await s.service.interact(world.worldId, await tap(s, baseline));
  s.store.db.prepare('UPDATE turns SET expires_at=? WHERE world_id=?').run('2000-01-01', world.worldId);
  s.store.db.prepare('UPDATE versions SET expires_at=? WHERE id=?').run('2000-01-01', baseline.versionId);
  s.store.prune();
  expect(s.service.records(world.worldId).attempts).toHaveLength(0);
  expect(s.store.version(baseline.versionId)).toEqual(baseline);
});
it('rejects undeclared event payloads, invalid migration and excessive bindings in the sandbox', async () => {
  const pkg = await interactivePackage(), initial = await executePackage(engine, pkg, {}, { migrate: true });
  await expect(executePackage(engine, pkg, initial.state, { event: { name: 'light.tapped', payload: { injected: true } } })).rejects.toThrow('Invalid event payload');
  const bad = structuredClone(pkg); bad.files['scene.js'] = 'export function migrate(sdk){sdk.setState({bad:true})} export function mount(){}'; bad.hashes['scene.js'] = await sha256(bad.files['scene.js']);
  await expect(executePackage(engine, bad, initial.state, { migrate: true })).rejects.toThrow('Invalid scene state');
  expect(initial.state).toEqual({ taps: 0, door: false });
  bad.files['scene.js'] = pkg.files['scene.js'].replace("sdk.onTap('light','light.tapped',{});", "for(let i=0;i<1001;i++){try{sdk.onTap('light','light.tapped',{})}catch(e){}}"); bad.hashes['scene.js'] = await sha256(bad.files['scene.js']);
  await expect(executePackage(engine, bad, initial.state)).rejects.toThrow('Binding limit');
});
it('purges expired real archives and unreferenced files while preserving the exact playable current world', async () => {
  const s = await setup(), world = s.store.createWorld();
  let state = await s.service.trial(await receipt(await candidate(s, world.worldId))) as WorldSnapshot;
  state = await s.service.interact(world.worldId, await tap(s, state)) as WorldSnapshot;
  const records = s.service.records(world.worldId), requestHash = records.attempts[0].request_hash!;
  const deadline = new Date(addCalendarMonths(new Date(), 3).getTime() + 1000);
  const result = s.store.prune(deadline);
  expect(result.turns).toBe(1); expect(result.interactions).toBe(1); expect(result.versions).toBeGreaterThan(0);
  expect(s.service.records(world.worldId).attempts).toHaveLength(0); expect(() => s.store.read(requestHash)).toThrow('Artifact not found');
  expect(s.store.world(world.worldId)).toEqual(state);
  const pkg = s.store.json<Awaited<ReturnType<typeof interactivePackage>>>(state.packageHash!);
  const restored = await executePackage(engine, pkg, state.state); expect(restored.state).toEqual(state.state); expect(restored.operations).toEqual(state.operations);
  for (const hash of Object.values(pkg.hashes)) expect(s.store.read(hash)).toBeTruthy();
});
it('uses calendar-month expiry with end-of-month clamping', () => {
  expect(addCalendarMonths(new Date('2026-08-31T12:30:00.000Z'), 3).toISOString()).toBe('2026-11-30T12:30:00.000Z');
});
