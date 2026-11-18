export function migrate(sdk) {
  sdk.setState({ball:{id:'ball-1',type:'Ball',x:.5,y:.42,radius:.09,color:'#4385f5'}});
}
export function mount(sdk) {
  const b=sdk.getState().ball;
  sdk.node({id:'page',kind:'rect',x:.5,y:.5,width:.88,height:.9,color:'#fffdf6',roundness:.025,stroke:'#e6ddc9',strokeWidth:.002,shadow:true});
  sdk.node({id:'window',kind:'rect',x:.5,y:.44,width:.75,height:.56,color:'#e9f3f1',roundness:.018,gradient:{type:'linear',from:'#e3f1f0',to:'#f7f1d8'}});
  sdk.node({id:'hill',kind:'path',x:.5,y:.65,width:.75,height:.15,color:'#b8d4be',path:[['M',-.5,.5],['L',-.5,0],['Q',0,-.8,.5,0],['L',.5,.5],['Z']]});
  sdk.node({id:'shadow',kind:'ellipse',x:.5,y:.56,width:.22,height:.035,color:'#91b3a0',alpha:.25});
  sdk.node({id:b.id,kind:'circle',x:.5,y:.45,width:.21,color:b.color,gradient:{type:'radial',from:'#afdfff',to:b.color},stroke:'#376aab',strokeWidth:.003});
  sdk.node({id:'highlight',kind:'ellipse',x:.467,y:.412,width:.04,height:.026,color:'#ffffff',alpha:.75});
  sdk.node({id:'title',kind:'text',x:.5,y:.115,width:.75,height:.08,text:story.title,fontSize:.043,color:'#3c5260'});
  sdk.node({id:'caption',kind:'text',x:.5,y:.81,width:.68,height:.12,text:story.caption,fontSize:.029,color:'#6a776c'});
}
