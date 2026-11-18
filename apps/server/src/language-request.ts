import { locales, type Locale } from '@and-there-was/scene/languages';

// Resolve clear whole-story requests before generating. More conversational
// requests (including individual lines of dialogue) still go to the model.
const aliases: Record<Locale, string[]> = {
  en: ['英语', '英語', '英文', 'английском'],
  'zh-CN': ['简体中文', '簡體中文', '简体字', '簡體字', 'упрощённом китайском'],
  'zh-TW': ['繁体中文', '繁體中文', '繁体字', '繁體字', 'традиционном китайском'],
  ja: ['日语', '日語', '日文', '日本語', 'японском'],
  ko: ['韩语', '韓語', '韩文', '韓文', 'корейском'],
  es: ['西班牙语', '西班牙語', '西班牙文', '西语', 'испанском'],
  fr: ['法语', '法語', '法文', 'французском'],
  de: ['德语', '德語', '德文', 'немецком'],
  'pt-BR': ['葡萄牙语', '葡萄牙語', '葡文', 'português', 'португальском'],
  ru: ['俄语', '俄語', '俄文', 'русском']
};
const names = new Map<string, Locale>();
for (const locale of locales) {
  // Include the language names children see in each of the ten menus.
  for (const language of locales) {
    const display = new Intl.DisplayNames([language], { type: 'language' });
    names.set(display.of(locale)!.toLowerCase(), locale);
    if (locale === 'zh-CN' || locale === 'zh-TW') names.set(display.of(locale === 'zh-CN' ? 'zh-Hans' : 'zh-Hant')!.toLowerCase(), locale);
    if (locale === 'pt-BR') names.set(display.of('pt')!.toLowerCase(), locale);
  }
  for (const alias of aliases[locale]) names.set(alias.toLowerCase(), locale);
}
const genericChinese = new Set(locales.map(ui => new Intl.DisplayNames([ui], { type:'language' }).of('zh')!.toLowerCase()));
for (const name of ['中文', '汉语', '漢語', 'китайском', ...genericChinese]) names.set(name, 'zh-CN');
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const languagePattern = new RegExp([...names.keys()].sort((a,b) => b.length - a.length).map(escapePattern).join('|'), 'giu');

// Patterns match an affirmative instruction about the whole work. A mention
// such as "a Japanese forest" or "a rabbit that speaks French" is ordinary content.
const directives = [
  /^(?:请你?|請你?)?(?:用|改用)@(?:来|來)?(?:讲述?|講述?|写|寫|创作|創作|重写|重寫|读|讀)(?:一下)?(?:这本|這本|这个|這個|整个|整個|一個|一个|这段|這段)?(?:故事|绘本|繪本|童话|童話|漫画|漫畫)/u,
  /^(?:请你?|請你?)?(?:把|将|將)?(?:这本|這本|这个|這個|整本|整个|整個)?(?:故事|绘本|繪本|漫画|漫畫)(?:的语言|的語言)?(?:翻译|翻譯|写|寫|改|切换|切換|换|換)(?:成|为|為|用)@/u,
  /^(?:please\s+)?(?:write|tell|read|retell|translate|rewrite|continue)\b.{0,80}\b(?:story|book|tale|narration)\b\s+(?:(?:entirely|completely|only|again)\s+)*(?:in|into)\s+@/iu,
  /^(?:por favor\s+|s’il te plaît\s+|bitte\s+)?(?:cuenta|escribe|traduce|raconte|écris|traduis|erzähle?|schreib\w*|übersetz\w*|conte|escreva|traduza)\b.{0,80}(?:historia|cuento|libro|histoire|livre|geschichte|buch|história|conto|livro)\s+(?:(?:entièrement|vollständig|inteiramente|completamente)\s+)*(?:en|auf|ins|em|para)\s+@/iu,
  /^(?:この|その|全部の)?(?:物語|お話|絵本|ストーリー)(?:全体)?を@で(?:書|描|語|話|読|作)/u,
  /^(?:이\s*|그\s*)?(?:이야기|그림책|동화)(?:를|을)\s*@(?:으)?로\s*(?:써|쓰|읽|들려|말|바꿔)/u,
  /^(?:пожалуйста\s+)?(?:расскажи|напиши|переведи|продолжи)\s+.{0,55}(?:историю|сказку|книгу|рассказ)\s+на\s+@/iu
];

export function namesLanguage(quote: string, locale: Locale): boolean {
  for (const match of quote.toLowerCase().matchAll(languagePattern)) {
    if (names.get(match[0]) === locale || (locale.startsWith('zh-') && genericChinese.has(match[0]))) return true;
  }
  return false;
}

export function requestedStoryLocale(text: string, previous: Locale): Locale | undefined {
  const unquoted = text.toLowerCase().replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|«[^»]*»/gu, ' ');
  let requested: Locale | undefined;
  for (const part of unquoted.split(/[.!?。！？,，;；\n]/u)) {
    const clause = part.trim();
    for (const match of clause.matchAll(languagePattern)) {
      const tokenized = clause.slice(0, match.index) + '@' + clause.slice(match.index + match[0].length);
      if (directives.some(pattern => pattern.test(tokenized))) {
        const locale = names.get(match[0])!;
        requested = genericChinese.has(match[0]) && previous === 'zh-TW' ? previous : locale;
      }
    }
  }
  return requested;
}
