export type WorldMode = 'animated' | 'storybook';
export type MotionCues = Record<string, { key: string; startMs: number }>;
export interface MotionFrame { at: number; x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number; alpha?: number }
export interface Motion { duration: number; loop: 'repeat' | 'pingpong' | 'once'; frames: MotionFrame[]; easing?: 'linear' | 'smooth'; phase?: number }
export interface Pose { x: number; y: number; scaleX: number; scaleY: number; rotation: number; alpha: number }
export const restingPose = (): Pose => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 });
// A pure timeline: the same saved time and tracks always produce the same frame.
export function sampleMotion(tracks: Motion[] | undefined, elapsedMs: number): Pose {
  const result = restingPose();
  for (const track of tracks ?? []) {
    const cycles = Math.max(0, elapsedMs / 1000 + (track.phase ?? 0)) / track.duration;
    let position = track.loop === 'once' ? Math.min(1, cycles) : track.loop === 'pingpong' ? 1 - Math.abs(cycles % 2 - 1) : cycles % 1;
    const upper = track.frames.findIndex(frame => frame.at >= position);
    const b = track.frames[upper < 0 ? track.frames.length - 1 : upper], a = track.frames[Math.max(0, upper - 1)];
    position = b.at === a.at ? 1 : (position - a.at) / (b.at - a.at);
    if (track.easing === 'smooth') position = position * position * (3 - 2 * position);
    const base = restingPose();
    for (const key of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'alpha'] as const) {
      const value = (a[key] ?? base[key]) + ((b[key] ?? base[key]) - (a[key] ?? base[key])) * position;
      if (key === 'scaleX' || key === 'scaleY' || key === 'alpha') result[key] *= value; else result[key] += value;
    }
  }
  return result;
}
