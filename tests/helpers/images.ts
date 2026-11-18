import type { AssetRequest, WorldMode } from '@and-there-was/scene';
export function imageReply(mode:WorldMode='animated',assetIds=['free_rabbit'],assetRequests:AssetRequest[]=[]) {
  const alias=assetIds[0]??assetRequests[0]?.id;
  return JSON.stringify({storyLocale:'zh-CN',protocol:{schemaVersion:4,mode,stateSchema:{type:'object',properties:{taps:{type:'integer',minimum:0}},required:['taps'],additionalProperties:false},events:mode==='animated'?{tap:{type:'object',properties:{},additionalProperties:false}}:{}},
    script:`export function migrate(sdk){const s=sdk.getState();sdk.setState({taps:s.taps||0});}
export function mount(sdk){const s=sdk.getState();sdk.node({id:'actor',kind:'sprite',asset:${JSON.stringify(alias)},x:.5,y:.5,width:.55,height:.55${mode==='animated'?",motionKey:String(s.taps),motions:[{duration:2,loop:'pingpong',frames:[{at:0,y:-.02},{at:1,y:.02}]}]":""}});${mode==='animated'?"sdk.onTap('actor','tap',{});":"sdk.node({id:'caption',kind:'text',x:.5,y:.88,width:.8,height:.1,text:'我的小世界',fontSize:.04,color:'#303030'});"}}
export function onEvent(sdk){const s=sdk.getState();s.taps++;sdk.setState(s);}`,
    view:{coordinates:'normalized',background:'#fcfaf5',mode},assetIds,assetRequests});
}
