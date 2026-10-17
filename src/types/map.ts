/** Side length of the square map sheet, in map units. All object coordinates use these units. */
export const SHEET_SIZE = 360;

export type Point = [number, number];
export interface XY {
  x: number;
  y: number;
}

export type SurfaceKind = 'floor' | 'lane' | 'site' | 'cut';

export const SURFACES: Record<SurfaceKind, { name: string; fill: string }> = {
  floor: { name: 'Floor', fill: '#767676' },
  lane: { name: 'Lane', fill: '#939393' },
  site: { name: 'Site', fill: '#9d9d63' },
  cut: { name: 'Cutout', fill: '#ffffff' },
};
export const SURFACE_KINDS = Object.keys(SURFACES) as SurfaceKind[];

export type Tool = 'select' | 'poly' | 'rect' | 'circle' | 'line' | 'curve' | 'label';
export type LabelTone = 'light' | 'dark';
export type Outline = 'none' | 'white' | 'black';

interface ObjectBase {
  id: string;
  hidden?: boolean;
  /** Optional edge treatment; omitted values retain the editor's original default appearance. */
  outline?: Outline;
  /** Vertices in map units. Labels use a single point; rectangles use four corners (TL, TR, BR, BL). */
  pts: Point[];
}

export interface PolygonObject extends ObjectBase {
  type: 'poly';
  kind: SurfaceKind;
}
export interface RectObject extends ObjectBase {
  type: 'rect';
  kind: SurfaceKind;
}
export interface CircleObject extends ObjectBase {
  type: 'circle';
  kind: SurfaceKind;
}
export interface LineObject extends ObjectBase {
  type: 'line' | 'curve';
  kind: SurfaceKind;
}
export interface LabelObject extends ObjectBase {
  type: 'label';
  text: string;
  size: number;
  tone: LabelTone;
}

export type FilledObject = PolygonObject | RectObject | CircleObject;
export type MapObject = FilledObject | LineObject | LabelObject;

/** In-progress drawing, kept outside the document until it is committed. */
export type Draft =
  | { type: 'poly'; pts: Point[] }
  | { type: 'rect'; a: XY; b: XY }
  | { type: 'circle'; center: XY; edge: XY }
  | { type: 'line'; a: XY; b: XY }
  | { type: 'curve'; pts: Point[] };

export const LABEL_LIMITS = { minSize: 4, maxSize: 40, maxText: 40 } as const;
