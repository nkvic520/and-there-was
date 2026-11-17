import { newVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import type { ScenePackage, SceneState } from '@and-there-was/scene';

const engine = await createEngine(newVariant(RELEASE_SYNC, { wasmLocation: wasmUrl }));
self.postMessage({ type: 'ready' });
self.onmessage = async (event: MessageEvent<{ package: ScenePackage; state: SceneState }>) => {
  try { self.postMessage({ type: 'result', output: await executePackage(engine, event.data.package, event.data.state) }); }
  catch (error) { self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) }); }
};
