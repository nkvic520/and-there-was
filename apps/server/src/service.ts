import { randomUUID } from 'node:crypto';
import { canonical, validatePackage, validateOutput, type ScenePackage, type TrialResult, type Candidate, type WorldSnapshot } from '@and-there-was/scene';
import { Store, HttpError, now, type AttemptRow, type TurnRow } from './store';
import { FixtureGenerator, type Generator } from './generator';

export class WorldService {
  private pumping = new Set<string>();
  private closed = false;
  private sweepTimer: ReturnType<typeof setInterval>;
  constructor(readonly store: Store, private generator: Generator = new FixtureGenerator(), private trialTimeoutMs = 60000) {
    // On process restart, an uncommitted candidate is never inferred to be active.
    const interrupted = store.db.prepare("SELECT * FROM attempts WHERE status IN ('generating','trial')").all() as AttemptRow[];
    for (const attempt of interrupted) this.fail(attempt.id, '服务已重启，本次尝试中断。可以重试。');
    this.sweepTimer = setInterval(() => this.sweep(), 1000);
    this.sweepTimer.unref();
    for (const row of store.db.prepare("SELECT DISTINCT world_id FROM turns WHERE status='queued'").all() as { world_id: string }[]) this.schedule(row.world_id);
  }
  schedule(worldId: string) { queueMicrotask(() => { if (!this.closed) void this.pump(worldId); }); }
  submit(worldId: string, clientId: string, text: string): TurnRow {
    this.store.world(worldId);
    if (!/^[\w-]{8,100}$/.test(clientId) || !text.trim() || text.length > 2000) throw new HttpError(400, 'Invalid submission');
    const existing = this.store.db.prepare('SELECT * FROM turns WHERE world_id=? AND client_id=?').get(worldId, clientId) as TurnRow | undefined;
    if (existing) {
      if (existing.text !== text) throw new HttpError(409, 'Submission id already used with different text');
      return existing;
    }
    const id = randomUUID();
    this.store.db.transaction(() => {
      this.store.db.prepare("INSERT INTO turns(id,world_id,client_id,text,status,created_at) VALUES (?,?,?,?,'queued',?)").run(id, worldId, clientId, text, now());
      this.store.event(worldId, 'turn.queued', { turnId: id, receivedVersionId: this.store.world(worldId).versionId });
    })();
    this.schedule(worldId);
    return this.store.turn(id);
  }
  retry(turnId: string): TurnRow {
    const turn = this.store.turn(turnId);
    // Repeated retry requests while queued/running return the same attempt.
    if (turn.status === 'committed') throw new HttpError(409, 'A successful turn cannot be retried');
    if (turn.status !== 'failed') return turn;
    this.store.db.transaction(() => {
      this.store.db.prepare("UPDATE turns SET status='queued' WHERE id=?").run(turnId);
      this.store.event(turn.world_id, 'turn.retried', { turnId });
    })();
    this.schedule(turn.world_id);
    return this.store.turn(turnId);
  }
  private async pump(worldId: string): Promise<void> {
    if (this.closed || this.pumping.has(worldId)) return;
    this.pumping.add(worldId);
    try {
      while (!this.closed) {
        if (this.store.db.prepare("SELECT 1 FROM turns WHERE world_id=? AND status IN ('generating','trial')").get(worldId)) return;
        const turn = this.store.db.prepare("SELECT * FROM turns WHERE world_id=? AND status='queued' ORDER BY seq LIMIT 1").get(worldId) as TurnRow | undefined;
        if (!turn) return;
        const baseline = this.store.world(worldId), attemptId = randomUUID();
        const requestHash = this.store.putJson({ adapter: this.generator.id, promptVersion: 1, sdkVersion: 1, runtime: 'quickjs-wasm-0.32.0/sdk-1', text: turn.text, baseline, sdk: ['getState', 'setState', 'circle', 'ellipse'], instruction: 'Generate a closed state schema, a synchronous mount(sdk) module, and a normalized view.' });
        this.store.db.transaction(() => {
          this.store.db.prepare("INSERT INTO attempts(id,turn_id,status,base_version,base_revision,request_hash,created_at,updated_at) VALUES (?,?,'generating',?,?,?,?,?)").run(attemptId, turn.id, baseline.versionId, baseline.revision, requestHash, now(), now());
          this.store.db.prepare("UPDATE turns SET status='generating',attempt_id=? WHERE id=?").run(attemptId, turn.id);
          this.store.event(worldId, 'attempt.generating', { turnId: turn.id, attemptId });
        })();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const pkg = await Promise.race([
            this.generator.generate(turn.text, baseline),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('生成超时，请重试。')), 10000); })
          ]);
          if (this.closed) return;
          const responseHash = this.store.put(JSON.stringify(pkg));
          this.store.db.prepare('UPDATE attempts SET response_hash=? WHERE id=?').run(responseHash, attemptId);
          // Save every candidate before validating, including failed candidates.
          for (const [name, content] of Object.entries(pkg.files ?? {})) if (typeof content === 'string') this.store.put(content, name.endsWith('.json') ? 'application/json' : 'text/plain');
          const packageHash = this.store.putJson(pkg);
          this.store.db.prepare('UPDATE attempts SET package_hash=? WHERE id=?').run(packageHash, attemptId);
          await validatePackage(pkg);
          if (this.closed) return;
          this.store.db.transaction(() => {
            this.store.db.prepare("UPDATE attempts SET status='trial',updated_at=? WHERE id=?").run(now(), attemptId);
            this.store.db.prepare("UPDATE turns SET status='trial' WHERE id=?").run(turn.id);
            this.store.event(worldId, 'candidate.ready', { turnId: turn.id, attemptId, packageHash });
          })();
          return;
        } catch (error) {
          if (!this.closed) this.fail(attemptId, error instanceof Error ? error.message : String(error));
        } finally { if (timer) clearTimeout(timer); }
      }
    } finally { this.pumping.delete(worldId); }
  }
  candidate(attemptId: string): Candidate {
    const attempt = this.store.attempt(attemptId), turn = this.store.turn(attempt.turn_id);
    if (attempt.status !== 'trial' || turn.attempt_id !== attemptId || !attempt.package_hash) throw new HttpError(409, 'Candidate no longer active');
    return { worldId: turn.world_id, turnId: turn.id, attemptId, packageHash: attempt.package_hash, baseVersionId: attempt.base_version, baseRevision: attempt.base_revision, baseline: this.store.version(attempt.base_version), package: this.store.json(attempt.package_hash) };
  }
  fail(attemptId: string, error: string, result?: unknown) {
    const attempt = this.store.attempt(attemptId), turn = this.store.turn(attempt.turn_id);
    if (!['generating', 'trial'].includes(attempt.status)) return;
    const resultHash = this.store.putJson(result ?? { ok: false, error });
    this.store.db.transaction(() => {
      this.store.db.prepare("UPDATE attempts SET status='failed',error=?,result_hash=?,updated_at=? WHERE id=?").run(error.slice(0, 2000), resultHash, now(), attemptId);
      this.store.db.prepare("UPDATE turns SET status='failed' WHERE id=? AND attempt_id=?").run(turn.id, attemptId);
      this.store.event(turn.world_id, 'attempt.failed', { turnId: turn.id, attemptId, error: error.slice(0, 2000) });
    })();
    this.schedule(turn.world_id);
  }
  async trial(result: TrialResult): Promise<WorldSnapshot | { failed: true }> {
    const attempt = this.store.attempt(result.attemptId), turn = this.store.turn(attempt.turn_id);
    if (attempt.package_hash !== result.packageHash || attempt.base_version !== result.baseVersionId || attempt.base_revision !== result.baseRevision) throw new HttpError(409, 'Trial receipt does not match candidate');
    if (attempt.status === 'committed' && attempt.committed_version) return this.store.version(attempt.committed_version);
    if (attempt.status !== 'trial' || turn.attempt_id !== attempt.id) throw new HttpError(409, 'Expired attempt');
    if (!result.ok) { this.fail(attempt.id, result.error || '隔离试跑失败', result); return { failed: true }; }
    try {
      const pkg = this.store.json<ScenePackage>(result.packageHash);
      const protocol = await validatePackage(pkg);
      validateOutput(protocol, result.output);
      const resultHash = this.store.putJson(result);
      const committed = this.store.db.transaction(() => {
        // Re-read after async verification: another client may already have committed.
        const latestAttempt = this.store.attempt(attempt.id);
        if (latestAttempt.status === 'committed' && latestAttempt.committed_version) return this.store.version(latestAttempt.committed_version);
        const baseline = this.store.world(turn.world_id);
        if (latestAttempt.status !== 'trial' || baseline.versionId !== attempt.base_version || baseline.revision !== attempt.base_revision) throw new HttpError(409, 'Stale world baseline');
        const snapshot: WorldSnapshot = { worldId: turn.world_id, versionId: randomUUID(), parentVersionId: baseline.versionId, revision: baseline.revision + 1, packageHash: result.packageHash, state: result.output!.state, operations: result.output!.operations, createdAt: now() };
        this.store.db.prepare('INSERT INTO versions VALUES (?,?,?)').run(snapshot.versionId, snapshot.worldId, canonical(snapshot));
        this.store.db.prepare('UPDATE worlds SET current_version=?,revision=? WHERE id=?').run(snapshot.versionId, snapshot.revision, snapshot.worldId);
        this.store.db.prepare("UPDATE attempts SET status='committed',result_hash=?,committed_version=?,updated_at=? WHERE id=?").run(resultHash, snapshot.versionId, now(), attempt.id);
        this.store.db.prepare("UPDATE turns SET status='committed' WHERE id=?").run(turn.id);
        this.store.event(turn.world_id, 'version.committed', { turnId: turn.id, attemptId: attempt.id, versionId: snapshot.versionId });
        return snapshot;
      })();
      this.schedule(turn.world_id);
      return committed;
    } catch (error) {
      this.fail(attempt.id, error instanceof Error ? error.message : String(error), result);
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid trial output');
    }
  }
  records(worldId: string) {
    const snapshot = this.store.world(worldId);
    const turns = this.store.db.prepare('SELECT * FROM turns WHERE world_id=? ORDER BY seq').all(worldId) as TurnRow[];
    const attempts = this.store.db.prepare('SELECT a.* FROM attempts a JOIN turns t ON a.turn_id=t.id WHERE t.world_id=? ORDER BY a.seq').all(worldId) as AttemptRow[];
    const versions = (this.store.db.prepare('SELECT snapshot FROM versions WHERE world_id=? ORDER BY rowid').all(worldId) as { snapshot: string }[]).map(row => JSON.parse(row.snapshot));
    return { snapshot, turns, attempts, versions, events: this.store.events(worldId, 0) };
  }
  private sweep() {
    if (this.closed) return;
    const attempts = this.store.db.prepare("SELECT * FROM attempts WHERE status='trial' AND updated_at<?").all(new Date(Date.now() - this.trialTimeoutMs).toISOString()) as AttemptRow[];
    for (const attempt of attempts) this.fail(attempt.id, '试跑等待超时，请重试。');
  }
  close() { this.closed = true; clearInterval(this.sweepTimer); }
}
