import { test, expect, type Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { modelReply, streamReply, animatedReply, withImageWorkflow } from '../helpers/interactive';
import { Store } from '../../apps/server/src/store';
import { addCalendarMonths } from '@and-there-was/scene';
import { languages, locales } from '@and-there-was/scene/languages';
import { imageReply } from '../helpers/images';
import { responsesWire } from '../helpers/openai';

let server: ChildProcess, dataDirectory: string, serverLog = '';
let modelEnvironment: Record<string, string> = {};
async function start() {
  serverLog = '';
  server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: process.cwd(), env: { ...process.env, OPENAI_API_KEY:'', DEEPSEEK_API_KEY:'', SEEDREAM_API_KEY:'', PORT: '3179', HOST: '127.0.0.1', DATA_DIR: dataDirectory, GENERATOR_MODE: 'fixture', ...modelEnvironment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', chunk => { serverLog += chunk; }); server.stderr?.on('data', chunk => { serverLog += chunk; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch('http://127.0.0.1:3179/api/health')).ok) return; } catch { /* still starting */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Server did not start: ${serverLog}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise<void>(r => server.once('exit', () => r())); server.kill('SIGTERM'); await exited;
}
test.beforeAll(async () => { dataDirectory = mkdtempSync(join(tmpdir(), 'and-there-was-e2e-')); await start(); });
test.afterAll(async () => {
  await stop();
  if (!resolve(dataDirectory).startsWith(resolve(tmpdir()) + '\\and-there-was-e2e-') && !resolve(dataDirectory).startsWith(resolve(tmpdir()) + '/and-there-was-e2e-')) throw new Error('Unsafe cleanup');
  rmSync(dataDirectory, { recursive: true, force: true });
});

test.use({ locale: 'zh-CN' });

async function freshContext(browser: Browser, projectUse: Record<string, unknown>) {
  return browser.newContext({ locale: 'zh-CN', viewport: projectUse.viewport as { width: number; height: number } | undefined, isMobile: Boolean(projectUse.isMobile), hasTouch: Boolean(projectUse.hasTouch) });
}

test('real fixture → isolated worker → saved scene → fresh-browser restore after process restart', async ({ page, browser, request }, info) => {
  const failures: string[] = [], external: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:3179')) external.push(req.url()); });
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
  const worldUrl = page.url(), worldId = worldUrl.split('/').at(-1)!;
  const canvas = await page.locator('canvas').elementHandle();
  await page.screenshot({ path: info.outputPath('empty.png') });
  await page.getByRole('textbox').fill('有一个球');
  // Browser composition events plus Enter must never submit. OS IME gets a separate manual check.
  await page.getByRole('textbox').dispatchEvent('compositionstart');
  await page.getByRole('textbox').press('Enter');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect((await (await request.get(`/api/worlds/${worldId}/records`)).json()).turns).toHaveLength(0);
  await page.getByRole('textbox').dispatchEvent('compositionend');
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  await page.route('**/api/worlds/*/turns', async route => { await gate; await route.continue(); }, { times: 1 });
  const started = performance.now();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('收到啦');
  const localFeedbackMs = performance.now() - started;
  expect(await page.locator('#canvas').getAttribute('data-operation-count')).toBe('0');
  release();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
  const firstVisibleMs = performance.now() - started;
  expect(await canvas!.evaluate(node => node === document.querySelector('canvas'))).toBe(true);
  await expect(page.locator('#canvas')).toHaveAttribute('data-operation-count', '3');
  expect(await page.locator('canvas').count()).toBe(1);
  await page.screenshot({ path: info.outputPath('ball.png') });
  const records = await (await request.get(`/api/worlds/${worldId}/records`)).json();
  expect(records.turns).toHaveLength(1); expect(records.turns[0].text).toBe('有一个球');
  expect(records.attempts[0].status).toBe('committed'); expect(records.snapshot.state.ball.id).toBe('ball-1');
  const snapshot = records.snapshot;
  const pkgResponse = await request.get(`/api/artifacts/${snapshot.packageHash}`);
  const pkg = JSON.parse(await pkgResponse.text()); expect(pkg.files['scene.js']).toContain('export function mount');
  await page.goto(`/inspect/${worldId}`); await expect(page.getByRole('heading', { name: '世界档案' })).toBeVisible();
  await expect(page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^scene\.js$/ }) }).locator('pre')).toBeVisible();
  await page.close(); await stop(); await start();
  const context = await freshContext(browser, info.project.use), restored = await context.newPage();
  await restored.goto(worldUrl); await expect(restored.locator('#app')).toHaveAttribute('data-version-id', snapshot.versionId);
  await expect(restored.locator('#canvas')).toHaveAttribute('data-operation-count', '3');
  const after = await (await request.get(`/api/worlds/${worldId}/records`)).json();
  expect(after.snapshot).toEqual(snapshot); expect(after.turns).toHaveLength(1); expect(after.attempts).toHaveLength(1);
  await restored.screenshot({ path: info.outputPath('restored.png') });
  expect(external).toEqual([]); expect(failures).toEqual([]);
  const metrics = { browser: info.project.name, browserVersion: browser.version(), localFeedbackMs, firstVisibleMs, worldId, versionId: snapshot.versionId, packageHash: snapshot.packageHash };
  writeFileSync(info.outputPath('metrics.json'), JSON.stringify(metrics, null, 2));
  await info.attach('metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
  console.log(JSON.stringify(metrics));
  await context.close();
});

