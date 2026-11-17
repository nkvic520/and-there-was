import { Application, Container, Graphics, Text, FillGradient, Rectangle, Circle } from 'pixi.js';
import { canonical, sampleMotion, type DrawOperation, type EventBinding, type WorldMode, type MotionCues } from '@and-there-was/scene';

interface Visual { container: Container; body: Container; op: DrawOperation; geometry: string; gradients: FillGradient[]; born: number; retiring?: number; from?: { x:number;y:number;rotation:number;at:number } }
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
      const geometry = canonical(shape);
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
    if (op.kind === 'text') {
      const label = new Text({ text:op.text ?? '', resolution:1, style:{ fontFamily:'"Microsoft YaHei", "Segoe UI", sans-serif', fontSize:(op.fontSize ?? .035)*1000, fill:op.color, fontWeight:'500', wordWrap:true, wordWrapWidth:w, breakWords:true, align:op.align ?? 'center', lineHeight:(op.fontSize ?? .035)*1450 } });
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
    const width=this.host.clientWidth,height=this.host.clientHeight;
    if(this.mode === 'storybook' && this.nodes.size) {
      // A book fits the whole illustration, including strokes and captions near its edges.
      this.frame();
      const bounds=this.root.getLocalBounds(), scale=Math.min(width/Math.max(1000,bounds.width),height/Math.max(1000,bounds.height))*.96;
      this.root.scale.set(scale);this.root.position.set(width/2-(bounds.x+bounds.width/2)*scale,height/2-(bounds.y+bounds.height/2)*scale);
    } else {
      const size=Math.min(width,height);this.root.scale.set(size/1000);this.root.position.set((width-size)/2,(height-size)/2);
    }
    this.frame();
  }
  private frame() {
    const now = performance.now(), enabled = this.mode === 'animated';
    for (const [id,node] of this.nodes) {
      if (node.container.destroyed) { node.gradients.forEach(g => g.destroy()); this.nodes.delete(id); continue; }
      if (node.retiring) { node.container.alpha = Math.max(0,1-(now-node.retiring)/280); if(now-node.retiring >= 280) this.remove(id); continue; }
      const op=node.op, motion=sampleMotion(enabled ? op.motions : undefined, this.time-(this.cues[op.id]?.startMs ?? 0));
      let x=(op.x+motion.x)*1000, y=(op.y+motion.y)*1000, rotation=(op.rotation ?? 0)+motion.rotation;
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
      node.container.scale.set(motion.scaleX*scale,motion.scaleY*scale);
      node.container.alpha = op.alpha*motion.alpha*arrival;
    }
    if(now-this.lastStamp > 100) { this.host.dataset.animationTime = String(Math.round(this.time)); this.host.dataset.animationPaused=String(this.stopped); this.lastStamp=now; }
    // A still page is rendered on updates only. Animated scenes use the app ticker.
    if(this.mode === 'storybook') { this.app.stop(); this.app.renderer.render(this.app.stage); } else if(!this.app.ticker.started) this.app.start();
  }
}
