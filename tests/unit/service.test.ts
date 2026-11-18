import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../apps/server/src/app';
import { FixtureGenerator, type Generator } from '../../apps/server/src/generator';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import type { Candidate, TrialResult, WorldSnapshot } from '@and-there-was/scene';

let engine: Awaited<ReturnType<typeof createEngine>>;
let instances: Awaited<ReturnType<typeof createApp>>[] = [], directories: string[] = [];
beforeAll(async () => { engine = await createEngine(); });
afterEach(async () => {
  for (const instance of instances) await instance.app.close(); instances = [];
  for (const directory of directories) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '\\and-there-was-') && !resolve(directory).startsWith(resolve(tmpdir()) + '/and-there-was-')) throw new Error('Unsafe test cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
  directories = [];
});
async function setup(generator?: Generator, existing?: string) {
  const directory = existing ?? mkdtempSync(join(tmpdir(), 'and-there-was-'));
  if (!existing) directories.push(directory);
  const instance = await createApp({ dataDir: directory, generator }); instances.push(instance); return instance;
}
async function until<T>(fn: () => T | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('Timed out waiting for service');
}
async function candidate(instance: Awaited<ReturnType<typeof setup>>, worldId: string, text = '有一个球') {
  const turn = instance.service.submit(worldId, randomUUID(), text);
  return until(() => { const latest = instance.store.turn(turn.id); return latest.status === 'trial' ? instance.service.candidate(latest.attempt_id!) : undefined; });
}
async function receipt(c: Candidate): Promise<TrialResult> { return { attemptId: c.attemptId, packageHash: c.packageHash, baseVersionId: c.baseVersionId, baseRevision: c.baseRevision, ok: true, output: await executePackage(engine, c.package, c.baseline.state) }; }
describe('durability, protocol and commit boundaries', () => {
  it('archives text, request, raw response, source and state then restores from disk', async () => {
    const first = await setup(), empty = first.store.createWorld();
    const c = await candidate(first, empty.worldId, ' 有一个球 ');
    expect(first.store.world(empty.worldId).revision).toBe(0);
    const saved = await first.service.trial(await receipt(c)) as WorldSnapshot;
    expect(saved.revision).toBe(1);
    const records = first.service.records(empty.worldId);
    expect(records.turns[0].text).toBe(' 有一个球 ');
    expect(records.attempts[0].request_hash).toBeTruthy(); expect(records.attempts[0].response_hash).toBeTruthy(); expect(records.attempts[0].result_hash).toBeTruthy();
    for (const hash of Object.values(c.package.hashes)) expect(first.store.read(hash)).toBeTruthy();
    const directory = first.store.directory; await first.app.close(); instances = instances.filter(i => i !== first);
    const restarted = await setup(undefined, directory);
    expect(restarted.store.world(empty.worldId)).toEqual(saved);
    expect(restarted.service.records(empty.worldId).turns).toHaveLength(1);
  });
  it('deduplicates network retries and rejects id reuse for different text', async () => {
    const s = await setup(), world = s.store.createWorld(), id = randomUUID();
    const first = s.service.submit(world.worldId, id, '有一个球');
    expect(s.service.submit(world.worldId, id, '有一个球').id).toBe(first.id);
    expect(() => s.service.submit(world.worldId, id, '另一句话')).toThrow(/different text/);
    expect(s.service.records(world.worldId).turns).toHaveLength(1);
  });
  it('handles a lost commit acknowledgement and concurrent duplicate receipts', async () => {
    const s = await setup(), world = s.store.createWorld(), result = await receipt(await candidate(s, world.worldId));
    const [a, b] = await Promise.all([s.service.trial(result), s.service.trial(result)]);
    expect(a).toEqual(b); expect(await s.service.trial(result)).toEqual(a);
    expect(s.service.records(world.worldId).versions).toHaveLength(2);
  });
  it('serializes queued turns and uses the latest committed baseline', async () => {
    const s = await setup(), world = s.store.createWorld(), first = await candidate(s, world.worldId);
    const second = s.service.submit(world.worldId, randomUUID(), '有一个球'); expect(second.status).toBe('queued');
    const saved = await s.service.trial(await receipt(first)) as WorldSnapshot;
    const next = await until(() => { const t = s.store.turn(second.id); return t.status === 'trial' ? s.service.candidate(t.attempt_id!) : undefined; });
    expect(next.baseVersionId).toBe(saved.versionId);
    const again = await s.service.trial(await receipt(next)) as WorldSnapshot;
    expect(again.state).toEqual(saved.state); expect(s.service.records(world.worldId).turns).toHaveLength(2);
  });
  it('retains an active world on failed trial and records retry as another attempt', async () => {
    const s = await setup(), world = s.store.createWorld();
    const saved = await s.service.trial(await receipt(await candidate(s, world.worldId)));
    const bad = await candidate(s, world.worldId); const result = await receipt(bad); result.output!.state = {};
    await expect(s.service.trial(result)).rejects.toThrow(/Invalid scene state/);
    expect(s.store.world(world.worldId)).toEqual(saved);
    s.service.retry(bad.turnId);
    const next = await until(() => { const t = s.store.turn(bad.turnId); return t.status === 'trial' ? s.service.candidate(t.attempt_id!) : undefined; });
    expect(next.attemptId).not.toBe(bad.attemptId);
    await expect(s.service.trial(result)).rejects.toThrow(/Expired/);
    await s.service.trial(await receipt(next));
    expect(s.service.records(world.worldId).attempts).toHaveLength(3);
  });
  it('rejects stale baselines inside the commit transaction', async () => {
    const s = await setup(), world = s.store.createWorld(), c = await candidate(s, world.worldId);
    s.store.db.prepare('UPDATE worlds SET revision=revision+1 WHERE id=?').run(world.worldId);
    // world() reads a version snapshot; simulate a legitimately newer state revision.
    const changed = { ...world, revision: 1 }; s.store.db.prepare('UPDATE versions SET snapshot=? WHERE id=?').run(JSON.stringify(changed), world.versionId);
    await expect(s.service.trial(await receipt(c))).rejects.toThrow(/Stale/);
    expect(s.service.records(world.worldId).versions).toHaveLength(1);
  });
  it('preserves interrupted candidate on restart without activating it', async () => {
    const first = await setup(), world = first.store.createWorld(), c = await candidate(first, world.worldId), directory = first.store.directory;
    await first.app.close(); instances = instances.filter(i => i !== first);
    const next = await setup(undefined, directory);
    expect(next.store.world(world.worldId)).toEqual(world);
    expect(next.store.attempt(c.attemptId).status).toBe('failed'); expect(next.store.read(c.packageHash)).toBeTruthy();
    next.service.retry(c.turnId);
    await until(() => next.store.turn(c.turnId).status === 'trial' || undefined);
  });
  it('retains unsupported text and generator errors', async () => {
    const s = await setup(), world = s.store.createWorld(), turn = s.service.submit(world.worldId, randomUUID(), '要有光');
    await until(() => s.store.turn(turn.id).status === 'failed' || undefined);
    expect(s.service.records(world.worldId).turns[0].text).toBe('要有光'); expect(s.store.world(world.worldId)).toEqual(world);
    expect(s.store.attempt(s.store.turn(turn.id).attempt_id!).error).toContain('暂时只支持');
  });
  it('retains corrupt candidate artifacts but never publishes them', async () => {
    const generator: Generator = { id: 'test/corrupt', generate: async () => { const pkg = await new FixtureGenerator().generate('有一个球'); pkg.hashes['scene.js'] = '0'.repeat(64); return pkg; } };
    const s = await setup(generator), world = s.store.createWorld(), turn = s.service.submit(world.worldId, randomUUID(), '有一个球');
    await until(() => s.store.turn(turn.id).status === 'failed' || undefined);
    const attempt = s.store.attempt(s.store.turn(turn.id).attempt_id!);
    expect(attempt.response_hash).toBeTruthy(); expect(attempt.package_hash).toBeTruthy(); expect(s.store.world(world.worldId)).toEqual(world);
  });
  it('detects on-disk tampering before commit', async () => {
    const s = await setup(), world = s.store.createWorld(), c = await candidate(s, world.worldId), result = await receipt(c);
    writeFileSync(join(s.store.directory, 'artifacts', c.packageHash), '{}');
    await expect(s.service.trial(result)).rejects.toThrow(/hash mismatch/);
    expect(s.store.world(world.worldId).revision).toBe(0);
  });
  it('replays only events after the saved SSE cursor', async () => {
    const s = await setup(), world = s.store.createWorld(), before = s.store.events(world.worldId, 0).at(-1)!.id;
    await candidate(s, world.worldId);
    await s.app.listen({ host: '127.0.0.1', port: 0 });
    const address = s.app.server.address(); if (!address || typeof address === 'string') throw new Error('No address');
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/worlds/${world.worldId}/events`, { headers: { 'Last-Event-ID': String(before) }, signal: controller.signal });
    const reader = response.body!.getReader(), { value } = await reader.read(); controller.abort();
    const text = new TextDecoder().decode(value); expect(text).toContain('candidate.ready'); expect(text).not.toContain('world.created');
  });
  it('rejects malformed API input and cross-origin writes', async () => {
    const s = await setup(), world = s.store.createWorld();
    expect((await s.app.inject({ method: 'POST', url: `/api/worlds/${world.worldId}/turns`, payload: { text: 12 } })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: '/api/worlds', headers: { origin: 'https://attacker.example' }, payload: {} })).statusCode).toBe(403);
    expect((await s.app.inject('/api/artifacts/not-a-hash')).statusCode).toBe(404);
  });
});

it('commits language with the version, and replays a submission using its original menu preference', async () => {
  const s = await setup(), world = s.store.createWorld('storybook');
  const url = '/api/worlds/' + world.worldId + '/turns';
  const payload = {text:'  Il y a une balle  ',clientSubmissionId:randomUUID(),uiLocale:'de'};
  expect((await s.app.inject({method:'POST',url,payload:{...payload,uiLocale:'de-invalid'}})).statusCode).toBe(400);
  const first = (await s.app.inject({method:'POST',url,payload})).json();
  const replay = (await s.app.inject({method:'POST',url,payload:{...payload,uiLocale:'ja'}})).json();
  expect(replay).toMatchObject({id:first.id,ui_locale:'de',text:payload.text});
  async function pending() {
    return until(() => {
      const turn = s.store.turn(first.id);
      return turn.status === 'trial' ? s.service.candidate(turn.attempt_id!) : undefined;
    });
  }
  const c = await pending();
  expect(s.store.world(world.worldId).storyLocale).toBeUndefined();
  const base = {attemptId:c.attemptId,packageHash:c.packageHash,baseRevision:c.baseRevision,baseVersionId:c.baseVersionId};
  await s.service.trial({...base,ok:false,error:'Test interrupted trial'});
  expect(s.store.world(world.worldId)).toEqual(world);
  s.service.retry(first.id);
  const retried = await pending();
  const output = await executePackage(engine,retried.package,retried.baseline.state,{migrate:true});
  const saved = await s.service.trial({...base,attemptId:retried.attemptId,packageHash:retried.packageHash,ok:true,output});
  expect(saved).toMatchObject({storyLocale:'fr',revision:1});
  expect(s.service.records(world.worldId).turns).toHaveLength(1);
});
