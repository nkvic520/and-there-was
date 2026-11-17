import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { record, type TrialResult, type InteractionReceipt, type WorldMode, type MotionCues, type ArtSelection, type ImageRole, type SceneAsset } from '@and-there-was/scene';
import { Store, HttpError } from './store';
import { WorldService } from './service';
import type { Generator } from './generator';
import { Images } from './images';
import type { ImageGenerator } from './seedream';

export async function createApp(options: { dataDir: string; generator?: Generator; imageGenerator?: ImageGenerator; logger?: boolean; staticDir?: string; trialTimeoutMs?: number; generationTimeoutMs?: number }) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 512 * 1024, forceCloseConnections: true });
  const store = new Store(options.dataDir), images = new Images(store, options.imageGenerator);
  try { await images.initialize(); } catch (error) { store.close(); throw error; }
  const service = new WorldService(store, options.generator, options.trialTimeoutMs, options.generationTimeoutMs, images);
  const streams = new Set<() => void>();
  const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
  if (process.env.PUBLIC_ORIGIN) allowedOrigins.add(new URL(process.env.PUBLIC_ORIGIN).origin);
  if (process.env.CODESPACE_NAME) allowedOrigins.add(`https://${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'}`);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST' && request.headers.origin) {
      const origin = new URL(request.headers.origin);
      if (origin.host !== request.headers.host && !allowedOrigins.has(origin.origin)) throw new HttpError(403, 'Cross-origin mutation rejected');
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = record(error) && typeof error.statusCode === 'number' ? error.statusCode : 500;
    reply.code(status).send({ error: error instanceof Error ? error.message : 'Internal error' });
  });
  app.get('/api/health', async () => ({ status: 'ok', mode: service.generatorId.startsWith('deepseek/') ? 'deepseek' : 'fixture', generator: service.generatorId, imageGenerator: images.generator.id, imagesConfigured: images.generator.configured, version: '0.4.0', archiveRetentionMonths: store.retentionMonths }));
  app.get<{Params:{id:string}}>('/api/worlds/:id/images', async request => images.list(request.params.id));
  app.post<{Params:{id:string};Body:{name:string;role:ImageRole;dataBase64:string}}>('/api/worlds/:id/images', {
    bodyLimit:12*1024*1024,
    schema:{body:{type:'object',additionalProperties:false,required:['name','role','dataBase64'],properties:{name:{type:'string',minLength:1,maxLength:120},role:{type:'string',enum:['character','background','illustration']},dataBase64:{type:'string',maxLength:12*1024*1024,pattern:'^[A-Za-z0-9+/]+={0,2}$'}}}}
  }, async (request,reply) => {
    store.world(request.params.id);
    try { const asset = await images.add(Buffer.from(request.body.dataBase64,'base64'),{name:request.body.name,role:request.body.role,source:'upload',credit:'孩子上传的作品'},request.params.id); return reply.code(201).send(asset); }
    catch(error){throw new HttpError(400,error instanceof Error?error.message:'图片无法读取');}
  });
  app.get<{Params:{hash:string}}>('/api/images/:hash',async(request,reply)=>{
    const row=store.db.prepare("SELECT 1 FROM images WHERE json_extract(metadata,'$.hash')=?").get(request.params.hash);
    if(!row)throw new HttpError(404,'Image not found');
    return reply.type('image/png').send(store.readBytes(request.params.hash));
  });
  app.get<{Params:{id:string}}>('/api/images/:id/original',async(request,reply)=>{
    const row=store.db.prepare('SELECT metadata FROM images WHERE id=?').get(request.params.id) as {metadata:string}|undefined;
    if(!row)throw new HttpError(404,'Image not found');
    const asset=JSON.parse(row.metadata) as SceneAsset;
    const media=store.db.prepare('SELECT media_type FROM artifacts WHERE hash=?').get(asset.originalHash) as {media_type:string};
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[media.media_type]??'image';
    return reply.type('application/octet-stream').header('Content-Disposition',`attachment; filename="${asset.imageId}.${extension}"`).send(store.readBytes(asset.originalHash));
  });
  app.post<{ Body: { mode?: WorldMode } }>('/api/worlds', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { mode: { type: 'string', enum: ['animated','storybook'] } } } }
  }, async (request, reply) => reply.code(201).send(store.createWorld(request.body?.mode)));
  app.get<{ Params: { id: string } }>('/api/worlds/:id/playback', async request => store.playback(request.params.id));
  app.post<{ Params: { id: string }; Body: { versionId: string; elapsedMs: number; paused: boolean; cues?:MotionCues } }>('/api/worlds/:id/playback', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['versionId','elapsedMs','paused'], properties: { versionId: { type:'string' }, elapsedMs: { type:'number',minimum:0,maximum:315360000000 }, paused: { type:'boolean' }, cues:{type:'object',maxProperties:64,additionalProperties:{type:'object',additionalProperties:false,required:['key','startMs'],properties:{key:{type:'string',maxLength:80},startMs:{type:'number',minimum:0,maximum:315360000000}}}} } } }
  }, async request => store.savePlayback(request.params.id, request.body.versionId, request.body.elapsedMs, request.body.paused,request.body.cues));
  app.get<{ Params: { id: string } }>('/api/worlds/:id', async request => store.world(request.params.id));
  app.get<{ Params: { id: string } }>('/api/worlds/:id/records', async request => service.records(request.params.id));
  app.get<{ Params: { id: string } }>('/api/worlds/:id/activity', async request => {
    store.world(request.params.id);
    return {
      turns: store.db.prepare('SELECT id,status FROM turns WHERE world_id=? ORDER BY seq DESC LIMIT 200').all(request.params.id),
      attempts: store.db.prepare('SELECT a.id,a.status FROM attempts a JOIN turns t ON a.turn_id=t.id WHERE t.world_id=? ORDER BY a.seq DESC LIMIT 200').all(request.params.id)
    };
  });
  app.post<{ Params: { id: string }; Body: { text: string; clientSubmissionId: string } & ArtSelection }>('/api/worlds/:id/turns', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['text', 'clientSubmissionId'], properties: { text: { type: 'string', minLength: 1, maxLength: 2000 }, clientSubmissionId: { type: 'string', minLength: 8, maxLength: 100 }, artSource:{type:'string',enum:['library','seedream']},assetIds:{type:'array',maxItems:16,uniqueItems:true,items:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'}},allowUploadReferences:{type:'boolean'} } } }
  }, async (request, reply) => { const {text,clientSubmissionId,...selection}=request.body; return reply.code(202).send(service.submit(request.params.id,clientSubmissionId,text,selection)); });
  app.post<{ Params: { id: string } }>('/api/turns/:id/retry', async request => service.retry(request.params.id));
  app.post<{ Params: { id: string }; Body: InteractionReceipt }>('/api/worlds/:id/interactions', async request => {
    const body = request.body;
    if (!record(body) || typeof body.clientEventId !== 'string' || typeof body.versionId !== 'string' || typeof body.targetId !== 'string' || !Number.isInteger(body.revision) || (body.error !== undefined && typeof body.error !== 'string')) throw new HttpError(400, 'Invalid interaction receipt');
    return service.interact(request.params.id, body);
  });
  app.get<{ Params: { id: string } }>('/api/attempts/:id/candidate', async request => service.candidate(request.params.id));
  app.post<{ Body: TrialResult }>('/api/trials', async request => {
    const body = request.body;
    if (!record(body) || typeof body.attemptId !== 'string' || typeof body.packageHash !== 'string' || typeof body.baseVersionId !== 'string' || !Number.isInteger(body.baseRevision) || typeof body.ok !== 'boolean' || (body.error !== undefined && typeof body.error !== 'string')) throw new HttpError(400, 'Invalid trial receipt');
    return service.trial(body);
  });
  app.get<{ Params: { hash: string } }>('/api/artifacts/:hash', async (request, reply) => reply.type('text/plain; charset=utf-8').send(store.read(request.params.hash)));
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/worlds/:id/events', async (request, reply) => {
    store.world(request.params.id);
    let cursor = Number(request.headers['last-event-id'] ?? request.query.after ?? 0);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'Invalid event cursor');
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    reply.raw.write(': connected\n\n');
    let stopped = false;
    const send = () => {
      if (stopped) return;
      for (const event of store.events(request.params.id, cursor)) {
        reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
        cursor = event.id;
      }
    };
    const timer = setInterval(send, 150), heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000);
    const stop = () => { if (stopped) return; stopped = true; clearInterval(timer); clearInterval(heartbeat); streams.delete(stop); reply.raw.end(); };
    streams.add(stop);
    request.raw.on('close', stop);
    send();
  });
  const staticDir = options.staticDir ?? resolve('apps/web/dist');
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir, index: false, cacheControl: false });
    app.get('/', (_request, reply) => reply.sendFile('index.html'));
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/assets/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  app.addHook('preClose', async () => { for (const stop of streams) stop(); });
  app.addHook('onClose', async () => { service.close(); store.close(); });
  return { app, service, store, images };
}
