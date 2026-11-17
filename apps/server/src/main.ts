import { createApp } from './app';
import { configuredGenerator } from './deepseek';
if (process.env.ARCHIVE_RETENTION_MONTHS && process.env.ARCHIVE_RETENTION_MONTHS !== '3') throw new Error('ARCHIVE_RETENTION_MONTHS must be 3');
const { app } = await createApp({ dataDir: process.env.DATA_DIR ?? './data', logger: true, generator: configuredGenerator() });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
