import { test, expect, type Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { modelReply, streamReply } from '../helpers/interactive';
import { Store } from '../../apps/server/src/store';
import { addCalendarMonths } from '@and-there-was/scene';

let server: ChildProcess, dataDirectory: string, serverLog = '';
let modelEnvironment: Record<string, string> = {};
async function start() {
  serverLog = '';
  server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: process.cwd(), env: { ...process.env, PORT: '3179', HOST: '127.0.0.1', DATA_DIR: dataDirectory, GENERATOR_MODE: 'fixture', ...modelEnvironment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

async function freshContext(browser: Browser, projectUse: Record<string, unknown>) {
  return browser.newContext({ viewport: projectUse.viewport as { width: number; height: number } | undefined, isMobile: Boolean(projectUse.isMobile), hasTouch: Boolean(projectUse.hasTouch) });
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
    else res.end(streamReply(await modelReply(input.request.includes('upgrade'))));
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
