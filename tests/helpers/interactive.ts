import { sha256, type ScenePackage } from '@and-there-was/scene';
export async function interactivePackage(upgrade = false): Promise<ScenePackage> {
  const protocol = { schemaVersion: 2, stateSchema: { type: 'object', properties: { taps: { type: 'integer', minimum: 0, maximum: 100 }, door: { type: 'boolean' }, ...(upgrade ? { color: { type: 'string' } } : {}) }, required: ['taps', 'door', ...(upgrade ? ['color'] : [])], additionalProperties: false }, events: { 'light.tapped': { type: 'object', properties: {}, additionalProperties: false } } };
  const script = `export function migrate(sdk) { const s=sdk.getState(); sdk.setState({taps:s.taps||0,door:!!s.door${upgrade ? ",color:s.color||'#ffc233'" : ''}}); }
export function mount(sdk) { const s=sdk.getState(); sdk.circle('light',.4,.4,.12,${upgrade ? 's.color' : "'#ffc233'"}); sdk.onTap('light','light.tapped',{}); if(s.door) sdk.rect('door',.7,.5,.18,.3,'#7a421f'); }
export function onEvent(sdk,name,payload) { if(name!=='light.tapped')return; const s=sdk.getState(); s.taps=Math.min(100,s.taps+1); if(s.taps>=3)s.door=true; sdk.setState(s); }`;
  const files = { 'protocol.json': JSON.stringify(protocol), 'scene.js': script, 'view.json': '{"coordinates":"normalized","background":"#ffffff"}' }, hashes: Record<string, string> = {};
  for (const [name, source] of Object.entries(files)) hashes[name] = await sha256(source);
  return { formatVersion: 1, sdkVersion: 2, entry: 'scene.js', assets: [], files, hashes };
}
export async function modelReply(upgrade = false) {
  const pkg = await interactivePackage(upgrade);
  return JSON.stringify({ protocol: JSON.parse(pkg.files['protocol.json']), script: pkg.files['scene.js'], view: JSON.parse(pkg.files['view.json']) });
}
export function streamReply(content: string, finish = 'stop', done = true) {
  return `data: ${JSON.stringify({ id: 'mock-completion', choices: [{ delta: { content }, finish_reason: null }] })}\n\n` +
    `data: ${JSON.stringify({ id: 'mock-completion', choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\n` + (done ? 'data: [DONE]\n\n' : '');
}
