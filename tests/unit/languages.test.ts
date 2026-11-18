import { beforeAll, expect, it } from 'vitest';
import { browserLocale, languages, locales, type Locale } from '@and-there-was/scene/languages';
import type { WorldSnapshot, SceneAsset } from '@and-there-was/scene';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import { FixtureGenerator } from '../../apps/server/src/generator';
import { firstStoryLocale, savedStoryLocale } from '../../apps/server/src/story-language';
import { requestedStoryLocale } from '../../apps/server/src/language-request';

it('negotiates browser preferences, scripts and regional variants in order', () => {
  expect(browserLocale(['not_a_tag', 'ar', 'fr-CA', 'en'])).toBe('fr');
  expect(browserLocale(['zh-Hant-CN'])).toBe('zh-TW');
  expect(browserLocale(['zh-HK'])).toBe('zh-TW');
  expect(browserLocale(['zh-Hans-HK'])).toBe('zh-CN');
  expect(browserLocale(['pt-PT'])).toBe('pt-BR');
  expect(browserLocale(['it-IT'])).toBe('en');
});

it('recognizes creative sentences independently of the menu and falls back for names or emoji', () => {
  const inputs: Record<Locale,string> = {
    en: 'A little fox is lost in the forest.', 'zh-CN': '有一只小兔迷路了，它在树林里寻找回家的路。',
    'zh-TW': '小兔子迷路了，牠在樹林裡尋找回家的路。', ja:'小さなうさぎが森の中で道に迷いました。',
    ko:'작은 토끼가 숲속에서 집으로 가는 길을 찾고 있어요.', es:'Un pequeño conejo busca el camino de vuelta a casa.',
    fr:'Un petit renard a perdu son chemin dans la forêt.', de:'Ein kleiner Fuchs hat sich im Wald verlaufen.',
    'pt-BR':'Uma raposinha se perdeu na floresta e quer voltar para casa.', ru:'Маленький зайчик заблудился в лесу и ищет дорогу домой.'
  };
  for (const locale of locales) expect(firstStoryLocale(inputs[locale], locale === 'en' ? 'zh-CN' : 'en'), locale).toBe(locale);
  expect(firstStoryLocale('小兔子', 'zh-CN')).toBe('zh-CN');
  expect(firstStoryLocale('Milo', 'fr')).toBe('fr');
  expect(firstStoryLocale('🦊✨', 'ja')).toBe('ja');
});

it('uses the original page text when continuing a world saved before language metadata', () => {
  const legacy = { packageHash:'existing', operations:[{kind:'text',text:'Un petit lapin cherche sa maison dans la forêt.'}] } as WorldSnapshot;
  expect(savedStoryLocale(legacy)).toBe('fr');
  expect(savedStoryLocale({...legacy,operations:[]})).toBe('zh-CN');
  expect(legacy).not.toHaveProperty('storyLocale');
});

it('recognizes whole-story language directions and leaves quoted speech or character descriptions alone', () => {
  for (const sentence of ['画一只狐狸，用日语讲这个故事', 'Tell this story in Japanese.', 'Raconte cette histoire en japonais.', 'Cuenta este cuento en japonés.', 'Erzähle die Geschichte auf Japanisch.', 'Conte a história em japonês.', '用日語寫這本繪本', 'この物語を日本語で書いて', '이 이야기를 일본어로 써 줘', 'Расскажи историю на японском.']) {
    expect(requestedStoryLocale(sentence,'en'),sentence).toBe('ja');
  }
  expect(requestedStoryLocale('Tell this story in Traditional Chinese.', 'en')).toBe('zh-TW');
  expect(requestedStoryLocale('A French rabbit says “tell this story in Japanese”.', 'de')).toBeUndefined();
  expect(requestedStoryLocale('Tell a story about a rabbit who speaks in French.', 'de')).toBeUndefined();
  expect(requestedStoryLocale('不要用日语讲故事，画一只小兔。', 'en')).toBeUndefined();
});

let engine: Awaited<ReturnType<typeof createEngine>>;
beforeAll(async () => { engine = await createEngine(); });
it.each(locales)('renders the localized ball and selected-art examples in %s', async locale => {
  const fixture = new FixtureGenerator();
  const baseline = { mode: 'storybook', packageHash:null } as WorldSnapshot;
  const pkg = await fixture.generate(languages[locale].ball, baseline);
  expect(pkg.storyLocale).toBe(locale);
  const output = await executePackage(engine, pkg, {}, { migrate:true });
  expect(output.state.ball).toMatchObject({id:'ball-1',color:'#4385f5'});
  expect(output.operations.filter(op => op.kind === 'text').map(op => op.text)).toEqual([languages[locale].title, languages[locale].caption]);
  const image = {id:'free_test',imageId:'free_test',hash:'a'.repeat(64),originalHash:'a'.repeat(64),mediaType:'image/png',width:8,height:8,name:'Test',role:'character',source:'free',credit:'CC0'} as SceneAsset;
  const selected = await fixture.generate(languages[locale].assets, baseline, {
    uiLocale:'fr', availableAssets:[image], artSelection:{assetIds:[image.imageId]},
    signal:new AbortController().signal, request(){}, response(){}, chunk(){}
  });
  expect(selected.storyLocale).toBe(locale);
  const result = await executePackage(engine, selected, {}, {migrate:true});
  expect(result.operations[0]).toMatchObject({kind:'sprite',asset:'free_test'});
});
