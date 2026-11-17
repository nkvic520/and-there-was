import { addCalendarMonths, canonical, type InteractionReceipt, type ScenePackage, type TrialOutput, type WorldSnapshot } from '@and-there-was/scene';
import { runIsolated } from './runtime';

export const clientId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
interface Intent { id: string; targetId: string; packageHash: string; expiresAt: string; receipt?: InteractionReceipt }
interface Host {
  worldId: string;
  snapshot(): WorldSnapshot;
  load(hash: string): Promise<ScenePackage>;
  api<T>(path: string, body?: unknown): Promise<T>;
  accept(snapshot: WorldSnapshot): Promise<void>;
  preview(snapshot: WorldSnapshot, count: number): void;
  status(message: string): void;
}
export class InteractionQueue {
  private items: Intent[];
  private key: string;
  private syncing?: Promise<void>;
  private previewSerial = 0;
  constructor(private host: Host) {
    this.key = `interactions:${host.worldId}`;
    try { this.items = JSON.parse(localStorage.getItem(this.key) ?? '[]'); } catch { this.items = []; }
    this.items = this.items.filter(item => item.expiresAt > new Date().toISOString()).slice(0, 100);
    this.save();
  }
  get pending() { return this.items.length; }
  private save() { if (this.items.length) localStorage.setItem(this.key, JSON.stringify(this.items)); else localStorage.removeItem(this.key); }
  enqueue(targetId: string) {
    const snapshot = this.host.snapshot();
    if (!snapshot.packageHash || this.items.length >= 100) { this.host.status('先等这些触碰保存好，再继续玩。'); return; }
    this.items.push({ id: clientId(), targetId, packageHash: snapshot.packageHash, expiresAt: addCalendarMonths(new Date(), 3).toISOString() });
    this.save(); void this.preview(); void this.flush().catch(() => this.host.status('触碰已记在本机，连上后会继续保存。'));
  }
  private async execute(snapshot: WorldSnapshot, targetId: string): Promise<TrialOutput> {
    const binding = snapshot.bindings?.find(value => value.targetId === targetId);
    if (!binding || !snapshot.packageHash) throw new Error('这个物体已经变化，请再试一次。');
    const pkg = await this.host.load(snapshot.packageHash);
    const output = await runIsolated(pkg, snapshot.state, snapshot.packageHash, { event: { name: binding.event, payload: binding.payload } });
    const restored = await runIsolated(pkg, output.state, snapshot.packageHash);
    if (canonical(restored.state) !== canonical(output.state) || canonical(restored.operations) !== canonical(output.operations) || canonical(restored.bindings ?? []) !== canonical(output.bindings ?? [])) throw new Error('互动后的场景无法恢复');
    return output;
  }
  async preview() {
    const serial = ++this.previewSerial, items = this.items.slice();
    let snapshot = this.host.snapshot();
    for (const item of items) {
      if (item.packageHash !== snapshot.packageHash) break;
      try {
        const output = await this.execute(snapshot, item.targetId);
        snapshot = { ...snapshot, state: output.state, operations: output.operations, bindings: output.bindings };
      } catch { break; }
      if (serial !== this.previewSerial) return;
    }
    if (serial === this.previewSerial) this.host.preview(snapshot, items.length);
  }
  flush(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.sync().finally(() => { this.syncing = undefined; });
    return this.syncing;
  }
  private async sync() {
    while (this.items.length) {
      const item = this.items[0];
      if (!item.receipt) {
        const baseline = await this.host.api<WorldSnapshot>(`/api/worlds/${this.host.worldId}`);
        if (baseline.packageHash !== item.packageHash) {
          this.items.shift(); this.save(); await this.host.accept(baseline); await this.preview();
          this.host.status('世界已经更新，旧物体上的触碰没有应用到新世界。'); continue;
        }
        const receipt: InteractionReceipt = { clientEventId: item.id, versionId: baseline.versionId, revision: baseline.revision, targetId: item.targetId };
        try { receipt.output = await this.execute(baseline, item.targetId); }
        catch (error) { receipt.error = error instanceof Error ? error.message : String(error); }
        item.receipt = receipt; this.save();
      }
      let result: WorldSnapshot | { failed: true };
      try { result = await this.host.api(`/api/worlds/${this.host.worldId}/interactions`, item.receipt); }
      catch (error) {
        if (error instanceof Error && error.message === 'Stale interaction baseline') { delete item.receipt; this.save(); continue; }
        throw error;
      }
      this.items.shift(); this.save(); ++this.previewSerial;
      if ('failed' in result) this.host.status('这次触碰没有生效，原来的场景还在。');
      else await this.host.accept(result);
      await this.preview();
    }
  }
}
