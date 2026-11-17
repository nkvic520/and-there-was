import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule, type QuickJSSyncVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { assert, LIMITS, runtimeVersion, utf8Size, validateOutput, validatePackage, validateState, validateEvent, type ScenePackage, type SceneState, type TrialOutput, type DrawOperation, type EventBinding, type ExecutionOptions } from './index';

export async function createEngine(variant: QuickJSSyncVariant = RELEASE_SYNC): Promise<QuickJSWASMModule> {
  return newQuickJSWASMModuleFromVariant(variant);
}

export async function executePackage(engine: QuickJSWASMModule, pkg: ScenePackage, initialState: SceneState, options: ExecutionOptions = {}): Promise<TrialOutput> {
  const protocol = await validatePackage(pkg);
  if (options.event) { validateState(protocol, initialState); validateEvent(protocol, options.event); }
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(LIMITS.memoryBytes);
  runtime.setMaxStackSize(256 * 1024);
  runtime.setModuleLoader(() => { throw new Error('External imports are forbidden'); });
  const started = performance.now();
  runtime.setInterruptHandler(() => performance.now() - started > LIMITS.callMs);
  const vm = runtime.newContext();
  let state = structuredClone(initialState);
  const operations: DrawOperation[] = [];
  const bindings: EventBinding[] = [];
  let drawCount = 0, bindingCount = 0;
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
      assert(++drawCount <= LIMITS.operations, 'Operation limit exceeded');
      const json = vm.getString(value);
      assert(utf8Size(json) <= 2048, 'Operation too large');
      operations.push(JSON.parse(json));
      return vm.undefined;
    } catch (error) { bridgeError = error as Error; throw bridgeError; }
  });
  const bindFn = vm.newFunction('bind', value => {
    try {
      assert(++bindingCount <= LIMITS.operations, 'Binding limit exceeded');
      const json = vm.getString(value); assert(utf8Size(json) <= 8192, 'Binding too large');
      bindings.push(JSON.parse(json)); return vm.undefined;
    } catch (error) { bridgeError = error as Error; throw bridgeError; }
  });
  vm.setProp(vm.global, '__saveState', stateFn);
  vm.setProp(vm.global, '__draw', drawFn);
  vm.setProp(vm.global, '__bind', bindFn);
  stateFn.dispose(); drawFn.dispose(); bindFn.dispose();
  try {
    const bootstrap = vm.evalCode(`(() => {
      const save = __saveState, draw = __draw, bind = __bind;
      delete globalThis.__saveState; delete globalThis.__draw; delete globalThis.__bind;
      delete globalThis.Date;
      Math.random = () => { throw new Error('Persist deterministic values in scene state'); };
      let state = ${JSON.stringify(initialState)};
      globalThis.sdk = Object.freeze({
        getState: () => JSON.parse(JSON.stringify(state)),
        setState: value => { save(JSON.stringify(value)); state = value; },
        circle: (id, x, y, radius, color, alpha = 1) => draw(JSON.stringify({kind:'circle',id,x,y,radiusX:radius,radiusY:radius,color,alpha})),
        ellipse: (id, x, y, radiusX, radiusY, color, alpha = 1) => draw(JSON.stringify({kind:'ellipse',id,x,y,radiusX,radiusY,color,alpha}))
        ${pkg.sdkVersion === 2 ? `,
        rect: (id, x, y, width, height, color, alpha = 1) => draw(JSON.stringify({kind:'rect',id,x,y,radiusX:width/2,radiusY:height/2,color,alpha})),
        onTap: (targetId, event, payload = {}) => bind(JSON.stringify({targetId,event,payload}))` : ''}
      });
    })()`);
    vm.unwrapResult(bootstrap).dispose();
    const exports = vm.unwrapResult(vm.evalCode(pkg.files['scene.js'], 'scene.js', { type: 'module' }));
    try {
      const call = (name: string, args: unknown[] = [], required = true) => {
        const fn = vm.getProp(exports, name);
        if (!required && vm.typeof(fn) === 'undefined') { fn.dispose(); return; }
        const sdk = vm.getProp(vm.global, 'sdk');
        const handles: ReturnType<typeof vm.newString>[] = [];
        try {
          for (const arg of args) handles.push(vm.unwrapResult(vm.evalCode(`(${JSON.stringify(arg)})`)));
          assert(vm.typeof(fn) === 'function', `Module must export ${name}`);
          const result = vm.unwrapResult(vm.callFunction(fn, vm.undefined, sdk, ...handles));
          try { assert(vm.typeof(result) === 'undefined', `${name} must be synchronous and return undefined`); }
          finally { result.dispose(); }
        } finally { handles.forEach(h => h.dispose()); sdk.dispose(); fn.dispose(); }
      };
      if (options.migrate && pkg.sdkVersion === 2) call('migrate', [options.previousProtocol ?? null], false);
      if (options.event) call('onEvent', [options.event.name, options.event.payload]);
      // Event handlers and migration change state; only mount defines the full drawing.
      operations.length = 0; bindings.length = 0;
      call('mount');
    } finally { exports.dispose(); }
    if (bridgeError) throw bridgeError;
    const output = { state, operations, ...(pkg.sdkVersion === 2 ? { bindings } : {}), durationMs: performance.now() - started, runtimeVersion: runtimeVersion(pkg.sdkVersion) };
    validateOutput(protocol, output);
    return output;
  } catch (error) {
    throw new Error(bridgeError?.message ?? (error instanceof Error ? error.message : JSON.stringify(error)));
  } finally { vm.dispose(); runtime.dispose(); }
}