test('animation changes actual pixels, pauses and resumes from a saved clock after restart', async ({page,browser,request},info) => {
  const failures:string[]=[]; page.on('pageerror',error=>failures.push(error.message));
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
  const worldUrl=page.url(), id=worldUrl.split('/').at(-1)!, canvas=page.locator('canvas');
  await expect(page.locator('#canvas')).toHaveAttribute('data-animated-nodes','3');
  await expect.poll(async()=>Number(await page.locator('#canvas').getAttribute('data-animation-time'))).toBeGreaterThan(850);
  const first=await canvas.screenshot();
  await expect.poll(async()=>Buffer.compare(first,await canvas.screenshot())).not.toBe(0);
  const checkpoint=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/playback') && r.ok());
  await page.getByRole('button',{name:'暂停动画'}).click(); await checkpoint;
  await expect(page.locator('#canvas')).toHaveAttribute('data-animation-paused','true');
  await expect.poll(async()=>(await (await request.get(`/api/worlds/${id}/playback`)).json()).paused).toBe(true);
  const before=await (await request.get(`/api/worlds/${id}/records`)).json(), still=await canvas.screenshot();
  // Observe several actual paint frames after pausing; this is a visual invariant, not only a DOM flag.
  await page.evaluate(()=>new Promise<void>(resolve=>{let n=0;function f(){if(++n===20)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}));
  expect(await canvas.screenshot()).toEqual(still);
  await page.screenshot({path:info.outputPath('animated-paused.png')});
  await page.close(); await stop(); await start();
  const context=await freshContext(browser,info.project.use), restored=await context.newPage();
  restored.on('pageerror',error=>failures.push(error.message));
  await restored.goto(worldUrl); await expect(restored.locator('#app')).toHaveAttribute('data-version-id',before.snapshot.versionId);
  await expect(restored.getByRole('button',{name:'播放动画'})).toBeVisible();
  expect(await restored.locator('canvas').screenshot()).toEqual(still);
  const after=await (await request.get(`/api/worlds/${id}/records`)).json();
  expect(after.playback).toEqual(before.playback); expect(after.snapshot).toEqual(before.snapshot); expect(after.versions).toHaveLength(2);
  await restored.getByRole('button',{name:'播放动画'}).click();
  await expect.poll(async()=>Number(await restored.locator('#canvas').getAttribute('data-animation-time'))).toBeGreaterThan(before.playback.elapsedMs+150);
  expect(failures).toEqual([]); await context.close();
});

test('storybook selection produces a still illustrated page and survives fresh-browser restart', async ({page,browser,request},info) => {
  const failures:string[]=[]; page.on('pageerror',error=>failures.push(error.message));
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
  await page.getByRole('link',{name:'▤ 静态漫画／绘本'}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-mode','storybook');
  const worldUrl=page.url(), id=worldUrl.split('/').at(-1)!;
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
  await expect(page.locator('#canvas')).toHaveAttribute('data-animated-nodes','0');
  await expect(page.locator('#pause')).toBeHidden();
  const before=await (await request.get(`/api/worlds/${id}/records`)).json();
  expect(before.snapshot.mode).toBe('storybook'); expect(before.snapshot.operations.filter((o:{kind:string})=>o.kind==='text')).toHaveLength(2);
  const still=await page.locator('canvas').screenshot();
  await page.evaluate(()=>new Promise<void>(resolve=>{let n=0;function f(){if(++n===20)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}));
  expect(await page.locator('canvas').screenshot()).toEqual(still);
  await page.screenshot({path:info.outputPath('storybook.png')});
  await page.close(); await stop(); await start();
  const context=await freshContext(browser,info.project.use),restored=await context.newPage();
  await restored.goto(worldUrl); await expect(restored.locator('#app')).toHaveAttribute('data-version-id',before.snapshot.versionId);
  expect(await restored.locator('canvas').screenshot()).toEqual(still);
  expect((await (await request.get(`/api/worlds/${id}/records`)).json()).snapshot).toEqual(before.snapshot);
  expect(failures).toEqual([]); await context.close();
});

test('tapping a composed character restarts its motion and restores the saved cue',async({page,browser,request},info)=>{
  const model=createServer(async(req,res)=>{for await(const _ of req){} res.setHeader('Content-Type','text/event-stream');res.end(streamReply(withImageWorkflow(await animatedReply())));});
  await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));
  const address=model.address() as {port:number}; await stop();
  modelEnvironment={GENERATOR_MODE:'deepseek',DEEPSEEK_API_KEY:'test-key',DEEPSEEK_BASE_URL:`http://127.0.0.1:${address.port}`}; await start();
  try {
    await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
    await page.getByRole('textbox').fill('小狐狸');await page.getByRole('button',{name:'发送',exact:true}).click();
    await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
    const url=page.url(),id=url.split('/').at(-1)!;
    await expect.poll(async()=>Number(await page.locator('#canvas').getAttribute('data-animation-time'))).toBeGreaterThan(2200);
    const box=(await page.locator('canvas').boundingBox())!,size=Math.min(box.width,box.height),x=box.x+box.width/2,y=box.y+(box.height-size)/2+.55*size;
    if(info.project.use.hasTouch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    await expect(page.locator('#app')).toHaveAttribute('data-revision','2');
    await page.getByRole('button',{name:'暂停动画'}).click();
    await expect.poll(async()=>(await (await request.get(`/api/worlds/${id}/playback`)).json()).paused).toBe(true);
    const before=await (await request.get(`/api/worlds/${id}/records`)).json();
    expect(before.snapshot.state.taps).toBe(1);expect(before.playback.cues.actor.key).toBe('1');expect(before.playback.cues.actor.startMs).toBeGreaterThan(2000);
    const still=await page.locator('canvas').screenshot();await page.close();await stop();await start();
    const context=await freshContext(browser,info.project.use),restored=await context.newPage();
    await restored.goto(url);await expect(restored.locator('#app')).toHaveAttribute('data-revision','2');
    expect(await restored.locator('canvas').screenshot()).toEqual(still);
    await context.close();
  } finally {await stop();modelEnvironment={};await start();model.closeAllConnections();await new Promise<void>(resolve=>model.close(()=>resolve()));}
});

test('failure and retry preserve the ball; repeated successful sentences remain one ball', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
  const versionId = await page.locator('#app').getAttribute('data-version-id'), worldId = page.url().split('/').at(-1)!;
  await page.getByRole('textbox').fill('要有光'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '再试一次' })).toBeVisible();
  expect(await page.locator('#app').getAttribute('data-version-id')).toBe(versionId);
  await page.getByRole('button', { name: '再试一次' }).click();
  await expect.poll(async () => (await (await request.get(`/api/worlds/${worldId}/records`)).json()).attempts.length).toBe(3);
  await expect(page.getByRole('button', { name: '再试一次' })).toBeVisible();
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '2');
  const records = await (await request.get(`/api/worlds/${worldId}/records`)).json();
  expect(records.turns).toHaveLength(3); expect(Object.keys(records.snapshot.state)).toEqual(['ball']);
  await expect(page.locator('#canvas')).toHaveAttribute('data-operation-count', '3');
});

