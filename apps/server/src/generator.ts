import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, type ScenePackage, type WorldSnapshot } from '@and-there-was/scene';
export interface GenerationContext {
  previousPackage?: ScenePackage;
  previousFailure?: { error: string; package?: ScenePackage; content?: string };
  signal: AbortSignal;
  request(value: unknown): void;
  chunk(text: string): void;
  response(value: unknown): void;
}
export interface Generator {
  readonly id: string;
  generate(text: string, baseline: WorldSnapshot, context?: GenerationContext): Promise<ScenePackage>;
}
export class FixtureGenerator implements Generator {
  readonly id = 'fixture/ball-v1';
  async generate(text: string): Promise<ScenePackage> {
    if (text.trim() !== '有一个球') throw new Error('样例暂时只支持「有一个球」，可以改好再发送。');
    const files: Record<string, string> = {}, hashes: Record<string, string> = {};
    for (const name of ['protocol.json', 'scene.js', 'view.json']) {
      files[name] = await readFile(resolve('fixtures/ball', name), 'utf8');
      hashes[name] = await sha256(files[name]);
    }
    return { formatVersion: 1, sdkVersion: 1, entry: 'scene.js', files, hashes, assets: [] };
  }
}
