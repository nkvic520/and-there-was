export function migrate(sdk) {
  sdk.setState({ball:{id:'ball-1',type:'Ball',x:.5,y:.42,radius:.09,color:'#4385f5'}});
}
export function mount(sdk) {
  const b=sdk.getState().ball;
  const bounce=[{duration:1.8,loop:'repeat',easing:'smooth',frames:[{at:0,y:0,scaleX:1.08,scaleY:.92},{at:.5,y:-.12,scaleX:.96,scaleY:1.04},{at:1,y:0,scaleX:1.08,scaleY:.92}]}];
  sdk.node({id:'shadow',kind:'ellipse',x:b.x,y:b.y+.12,width:.18,height:.03,color:'#b9c6d7',alpha:.3,motions:[{duration:1.8,loop:'repeat',easing:'smooth',frames:[{at:0,scaleX:1,alpha:1},{at:.5,scaleX:.65,alpha:.5},{at:1,scaleX:1,alpha:1}]}]});
  sdk.node({id:b.id,kind:'circle',x:b.x,y:b.y,width:b.radius*2,color:b.color,gradient:{type:'radial',from:'#a7d8ff',to:b.color},stroke:'#3875c8',strokeWidth:.002,enter:'drop',motions:bounce});
  sdk.node({id:'highlight',kind:'ellipse',x:b.x-.026,y:b.y-.03,width:.035,height:.023,color:'#ffffff',alpha:.7,motions:bounce});
}