test('lost submission response is retried with the same id', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
  const worldId = page.url().split('/').at(-1)!;
  await page.route('**/api/worlds/*/turns', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
  await expect.poll(async () => page.evaluate(id => localStorage.getItem(`outbox:${id}`), worldId)).toBeNull();
  expect((await (await request.get(`/api/worlds/${worldId}/records`)).json()).turns).toHaveLength(1);
});

test('candidate stays invisible until commit; lost trial acknowledgement does not duplicate versions', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
  const worldId = page.url().split('/').at(-1)!;
  let release!: () => void, reportSeen!: () => void;
  const gate = new Promise<void>(r => { release = r; }), seen = new Promise<void>(r => { reportSeen = r; });
  await page.route('**/api/trials', async route => { reportSeen(); await gate; await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('textbox').fill('有一个球'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await seen;
  expect((await (await request.get(`/api/worlds/${worldId}`)).json()).revision).toBe(0);
  await expect(page.locator('#canvas')).toHaveAttribute('data-operation-count', '0');
  const acknowledged = page.waitForResponse(response => response.url().endsWith('/api/trials') && response.ok());
  release();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
  // Observe the transport retry, not a timing-only sleep.
  await acknowledged;
  const records = await (await request.get(`/api/worlds/${worldId}/records`)).json();
  expect(records.versions).toHaveLength(2); expect(records.attempts).toHaveLength(1);
});

test('plain LAN HTTP works without secure-context crypto APIs', async ({ page }) => {
  await page.goto('http://lan.test:3179/');
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.subtle)).toBe('undefined');
  await page.getByRole('textbox').fill('有一个球');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
  const version = await page.locator('#app').getAttribute('data-version-id');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-version-id', version!);
  await expect(page.locator('#canvas')).toHaveAttribute('data-operation-count', '3');
});

