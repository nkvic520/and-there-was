import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule, type QuickJSSyncVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { assert, LIMITS, RUNTIME_VERSION, utf8Size, validateOutput, validatePackage, type ScenePackage, type SceneState, type TrialOutput, type DrawOperation } from './index';

export async function createEngine(variant: QuickJSSyncVariant = RELEASE_SYNC): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(variant);
}

export async function executePackage(engine: QuickJSWASMModule, pkg: ScenePackage, initialState: SceneState): Promise<TrialOutput> {
  const protocol = await validatePackage(pkg);
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(LIMITS.memoryBytes);
  runtime.setMaxStackSize(256 * 1024);
  runtime.setModuleLoader(() => { throw new Error('External imports are forbidden'); });
  const started = performance.now();
  runtime.setInterruptHandler(() => performance.now() - started > LIMITS.callMs);
  const vm = runtime.newContext();
  let state = structuredClone(initialState);
  const operations: DrawOperation[] = [];
  let bridgeError: Error | undefined;
  const stateFn = vm.newFunction('saveState', value => {
    try {
      const json = vm.getString(value);
      assert(utf8Size(json) <= LIMITS.stateBytes, 'State limit exceeded');
      state = JSON.parse(json);
      return vm.undefined;
    } catch (error) { bridgeError = error as Error; throw bridgeError; }
  });
  const drawFn = vm.newFunction('draw', value => {
    try {
      assert(operations.length < LIMITS.operations, 'Operation limit exceeded');
      const json = vm.getString(value);
      assert(utf8Size(json) <= 2048, 'Operation too large');
      operations.push(JSON.parse(json));
      return vm.undefined;
    } catch (error) { bridgeError = error as Error; throw bridgeError; }
  });
  vm.setProp(vm.global, '__saveState', stateFn);
  vm.setProp(vm.global, '__draw', drawFn);
  stateFn.dispose(); drawFn.dispose();
  try {
    const bootstrap = vm.evalCode(`(() => {
      const save = __saveState, draw = __draw;
      delete globalThis.__saveState; delete globalThis.__draw;
      let state = ${JSON.stringify(initialState)};
      globalThis.sdk = Object.freeze({
        getState: () => JSON.parse(JSON.stringify(state)),
        setState: value => { save(JSON.stringify(value)); state = value; },
        circle: (id, x, y, radius, color, alpha = 1) => draw(JSON.stringify({kind:'circle',id,x,y,radiusX:radius,radiusY:radius,color,alpha})),
        ellipse: (id, x, y, radiusX, radiusY, color, alpha = 1) => draw(JSON.stringify({kind:'ellipse',id,x,y,radiusX,radiusY,color,alpha}))
      });
    })()`);
    vm.unwrapResult(bootstrap).dispose();
    const exports = vm.unwrapResult(vm.evalCode(pkg.files['scene.js'], 'scene.js', { type: 'module' }));
    try {
      const mount = vm.getProp(exports, 'mount');
      try {
        assert(vm.typeof(mount) === 'function', 'Module must export mount');
        const sdk = vm.getProp(vm.global, 'sdk');
        try {
          const result = vm.unwrapResult(vm.callFunction(mount, vm.undefined, sdk));
          try { assert(vm.typeof(result) === 'undefined', 'mount must be synchronous and return undefined'); }
          finally { result.dispose(); }
        } finally { sdk.dispose(); }
      } finally { mount.dispose(); }
    } finally { exports.dispose(); }
    if (bridgeError) throw bridgeError;
    const output = { state, operations, durationMs: performance.now() - started, runtimeVersion: RUNTIME_VERSION };
    validateOutput(protocol, output);
    return output;
  } catch (error) {
    throw new Error(bridgeError?.message ?? (error instanceof Error ? error.message : JSON.stringify(error)));
  } finally { vm.dispose(); runtime.dispose(); }
}
