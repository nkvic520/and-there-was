import Ajv from 'ajv';
import { sha256 as digest256 } from '@noble/hashes/sha2.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type SceneState = { [key: string]: Json };
export interface SceneProtocol { schemaVersion: 1; stateSchema: Record<string, Json>; events: Record<string, Json> }
export interface ScenePackage {
  formatVersion: 1; sdkVersion: 1; entry: 'scene.js';
  files: Record<string, string>; hashes: Record<string, string>; assets: [];
}
export interface DrawOperation {
  kind: 'circle' | 'ellipse'; id: string; x: number; y: number;
  radiusX: number; radiusY: number; color: string; alpha: number;
}
export interface TrialOutput { state: SceneState; operations: DrawOperation[]; durationMs: number; runtimeVersion: string }
export interface TrialResult {
  attemptId: string; packageHash: string; baseVersionId: string; baseRevision: number;
  ok: boolean; output?: TrialOutput; error?: string;
}
export interface WorldSnapshot {
  worldId: string; versionId: string; parentVersionId: string | null; revision: number;
  packageHash: string | null; state: SceneState; operations: DrawOperation[]; createdAt: string;
}
export interface Candidate {
  worldId: string; turnId: string; attemptId: string; packageHash: string;
  baseVersionId: string; baseRevision: number; baseline: WorldSnapshot; package: ScenePackage;
}
export const LIMITS = { callMs: 500, memoryBytes: 16 * 1024 * 1024, operations: 1000, stateBytes: 128 * 1024, packageBytes: 256 * 1024, workerMs: 2500 } as const;
export const RUNTIME_VERSION = 'quickjs-wasm-0.32.0/sdk-1';
export const utf8Size = (s: string) => new TextEncoder().encode(s).length;
export function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { assert(Number.isFinite(value), 'Non-finite number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  assert(record(value), 'Expected JSON data');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export async function sha256(text: string): Promise<string> {
  // Plain HTTP on a trusted LAN has no SubtleCrypto, including in workers.
  return Array.from(digest256(new TextEncoder().encode(text)), b => b.toString(16).padStart(2, '0')).join('');
}
export const hashJson = (value: unknown) => sha256(canonical(value));

// A deliberately small, bounded JSON Schema subset. No references, regex, custom
// keywords, recursive schemas, coercion or remote loading enter the validator.
const keywords = new Set(['type', 'title', 'description', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'const']);
function checkSchema(schema: unknown, depth = 0, budget = { nodes: 0 }): void {
  assert(record(schema) && depth <= 10 && ++budget.nodes <= 128, 'Schema is too complex');
  for (const key of Object.keys(schema)) assert(keywords.has(key), `Unsupported schema keyword: ${key}`);
  assert(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(String(schema.type)), 'Schema type required');
  if (schema.type === 'object') {
    assert(record(schema.properties) && schema.additionalProperties === false, 'Objects must define closed properties');
    for (const [key, child] of Object.entries(schema.properties)) {
      assert(!['__proto__', 'constructor', 'prototype'].includes(key), 'Unsafe property');
      checkSchema(child, depth + 1, budget);
    }
  }
  if (schema.type === 'array') {
    assert(Number.isInteger(schema.maxItems) && Number(schema.maxItems) <= 1000, 'Arrays require bounded maxItems');
    checkSchema(schema.items, depth + 1, budget);
  }
}
const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false, addUsedSchema: false });
export function validateProtocol(value: unknown): asserts value is SceneProtocol {
  assert(record(value) && value.schemaVersion === 1 && record(value.events) && Object.keys(value.events).length === 0, 'Unsupported protocol/events');
  assert(utf8Size(JSON.stringify(value)) <= 32768, 'Protocol too large');
  checkSchema(value.stateSchema);
  assert(ajv.validateSchema(value.stateSchema as object), 'Invalid state schema');
}
export function validateState(protocol: SceneProtocol, value: unknown): asserts value is SceneState {
  validateProtocol(protocol);
  assert(record(value) && utf8Size(canonical(value)) <= LIMITS.stateBytes, 'State too large or invalid');
  const validate = ajv.compile(protocol.stateSchema);
  try { assert(validate(value), `Invalid scene state: ${ajv.errorsText(validate.errors)}`); }
  finally { ajv.removeSchema(protocol.stateSchema); }
}
export function validateOperations(value: unknown): asserts value is DrawOperation[] {
  assert(Array.isArray(value) && value.length <= LIMITS.operations, 'Operation limit exceeded');
  const ids = new Set<string>();
  for (const op of value) {
    assert(record(op) && ['circle', 'ellipse'].includes(String(op.kind)), 'Unsupported operation');
    assert(typeof op.id === 'string' && /^[\w-]{1,80}$/.test(op.id) && !ids.has(op.id), 'Invalid/duplicate drawing id');
    ids.add(op.id);
    for (const field of ['x', 'y', 'radiusX', 'radiusY', 'alpha']) assert(typeof op[field] === 'number' && Number.isFinite(op[field]) && op[field] >= 0 && op[field] <= 1, `Invalid ${field}`);
    assert(Number(op.radiusX) > 0 && Number(op.radiusY) > 0 && (op.kind !== 'circle' || op.radiusX === op.radiusY), 'Invalid radius');
    assert(typeof op.color === 'string' && /^#[0-9a-f]{6}$/i.test(op.color), 'Invalid color');
    assert(Object.keys(op).length === 8, 'Unexpected drawing fields');
  }
}
export function validateOutput(protocol: SceneProtocol, output: unknown): asserts output is TrialOutput {
  assert(record(output) && output.runtimeVersion === RUNTIME_VERSION, 'Runtime version mismatch');
  assert(typeof output.durationMs === 'number' && Number.isFinite(output.durationMs) && output.durationMs >= 0, 'Invalid duration');
  validateState(protocol, output.state);
  validateOperations(output.operations);
}
export async function validatePackage(value: unknown): Promise<SceneProtocol> {
  assert(record(value) && value.formatVersion === 1 && value.sdkVersion === 1 && value.entry === 'scene.js', 'Unsupported package or SDK');
  assert(record(value.files) && record(value.hashes) && Array.isArray(value.assets) && value.assets.length === 0, 'Invalid files/assets');
  assert(utf8Size(canonical(value)) <= LIMITS.packageBytes, 'Package too large');
  const names = ['protocol.json', 'scene.js', 'view.json'];
  assert(Object.keys(value.files).sort().join() === names.sort().join() && Object.keys(value.hashes).sort().join() === names.join(), 'Invalid file manifest');
  for (const name of names) {
    const content = value.files[name];
    assert(typeof content === 'string' && await sha256(content) === value.hashes[name], `File hash mismatch: ${name}`);
  }
  const protocol: unknown = JSON.parse(value.files['protocol.json'] as string);
  validateProtocol(protocol);
  const view = JSON.parse(value.files['view.json'] as string);
  assert(record(view) && view.coordinates === 'normalized' && view.background === '#ffffff', 'Unsupported view');
  return protocol;
}
