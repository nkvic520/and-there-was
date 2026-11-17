import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import { hashJson, sha256, validatePackage, type ScenePackage } from '@and-there-was/scene';
import { FixtureGenerator } from '../../apps/server/src/generator';

let engine: Awaited<ReturnType<typeof createEngine>>, pkg: ScenePackage;
beforeAll(async () => { engine = await createEngine(); pkg = await new FixtureGenerator().generate('有一个球'); });
async function code(source: string) {
  const copy = structuredClone(pkg); copy.files['scene.js'] = source; copy.hashes['scene.js'] = await sha256(source); return copy;
}
describe('package and isolated runtime', () => {
  it('produces the reproducible fixture and restores without mutation', async () => {
    expect(await hashJson(pkg)).toBe(await hashJson(await new FixtureGenerator().generate('有一个球')));
    const result = await executePackage(engine, pkg, {});
    expect(result.state).toEqual(JSON.parse(await readFile('fixtures/ball/expected-state.json', 'utf8')));
    expect(result.operations).toHaveLength(3);
    const restored = await executePackage(engine, pkg, result.state);
    expect(restored.state).toEqual(result.state); expect(restored.operations).toEqual(result.operations);
  });
  it('rejects altered code before execution', async () => {
    const invalid = structuredClone(pkg); invalid.files['scene.js'] += '\nwhile(true){}';
    await expect(executePackage(engine, invalid, {})).rejects.toThrow(/hash/);
  });
  it('rejects remote and recursive schema references', async () => {
    const invalid = structuredClone(pkg), protocol = JSON.parse(invalid.files['protocol.json']);
    protocol.stateSchema.$ref = 'https://example.com/schema';
    invalid.files['protocol.json'] = JSON.stringify(protocol); invalid.hashes['protocol.json'] = await sha256(invalid.files['protocol.json']);
    await expect(validatePackage(invalid)).rejects.toThrow(/keyword/);
  });
  it('interrupts infinite loops', async () => {
    const start = performance.now();
    await expect(executePackage(engine, await code('export function mount(){while(true){}}'), {})).rejects.toThrow(/interrupt/i);
    expect(performance.now() - start).toBeLessThan(2500);
  });
  it('enforces the VM heap limit', async () => {
    await expect(executePackage(engine, await code('export function mount(){new ArrayBuffer(64*1024*1024);}'), {})).rejects.toThrow(/memory|alloc/i);
  });
  it.each(['fetch("https://example.com")', 'document.body', 'process.env', 'require("fs")', 'new WebSocket("wss://example.com")'])('has no host capability: %s', async expression => {
    await expect(executePackage(engine, await code(`export function mount(){${expression};}`), {})).rejects.toThrow(/not defined|not a function/i);
  });
  it('refuses external module imports', async () => {
    await expect(executePackage(engine, await code('import x from "https://example.com/a.js"; export function mount(){x()}'), {})).rejects.toThrow(/forbidden/i);
  });
  it('enforces output count even if the guest catches the exception', async () => {
    await expect(executePackage(engine, await code('export function mount(sdk){for(let i=0;i<1001;i++){try{sdk.circle("c"+i,.5,.5,.1,"#ffffff")}catch(e){}}}'), {})).rejects.toThrow(/Operation limit/);
  });
  it('rejects invalid state and does not mutate its baseline', async () => {
    const baseline = (await executePackage(engine, pkg, {})).state, copy = structuredClone(baseline);
    await expect(executePackage(engine, await code('export function mount(sdk){sdk.setState({});}'), baseline)).rejects.toThrow(/Invalid scene state/);
    expect(baseline).toEqual(copy);
  });
  it('rejects invalid drawing instructions', async () => {
    await expect(executePackage(engine, await code(pkg.files['scene.js'].replace("b.color);", "'url(https://example.com)');")), {})).rejects.toThrow(/color/);
  });
});
