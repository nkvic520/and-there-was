import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { addCalendarMonths, canonical, record, type WorldSnapshot, type WorldMode, type MotionCues } from '@and-there-was/scene';

export interface TurnRow { seq: number; id: string; world_id: string; client_id: string; text: string; status: string; attempt_id: string | null; created_at: string }
export interface AttemptRow { seq: number; id: string; turn_id: string; status: string; base_version: string; base_revision: number; package_hash: string | null; request_hash: string | null; response_hash: string | null; result_hash: string | null; committed_version: string | null; error: string | null; created_at: string; updated_at: string }
export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
export const now = () => new Date().toISOString();
export class Store {
  readonly db: Database.Database;
  readonly directory: string;
  constructor(directory: string, readonly retentionMonths = 3) {
    if (retentionMonths !== 3) throw new Error('This deployment retains real archives for 3 calendar months');
    this.directory = resolve(directory);
    mkdirSync(join(this.directory, 'artifacts'), { recursive: true });
    this.db = new Database(join(this.directory, 'worlds.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('secure_delete = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, current_version TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, world_id TEXT NOT NULL REFERENCES worlds(id), client_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, attempt_id TEXT, created_at TEXT NOT NULL, UNIQUE(world_id, client_id));
      CREATE TABLE IF NOT EXISTS attempts (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, turn_id TEXT NOT NULL REFERENCES turns(id), status TEXT NOT NULL, base_version TEXT NOT NULL, base_revision INTEGER NOT NULL, package_hash TEXT, request_hash TEXT, response_hash TEXT, result_hash TEXT, committed_version TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL REFERENCES worlds(id), kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts (hash TEXT PRIMARY KEY, size INTEGER NOT NULL, media_type TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_world ON turns(world_id, seq);
      CREATE INDEX IF NOT EXISTS events_world ON events(world_id, id);
    `);
    const addColumn = (table: string, name: string, definition: string) => {
      if (!(this.db.pragma(`table_info(${table})`) as { name: string }[]).some(column => column.name === name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    addColumn('worlds', 'retention_enabled', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('turns', 'expires_at', 'TEXT');
    addColumn('attempts', 'generator_id', "TEXT NOT NULL DEFAULT 'fixture/ball-v1'");
    addColumn('versions', 'expires_at', 'TEXT');
    addColumn('events', 'expires_at', 'TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS response_chunks (seq INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id TEXT NOT NULL REFERENCES attempts(id), hash TEXT NOT NULL REFERENCES artifacts(hash));
      CREATE TABLE IF NOT EXISTS interactions (seq INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL REFERENCES worlds(id), client_id TEXT NOT NULL, version_id TEXT NOT NULL, target_id TEXT NOT NULL, result_hash TEXT NOT NULL, committed_version TEXT, error TEXT, created_at TEXT NOT NULL, expires_at TEXT, UNIQUE(world_id,client_id));
      CREATE INDEX IF NOT EXISTS chunks_attempt ON response_chunks(attempt_id, seq);
      CREATE TABLE IF NOT EXISTS playback (world_id TEXT PRIMARY KEY REFERENCES worlds(id), package_hash TEXT NOT NULL, elapsed_ms REAL NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version = 3;
    `);
    addColumn('playback', 'cues', "TEXT NOT NULL DEFAULT '{}'");
  }
  put(text: string, mediaType = 'application/json'): string {
    const hash = createHash('sha256').update(text).digest('hex');
    const target = join(this.directory, 'artifacts', hash);
    if (!existsSync(target)) {
      const temporary = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx', flush: true });
      renameSync(temporary, target);
    }
    if (createHash('sha256').update(readFileSync(target)).digest('hex') !== hash) throw new Error('Stored artifact failed integrity check');
    this.db.prepare('INSERT OR IGNORE INTO artifacts VALUES (?, ?, ?)').run(hash, Buffer.byteLength(text), mediaType);
    return hash;
  }
  putJson(value: unknown): string { return this.put(canonical(value)); }
  read(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash) || !this.db.prepare('SELECT 1 FROM artifacts WHERE hash=?').get(hash)) throw new HttpError(404, 'Artifact not found');
    let text: string;
    try { text = readFileSync(join(this.directory, 'artifacts', hash), 'utf8'); }
    catch { throw new HttpError(500, 'Saved artifact is missing'); }
    if (createHash('sha256').update(text).digest('hex') !== hash) throw new HttpError(500, 'Saved artifact hash mismatch');
    return text;
  }
  json<T>(hash: string): T { return JSON.parse(this.read(hash)) as T; }
  event(worldId: string, kind: string, payload: unknown): void {
    this.db.prepare('INSERT INTO events(world_id,kind,payload,created_at,expires_at) VALUES (?,?,?,?,?)').run(worldId, kind, canonical(payload), now(), this.expiryForWorld(worldId));
  }
  expiryForWorld(worldId: string, at = new Date()): string | null {
    const row = this.db.prepare('SELECT retention_enabled FROM worlds WHERE id=?').get(worldId) as { retention_enabled: number } | undefined;
    return row?.retention_enabled ? addCalendarMonths(at, this.retentionMonths).toISOString() : null;
  }
  createWorld(mode?: WorldMode): WorldSnapshot {
    if (mode !== undefined && !['animated','storybook'].includes(mode)) throw new HttpError(400, 'Invalid world mode');
    const snapshot: WorldSnapshot = { worldId: randomUUID(), versionId: randomUUID(), parentVersionId: null, revision: 0, packageHash: null, state: {}, operations: [], createdAt: now(), ...(mode ? { mode } : {}) };
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO worlds(id,current_version,revision) VALUES (?,?,0)').run(snapshot.worldId, snapshot.versionId);
      this.db.prepare('INSERT INTO versions(id,world_id,snapshot) VALUES (?,?,?)').run(snapshot.versionId, snapshot.worldId, canonical(snapshot));
      this.event(snapshot.worldId, 'world.created', { versionId: snapshot.versionId });
    })();
    return snapshot;
  }
  world(id: string): WorldSnapshot {
    const row = this.db.prepare('SELECT v.snapshot FROM versions v JOIN worlds w ON w.current_version=v.id WHERE w.id=?').get(id) as { snapshot: string } | undefined;
    if (!row) throw new HttpError(404, 'World not found');
    return JSON.parse(row.snapshot);
  }
  version(id: string): WorldSnapshot {
    const row = this.db.prepare('SELECT snapshot FROM versions WHERE id=?').get(id) as { snapshot: string } | undefined;
    if (!row) throw new HttpError(404, 'Version not found');
    return JSON.parse(row.snapshot);
  }
  playback(worldId: string) {
    const snapshot = this.world(worldId);
    const row = this.db.prepare('SELECT * FROM playback WHERE world_id=? AND package_hash=?').get(worldId, snapshot.packageHash) as { elapsed_ms: number; paused: number; cues:string } | undefined;
    return { packageHash: snapshot.packageHash, elapsedMs: row?.elapsed_ms ?? 0, paused: Boolean(row?.paused), cues:JSON.parse(row?.cues ?? '{}') as MotionCues };
  }
  savePlayback(worldId: string, versionId: string, elapsedMs: number, paused: boolean, cues: MotionCues = {}) {
    const snapshot = this.world(worldId);
    if (snapshot.versionId !== versionId) throw new HttpError(409, 'Stale playback version');
    if (snapshot.mode === 'storybook' || !snapshot.packageHash) throw new HttpError(400, 'This world has no animation timeline');
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 315360000000 || typeof paused !== 'boolean') throw new HttpError(400, 'Invalid playback');
    if (!record(cues) || Object.keys(cues).length > 64) throw new HttpError(400,'Invalid motion cues');
    for (const [id,cue] of Object.entries(cues)) {
      if (!record(cue) || Object.keys(cue).length !== 2 || typeof cue.key !== 'string' || cue.key.length > 80 || typeof cue.startMs !== 'number' || !Number.isFinite(cue.startMs) || cue.startMs < 0 || cue.startMs > elapsedMs || !snapshot.operations.some(op=>op.id === id && op.motionKey === cue.key)) throw new HttpError(400,'Motion cue does not match current scene');
    }
    const old = this.playback(worldId);
    // Late checkpoints never move a timeline backwards. Pause changes at equal time are allowed.
    if (elapsedMs < old.elapsedMs) return old;
    this.db.prepare('INSERT INTO playback(world_id,package_hash,elapsed_ms,paused,cues) VALUES (?,?,?,?,?) ON CONFLICT(world_id) DO UPDATE SET package_hash=excluded.package_hash,elapsed_ms=excluded.elapsed_ms,paused=excluded.paused,cues=excluded.cues').run(worldId, snapshot.packageHash, elapsedMs, Number(paused),canonical(cues));
    return this.playback(worldId);
  }
  turn(id: string): TurnRow {
    const row = this.db.prepare('SELECT * FROM turns WHERE id=?').get(id) as TurnRow | undefined;
    if (!row) throw new HttpError(404, 'Turn not found');
    return row;
  }
  attempt(id: string): AttemptRow {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id) as AttemptRow | undefined;
    if (!row) throw new HttpError(404, 'Attempt not found');
    return row;
  }
  events(worldId: string, after: number, limit = 1000) {
    return (this.db.prepare('SELECT * FROM events WHERE world_id=? AND id>? ORDER BY id LIMIT ?').all(worldId, after, limit) as { id: number; kind: string; payload: string; created_at: string }[])
      .map(row => ({ id: row.id, kind: row.kind, payload: JSON.parse(row.payload), createdAt: row.created_at }));
  }
  prune(at = new Date()) {
    const cutoff = at.toISOString();
    const counts = this.db.transaction(() => {
      const expired = this.db.prepare("SELECT id FROM turns WHERE expires_at<=? AND status NOT IN ('queued','generating','trial')").all(cutoff) as { id: string }[];
      for (const turn of expired) {
        this.db.prepare('DELETE FROM response_chunks WHERE attempt_id IN (SELECT id FROM attempts WHERE turn_id=?)').run(turn.id);
        this.db.prepare('DELETE FROM attempts WHERE turn_id=?').run(turn.id);
        this.db.prepare('DELETE FROM turns WHERE id=?').run(turn.id);
      }
      const interactions = this.db.prepare('DELETE FROM interactions WHERE expires_at<=?').run(cutoff).changes;
      const events = this.db.prepare('DELETE FROM events WHERE expires_at<=?').run(cutoff).changes;
      const versions = this.db.prepare(`DELETE FROM versions WHERE expires_at<=?
        AND id NOT IN (SELECT current_version FROM worlds)
        AND id NOT IN (SELECT base_version FROM attempts)
        AND id NOT IN (SELECT committed_version FROM attempts WHERE committed_version IS NOT NULL)
        AND id NOT IN (SELECT version_id FROM interactions)
        AND id NOT IN (SELECT committed_version FROM interactions WHERE committed_version IS NOT NULL)`).run(cutoff).changes;
      return { turns: expired.length, interactions, events, versions };
    })();
    // Trace from surviving rows, then recursively retain runtime package members.
    const live = new Set<string>(), pending: string[] = [];
    const retain = (hash: unknown) => { if (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) && !live.has(hash)) { live.add(hash); pending.push(hash); } };
    for (const row of this.db.prepare('SELECT request_hash,response_hash,result_hash,package_hash FROM attempts').all() as Record<string, string>[]) Object.values(row).forEach(retain);
    for (const row of this.db.prepare('SELECT hash FROM response_chunks UNION SELECT result_hash AS hash FROM interactions').all() as { hash: string }[]) retain(row.hash);
    for (const row of this.db.prepare('SELECT snapshot FROM versions').all() as { snapshot: string }[]) retain(JSON.parse(row.snapshot).packageHash);
    while (pending.length) {
      const hash = pending.pop()!;
      try {
        const value = JSON.parse(this.read(hash));
        if (record(value) && value.formatVersion === 1 && record(value.files)) {
          for (const file of Object.values(value.files)) if (typeof file === 'string') retain(createHash('sha256').update(file).digest('hex'));
        }
      } catch { /* A code/partial response artifact need not be JSON. */ }
    }
    let artifacts = 0;
    for (const row of this.db.prepare('SELECT hash FROM artifacts').all() as { hash: string }[]) if (!live.has(row.hash)) {
      // Only exact hash filenames inside this store's artifacts directory are eligible.
      if (!/^[a-f0-9]{64}$/.test(row.hash)) continue;
      try { unlinkSync(join(this.directory, 'artifacts', row.hash)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      this.db.prepare('DELETE FROM artifacts WHERE hash=?').run(row.hash); artifacts++;
    }
    for (const file of readdirSync(join(this.directory, 'artifacts'))) if (/^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(file)) unlinkSync(join(this.directory, 'artifacts', file));
    if (Object.values(counts).some(Boolean) || artifacts) this.db.pragma('wal_checkpoint(TRUNCATE)');
    return { ...counts, artifacts };
  }
  close() { this.db.close(); }
}
