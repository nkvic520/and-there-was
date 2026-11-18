import { Application, Container, Graphics, Text, FillGradient, Rectangle, Circle, Sprite, Texture } from 'pixi.js';
import { canonical, sampleMotion, type DrawOperation, type EventBinding, type WorldMode, type MotionCues, type SceneAsset } from '@and-there-was/scene';

interface Visual { container: Container; body: Container; op: DrawOperation; geometry: string; gradients: FillGradient[]; born: number; retiring?: number; from?: { x:number;y:number;rotation:number;at:number }; fit?: { x?:number; y?:number; scaleX:number; scaleY:number } }
export class Presentation {
  private root = new Container();
  private nodes = new Map<string, Visual>();
  private bindings = new Set<string>();
  private mode: WorldMode = 'animated';
  private time = 0;
  private stopped = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private moving = false;
  private lastStamp = 0;
  private cues: MotionCues = {};
  private textures = new Map<string,Texture>();
  private backgrounds = new Set<string>();
  private responsive = false;
  private spanX = 1000;
  private spanY = 1000;
  setArtwork(textures: Map<string, Texture>, assets: SceneAsset[], responsive: boolean) {
    this.textures = textures;
    this.backgrounds = new Set(assets.filter(asset => asset.role === 'background' && asset.source !== 'upload').map(asset => asset.id));
    this.responsive = responsive;
  }
  constructor(private app: Application, private host: HTMLElement, private tap: (id: string) => void) {
    app.stage.addChild(this.root); app.ticker.maxFPS = 60;
    app.ticker.add(ticker => {
      if (document.hidden) return;
      if (this.mode === 'animated' && !this.stopped && this.moving) this.time += Math.min(ticker.deltaMS, 50);
      this.frame();
    });
    new ResizeObserver(() => this.resize()).observe(host);
  }
  get elapsedMs() { return this.time; }
  get paused() { return this.stopped; }
  get animated() { return this.mode === 'animated' && this.moving; }
  get motionCues() { return this.cues; }
  restore(time: number, paused: boolean, cues: MotionCues = {}) { this.time = time; this.cues = cues; this.stopped = paused || matchMedia('(prefers-reduced-motion: reduce)').matches; this.frame(); }
  pause(value: boolean) { this.stopped = value; this.frame(); }
  set(operations: DrawOperation[], bindings: EventBinding[], mode: WorldMode, initial = false) {
    this.mode = mode; this.bindings = new Set(bindings.map(binding => binding.targetId));
    this.moving = operations.some(op => op.motions?.length);
    const now = performance.now(), present = new Set(operations.map(op => op.id));
    const activeCues: MotionCues = Object.create(null);
    for (const op of operations) {
      if (op.motionKey !== undefined) {
        const saved = this.cues[op.id];
        activeCues[op.id] = saved?.key === op.motionKey ? saved : {key:op.motionKey,startMs:this.time};
      }
      let node = this.nodes.get(op.id);
      if (!node) {
        const container = new Container(), body = new Container(); container.addChild(body);
        node = { container, body, op, geometry:'', gradients:[], born: initial || mode === 'storybook' ? -10000 : now };
        this.nodes.set(op.id, node);
        container.on('pointertap', () => { if (this.bindings.has(op.id)) this.tap(op.id); });
      }
      if (node.op.x !== op.x || node.op.y !== op.y || node.op.rotation !== op.rotation) node.from = { x:node.container.x, y:node.container.y, rotation:node.container.rotation, at:now };
      node.op = op; node.retiring = undefined;
      const { x, y, parent, rotation, alpha, motions, motionKey, enter, ...shape } = op;
      const geometry = canonical(shape) + (op.asset ? `:${this.textures.get(op.asset)?.uid}` : '');
      if (geometry !== node.geometry) { this.paint(node); node.geometry = geometry; }
      node.container.eventMode = this.bindings.has(op.id) ? 'static' : op.kind === 'group' ? 'passive' : 'none';
      node.container.cursor = this.bindings.has(op.id) ? 'pointer' : 'default';
      node.container.hitArea = op.kind === 'circle' ? new Circle(0,0,op.radiusX*1000) : new Rectangle(-op.radiusX*1000,-op.radiusY*1000,op.radiusX*2000,op.radiusY*2000);
    }
    this.cues = activeCues;
    // Reparent by persistent ID, so a rule change does not destroy every object.
    for (const op of operations) (op.parent ? this.nodes.get(op.parent)!.container : this.root).addChild(this.nodes.get(op.id)!.container);
    for (const [id,node] of this.nodes) if (!present.has(id) && !node.retiring) {
      node.container.eventMode = 'none';
      if (mode === 'storybook' || this.stopped) this.remove(id); else node.retiring = now;
    }
    this.host.dataset.operationCount = String(operations.length);
    this.host.dataset.animatedNodes = String(operations.filter(op => op.motions?.length).length);
    this.host.dataset.worldMode = mode;
    this.resize();
  }
  private remove(id: string) {
    const node = this.nodes.get(id); if (!node) return;
    // Active descendants have already been reparented by set().
    if (!node.container.destroyed) node.container.destroy({ children:true });
    node.gradients.forEach(g => g.destroy()); this.nodes.delete(id);
  }
  private paint(node: Visual) {
    node.body.removeChildren().forEach(child => child.destroy({ children:true })); node.gradients.forEach(g => g.destroy()); node.gradients = [];
    const op = node.op, w = op.radiusX*2000, h = op.radiusY*2000;
    if (op.kind === 'group') return;
    if (op.kind === 'sprite') {
      const texture=this.textures.get(op.asset!); if(!texture) throw new Error('素材尚未加载');
      const sprite=new Sprite(texture);sprite.anchor.set(.5);sprite.scale.set(Math.min(w/texture.width,h/texture.height));
      node.body.addChild(sprite);return;
    }
    if (op.kind === 'text') {
      const label = new Text({ text:op.text ?? '', resolution:1, style:{ fontFamily:'system-ui, "Microsoft YaHei", "Yu Gothic", "Malgun Gothic", sans-serif', fontSize:(op.fontSize ?? .035)*1000, fill:op.color, fontWeight:'500', wordWrap:true, wordWrapWidth:w, breakWords:true, align:op.align ?? 'center', lineHeight:(op.fontSize ?? .035)*1450 } });
      label.anchor.set(op.align === 'left' ? 0 : op.align === 'right' ? 1 : .5, .5);
      if (op.align === 'left') label.x = -w/2; else if (op.align === 'right') label.x = w/2;
      node.body.addChild(label); return;
    }
    if (op.shadow) {
      const shadow = new Graphics();
      if (op.kind === 'rect') shadow.roundRect(-w/2+5,-h/2+10,w,h,(op.roundness ?? .015)*1000);
      else shadow.ellipse(5,h*.48,w*.43,Math.max(5,h*.1));
      shadow.fill({color:'#273a54',alpha:.12}); node.body.addChild(shadow);
    }
    const graphic = new Graphics();
    if (op.kind === 'rect') graphic.roundRect(-w/2,-h/2,w,h,Math.min(w/2,h/2,(op.roundness ?? 0)*1000));
    else if (op.kind === 'path') for (const command of op.path!) {
      const n = command.slice(1) as number[];
      if (command[0] === 'M') graphic.moveTo(n[0]*w,n[1]*h);
      else if (command[0] === 'L') graphic.lineTo(n[0]*w,n[1]*h);
      else if (command[0] === 'Q') graphic.quadraticCurveTo(n[0]*w,n[1]*h,n[2]*w,n[3]*h);
      else if (command[0] === 'C') graphic.bezierCurveTo(n[0]*w,n[1]*h,n[2]*w,n[3]*h,n[4]*w,n[5]*h);
      else graphic.closePath();
    } else graphic.ellipse(0,0,w/2,h/2);
    if (op.gradient) {
      const gradient = new FillGradient({type:op.gradient.type, colorStops:[{offset:0,color:op.gradient.from},{offset:1,color:op.gradient.to}], ...(op.gradient.type === 'radial' ? {center:{x:.32,y:.25},outerRadius:.8} : {start:{x:0,y:0},end:{x:.8,y:1}})});
      node.gradients.push(gradient); graphic.fill(gradient);
    } else graphic.fill(op.color);
    if (op.stroke) graphic.stroke({color:op.stroke,width:(op.strokeWidth ?? .002)*1000,join:'round',cap:'round'});
    node.body.addChild(graphic);
  }
  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    if (this.app.screen.width !== width || this.app.screen.height !== height) this.app.renderer.resize(width, height);
    let scale = Math.min(width, height) / 1000;
    this.root.position.set((width - 1000 * scale) / 2, (height - 1000 * scale) / 2);
    this.spanX = this.spanY = 1000;
    for (const node of this.nodes.values()) node.fit = undefined;
    if (this.mode === 'storybook' && this.nodes.size) {
      // Measure the authored page before extending any decorative paper or scenery.
      this.frame(false);
      const bounds = this.root.getLocalBounds(), style = getComputedStyle(this.host);
      const left = parseFloat(style.paddingLeft), top = parseFloat(style.paddingTop);
      const pageWidth = Math.max(1, width - left - parseFloat(style.paddingRight));
      const pageHeight = Math.max(1, height - top - parseFloat(style.paddingBottom));
      scale = Math.min(pageWidth / Math.max(1000, bounds.width), pageHeight / Math.max(1000, bounds.height));
      this.root.position.set(left + pageWidth / 2 - (bounds.x + bounds.width / 2) * scale,
        top + pageHeight / 2 - (bounds.y + bounds.height / 2) * scale);
    } else if (this.responsive) {
      this.spanX = width / scale;
      this.spanY = height / scale;
    }
    this.root.scale.set(scale);
    this.fitScenery(width / scale, height / scale);
    this.frame();
  }
  private fitScenery(width: number, height: number) {
    const centerX = width / 2 - this.root.x / this.root.scale.x;
    const centerY = height / 2 - this.root.y / this.root.scale.y;
    for (const node of this.nodes.values()) {
      const op = node.op;
      if (op.parent || op.rotation) continue;
      const spansWidth = op.x - op.radiusX <= .005 && op.x + op.radiusX >= .995;
      const spansHeight = op.y - op.radiusY <= .005 && op.y + op.radiusY >= .995;
      if (op.kind === 'sprite' && op.asset && this.backgrounds.has(op.asset) && spansWidth && spansHeight) {
        const sprite = node.body.children[0] as Sprite;
        const cover = Math.max(width / sprite.width, height / sprite.height);
        node.fit = { x:centerX, y:centerY, scaleX:cover, scaleY:cover };
        continue;
      }
      // Whole sheets of paper and edge-spanning scenery can extend. Framed panels and character parts retain their shape.
      const scenery = op.kind === 'rect' || (op.kind === 'path' && this.responsive && this.mode === 'animated');
      if (!scenery || op.roundness || op.stroke || op.shadow || !(spansWidth || spansHeight)) continue;
      if (this.mode === 'storybook' && !(spansWidth && spansHeight)) continue;
      node.fit = {
        x: spansWidth ? centerX + (op.x - .5) * width : undefined,
        y: spansHeight ? centerY + (op.y - .5) * height : undefined,
        scaleX: spansWidth ? width / 1000 : 1,
        scaleY: spansHeight ? height / 1000 : 1
      };
    }
  }
  private frame(render = true) {
    const now = performance.now(), enabled = this.mode === 'animated';
    for (const [id,node] of this.nodes) {
      if (node.container.destroyed) { node.gradients.forEach(g => g.destroy()); this.nodes.delete(id); continue; }
      if (node.retiring) { node.container.alpha = Math.max(0,1-(now-node.retiring)/280); if(now-node.retiring >= 280) this.remove(id); continue; }
      const op=node.op, motion=sampleMotion(enabled ? op.motions : undefined, this.time-(this.cues[op.id]?.startMs ?? 0));
      const spanX = op.parent ? 1000 : this.spanX, spanY = op.parent ? 1000 : this.spanY;
      let x = (node.fit?.x ?? (op.parent ? op.x * 1000 : (op.x - .5) * spanX + 500)) + motion.x * spanX;
      let y = (node.fit?.y ?? (op.parent ? op.y * 1000 : (op.y - .5) * spanY + 500)) + motion.y * spanY;
      let rotation = (op.rotation ?? 0) + motion.rotation;
      if(node.from && enabled && !this.stopped) {
        const t=Math.min(1,(now-node.from.at)/320), eased=1-(1-t)**3;
        x=node.from.x+(x-node.from.x)*eased; y=node.from.y+(y-node.from.y)*eased; rotation=node.from.rotation+(rotation-node.from.rotation)*eased;
        if(t===1) node.from=undefined;
      }
      let entry = enabled && !this.stopped ? Math.min(1,(now-node.born)/650) : 1;
      const arrival = 1-(1-entry)**3;
      let scale = 1;
      if(op.enter === 'pop') scale = entry === 1 ? 1 : 1-Math.exp(-7*entry)*Math.cos(10*entry);
      if(op.enter === 'drop') y -= (1-arrival)*180;
      node.container.position.set(x,y); node.container.rotation=rotation;
      node.container.scale.set(motion.scaleX * scale * (node.fit?.scaleX ?? 1), motion.scaleY * scale * (node.fit?.scaleY ?? 1));
      node.container.alpha = op.alpha*motion.alpha*arrival;
    }
    if (!render) return;
    if(now-this.lastStamp > 100) { this.host.dataset.animationTime = String(Math.round(this.time)); this.host.dataset.animationPaused=String(this.stopped); this.lastStamp=now; }
    // A still page is rendered on updates only. Animated scenes use the app ticker.
    if(this.mode === 'storybook') { this.app.stop(); this.app.renderer.render(this.app.stage); } else if(!this.app.ticker.started) this.app.start();
  }
}
