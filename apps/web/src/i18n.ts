import { browserLocale, isLocale, languages, locales, type Locale } from '@and-there-was/scene/languages';
import type { SceneAsset } from '@and-there-was/scene';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';

export type Message = keyof typeof en;
type Values = Record<string, string>;
const catalogs: Record<Locale, Record<Message, string>> = {
  en, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, ko, es, fr, de, 'pt-BR': ptBR, ru
};
const preferenceKey = 'interface-language';
let selected: Locale = browserLocale(navigator.languages.length ? navigator.languages : [navigator.language]);
try {
  const saved = localStorage.getItem(preferenceKey);
  if (isLocale(saved)) selected = saved;
} catch { /* The page can still use the browser language without storage. */ }
export const uiLocale = () => selected;
const values = new WeakMap<Element, Values>();

export function translate(key: Message, args: Values = {}): string {
  const variables: Values = { ball: languages[selected].ball, assets: languages[selected].assets, ...args };
  return catalogs[selected][key].replace(/\{(\w+)\}/g, (_, name: string) => variables[name] ?? '');
}

export function label(node: HTMLElement, key: Message, args?: Values) {
  node.dataset.i18n = key;
  if (args) values.set(node, args); else values.delete(node);
  node.textContent = translate(key, args);
}

export function clearLabel(node: HTMLElement) {
  delete node.dataset.i18n;
  values.delete(node);
  node.textContent = '';
}

export function assetName(asset: SceneAsset): Message | undefined {
  if (asset.source === 'free' && asset.imageId.startsWith('free_') && Object.hasOwn(en, asset.imageId)) return asset.imageId as Message;
}

export function localize(root: ParentNode = document) {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n], [data-i18n-aria], [data-i18n-placeholder], [data-i18n-alt]')) {
    const { i18n, i18nAria, i18nPlaceholder, i18nAlt } = node.dataset;
    if (i18n) node.textContent = translate(i18n as Message, values.get(node));
    if (i18nAria) node.setAttribute('aria-label', translate(i18nAria as Message));
    if (i18nPlaceholder) node.setAttribute('placeholder', translate(i18nPlaceholder as Message));
    if (i18nAlt) node.setAttribute('alt', translate(i18nAlt as Message));
  }
}

function pageLanguage() {
  document.documentElement.lang = selected;
  document.title = translate('brand');
  document.querySelector('meta[name="description"]')?.setAttribute('content', translate('description'));
}
pageLanguage();

export function languagePicker(): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'language-picker';
  const globe = document.createElement('span');
  globe.textContent = '🌐';
  globe.setAttribute('aria-hidden', 'true');
  const select = document.createElement('select');
  select.dataset.i18nAria = 'language';
  select.setAttribute('aria-label', translate('language'));
  for (const locale of locales) {
    const option = new Option(languages[locale].name, locale);
    option.lang = locale;
    select.add(option);
  }
  select.value = selected;
  select.onchange = () => {
    if (!isLocale(select.value)) return;
    selected = select.value;
    try { localStorage.setItem(preferenceKey, selected); } catch { /* Keep the choice in this tab. */ }
    pageLanguage();
    localize();
  };
  wrapper.append(globe, select);
  return wrapper;
}
