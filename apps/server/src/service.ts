import { randomUUID } from 'node:crypto';
import { canonical, validatePackage, validateOutput, validateWorldMode, type ScenePackage, type TrialResult, type Candidate, type WorldSnapshot, type InteractionReceipt } from '@and-there-was/scene';
import { Store, HttpError, now, type AttemptRow, type TurnRow } from './store';
import { FixtureGenerator, type Generator } from './generator';

export class WorldService {
  private pumping = new Set<string>();
  private closed = false;
  private sweepTimer: ReturnType<typeof setInterval>;
  private retentionTimer: ReturnType<typeof setInterval>;
  private controllers = new Set<AbortController>();
  get generatorId() { return this.generator.id; }
  constructor(readonly store: Store, private generator: Generator = new FixtureGenerator(), private trialTimeoutMs = 60000, private generationTimeoutMs = 125000) {
    // On process restart, an uncommitted candidate is never inferred to be active.
    const interrupted = store.db.prepare("SELECT * FROM attempts WHERE status IN ('generating','trial')").all() as AttemptRow[];
    for (const attempt of interrupted) this.fail(attempt.id, '服务已重启，本次尝试中断。可以重试。');
    this.sweepTimer = setInterval(() => this.sweep(), 1000);
    this.sweepTimer.unref();
    store.prune();
    this.retentionTimer = setInterval(() => { if (!this.closed) store.prune(); }, 60 * 60 * 1000);
    this.retentionTimer.unref();
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
      if (this.generator.id.startsWith('deepseek/')) this.store.db.prepare('UPDATE worlds SET retention_enabled=1 WHERE id=?').run(worldId);
      this.store.db.prepare("INSERT INTO turns(id,world_id,client_id,text,status,created_at,expires_at) VALUES (?,?,?,?,'queued',?,?)").run(id, worldId, clientId, text, now(), this.generator.id.startsWith('deepseek/') ? this.store.expiryForWorld(worldId) : null);
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
        const sdkVersion = baseline.mode ? 3 : 1;
        const requestHash = this.store.putJson({ adapter: this.generator.id, sdkVersion, worldMode: baseline.mode ?? 'legacy', text: turn.text, baseline });
        this.store.db.transaction(() => {
          this.store.db.prepare("INSERT INTO attempts(id,turn_id,status,base_version,base_revision,request_hash,created_at,updated_at,generator_id) VALUES (?,?,'generating',?,?,?,?,?,?)").run(attemptId, turn.id, baseline.versionId, baseline.revision, requestHash, now(), now(), this.generator.id);
          this.store.db.prepare("UPDATE turns SET status='generating',attempt_id=? WHERE id=?").run(attemptId, turn.id);
          this.store.event(worldId, 'attempt.generating', { turnId: turn.id, attemptId });
        })();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController(); this.controllers.add(controller);
        try {
          const previous = this.store.db.prepare("SELECT * FROM attempts WHERE turn_id=? AND status='failed' ORDER BY seq DESC LIMIT 1").get(turn.id) as AttemptRow | undefined;
          const previousResponse = previous?.response_hash ? this.store.json<{ content?: string }>(previous.response_hash) : undefined;
          const pkg = await Promise.race([
            this.generator.generate(turn.text, baseline, {
              previousPackage: baseline.packageHash ? this.store.json<ScenePackage>(baseline.packageHash) : undefined,
              previousFailure: previous ? { error: previous.error ?? 'Unknown error', ...(previous.package_hash ? { package: this.store.json<ScenePackage>(previous.package_hash) } : {}), ...(previousResponse?.content ? { content: previousResponse.content.slice(0, 16000) } : {}) } : undefined,
              signal: controller.signal,
              request: value => { if (!this.closed && !controller.signal.aborted) this.store.db.prepare('UPDATE attempts SET request_hash=? WHERE id=?').run(this.store.putJson(value), attemptId); },
              chunk: text => {
                if (this.closed) return;
                const hash = this.store.put(text, 'text/plain');
                this.store.db.prepare('INSERT INTO response_chunks(attempt_id,hash) VALUES (?,?)').run(attemptId, hash);
              },
              response: value => { if (!this.closed) this.store.db.prepare('UPDATE attempts SET response_hash=? WHERE id=?').run(this.store.putJson(value), attemptId); }
            }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('生成超时，请重试。')); }, this.generationTimeoutMs); })
          ]);
          if (this.closed) return;
          if (!this.store.attempt(attemptId).response_hash) this.store.db.prepare('UPDATE attempts SET response_hash=? WHERE id=?').run(this.store.put(JSON.stringify(pkg)), attemptId);
          // Save every candidate before validating, including failed candidates.
          for (const [name, content] of Object.entries(pkg.files ?? {})) if (typeof content === 'string') this.store.put(content, name.endsWith('.json') ? 'application/json' : 'text/plain');
          const packageHash = this.store.putJson(pkg);
          this.store.db.prepare('UPDATE attempts SET package_hash=? WHERE id=?').run(packageHash, attemptId);
          validateWorldMode(await validatePackage(pkg), baseline.mode);
          if (this.closed) return;
          this.store.db.transaction(() => {
            this.store.db.prepare("UPDATE attempts SET status='trial',updated_at=? WHERE id=?").run(now(), attemptId);
            this.store.db.prepare("UPDATE turns SET status='trial' WHERE id=?").run(turn.id);
            this.store.event(worldId, 'candidate.ready', { turnId: turn.id, attemptId, packageHash });
          })();
          return;
        } catch (error) {
          if (!this.closed) this.fail(attemptId, error instanceof Error ? error.message : String(error));
        } finally { if (timer) clearTimeout(timer); this.controllers.delete(controller); }
      }
    } finally { this.pumping.delete(worldId); }
  }
  candidate(attemptId: string): Candidate {
    let attempt = this.store.attempt(attemptId); const turn = this.store.turn(attempt.turn_id);
    if (attempt.status !== 'trial' || turn.attempt_id !== attemptId || !attempt.package_hash) throw new HttpError(409, 'Candidate no longer active');
    const baseline = this.store.world(turn.world_id);
    if (baseline.versionId !== attempt.base_version || baseline.revision !== attempt.base_revision) {
      this.store.db.prepare('UPDATE attempts SET base_version=?,base_revision=?,updated_at=? WHERE id=?').run(baseline.versionId, baseline.revision, now(), attemptId);
      this.store.event(turn.world_id, 'candidate.rebased', { attemptId, baseVersionId: baseline.versionId, baseRevision: baseline.revision });
      attempt = this.store.attempt(attemptId);
    }
    const previous = baseline.packageHash ? this.store.json<ScenePackage>(baseline.packageHash) : undefined;
    return { worldId: turn.world_id, turnId: turn.id, attemptId, packageHash: attempt.package_hash!, baseVersionId: attempt.base_version, baseRevision: attempt.base_revision, baseline, package: this.store.json(attempt.package_hash!), ...(previous ? { previousProtocol: JSON.parse(previous.files['protocol.json']) } : {}) };
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
      validateWorldMode(protocol, this.store.world(turn.world_id).mode);
      validateOutput(protocol, result.output);
      const resultHash = this.store.putJson(result);
      const committed = this.store.db.transaction(() => {
        // Re-read after async verification: another client may already have committed.
        const latestAttempt = this.store.attempt(attempt.id);
        if (latestAttempt.status === 'committed' && latestAttempt.committed_version) return this.store.version(latestAttempt.committed_version);
        const baseline = this.store.world(turn.world_id);
        if (latestAttempt.status !== 'trial' || baseline.versionId !== attempt.base_version || baseline.revision !== attempt.base_revision) throw new HttpError(409, 'Stale world baseline');
        const snapshot: WorldSnapshot = { worldId: turn.world_id, versionId: randomUUID(), parentVersionId: baseline.versionId, revision: baseline.revision + 1, packageHash: result.packageHash, state: result.output!.state, operations: result.output!.operations, ...(baseline.mode ? { mode: baseline.mode } : {}), ...(result.output!.bindings ? { bindings: result.output!.bindings } : {}), createdAt: now() };
        this.saveSnapshot(snapshot);
        this.store.db.prepare("UPDATE attempts SET status='committed',result_hash=?,committed_version=?,updated_at=? WHERE id=?").run(resultHash, snapshot.versionId, now(), attempt.id);
        this.store.db.prepare("UPDATE turns SET status='committed' WHERE id=?").run(turn.id);
        this.store.event(turn.world_id, 'version.committed', { turnId: turn.id, attemptId: attempt.id, versionId: snapshot.versionId });
        return snapshot;
      })();
      this.schedule(turn.world_id);
      return committed;
    } catch (error) {
      if (error instanceof HttpError && error.message === 'Stale world baseline') throw error;
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
    const chunks = this.store.db.prepare('SELECT c.* FROM response_chunks c JOIN attempts a ON c.attempt_id=a.id JOIN turns t ON a.turn_id=t.id WHERE t.world_id=? ORDER BY c.seq').all(worldId);
    const interactions = this.store.db.prepare('SELECT * FROM interactions WHERE world_id=? ORDER BY seq').all(worldId);
    return { snapshot, turns, attempts, versions, chunks, interactions, playback: this.store.playback(worldId), retention: { months: this.store.retentionMonths, currentWorldRetained: true }, events: this.store.events(worldId, 0, -1) };
  }
  private saveSnapshot(snapshot: WorldSnapshot) {
    this.store.db.prepare('INSERT INTO versions(id,world_id,snapshot,expires_at) VALUES (?,?,?,?)').run(snapshot.versionId, snapshot.worldId, canonical(snapshot), this.store.expiryForWorld(snapshot.worldId));
    this.store.db.prepare('UPDATE worlds SET current_version=?,revision=? WHERE id=?').run(snapshot.versionId, snapshot.revision, snapshot.worldId);
    this.store.alignPlayback(snapshot);
  }
  async interact(worldId: string, receipt: InteractionReceipt): Promise<WorldSnapshot | { failed: true }> {
    if (!/^[\w-]{8,100}$/.test(receipt.clientEventId)) throw new HttpError(400, 'Invalid interaction id');
    const previous = this.store.db.prepare('SELECT * FROM interactions WHERE world_id=? AND client_id=?').get(worldId, receipt.clientEventId) as { version_id: string; target_id: string; committed_version: string | null } | undefined;
    if (previous) {
      if (previous.version_id !== receipt.versionId || previous.target_id !== receipt.targetId) throw new HttpError(409, 'Interaction id reused');
      return previous.committed_version ? this.store.version(previous.committed_version) : { failed: true };
    }
    const baseline = this.store.world(worldId);
    if (baseline.versionId !== receipt.versionId || baseline.revision !== receipt.revision) throw new HttpError(409, 'Stale interaction baseline');
    const binding = baseline.bindings?.find(b => b.targetId === receipt.targetId);
    if (!binding || !baseline.packageHash) throw new HttpError(400, 'Target has no event binding');
    const pkg = this.store.json<ScenePackage>(baseline.packageHash), protocol = await validatePackage(pkg);
    let failure = receipt.error;
    if (!failure) {
      try { validateOutput(protocol, receipt.output); }
      catch (error) { failure = error instanceof Error ? error.message : 'Invalid interaction output'; }
    }
    const hash = this.store.putJson({ ...receipt, ...(failure ? { error: failure } : {}), event: binding });
    return this.store.db.transaction(() => {
      const duplicate = this.store.db.prepare('SELECT committed_version FROM interactions WHERE world_id=? AND client_id=?').get(worldId, receipt.clientEventId) as { committed_version: string | null } | undefined;
      if (duplicate) return duplicate.committed_version ? this.store.version(duplicate.committed_version) : { failed: true as const };
      const latest = this.store.world(worldId);
      if (latest.versionId !== baseline.versionId || latest.revision !== baseline.revision) throw new HttpError(409, 'Stale interaction baseline');
      const snapshot: WorldSnapshot | undefined = failure ? undefined : { ...baseline, versionId: randomUUID(), parentVersionId: baseline.versionId, revision: baseline.revision + 1, state: receipt.output!.state, operations: receipt.output!.operations, bindings: receipt.output!.bindings, createdAt: now() };
      if (snapshot) this.saveSnapshot(snapshot);
      this.store.db.prepare('INSERT INTO interactions(world_id,client_id,version_id,target_id,result_hash,committed_version,error,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)').run(worldId, receipt.clientEventId, baseline.versionId, receipt.targetId, hash, snapshot?.versionId ?? null, failure?.slice(0, 2000) ?? null, now(), this.store.expiryForWorld(worldId));
      this.store.event(worldId, snapshot ? 'interaction.committed' : 'interaction.failed', { clientEventId: receipt.clientEventId, versionId: snapshot?.versionId ?? baseline.versionId, targetId: receipt.targetId });
      return snapshot ?? { failed: true as const };
    })();
  }
  private sweep() {
    if (this.closed) return;
    const attempts = this.store.db.prepare("SELECT * FROM attempts WHERE status='trial' AND updated_at<?").all(new Date(Date.now() - this.trialTimeoutMs).toISOString()) as AttemptRow[];
    for (const attempt of attempts) this.fail(attempt.id, '试跑等待超时，请重试。');
  }
  close() { this.closed = true; for (const controller of this.controllers) controller.abort(); clearInterval(this.sweepTimer); clearInterval(this.retentionTimer); }
}
