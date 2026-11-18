import { assert, canonical, record, sha256, type WorldSnapshot } from '@and-there-was/scene';
import { isLocale, locales, type Locale } from '@and-there-was/scene/languages';
import type { GenerationContext, GenerationResult } from './generator';
import { namesLanguage, requestedStoryLocale } from './language-request';
import { firstStoryLocale, savedStoryLocale } from './story-language';
import { ART_PROMPT } from './art-prompt';
import { PROMPT_VERSION, SCENE_PROMPT } from './scene-prompt';

export function sceneBrief(text: string, baseline: WorldSnapshot, context?: GenerationContext) {
  const saved = savedStoryLocale(baseline) ?? null;
  const uiLocale = context?.uiLocale ?? 'zh-CN';
  const defaultLocale = saved ?? firstStoryLocale(text, uiLocale);
  const requested = requestedStoryLocale(text, defaultLocale);
  const target = requested ?? defaultLocale;
  const language = {
    target, saved, supported: locales,
    previousStoryText: baseline.operations.filter(op => op.kind === 'text').map(op => ({ id: op.id, text: op.text }))
  };
  const languageInstruction = `\nFor this particular artwork the target storyLocale is "${target}". Write all on-page text and new artwork names in that language. Use language.previousStoryText as the source for continuing or translating the work. Double-check that the title and narration identify the same character as the source. A change to another target requires an explicit language request quoted from the child as languageChangeQuote.`;
  const art = context?.artSelection?.artSource;
  const instructions = SCENE_PROMPT + (art ? ART_PROMPT : '') + languageInstruction;
  const input = canonical({
    language, worldMode: baseline.mode ?? 'animated', request: text, snapshot: baseline,
    previousPackage: context?.previousPackage ?? null, previousFailure: context?.previousFailure ?? null,
    ...(art ? { artSelection: context.artSelection, imageProvider: context.imageProvider ?? null,
      availableAssetIds: context.availableAssets?.map(a => a.id) ?? [], availableAssets: context.availableAssets ?? [] } : {})
  });
  return { instructions, input, target, requested, promptVersion: PROMPT_VERSION + (art ? '+images-4/providers' : '') };
}

export async function sceneResult(value: unknown, text: string, language: {target: Locale; requested?: Locale}, context?: GenerationContext): Promise<GenerationResult> {
  const { target, requested } = language;
  assert(record(value) && record(value.protocol) && typeof value.script === 'string' && record(value.view), 'Model must return protocol, script and view');
  assert(isLocale(value.storyLocale), 'Model must return a supported storyLocale');
  if (requested) assert(value.storyLocale === requested, 'The scene must use the explicitly requested story language');
  if (value.storyLocale !== target) {
    const quote = value.languageChangeQuote;
    assert(typeof quote === 'string' && text.includes(quote) && namesLanguage(quote, value.storyLocale), 'Changing the story language requires a quoted request from this turn');
  }
  const files = { 'protocol.json': JSON.stringify(value.protocol), 'scene.js': value.script, 'view.json': JSON.stringify(value.view) };
  const hashes: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) hashes[name] = await sha256(text);
  assert([2,3,4].includes(Number(value.protocol.schemaVersion)), 'Unsupported generated SDK');
  if (context?.artSelection?.artSource) assert(value.protocol.schemaVersion === 4 && Array.isArray(value.assetIds) && Array.isArray(value.assetRequests), '图片世界需要 SDK 4 和素材清单');
  return { storyLocale: value.storyLocale, formatVersion: 1, sdkVersion: value.protocol.schemaVersion as 2 | 3 | 4, entry: 'scene.js', files, hashes, assets: [], ...(value.assetIds !== undefined ? {assetIds:value.assetIds as string[]} : {}), ...(value.assetRequests !== undefined ? {assetRequests:value.assetRequests as GenerationResult['assetRequests']} : {}) };
}
