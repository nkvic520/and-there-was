import { createApp } from './app';
const { app } = await createApp({ dataDir: process.env.DATA_DIR ?? './data', logger: true });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
