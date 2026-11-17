import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonical, type WorldSnapshot } from '@and-there-was/scene';

export interface TurnRow { seq: number; id: string; world_id: string; client_id: string; text: string; status: string; attempt_id: string | null; created_at: string }
export interface AttemptRow { seq: number; id: string; turn_id: string; status: string; base_version: string; base_revision: number; package_hash: string | null; request_hash: string | null; response_hash: string | null; result_hash: string | null; committed_version: string | null; error: string | null; created_at: string; updated_at: string }
export class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
export const now = () => new Date().toISOString();
export class Store {
  readonly db: Database.Database;
  readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory);
    mkdirSync(join(this.directory, 'artifacts'), { recursive: true });
    this.db = new Database(join(this.directory, 'worlds.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, current_version TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, world_id TEXT NOT NULL REFERENCES worlds(id), client_id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, attempt_id TEXT, created_at TEXT NOT NULL, UNIQUE(world_id, client_id));
      CREATE TABLE IF NOT EXISTS attempts (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, turn_id TEXT NOT NULL REFERENCES turns(id), status TEXT NOT NULL, base_version TEXT NOT NULL, base_revision INTEGER NOT NULL, package_hash TEXT, request_hash TEXT, response_hash TEXT, result_hash TEXT, committed_version TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL REFERENCES worlds(id), kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts (hash TEXT PRIMARY KEY, size INTEGER NOT NULL, media_type TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_world ON turns(world_id, seq);
      CREATE INDEX IF NOT EXISTS events_world ON events(world_id, id);
      PRAGMA user_version = 1;
    `);
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
    this.db.prepare('INSERT INTO events(world_id,kind,payload,created_at) VALUES (?,?,?,?)').run(worldId, kind, canonical(payload), now());
  }
  createWorld(): WorldSnapshot {
    const snapshot: WorldSnapshot = { worldId: randomUUID(), versionId: randomUUID(), parentVersionId: null, revision: 0, packageHash: null, state: {}, operations: [], createdAt: now() };
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO worlds VALUES (?,?,0)').run(snapshot.worldId, snapshot.versionId);
      this.db.prepare('INSERT INTO versions VALUES (?,?,?)').run(snapshot.versionId, snapshot.worldId, canonical(snapshot));
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
  events(worldId: string, after: number) {
    return (this.db.prepare('SELECT * FROM events WHERE world_id=? AND id>? ORDER BY id LIMIT 1000').all(worldId, after) as { id: number; kind: string; payload: string; created_at: string }[])
      .map(row => ({ id: row.id, kind: row.kind, payload: JSON.parse(row.payload), createdAt: row.created_at }));
  }
  close() { this.db.close(); }
}
