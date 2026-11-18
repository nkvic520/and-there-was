import { sify, tify } from 'chinese-conv';
import type { WorldSnapshot } from '@and-there-was/scene';
import { eld } from 'eld/extrasmall';
import { isLocale, matchExample, type Locale } from '@and-there-was/scene/languages';

const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });

function chineseLocale(text: string, uiLocale: Locale): Locale {
  let traditional = 0, simplified = 0;
  for (const char of text) {
    if (sify(char) !== char) traditional++;
    if (tify(char) !== char) simplified++;
  }
  if (traditional !== simplified) return traditional > simplified ? 'zh-TW' : 'zh-CN';
  return uiLocale === 'zh-TW' ? 'zh-TW' : 'zh-CN';
}

// Resolve the new work from the child's words alone. Catalog names and model
// instructions can be in a different language and are never detection input.
export function firstStoryLocale(text: string, uiLocale: Locale): Locale {
  const example = matchExample(text);
  if (example) return example.locale;
  for (const { segment } of sentences.segment(text)) {
    const words = segment.match(/\p{L}+/gu) ?? [];
    if (!words.length) continue;
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(segment);
    if (words.length === 1 && !cjk) continue;
    const result = eld.detect(segment);
    if (!result.isReliable()) continue;
    // A few shared Han characters often score as Japanese without any kana.
    // Use the reader's preference for this ambiguous case.
    if (result.language === 'ja' && /^\p{Script=Han}{1,4}$/u.test(words.join(''))) {
      return uiLocale.startsWith('zh-') ? chineseLocale(segment, uiLocale) : uiLocale;
    }
    if (result.language === 'zh') return chineseLocale(segment, uiLocale);
    if (result.language === 'pt') return 'pt-BR';
    if (isLocale(result.language)) return result.language;
  }
  return uiLocale;
}

export function savedStoryLocale(world?: WorldSnapshot): Locale | undefined {
  if (world?.storyLocale) return world.storyLocale;
  if (!world?.packageHash) return;
  // Older versions did not record a language. Read their visible text on the
  // next edit, without modifying the original package or archived snapshot.
  const captions = world.operations.filter(op => op.kind === 'text').map(op => op.text).join(' ');
  return firstStoryLocale(captions, 'zh-CN');
}
