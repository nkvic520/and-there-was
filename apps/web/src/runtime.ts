import { hashJson, LIMITS, validatePackage, validateOutput, type ScenePackage, type SceneState, type TrialOutput } from '@and-there-was/scene';
export async function runIsolated(pkg: ScenePackage, state: SceneState, expectedHash: string): Promise<TrialOutput> {
  if (await hashJson(pkg) !== expectedHash) throw new Error('Package hash mismatch');
  const protocol = await validatePackage(pkg);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    let timer = setTimeout(() => finish(new Error('隔离运行环境加载超时')), 15000);
    const finish = (error?: Error, result?: TrialOutput) => { clearTimeout(timer); worker.terminate(); if (error) reject(error); else resolve(result!); };
    worker.onerror = event => { event.preventDefault(); finish(new Error(event.message || '隔离执行器异常')); };
    worker.onmessage = event => {
      if (event.data.type === 'ready') {
        clearTimeout(timer); timer = setTimeout(() => finish(new Error('脚本执行超时')), LIMITS.workerMs);
        worker.postMessage({ package: pkg, state });
      } else if (event.data.type === 'result') {
        try { validateOutput(protocol, event.data.output); finish(undefined, event.data.output); }
        catch (error) { finish(error as Error); }
      } else finish(new Error(event.data.error));
    };
  });
}