test('DeepSeek transport, offline taps, lost acknowledgement, restart and protocol migration', async ({ page, context, browser, request }, info) => {
  const calls: { snapshot: { state: { taps: number } }; request: string }[] = [];
  let failureSent = false;
  const model = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()), input = JSON.parse(body.messages[1].content); calls.push(input);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (input.request === 'bad upgrade' && !failureSent) { failureSent = true; res.end(streamReply('{malformed')); }
    else res.end(streamReply(withImageWorkflow(await modelReply(input.request.includes('upgrade'), input.snapshot.mode))));
  });
  await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
  const address = model.address(); if (!address || typeof address === 'string') throw new Error('No model test port');
  await stop(); modelEnvironment = { GENERATOR_MODE: 'deepseek', DEEPSEEK_API_KEY: 'mock-key', DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}` }; await start();
  try {
    await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '0');
    const worldUrl = page.url(), worldId = worldUrl.split('/').at(-1)!;
    const submit = async (target: typeof page, text: string) => { await target.getByRole('textbox').fill(text); await target.getByRole('button', { name: '发送', exact: true }).click(); };
    const tap = async (target: typeof page) => {
      const box = (await target.locator('canvas').boundingBox())!, size = Math.min(box.width, box.height);
      const x = box.x + (box.width - size) / 2 + .4 * size, y = box.y + (box.height - size) / 2 + .4 * size;
      if (info.project.use.hasTouch) await target.touchscreen.tap(x, y); else await target.mouse.click(x, y);
    };
    await submit(page, '要有光'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '1');
    await submit(page, '碰三次出现一扇门'); await expect(page.locator('#app')).toHaveAttribute('data-revision', '2');
    await context.setOffline(true);
    await tap(page); await expect(page.locator('#app')).toHaveAttribute('data-pending-events', '1');
    await tap(page); await expect(page.locator('#app')).toHaveAttribute('data-pending-events', '2');
    expect((await (await request.get(`/api/worlds/${worldId}`)).json()).state.taps).toBe(0);
    await page.route('**/api/worlds/*/interactions', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
    await context.setOffline(false);
    await expect(page.locator('#app')).toHaveAttribute('data-revision', '4');
    await expect(page.locator('#app')).toHaveAttribute('data-pending-events', '0');
    const saved = await (await request.get(`/api/worlds/${worldId}`)).json(); expect(saved.state).toEqual({ taps: 2, door: false });
    await page.close(); await stop(); await start();
    const fresh = await freshContext(browser, info.project.use), restored = await fresh.newPage();
    await restored.goto(worldUrl); await expect(restored.locator('#app')).toHaveAttribute('data-version-id', saved.versionId);
    await tap(restored); await expect(restored.locator('#app')).toHaveAttribute('data-revision', '5');
    await expect(restored.locator('#canvas')).toHaveAttribute('data-operation-count', '2');
    await submit(restored, 'upgrade'); await expect(restored.locator('#app')).toHaveAttribute('data-revision', '6');
    const records = await (await request.get(`/api/worlds/${worldId}/records`)).json();
    expect(records.snapshot.state).toEqual({ taps: 3, door: true, color: '#ffc233' }); expect(records.interactions).toHaveLength(3);
    expect(calls).toHaveLength(3); expect(calls[2].snapshot.state.taps).toBe(3);
    expect(records.chunks.length).toBeGreaterThan(0); expect(records.attempts.every((a: { generator_id: string }) => a.generator_id === 'deepseek/deepseek-flash')).toBe(true);
    await restored.screenshot({ path: info.outputPath('interactive-door.png') });
    await submit(restored, 'bad upgrade');
    await expect(restored.getByRole('button', { name: '再试一次' })).toBeVisible();
    await tap(restored); await expect(restored.locator('#app')).toHaveAttribute('data-revision', '7');
    // The old scene is still playable, and playing it must leave the retry available.
    await expect(restored.getByRole('button', { name: '再试一次' })).toBeVisible();
    await restored.getByRole('button', { name: '再试一次' }).click();
    await expect(restored.locator('#app')).toHaveAttribute('data-revision', '8');
    const retried = await (await request.get(`/api/worlds/${worldId}/records`)).json();
    expect(retried.snapshot.state).toEqual({ taps: 4, door: true, color: '#ffc233' });
    expect(retried.attempts.slice(-2).map((a: { status: string }) => a.status)).toEqual(['failed', 'committed']);
    await stop();
    const expiredStore = new Store(dataDirectory);
    try { expiredStore.prune(addCalendarMonths(new Date(), 4)); } finally { expiredStore.close(); }
    await start();
    await restored.goto(`/inspect/${worldId}`);
    await restored.getByText('当前作品 · scene.js', { exact: true }).click();
    await expect(restored.locator('details').filter({ has: restored.locator('summary').filter({ hasText: /^当前作品 · scene\.js$/ }) }).locator('pre')).toContainText('export function mount');
    expect((await (await request.get(`/api/worlds/${worldId}/records`)).json()).attempts).toHaveLength(0);
    await restored.goto(worldUrl); await expect(restored.locator('#app')).toHaveAttribute('data-version-id', retried.snapshot.versionId);
    await fresh.close();
  } finally {
    await context.setOffline(false); await stop(); modelEnvironment = {}; await start();
    model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
  }
});

test('free artwork animates; a corrupted candidate image keeps the saved scene until retry',async({page,request},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
  const id=page.url().split('/').at(-1)!;
  await page.locator('#art-trigger').click();await page.getByRole('checkbox',{name:'小兔贴纸',exact:true}).check();await page.getByRole('button',{name:'完成素材选择'}).click();
  await page.locator('#thought').fill('使用选中的素材');await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
  const first=await page.locator('canvas').screenshot();await expect.poll(async()=>Buffer.compare(first,await page.locator('canvas').screenshot())).not.toBe(0);
  const before=await(await request.get(`/api/worlds/${id}/records`)).json();expect(before.snapshot.operations[0].kind).toBe('sprite');expect(before.imageJobs).toHaveLength(0);
  const owl=before.images.find((a:{id:string})=>a.id==='free_owl');
  await page.locator('#art-trigger').click();await page.getByRole('checkbox',{name:'小兔贴纸',exact:true}).uncheck();await page.getByRole('checkbox',{name:'猫头鹰贴纸',exact:true}).check();await page.getByRole('button',{name:'完成素材选择'}).click();
  let corrupt=true;await page.route(`**/api/images/${owl.hash}`,async route=>{if(corrupt&&route.request().resourceType()==='fetch'){corrupt=false;await route.fulfill({status:200,body:'corrupted',contentType:'image/png'});}else await route.continue();});
  await page.locator('#thought').fill('使用选中的素材');await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByRole('button',{name:'再试一次'})).toBeVisible();
  expect((await(await request.get(`/api/worlds/${id}`)).json()).versionId).toBe(before.snapshot.versionId);
  expect((await(await request.get(`/api/worlds/${id}/records`)).json()).attempts.at(-1).error).toContain('素材哈希');
  await page.getByRole('button',{name:'再试一次'}).click();await expect(page.locator('#app')).toHaveAttribute('data-revision','2');
  expect((await(await request.get(`/api/worlds/${id}`)).json()).operations[0].asset).toBe('free_owl');
  await page.screenshot({path:info.outputPath('library-animated.png')});expect(errors).toEqual([]);
});

test('upload stays intact on a still page and restores identical pixels/files in a fresh browser',async({page,browser,request},info)=>{
  await page.goto('/?mode=storybook');await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
  const url=page.url(),id=url.split('/').at(-1)!;
  await page.locator('#art-trigger').click();await page.locator('.upload-form input[type=file]').setInputFiles('fixtures/library/rabbit.png');
  await page.getByRole('textbox',{name:'作品名字'}).fill('上传验收图');await page.getByRole('button',{name:'上传作品',exact:true}).click();
  await expect(page.locator('.art-feedback')).toContainText('作品已保存');await page.getByRole('button',{name:'完成素材选择'}).click();
  await page.locator('#thought').fill('使用选中的素材');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
  const before=await(await request.get(`/api/worlds/${id}/records`)).json(),upload=before.images.find((a:{source:string})=>a.source==='upload');
  await expect((await request.get(`/api/images/${upload.imageId}/original`)).body()).resolves.toEqual(readFileSync('fixtures/library/rabbit.png'));
  const still=await page.locator('canvas').screenshot();await page.screenshot({path:info.outputPath('uploaded-storybook.png')});await page.close();await stop();await start();
  const context=await freshContext(browser,info.project.use),restored=await context.newPage();await restored.goto(url);
  await expect(restored.locator('#app')).toHaveAttribute('data-version-id',before.snapshot.versionId);expect(await restored.locator('canvas').screenshot()).toEqual(still);
  const after=await(await request.get(`/api/worlds/${id}/records`)).json();expect(after.snapshot).toEqual(before.snapshot);expect(after.images).toEqual(before.images);expect(after.turns).toHaveLength(1);expect(after.imageJobs).toHaveLength(0);
  await restored.goto(`/inspect/${id}`);await expect(restored.getByRole('img',{name:'上传验收图'})).toBeVisible();await context.close();
});

test('Seedream HTTP transport, image decoding, interactive sprites, failure rollback and retry',async({page,request},info)=>{
  let imageCalls=0;
  const model=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
    if(req.url?.endsWith('/images/generations')) {
      imageCalls++;expect(req.headers.authorization).toBe('Bearer image-test-key');expect(body.response_format).toBe('b64_json');expect(body.background).toBe('transparent');
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{b64_json:imageCalls===2?Buffer.from('broken png').toString('base64'):readFileSync('fixtures/library/rabbit.png').toString('base64')}]}));
    } else {const input=JSON.parse(body.messages[1].content),alias=input.snapshot.revision?'next_art':'new_art';res.setHeader('Content-Type','text/event-stream');res.end(streamReply(imageReply('animated',[alias],[{id:alias,name:'绘制的小兔',role:'character',prompt:'a rabbit'}])));}
  });
  await new Promise<void>(r=>model.listen(0,'127.0.0.1',r));const address=model.address() as {port:number};await stop();
  modelEnvironment={GENERATOR_MODE:'deepseek',DEEPSEEK_API_KEY:'text-test-key',DEEPSEEK_BASE_URL:`http://127.0.0.1:${address.port}`,SEEDREAM_API_KEY:'image-test-key',SEEDREAM_BASE_URL:`http://127.0.0.1:${address.port}`};await start();
  try {
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-revision','0');await expect(page.locator('#art-trigger')).toContainText('AI 画图');
    const id=page.url().split('/').at(-1)!;await page.locator('#thought').fill('画小兔');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
    const box=(await page.locator('canvas').boundingBox())!;if(info.project.use.hasTouch)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await expect(page.locator('#app')).toHaveAttribute('data-revision','2');
    const before=await(await request.get(`/api/worlds/${id}`)).json();expect(before.state.taps).toBe(1);
    await page.locator('#thought').fill('换一张图片');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByRole('button',{name:'再试一次'})).toBeVisible();
    expect((await(await request.get(`/api/worlds/${id}`)).json()).versionId).toBe(before.versionId);
    await page.getByRole('button',{name:'再试一次'}).click();await expect(page.locator('#app')).toHaveAttribute('data-revision','3');
    expect(imageCalls).toBe(3);const records=await(await request.get(`/api/worlds/${id}/records`)).json();expect(records.imageJobs.map((j:{status:string})=>j.status)).toEqual(['completed','failed','completed']);
    await page.screenshot({path:info.outputPath('generated-sprite.png')});expect(errors).toEqual([]);
  } finally {await stop();modelEnvironment={};await start();model.closeAllConnections();await new Promise<void>(r=>model.close(()=>r()));}
});


