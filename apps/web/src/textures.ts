import { Texture } from 'pixi.js';
import { hashBytes, validateAssets, type ScenePackage } from '@and-there-was/scene';

// Image bytes never enter QuickJS. Only the host can fetch, verify and decode them.
export class Textures {
  private cache = new Map<string, Promise<Texture>>();
  private active = new Set<string>();
  private candidate = new Set<string>();
  async prepare(pkg: ScenePackage): Promise<Map<string, Texture>> {
    validateAssets(pkg.assets);
    this.candidate = new Set(pkg.assets.map(a => a.hash));
    const result = new Map<string, Texture>();
    for (const asset of pkg.assets) {
      let pending = this.cache.get(asset.hash);
      if (!pending) {
        pending = this.load(asset.hash, asset.width, asset.height);
        this.cache.set(asset.hash, pending);
        void pending.catch(() => { if(this.cache.get(asset.hash) === pending) this.cache.delete(asset.hash); });
      }
      const texture=await pending;
      if(texture.width!==asset.width || texture.height!==asset.height) throw new Error('素材尺寸不一致');
      result.set(asset.id, texture);
    }
    this.trim(); return result;
  }
  activate(pkg?: ScenePackage) { this.active = new Set(pkg?.assets.map(a => a.hash) ?? []); this.trim(); }
  private trim() {
    // Let outgoing sprites finish their short fade before destroying old textures.
    setTimeout(() => {
      for (const [hash,texture] of this.cache) if (!this.active.has(hash) && !this.candidate.has(hash)) {
        this.cache.delete(hash); void texture.then(t => t.destroy(true)).catch(() => {});
      }
    }, 800);
  }
  private async load(hash: string, width: number, height: number) {
    const response = await fetch(`/api/images/${hash}`, {cache:'no-store'});
    if (!response.ok || !response.body) throw new Error('素材暂时无法读取');
    const parts: Uint8Array[] = []; let total = 0;
    const reader = response.body.getReader();
    try {
      while(true) { const {done,value} = await reader.read(); if(done) break; total+=value.length; if(total>20*1024*1024) throw new Error('素材文件过大'); parts.push(value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = new Uint8Array(total); let offset=0;
    for (const part of parts) { bytes.set(part,offset); offset+=part.length; }
    if(hashBytes(bytes)!==hash) throw new Error('素材哈希不一致');
    const url = URL.createObjectURL(new Blob([bytes], {type:'image/png'}));
    try {
      const image = new Image(); image.src=url; await image.decode();
      if(image.naturalWidth!==width || image.naturalHeight!==height) throw new Error('素材尺寸不一致');
      return Texture.from(image);
    } finally { URL.revokeObjectURL(url); }
  }
}
