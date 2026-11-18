import type { SceneAsset } from './assets';
import type { Locale } from './languages';
export type { SceneAsset, AssetRequest, ArtSelection, ArtSource, ImageRole } from './assets';
import Ajv from 'ajv';
import { sha256 as digest256 } from '@noble/hashes/sha2.js';
import type { Motion, WorldMode } from './motion';
export { sampleMotion, restingPose, type Motion, type MotionFrame, type Pose, type WorldMode, type MotionCues } from './motion';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type SceneState = { [key: string]: Json };
export interface SceneProtocol { schemaVersion: 1 | 2 | 3 | 4; mode?: WorldMode; stateSchema: Record<string, Json>; events: Record<string, Json> }
export interface ScenePackage {
  formatVersion: 1; sdkVersion: 1 | 2 | 3 | 4; entry: 'scene.js';
  files: Record<string, string>; hashes: Record<string, string>; assets: SceneAsset[];
}
export interface DrawOperation {
  kind: 'circle' | 'ellipse' | 'rect' | 'path' | 'text' | 'group' | 'sprite'; id: string; x: number; y: number;
  radiusX: number; radiusY: number; color: string; alpha: number;
  asset?: string; parent?: string; rotation?: number; stroke?: string; strokeWidth?: number; roundness?: number;
  gradient?: { type: 'linear' | 'radial'; from: string; to: string }; shadow?: boolean;
  path?: (string | number)[][]; text?: string; fontSize?: number; align?: 'left' | 'center' | 'right';
  motions?: Motion[]; motionKey?: string; enter?: 'fade' | 'pop' | 'drop';
}
export interface EventBinding { targetId: string; event: string; payload: SceneState }
export interface SceneEvent { name: string; payload: SceneState }
export interface ExecutionOptions { event?: SceneEvent; migrate?: boolean; previousProtocol?: SceneProtocol }
export interface TrialOutput { state: SceneState; operations: DrawOperation[]; bindings?: EventBinding[]; durationMs: number; runtimeVersion: string }
export interface TrialResult {
  attemptId: string; packageHash: string; baseVersionId: string; baseRevision: number;
  ok: boolean; output?: TrialOutput; error?: string;
}
export interface WorldSnapshot {
  worldId: string; versionId: string; parentVersionId: string | null; revision: number;
  packageHash: string | null; state: SceneState; operations: DrawOperation[]; bindings?: EventBinding[]; createdAt: string;
  mode?: WorldMode;
  storyLocale?: Locale;
}
export interface InteractionReceipt { clientEventId: string; versionId: string; revision: number; targetId: string; output?: TrialOutput; error?: string }
export interface Candidate {
  worldId: string; turnId: string; attemptId: string; packageHash: string;
  baseVersionId: string; baseRevision: number; baseline: WorldSnapshot; package: ScenePackage;
  previousProtocol?: SceneProtocol;
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
export const hashBytes = (bytes: Uint8Array) => Array.from(digest256(bytes), b=>b.toString(16).padStart(2,'0')).join('');
export const hashJson = (value: unknown) => sha256(canonical(value));
export const runtimeVersion = (sdkVersion: number) => `quickjs-wasm-0.32.0/sdk-${sdkVersion}`;
export function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value); const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const end = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, end)); return result;
}

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
  assert(record(value) && [1, 2, 3, 4].includes(value.schemaVersion as number) && record(value.events) && Object.keys(value.events).length <= 32, 'Unsupported protocol/events');
  if (Number(value.schemaVersion) >= 3) assert(['animated', 'storybook'].includes(String(value.mode)), 'World mode required');
  if (value.mode === 'storybook') assert(Object.keys(value.events).length === 0, 'Storybook protocol must have no events');
  if (value.schemaVersion === 1) assert(Object.keys(value.events).length === 0, 'SDK 1 does not support events');
  assert(utf8Size(JSON.stringify(value)) <= 32768, 'Protocol too large');
  checkSchema(value.stateSchema);
  assert(ajv.validateSchema(value.stateSchema as object), 'Invalid state schema');
  for (const [name, schema] of Object.entries(value.events)) {
    assert(/^[a-zA-Z][\w.-]{0,79}$/.test(name) && !['constructor', 'prototype', '__proto__'].includes(name), 'Invalid event name');
    checkSchema(schema);
    assert(record(schema) && schema.type === 'object' && ajv.validateSchema(schema), 'Invalid event schema');
  }
}
export function validateEvent(protocol: SceneProtocol, event: SceneEvent) {
  const schema = protocol.events[event.name];
  assert(record(schema) && record(event.payload) && utf8Size(canonical(event.payload)) <= 4096, 'Unknown or invalid event');
  const validate = ajv.compile(schema);
  try { assert(validate(event.payload), `Invalid event payload: ${ajv.errorsText(validate.errors)}`); }
  finally { ajv.removeSchema(schema); }
}
export function validateState(protocol: SceneProtocol, value: unknown): asserts value is SceneState {
  validateProtocol(protocol);
  assert(record(value) && utf8Size(canonical(value)) <= LIMITS.stateBytes, 'State too large or invalid');
  const validate = ajv.compile(protocol.stateSchema);
  try { assert(validate(value), `Invalid scene state: ${ajv.errorsText(validate.errors)}`); }
  finally { ajv.removeSchema(protocol.stateSchema); }
}
export function validateOperations(value: unknown, sdk = 1): asserts value is DrawOperation[] {
  assert(Array.isArray(value) && value.length <= (sdk >= 3 ? 256 : LIMITS.operations), 'Operation limit exceeded');
  const ids = new Set<string>();
  for (const op of value) {
    assert(record(op) && (sdk >= 3 ? ['circle', 'ellipse', 'rect', 'path', 'text', 'group', ...(sdk >= 4 ? ['sprite'] : [])] : ['circle', 'ellipse', 'rect']).includes(String(op.kind)), 'Unsupported operation');
    assert(typeof op.id === 'string' && /^[\w-]{1,80}$/.test(op.id) && !ids.has(op.id), 'Invalid/duplicate drawing id');
    ids.add(op.id);
    for (const field of ['x', 'y', 'radiusX', 'radiusY', 'alpha']) assert(typeof op[field] === 'number' && Number.isFinite(op[field]) && op[field] >= (sdk >= 3 && ['x', 'y'].includes(field) ? -2 : 0) && op[field] <= (sdk >= 3 && field !== 'alpha' ? 2 : 1), `Invalid ${field}`);
    assert(Number(op.radiusX) > 0 && Number(op.radiusY) > 0 && (op.kind !== 'circle' || op.radiusX === op.radiusY), `Invalid radius on ${op.id}: use equal circle dimensions, or ellipse`);
    assert(typeof op.color === 'string' && /^#[0-9a-f]{6}$/i.test(op.color), 'Invalid color');
    if (sdk < 3) assert(Object.keys(op).length === 8, 'Unexpected drawing fields');
    else validateVisualFields(op);
  }
  if (sdk >= 3) {
    const byId = new Map((value as DrawOperation[]).map(op => [op.id, op]));
    const labels = (value as DrawOperation[]).filter(op => op.kind === 'text');
    assert(labels.length <= 24 && labels.reduce((n,op) => n+(op.text?.length ?? 0),0) <= 2400, 'Text budget exceeded');
    let textArea = 0;
    for (const op of labels) {
      const font = (op.fontSize ?? .035)*1000, width = op.radiusX*2000;
      const lines = op.text!.split('\n').reduce((n,line) => n+Math.max(1,Math.ceil(line.length/Math.max(1,Math.floor(width/font)))),0);
      assert(lines <= 12, 'Text wraps to too many lines');
      textArea += Math.min(width,op.text!.length*font)*lines*font*1.45;
    }
    assert(textArea <= 8_000_000, 'Text texture budget exceeded');
    assert((value as DrawOperation[]).reduce((n,op) => n+(op.path?.length ?? 0),0) <= 1024, 'Path budget exceeded');
    assert((value as DrawOperation[]).filter(op => op.motions?.length).length <= 64, 'Too many animated nodes');
    for (const op of value as DrawOperation[]) {
      let parent = op.parent, depth = 0;
      const ancestors = new Set([op.id]);
      while (parent) {
        const group = byId.get(parent);
        assert(group?.kind === 'group' && !ancestors.has(parent) && ++depth <= 8, 'Invalid group hierarchy');
        ancestors.add(parent); parent = group.parent;
      }
    }
  }
}
function validateVisualFields(op: Record<string, unknown>) {
  const allowed = new Set(['asset','kind','id','x','y','radiusX','radiusY','color','alpha','parent','rotation','stroke','strokeWidth','roundness','gradient','shadow','path','text','fontSize','align','motions','motionKey','enter']);
  for (const key of Object.keys(op)) assert(allowed.has(key), `Unexpected drawing field: ${key}`);
  if (op.kind === 'sprite') assert(typeof op.asset === 'string' && /^[\w-]{1,80}$/.test(op.asset),'Sprite requires an asset ID');
  else assert(op.asset === undefined,'Asset reference on non-sprite node');
  const finite = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const color = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  if (op.parent !== undefined) assert(typeof op.parent === 'string' && /^[\w-]{1,80}$/.test(op.parent), 'Invalid parent');
  for (const [key, min, max] of [['rotation', -20, 20], ['strokeWidth', 0, .05], ['roundness', 0, .5], ['fontSize', .012, .15]] as const) if (op[key] !== undefined) assert(finite(op[key], min, max), `Invalid ${key}`);
  if (op.stroke !== undefined) assert(color(op.stroke), 'Invalid stroke');
  if (op.shadow !== undefined) assert(typeof op.shadow === 'boolean', 'Invalid shadow');
  if (op.gradient !== undefined) assert(record(op.gradient) && Object.keys(op.gradient).length === 3 && ['linear','radial'].includes(String(op.gradient.type)) && color(op.gradient.from) && color(op.gradient.to), 'Invalid gradient');
  if (op.enter !== undefined) assert(['fade','pop','drop'].includes(String(op.enter)), 'Invalid entrance');
  if (op.motionKey !== undefined) assert(typeof op.motionKey === 'string' && op.motionKey.length <= 80 && Array.isArray(op.motions) && op.motions.length > 0, 'Invalid motion key');
  if (op.kind === 'text') assert(typeof op.text === 'string' && op.text.length <= 240 && finite(op.fontSize ?? .035, .012, .15), 'Invalid text');
  else assert(op.text === undefined && op.fontSize === undefined && op.align === undefined, 'Text fields on non-text node');
  if (op.align !== undefined) assert(['left','center','right'].includes(String(op.align)), 'Invalid text alignment');
  if (op.kind === 'path') {
    assert(Array.isArray(op.path) && op.path.length > 1 && op.path.length <= 64, 'Invalid path');
    assert(op.path[0]?.[0] === 'M', 'Path must start with M');
    for (const c of op.path) assert(Array.isArray(c) && ({ M:3,L:3,Q:5,C:7,Z:1 } as Record<string,number>)[String(c[0])] === c.length && c.slice(1).every(n => finite(n, -2, 2)), 'Invalid path command');
  } else assert(op.path === undefined, 'Path commands on non-path node');
  if (op.motions !== undefined) {
    assert(Array.isArray(op.motions) && op.motions.length <= 3, 'Invalid motion tracks');
    for (const m of op.motions) {
      assert(record(m) && Object.keys(m).every(k => ['duration','loop','frames','easing','phase'].includes(k)), `Invalid motion fields on ${op.id}: motionKey belongs on the node, outside motions[]`);
      assert(finite(m.duration, .2, 120) && ['repeat','pingpong','once'].includes(String(m.loop)), `Invalid motion on ${op.id}: duration must be .2..120 seconds, loop repeat/pingpong/once`);
      assert(m.easing === undefined || ['linear','smooth'].includes(String(m.easing)), 'Invalid easing');
      assert(m.phase === undefined || finite(m.phase, 0, 120), 'Invalid motion phase');
      assert(Array.isArray(m.frames) && m.frames.length >= 2 && m.frames.length <= 16 && m.frames[0]?.at === 0 && m.frames.at(-1)?.at === 1, 'Motion frames must span 0..1');
      let last = -1;
      for (const f of m.frames) {
        assert(record(f) && finite(f.at, 0, 1) && Number(f.at) > last, 'Invalid frame time'); last = Number(f.at);
        for (const [k,v] of Object.entries(f)) {
          const bounds: Record<string, [number,number]> = { at:[0,1],x:[-2,2],y:[-2,2],scaleX:[.05,3],scaleY:[.05,3],rotation:[-20,20],alpha:[0,1] };
          assert(bounds[k] && finite(v, ...bounds[k]), 'Invalid motion property');
        }
      }
    }
  }
}
export function validateOutput(protocol: SceneProtocol, output: unknown, assets: SceneAsset[] = []): asserts output is TrialOutput {
  assert(record(output) && output.runtimeVersion === runtimeVersion(protocol.schemaVersion), 'Runtime version mismatch');
  assert(typeof output.durationMs === 'number' && Number.isFinite(output.durationMs) && output.durationMs >= 0, 'Invalid duration');
  validateState(protocol, output.state);
  validateOperations(output.operations, protocol.schemaVersion);
  for (const op of output.operations) if (op.kind === 'sprite') assert(assets.some(a=>a.id===op.asset),`Unknown sprite asset '${op.asset}' on '${op.id}'. Expected one of: ${assets.map(a=>a.id).join(', ')}`);
  if (protocol.schemaVersion >= 2) {
    assert(Array.isArray(output.bindings) && output.bindings.length <= 1000, 'Invalid event bindings');
    const ids = new Set<string>();
    for (const binding of output.bindings) {
      assert(record(binding) && typeof binding.targetId === 'string' && typeof binding.event === 'string' && record(binding.payload), 'Invalid binding');
      assert(Object.keys(binding).length === 3, 'Unexpected event binding fields');
      assert(!ids.has(binding.targetId), `Duplicate binding target: ${binding.targetId}`);
      assert(output.operations.some(op => op.id === binding.targetId), `Binding target was not drawn in this mount: ${binding.targetId}`);
      ids.add(binding.targetId); validateEvent(protocol, { name: binding.event, payload: binding.payload as SceneState });
    }
    if (protocol.mode === 'storybook') assert(output.bindings.length === 0 && output.operations.every(op => !op.motions?.length && op.enter === undefined), 'Storybook scenes must be static');
  } else assert(output.bindings === undefined && output.operations.every(op => op.kind !== 'rect'), 'SDK 1 capability mismatch');
}
export async function validatePackage(value: unknown): Promise<SceneProtocol> {
  assert(record(value) && value.formatVersion === 1 && [1,2,3,4].includes(value.sdkVersion as number) && value.entry === 'scene.js', 'Unsupported package or SDK');
  assert(record(value.files) && record(value.hashes) && Array.isArray(value.assets) && (value.sdkVersion === 4 || value.assets.length === 0), 'Invalid files/assets');
  validateAssets(value.assets);
  assert(utf8Size(canonical(value)) <= LIMITS.packageBytes, 'Package too large');
  const names = ['protocol.json', 'scene.js', 'view.json'];
  assert(Object.keys(value.files).sort().join() === names.sort().join() && Object.keys(value.hashes).sort().join() === names.join(), 'Invalid file manifest');
  for (const name of names) {
    const content = value.files[name];
    assert(typeof content === 'string' && await sha256(content) === value.hashes[name], `File hash mismatch: ${name}`);
  }
  const protocol: unknown = JSON.parse(value.files['protocol.json'] as string);
  validateProtocol(protocol);
  assert(protocol.schemaVersion === value.sdkVersion, 'Protocol and SDK version mismatch');
  const view = JSON.parse(value.files['view.json'] as string);
  assert(record(view) && view.coordinates === 'normalized' && typeof view.background === 'string' && /^#[0-9a-f]{6}$/i.test(view.background) && (Number(value.sdkVersion) >= 2 || view.background === '#ffffff'), 'Unsupported view');
  if (Number(value.sdkVersion) >= 3) assert(view.mode === protocol.mode, 'View mode mismatch');
  return protocol;
}
export function validateAssets(value: unknown): asserts value is SceneAsset[] {
  assert(Array.isArray(value) && value.length <= 16,'Too many image assets');
  const ids = new Set<string>(); let pixels=0;
  for (const a of value) {
    assert(record(a) && Object.keys(a).every(k=>['id','imageId','hash','originalHash','mediaType','width','height','name','role','source','credit','sourceUrl'].includes(k)),'Invalid asset metadata');
    assert(typeof a.id==='string' && /^[\w-]{1,80}$/.test(a.id) && !ids.has(a.id),'Invalid/duplicate asset ID');ids.add(a.id);
    assert(typeof a.imageId==='string' && /^[\w-]{1,80}$/.test(a.imageId),'Invalid image ID');
    for(const key of ['hash','originalHash'])assert(typeof a[key]==='string' && /^[a-f0-9]{64}$/.test(a[key] as string),'Invalid image hash');
    assert(a.mediaType==='image/png' && Number.isInteger(a.width) && Number.isInteger(a.height) && Number(a.width)>0 && Number(a.height)>0 && Number(a.width)<=2048 && Number(a.height)<=2048,'Invalid image dimensions');
    assert(typeof a.name==='string' && a.name.length<=120 && typeof a.credit==='string' && a.credit.length<=400,'Invalid asset description');
    assert(['character','background','illustration'].includes(String(a.role)) && ['free','upload','seedream'].includes(String(a.source)),'Invalid asset origin');
    if(a.sourceUrl!==undefined)assert(typeof a.sourceUrl==='string' && a.sourceUrl.length<=500 && /^https:\/\//.test(a.sourceUrl),'Invalid source URL');
    pixels+=Number(a.width)*Number(a.height);
  }
  assert(pixels<=16_777_216,'Image texture budget exceeded');
}
export function validateWorldMode(protocol: SceneProtocol, mode?: WorldMode) {
  if (mode) assert(protocol.schemaVersion >= 3, 'World mode requires SDK 3');
  if (protocol.schemaVersion >= 3) assert(protocol.mode === (mode ?? 'animated'), 'Package does not match world mode');
  else assert(mode !== 'storybook', 'Storybook world requires SDK 3');
}
