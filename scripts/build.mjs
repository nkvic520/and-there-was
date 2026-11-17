import { build as bundle } from 'esbuild';
import { build as webBuild } from 'vite';
await webBuild({ configFile: 'apps/web/vite.config.ts' });
await bundle({ entryPoints: ['apps/server/src/main.ts'], outfile: 'apps/server/dist/main.js', bundle: true, platform: 'node', format: 'esm', target: 'node24', sourcemap: true, external: ['fastify', '@fastify/static', 'better-sqlite3', 'ajv'] });
