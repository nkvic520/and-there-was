import { sha256, type ScenePackage, type WorldMode } from '@and-there-was/scene';
export async function interactivePackage(upgrade = false): Promise<ScenePackage> {
  const protocol = { schemaVersion: 2, stateSchema: { type: 'object', properties: { taps: { type: 'integer', minimum: 0, maximum: 100 }, door: { type: 'boolean' }, ...(upgrade ? { color: { type: 'string' } } : {}) }, required: ['taps', 'door', ...(upgrade ? ['color'] : [])], additionalProperties: false }, events: { 'light.tapped': { type: 'object', properties: {}, additionalProperties: false } } };
  const script = `export function migrate(sdk) { const s=sdk.getState(); sdk.setState({taps:s.taps||0,door:!!s.door${upgrade ? ",color:s.color||'#ffc233'" : ''}}); }
export function mount(sdk) { const s=sdk.getState(); sdk.circle('light',.4,.4,.12,${upgrade ? 's.color' : "'#ffc233'"}); sdk.onTap('light','light.tapped',{}); if(s.door) sdk.rect('door',.7,.5,.18,.3,'#7a421f'); }
export function onEvent(sdk,name,payload) { if(name!=='light.tapped')return; const s=sdk.getState(); s.taps=Math.min(100,s.taps+1); if(s.taps>=3)s.door=true; sdk.setState(s); }`;
  const files = { 'protocol.json': JSON.stringify(protocol), 'scene.js': script, 'view.json': '{"coordinates":"normalized","background":"#ffffff"}' }, hashes: Record<string, string> = {};
  for (const [name, source] of Object.entries(files)) hashes[name] = await sha256(source);
  return { formatVersion: 1, sdkVersion: 2, entry: 'scene.js', assets: [], files, hashes };
}
export async function modelReply(upgrade = false, mode?: WorldMode) {
  const pkg = await interactivePackage(upgrade);
  const protocol = JSON.parse(pkg.files['protocol.json']), view = JSON.parse(pkg.files['view.json']);
  if (mode) { protocol.schemaVersion=3; protocol.mode=mode; view.mode=mode; }
  return JSON.stringify({ protocol, script: pkg.files['scene.js'], view });
}
export async function animatedReply() {
  const value=JSON.parse(await modelReply(false,'animated'));
  value.script=`export function migrate(sdk){sdk.setState({taps:0,door:false});}
export function mount(sdk){const s=sdk.getState();
sdk.node({id:'actor',kind:'group',x:.5,y:.55,width:.5,height:.5,motionKey:String(s.taps),motions:[{duration:2,loop:'once',frames:[{at:0,y:0},{at:.4,y:-.12},{at:1,y:0}]}]});
sdk.node({id:'body',parent:'actor',kind:'path',x:0,y:0,width:.3,height:.3,color:'#ed8240',path:[['M',-.5,.5],['Q',-.6,-.4,0,-.5],['Q',.6,-.4,.5,.5],['Z']]});
sdk.node({id:'label',parent:'actor',kind:'text',x:0,y:.04,width:.2,height:.06,text:'狐狸',fontSize:.04,color:'#ffffff'});
sdk.onTap('actor','light.tapped',{});}
export function onEvent(sdk){const s=sdk.getState();s.taps++;sdk.setState(s);}`;
  return JSON.stringify(value);
}
export function streamReply(content: string, finish = 'stop', done = true) {
  return `data: ${JSON.stringify({ id: 'mock-completion', choices: [{ delta: { content }, finish_reason: null }] })}\n\n` +
    `data: ${JSON.stringify({ id: 'mock-completion', choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\n` + (done ? 'data: [DONE]\n\n' : '');
}
export function withImageWorkflow(content:string) {
  const value=JSON.parse(content); value.protocol.schemaVersion=4;
  return JSON.stringify({...value,assetIds:[],assetRequests:[]});
}
