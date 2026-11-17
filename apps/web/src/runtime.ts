import { hashJson, LIMITS, validatePackage, validateOutput, type ScenePackage, type SceneState, type TrialOutput, type ExecutionOptions } from '@and-there-was/scene';

// Keep WASM loaded for offline play; every call still gets a fresh bounded VM.
let worker: Worker | undefined, ready = false, execution: Promise<unknown> = Promise.resolve();
function dispose() { worker?.terminate(); worker = undefined; ready = false; }
window.addEventListener('pagehide', dispose);
export function runIsolated(pkg: ScenePackage, state: SceneState, expectedHash: string, options: ExecutionOptions = {}): Promise<TrialOutput> {
  const result = execution.then(() => run(pkg, state, expectedHash, options));
  execution = result.catch(() => {}); return result;
}
async function run(pkg: ScenePackage, state: SceneState, expectedHash: string, options: ExecutionOptions): Promise<TrialOutput> {
  if (await hashJson(pkg) !== expectedHash) throw new Error('Package hash mismatch');
  const protocol = await validatePackage(pkg);
  if (!worker) worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const active = worker;
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer = setTimeout(() => finish(new Error('隔离运行环境加载超时'), undefined, true), 15000);
    function finish(error?: Error, output?: TrialOutput, terminate = false) {
      if (finished) return; finished = true; clearTimeout(timer); active.onmessage = null; active.onerror = null;
      if (terminate) dispose();
      if (error) reject(error); else resolve(output!);
    }
    function execute() {
      clearTimeout(timer); timer = setTimeout(() => finish(new Error('脚本执行超时'), undefined, true), LIMITS.workerMs);
      active.postMessage({ package: pkg, state, options });
    }
    active.onerror = event => { event.preventDefault(); finish(new Error(event.message || '隔离执行器异常'), undefined, true); };
    active.onmessage = event => {
      if (event.data.type === 'ready') { ready = true; execute(); }
      else if (event.data.type === 'result') {
        try { validateOutput(protocol, event.data.output); finish(undefined, event.data.output); }
        catch (error) { finish(error as Error); }
      } else finish(new Error(event.data.error));
    };
    if (ready) execute();
  });
}