test('menu languages preserve drafts and the current world across devices and a service restart', async ({ page, browser, request }, info) => {
  await page.goto('/?mode=storybook');
  const app = page.locator('#app'), input = page.locator('#thought'), picker = page.locator('.language-picker select');
  await expect(app).toHaveAttribute('data-revision', '0');
  const url = page.url(), worldId = url.split('/').at(-1)!;
  const canvas = await page.locator('canvas').elementHandle();
  await input.fill('draft / 草稿');
  for (const locale of locales) {
    await picker.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await input.getAttribute('placeholder')).toContain(languages[locale].ball);
    await expect(input).toHaveValue('draft / 草稿');
    expect(page.url()).toBe(url);
    expect(await picker.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.width >= 30;
    })).toBe(true);
  }
  await picker.selectOption('en');
  await page.locator('#art-trigger').click();
  await expect(page.getByRole('checkbox', { name:'Rabbit sticker', exact:true })).toBeVisible();
  await expect(page.getByText(/Choose pictures, then send/)).toContainText(languages.en.assets);
  await page.getByRole('button', { name:'Finish choosing artwork' }).click();
  await input.fill('  ' + languages.ja.ball + '  ');
  await page.getByRole('button', { name:'Send', exact:true }).click();
  await expect(app).toHaveAttribute('data-revision','1');
  const records = () => request.get('/api/worlds/' + worldId + '/records').then(response => response.json());
  const before = await records();
  expect(before.snapshot.storyLocale).toBe('ja');
  expect(before.snapshot.operations.map((op:{text?:string}) => op.text)).toContain(languages.ja.title);
  expect(before.turns[0]).toMatchObject({text:'  ' + languages.ja.ball + '  ',ui_locale:'en'});
  await picker.selectOption('de');
  expect(await canvas!.evaluate(c => c === document.querySelector('canvas'))).toBe(true);
  await page.reload();
  await expect(picker).toHaveValue('de');
  await expect(app).toHaveAttribute('data-version-id',before.snapshot.versionId);
  expect((await records()).turns).toHaveLength(1);
  await page.close();
  await stop(); await start();
  const context = await browser.newContext({ locale:'fr-CA', viewport:info.project.use.viewport });
  try {
    const restored = await context.newPage();
    await restored.goto(url);
    await expect(restored.locator('#app')).toHaveAttribute('data-version-id',before.snapshot.versionId);
    await expect(restored.locator('.language-picker select')).toHaveValue('fr');
    await restored.goto('/inspect/' + worldId);
    await expect(restored.getByRole('heading', {name:'Archives du monde'})).toBeVisible();
    const after = await records();
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.turns).toHaveLength(1); expect(after.attempts).toHaveLength(1);
  } finally { await context.close(); }
});

