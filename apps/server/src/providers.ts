import { assert } from '@and-there-was/scene';
import { FixtureGenerator } from './generator';
import { DeepSeekGenerator } from './deepseek';
import { SeedreamGenerator } from './seedream';
import { OpenAIScene } from './openai-scene';
import { OpenAIImage } from './openai-image';

export function configuredProviders(env:NodeJS.ProcessEnv = process.env) {
  const mode = env.GENERATOR_MODE?.trim() || 'auto';
  assert(['auto','deepseek','fixture'].includes(mode), 'GENERATOR_MODE must be auto, deepseek or fixture');
  const key = env.OPENAI_API_KEY?.trim();
  if (mode !== 'fixture' && key) return {
    generator:new OpenAIScene({apiKey:key, model:env.OPENAI_TEXT_MODEL || undefined}),
    imageGenerator:new OpenAIImage({apiKey:key, model:env.OPENAI_IMAGE_MODEL || undefined})
  };
  const useDeepSeek = mode === 'deepseek' || (mode === 'auto' && Boolean(env.DEEPSEEK_API_KEY?.trim()));
  return {
    generator:useDeepSeek ? new DeepSeekGenerator({apiKey:env.DEEPSEEK_API_KEY?.trim() ?? '', model:env.DEEPSEEK_MODEL, baseUrl:env.DEEPSEEK_BASE_URL}) : new FixtureGenerator(),
    imageGenerator:new SeedreamGenerator({apiKey:useDeepSeek ? env.SEEDREAM_API_KEY?.trim() ?? '' : '', model:env.SEEDREAM_MODEL, baseUrl:env.SEEDREAM_BASE_URL, size:env.SEEDREAM_SIZE})
  };
}
