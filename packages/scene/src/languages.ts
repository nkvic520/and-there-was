export const locales = ["en","zh-CN","zh-TW","ja","ko","es","fr","de","pt-BR","ru"] as const;
export type Locale = typeof locales[number];

interface Language {
  name: string;
  ball: string;
  assets: string;
  title: string;
  caption: string;
}

export const languages: Record<Locale, Language> = {
  'en': {
    name: "English", ball: "There is a ball", assets: "Use the selected assets",
    title: "A little blue ball", caption: "A little ball lands on the soft grass.\nA tiny story begins."
  },
  'zh-CN': {
    name: "简体中文", ball: "有一个球", assets: "使用选中的素材",
    title: "一个蓝色的小球", caption: "小球落在柔软的草地上，\n一个小小的故事，就有了。"
  },
  'zh-TW': {
    name: "繁體中文", ball: "有一個球", assets: "使用選取的素材",
    title: "一顆藍色的小球", caption: "小球落在柔軟的草地上，\n一個小小的故事，就有了。"
  },
  'ja': {
    name: "日本語", ball: "ボールがひとつある", assets: "選んだ素材を使って",
    title: "小さな青いボール", caption: "ボールがふわふわの草の上にぽとん。\n小さなお話のはじまりです。"
  },
  'ko': {
    name: "한국어", ball: "공이 하나 있어", assets: "선택한 그림을 사용해 줘",
    title: "작은 파란 공", caption: "작은 공이 보드라운 풀밭에 톡!\n작은 이야기가 시작돼요."
  },
  'es': {
    name: "Español", ball: "Hay una pelota", assets: "Usa las imágenes seleccionadas",
    title: "Una pelotita azul", caption: "La pelota cae sobre la hierba suave.\nAsí empieza una pequeña historia."
  },
  'fr': {
    name: "Français", ball: "Il y a une balle", assets: "Utilise les images choisies",
    title: "Une petite balle bleue", caption: "La balle se pose dans l’herbe douce.\nUne petite histoire commence."
  },
  'de': {
    name: "Deutsch", ball: "Da ist ein Ball", assets: "Verwende die ausgewählten Bilder",
    title: "Ein kleiner blauer Ball", caption: "Der Ball landet im weichen Gras.\nEine kleine Geschichte beginnt."
  },
  'pt-BR': {
    name: "Português (Brasil)", ball: "Tem uma bola", assets: "Use as imagens selecionadas",
    title: "Uma bolinha azul", caption: "A bolinha cai na grama macia.\nUma pequena história começa."
  },
  'ru': {
    name: "Русский", ball: "Есть мяч", assets: "Используй выбранные картинки",
    title: "Маленький синий мяч", caption: "Мяч опускается на мягкую траву.\nТак начинается маленькая история."
  }
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some(locale => locale === value);
}

export function browserLocale(preferences: readonly string[]): Locale {
  for (const tag of preferences) {
    try {
      const locale = new Intl.Locale(tag);
      if (locale.language === 'zh') return locale.maximize().script === 'Hant' ? 'zh-TW' : 'zh-CN';
      if (locale.language === 'pt') return 'pt-BR';
      if (isLocale(locale.language)) return locale.language;
    } catch { /* Skip malformed preferences and try the next language. */ }
  }
  return 'en';
}

function normalizeExample(text: string) {
  return text.normalize('NFC').trim().replace(/[.!?。！？]+$/u, '').trimEnd().replace(/\s+/gu, ' ').toLowerCase();
}

export function matchExample(text: string): { locale: Locale; kind: 'ball' | 'assets' } | undefined {
  const input = normalizeExample(text);
  for (const locale of locales) {
    for (const kind of ['ball', 'assets'] as const) {
      if (input === normalizeExample(languages[locale][kind])) return { locale, kind };
    }
  }
}
