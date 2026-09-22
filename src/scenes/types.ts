export type Ease = 'linear' | 'in' | 'out' | 'inOut';

/** heading in degrees: 0 = up (north), 90 = right (east), clockwise. */
export interface Pose { x: number; y: number; heading: number }
export interface Keyframe extends Pose { t: number; ease?: Ease; turning?: boolean }

export type ActorKind = 'car' | 'bus' | 'ambulance' | 'truck' | 'bike' | 'pedestrian';
export interface ActorDef { id: string; kind: ActorKind; color?: string; you?: boolean; start: Pose }

export interface Lane { id: string; x: number; y: number; w: number; h: number; heading: number | 'any' }
export interface Zone { id: string; x: number; y: number; w: number; h: number }
/** A vehicle travelling in `heading` must keep its front on the near side of (x, y). */
export interface StopLine { id: string; x: number; y: number; heading: number }
export interface StateSet { t: number; id: string; state: string }

export type Expectation =
  | { type: 'stopsBehind'; actor: string; line: string; from: number; to: number }
  | { type: 'entersAfter'; actor: string; other: string; zone: string };

export interface StepDef {
  id: string;
  duration: number;
  /** Poses that replace the carried-over poses at the start of this step. */
  at?: Record<string, Pose>;
  tracks?: Record<string, Keyframe[]>;
  states?: StateSet[];
  expect?: Expectation[];
}

export interface SceneDef {
  id: string;
  width: number;
  height: number;
  background: string;
  lanes: Lane[];
  zones: Zone[];
  lines: StopLine[];
  props: string[];
  actors: ActorDef[];
  initialStates?: Record<string, string>;
  steps: StepDef[];
}

export type FramePose = Pose & { turning: boolean };
export interface Frame { poses: Record<string, FramePose>; states: Record<string, string> }