test('OpenAI credit routing, named reference permission, image reuse and restart with a different provider', async ({page,request})=>{
  let textCalls=0, imageCalls=0, quota=false;
  const mock=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const piece of req)chunks.push(piece);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    if(req.url==='/v1/responses'){
      textCalls++;
      if(quota){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'credit_balance_exhausted',message:'Test credits used'}}));return;}
      const input=JSON.parse(body.input), existing=input.availableAssets as {id:string;source:string}[];
      const ref=existing.find(a=>a.source==='upload')!;
      const plans=textCalls===1?[{id:'actor',name:'画里的小兔',role:'character' as const,prompt:'a rabbit',references:[ref.id]}]:[];
      res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(responsesWire(imageReply('animated',['actor'],plans)));return;
    }
    if(req.url==='/v1/images/edits'){
      imageCalls++;
      expect(body.images[0].image_url).toMatch(/^data:image\/png;base64,/);
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{b64_json:readFileSync('fixtures/library/rabbit.png').toString('base64')}]}));return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));
  const port=(mock.address() as {port:number}).port;
  try {
    await stop();
    modelEnvironment={GENERATOR_MODE:'deepseek',OPENAI_API_KEY:'e2e-openai-only',DEEPSEEK_API_KEY:'old-text',SEEDREAM_API_KEY:'old-image',NODE_OPTIONS:'--import=./tests/helpers/openai-loopback.mjs',OPENAI_LOOPBACK_PORT:String(port)};
    await start();
    expect((await(await request.get('/api/health')).json()).mode).toBe('openai');
    await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-revision','0');
    const url=page.url(),world=url.split('/').at(-1)!;
    await page.locator('#art-trigger').click();
    await page.locator('.upload-form input[type=file]').setInputFiles('fixtures/library/rabbit.png');
    await page.locator('input[name=name]').fill('测试小兔');
    await page.locator('.upload-form button[type=submit]').click();
    await expect(page.locator('.art-feedback')).toContainText('作品已保存并选中');
    await page.locator('input[value="ai"]').check();
    const consent=page.locator('.reference-consent');
    await expect(consent).toBeVisible();await expect(consent).toContainText('OpenAI');await expect(consent.locator('input')).not.toBeChecked();
    await consent.locator('input').check();await page.locator('.art-close').click();
    await page.locator('#thought').fill('用我选中的兔子作参考图');await page.locator('#send').click();
    await expect(page.locator('#app')).toHaveAttribute('data-revision','1');
    await page.locator('#thought').fill('让它动一下');await page.locator('#send').click();
    await expect(page.locator('#app')).toHaveAttribute('data-revision','2');expect(imageCalls).toBe(1);
    const saved=await(await request.get('/api/worlds/'+world)).json();
    const records=await(await request.get('/api/worlds/'+world+'/records')).json();
    expect(JSON.parse(records.turns[0].art_selection)).toMatchObject({allowUploadReferences:true,referenceProvider:'openai'});
    expect(JSON.parse(records.turns[1].art_selection).allowUploadReferences).toBe(false);
    quota=true;await page.locator('#thought').fill('再加点阳光');await page.locator('#send').click();
    await expect(page.getByText(/OpenAI 额度已用完/)).toBeVisible();expect(textCalls).toBe(3);expect(imageCalls).toBe(1);
    expect(await(await request.get('/api/worlds/'+world)).json()).toEqual(saved);
    await stop();modelEnvironment={GENERATOR_MODE:'deepseek',DEEPSEEK_API_KEY:'old-text',SEEDREAM_API_KEY:'old-image'};await start();
    await page.goto(url);await expect(page.locator('#app')).toHaveAttribute('data-version-id',saved.versionId);
    await page.locator('#art-trigger').click();await expect(consent).toContainText('Seedream');await expect(consent.locator('input')).not.toBeChecked();
    expect(textCalls).toBe(3);expect(imageCalls).toBe(1);
  }finally{await stop();modelEnvironment={};await start();mock.closeAllConnections();await new Promise<void>(r=>mock.close(()=>r()));}
});
