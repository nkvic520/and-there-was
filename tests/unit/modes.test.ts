import { beforeAll, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createEngine, executePackage } from '@and-there-was/scene/sandbox';
import { sampleMotion, sha256, validateOperations, validateWorldMode, type WorldSnapshot, type WorldMode, type Motion } from '@and-there-was/scene';
import { FixtureGenerator } from '../../apps/server/src/generator';
import { createApp } from '../../apps/server/src/app';
let engine: Awaited<ReturnType<typeof createEngine>>;
beforeAll(async () => { engine=await createEngine(); });
async function fixture(mode: WorldMode) { return new FixtureGenerator().generate('有一个球',{mode} as WorldSnapshot); }
it('produces genuinely animated and static illustrated packages with deterministic restore', async () => {
  for (const mode of ['animated','storybook'] as const) {
    const pkg=await fixture(mode), output=await executePackage(engine,pkg,{}, {migrate:true});
    const again=await executePackage(engine,pkg,output.state);
    expect(again.operations).toEqual(output.operations); expect(again.state).toEqual(output.state);
    expect(output.operations.some(op => op.motions?.length)).toBe(mode === 'animated');
    expect(output.operations.some(op => op.kind === 'text')).toBe(mode === 'storybook');
    validateWorldMode(JSON.parse(pkg.files['protocol.json']),mode);
    expect(() => validateWorldMode(JSON.parse(pkg.files['protocol.json']),mode === 'animated' ? 'storybook' : 'animated')).toThrow('world mode');
  }
});
it('samples saved animation time deterministically with repeat, reverse and one-shot motion', () => {
  const m: Motion={duration:2,loop:'repeat',frames:[{at:0,x:0,scaleY:1},{at:1,x:.2,scaleY:2}]};
  expect(sampleMotion([m],1000)).toMatchObject({x:.1,scaleY:1.5});
  expect(sampleMotion([m],3000)).toEqual(sampleMotion([m],1000));
  expect(sampleMotion([{...m,loop:'pingpong'}],3000)).toEqual(sampleMotion([m],1000));
  expect(sampleMotion([{...m,loop:'once'}],10000)).toMatchObject({x:.2,scaleY:2});
});
it('rejects unbounded tracks, cyclic groups, scripts in path fields and moving storybooks', async () => {
  const pkg=await fixture('animated'), output=await executePackage(engine,pkg,{}, {migrate:true});
  const bad=structuredClone(output.operations); bad[0].motions![0].duration=0;
  expect(() => validateOperations(bad,3)).toThrow('motion');
  const group={kind:'group' as const,id:'g',x:0,y:0,radiusX:.1,radiusY:.1,color:'#ffffff',alpha:1,parent:'g'};
  expect(() => validateOperations([group],3)).toThrow('hierarchy');
  expect(() => validateOperations([{...group,kind:'path',parent:undefined,path:[['M',0,0],['eval','alert(1)']]}],3)).toThrow('path command');
  expect(() => validateOperations([{...group,kind:'text',parent:undefined,text:'字'.repeat(240),fontSize:.15,radiusX:.001}],3)).toThrow('too many lines');
  const protocol=JSON.parse(pkg.files['protocol.json']); protocol.mode='storybook'; pkg.files['protocol.json']=JSON.stringify(protocol);
  pkg.files['view.json']=JSON.stringify({mode:'storybook',coordinates:'normalized',background:'#ffffff'});
  for(const name of ['protocol.json','view.json']) pkg.hashes[name]=await sha256(pkg.files[name]);
  await expect(executePackage(engine,pkg,{}, {migrate:true})).rejects.toThrow('must be static');
});
it('persists mode and playback separately from semantic versions, rejects stale checkpoints and restores after restart', async () => {
  const dir=mkdtempSync(join(tmpdir(),'and-there-was-modes-'));
  let instance=await createApp({dataDir:dir});
  try {
    const world=instance.store.createWorld('animated');
    expect((await instance.app.inject({method:'POST',url:'/api/worlds',payload:{mode:'unknown'}})).statusCode).toBe(400);
    const turn=instance.service.submit(world.worldId,'mode-submission','有一个球');
    for(let i=0;i<100 && instance.store.turn(turn.id).status !== 'trial';i++) await new Promise(r=>setTimeout(r,10));
    const c=instance.service.candidate(instance.store.turn(turn.id).attempt_id!);
    const output=await executePackage(engine,c.package,c.baseline.state,{migrate:true});
    const saved=await instance.service.trial({attemptId:c.attemptId,packageHash:c.packageHash,baseVersionId:c.baseVersionId,baseRevision:c.baseRevision,ok:true,output}) as WorldSnapshot;
    expect(saved.mode).toBe('animated');
    expect(() => instance.store.savePlayback(world.worldId,saved.versionId,1000,false,{ghost:{key:'1',startMs:0}})).toThrow('does not match');
    instance.store.savePlayback(world.worldId,saved.versionId,4321,true);
    expect(instance.store.savePlayback(world.worldId,saved.versionId,1000,false)).toMatchObject({elapsedMs:4321,paused:true});
    expect(() => instance.store.savePlayback(world.worldId,world.versionId,5000,false)).toThrow('Stale');
    expect(instance.service.records(world.worldId).versions).toHaveLength(2);
    await instance.app.close(); instance=await createApp({dataDir:dir});
    expect(instance.store.world(world.worldId)).toEqual(saved);
    expect(instance.store.playback(world.worldId)).toMatchObject({elapsedMs:4321,paused:true});
    const book=instance.store.createWorld('storybook');
    expect(() => instance.store.savePlayback(book.worldId,book.versionId,1,false)).toThrow('no animation');
  } finally {
    await instance.app.close();
    if(!resolve(dir).startsWith(resolve(tmpdir())+'/and-there-was-modes-') && !resolve(dir).startsWith(resolve(tmpdir())+'\\and-there-was-modes-')) throw new Error('Unsafe test directory');
    rmSync(dir,{recursive:true,force:true});
  }
});
