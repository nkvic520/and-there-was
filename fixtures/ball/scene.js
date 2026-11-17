// This module is generated-fixture source. It runs only inside QuickJS.
export function mount(sdk) {
  const state = sdk.getState();
  if (!state.ball) {
    state.ball = { id: 'ball-1', type: 'Ball', x: 0.5, y: 0.42, radius: 0.09, color: '#4385f5' };
  }
  sdk.setState(state);
  const b = state.ball;
  sdk.ellipse('shadow', b.x, b.y + b.radius * 1.4, b.radius * 0.85, b.radius * 0.16, '#c7d3e6', 0.32);
  sdk.circle(b.id, b.x, b.y, b.radius, b.color);
  sdk.circle('highlight', b.x - b.radius * 0.3, b.y - b.radius * 0.33, b.radius * 0.22, '#ffffff', 0.75);
}
