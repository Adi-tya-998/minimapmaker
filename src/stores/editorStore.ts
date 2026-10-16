import { create } from 'zustand';
import { fitTransform, clamp } from '../lib/geometry';
import { createId } from '../lib/id';
import { loadTheme } from '../lib/storage';
import type { ThemeMode } from '../lib/storage';
import { SHEET_SIZE } from '../types/map';
import type { Draft, LabelObject, MapObject, Point, SurfaceKind, Tool, XY } from '../types/map';
import type { Background, MapContent, MapDocument } from '../types/project';
import { emptyDocument } from '../features/projects/sampleProject';

const HISTORY_LIMIT = 150;
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 24;

export interface ViewState {
  /** Screen pixels per map unit. */
  scale: number;
  /** Screen-space offset of the sheet origin. */
  x: number;
  y: number;
}

export interface Viewport {
  w: number;
  h: number;
}

type LabelPatch = Partial<Pick<LabelObject, 'text' | 'size' | 'tone'>>;

export interface EditorState {
  /** 'loading' until the autosave has been restored; autosave is paused while loading. */
  status: 'loading' | 'ready';

  // --- persistent document (saved, exported, tracked by undo/redo) ---
  doc: MapDocument;

  // --- transient UI state (never saved) ---
  selectedId: string | null;
  tool: Tool;
  kind: SurfaceKind;
  grid: boolean;
  snap: boolean;
  gridSize: number;
  altKey: boolean;
  spaceHeld: boolean;
  draft: Draft | null;
  cursor: XY | null;
  rawCursor: XY | null;
  view: ViewState;
  viewport: Viewport;
  autoFit: boolean;
  theme: ThemeMode;
  toast: { id: number; message: string } | null;

  // --- history ---
  past: MapContent[];
  future: MapContent[];
  pending: MapContent | null;

  // --- actions ---
  hydrate: (doc: MapDocument) => void;
  showToast: (message: string) => void;
  clearToast: (id: number) => void;
  setTheme: (t: ThemeMode) => void;

  setTool: (t: Tool) => void;
  setKind: (k: SurfaceKind) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setGridSize: (n: number) => void;
  setAlt: (alt: boolean) => void;
  setSpaceHeld: (held: boolean) => void;
  setCursor: (snapped: XY | null, raw: XY | null) => void;
  setDraft: (d: Draft | null) => void;
  select: (id: string | null) => void;

  setViewport: (w: number, h: number) => void;
  fitView: () => void;
  zoomAt: (factor: number, cx?: number, cy?: number) => void;
  panBy: (dx: number, dy: number) => void;

  checkpoint: () => void;
  commit: () => void;
  /** Apply a document change as a single undoable step. */
  act: (fn: (doc: MapDocument) => MapDocument) => void;
  /** Apply a change without recording history; call checkpoint() before and commit() after. */
  liveEdit: (fn: (doc: MapDocument) => MapDocument) => void;
  undo: () => void;
  redo: () => void;

  setName: (name: string) => void;
  newProject: () => void;
  openDocument: (doc: MapDocument) => void;
  addShape: (shape: MapObject) => void;
  finishPolygon: () => void;
  removeSelected: () => void;
  reorderSelected: (dir: 1 | -1) => void;
  duplicateSelected: () => void;
  nudgeSelected: (dx: number, dy: number) => void;
  toggleHidden: (id: string) => void;
  patchLabel: (id: string, patch: LabelPatch) => void;
  setBackground: (bg: Background | null) => void;
  patchBackground: (patch: Partial<Background>) => void;
}

// ---------- helpers ----------

export const findShape = (shapes: MapObject[], id: string | null): MapObject | null =>
  id === null ? null : (shapes.find((s) => s.id === id) ?? null);

/** Replace one shape, leaving every other shape (and its identity) untouched. */
export function mapShape(doc: MapDocument, id: string, fn: (s: MapObject) => MapObject): MapDocument {
  return { ...doc, shapes: doc.shapes.map((s) => (s.id === id ? fn(s) : s)) };
}

const snapshot = (doc: MapDocument): MapContent => ({ shapes: doc.shapes, background: doc.background });

// Shapes are never mutated in place, so a snapshot only needs to keep references.
function sameContent(a: MapContent, b: MapContent): boolean {
  if (a.background !== b.background) return false;
  return a.shapes === b.shapes || JSON.stringify(a.shapes) === JSON.stringify(b.shapes);
}

const initialView = fitTransform(600, 600);

export const useEditorStore = create<EditorState>()((set, get) => ({
  status: 'loading',
  doc: emptyDocument(),

  selectedId: null,
  tool: 'select',
  kind: 'floor',
  grid: true,
  snap: true,
  gridSize: 5,
  altKey: false,
  spaceHeld: false,
  draft: null,
  cursor: null,
  rawCursor: null,
  view: initialView,
  viewport: { w: 0, h: 0 },
  autoFit: true,
  theme: loadTheme(),
  toast: null,

  past: [],
  future: [],
  pending: null,

  hydrate: (doc) => set({ doc, status: 'ready', past: [], future: [], pending: null, selectedId: null, draft: null }),
  showToast: (message) => set({ toast: { id: Date.now() + Math.random(), message } }),
  clearToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : {})),
  setTheme: (theme) => set({ theme }),

  setTool: (tool) => set({ tool, draft: null }),
  setKind: (kind) => {
    const s = get();
    const sel = findShape(s.doc.shapes, s.selectedId);
    set({ kind });
    if (sel && sel.type !== 'label' && s.tool === 'select') {
      s.act((doc) => mapShape(doc, sel.id, (o) => (o.type === 'label' ? o : { ...o, kind })));
    }
  },
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setGridSize: (gridSize) => set({ gridSize }),
  setAlt: (altKey) => {
    if (get().altKey !== altKey) set({ altKey });
  },
  setSpaceHeld: (spaceHeld) => {
    if (get().spaceHeld !== spaceHeld) set({ spaceHeld });
  },
  setCursor: (cursor, rawCursor) => set({ cursor, rawCursor }),
  setDraft: (draft) => set({ draft }),
  select: (selectedId) => set({ selectedId }),

  setViewport: (w, h) => {
    const s = get();
    if (s.viewport.w === w && s.viewport.h === h) return;
    set({ viewport: { w, h }, ...(s.autoFit ? { view: fitTransform(w, h) } : {}) });
  },
  fitView: () => {
    const { viewport } = get();
    set({ view: fitTransform(viewport.w, viewport.h), autoFit: true });
  },
  zoomAt: (factor, cx, cy) => {
    const { view, viewport } = get();
    const px = cx ?? viewport.w / 2;
    const py = cy ?? viewport.h / 2;
    const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    if (scale === view.scale) return;
    // Keep the map point under (px, py) fixed on screen.
    const ux = (px - view.x) / view.scale;
    const uy = (py - view.y) / view.scale;
    set({ view: { scale, x: px - ux * scale, y: py - uy * scale }, autoFit: false });
  },
  panBy: (dx, dy) => set((s) => ({ view: { ...s.view, x: s.view.x + dx, y: s.view.y + dy }, autoFit: false })),

  checkpoint: () => {
    const s = get();
    if (s.pending === null) set({ pending: snapshot(s.doc) });
  },
  commit: () => {
    const s = get();
    if (s.pending === null) return;
    const changed = !sameContent(s.pending, snapshot(s.doc));
    set({
      pending: null,
      ...(changed ? { past: [...s.past, s.pending].slice(-HISTORY_LIMIT), future: [] } : {}),
    });
  },
  act: (fn) => {
    get().checkpoint();
    set((s) => ({ doc: fn(s.doc) }));
    get().commit();
  },
  liveEdit: (fn) => set((s) => ({ doc: fn(s.doc) })),
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({
      past: s.past.slice(0, -1),
      future: [...s.future, snapshot(s.doc)],
      // History restores shapes and background only; the project name is not part of undo.
      doc: { ...s.doc, ...prev },
      pending: null,
      selectedId: findShape(prev.shapes, s.selectedId) ? s.selectedId : null,
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[s.future.length - 1];
    if (!next) return;
    set({
      future: s.future.slice(0, -1),
      past: [...s.past, snapshot(s.doc)].slice(-HISTORY_LIMIT),
      doc: { ...s.doc, ...next },
      pending: null,
      selectedId: findShape(next.shapes, s.selectedId) ? s.selectedId : null,
    });
  },

  setName: (name) => set((s) => ({ doc: { ...s.doc, name: name.slice(0, 60) } })),
  newProject: () => {
    get().act((doc) => ({ ...doc, name: 'Untitled map', shapes: [], background: null }));
    set({ selectedId: null, draft: null });
    get().showToast('Sheet cleared. Press Ctrl+Z or the undo button to bring it back.');
  },
  openDocument: (next) => {
    get().act((doc) => ({ ...doc, name: next.name, shapes: next.shapes, background: next.background }));
    set({ selectedId: null, draft: null });
  },
  addShape: (shape) => {
    get().act((doc) => ({ ...doc, shapes: [...doc.shapes, shape] }));
    set({ selectedId: shape.id });
  },
  finishPolygon: () => {
    const { draft, kind } = get();
    set({ draft: null });
    if (draft?.type === 'poly' && draft.pts.length >= 3) {
      get().addShape({ id: createId(), type: 'poly', kind, pts: draft.pts });
    }
  },
  removeSelected: () => {
    const id = get().selectedId;
    if (id === null) return;
    get().act((doc) => ({ ...doc, shapes: doc.shapes.filter((s) => s.id !== id) }));
    set({ selectedId: null });
  },
  reorderSelected: (dir) => {
    const s = get();
    const i = s.doc.shapes.findIndex((o) => o.id === s.selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.doc.shapes.length) return;
    s.act((doc) => {
      const shapes = doc.shapes.slice();
      [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
      return { ...doc, shapes };
    });
  },
  duplicateSelected: () => {
    const s = get();
    const sel = findShape(s.doc.shapes, s.selectedId);
    if (!sel) return;
    const pts = sel.pts.map(([x, y]) => [Math.min(SHEET_SIZE, x + 6), Math.min(SHEET_SIZE, y + 6)] as Point);
    s.addShape({ ...sel, id: createId(), pts });
  },
  nudgeSelected: (dx, dy) => {
    const id = get().selectedId;
    if (id === null) return;
    get().act((doc) =>
      mapShape(doc, id, (o) => ({ ...o, pts: o.pts.map(([x, y]) => [x + dx, y + dy] as Point) })),
    );
  },
  toggleHidden: (id) => {
    get().act((doc) => mapShape(doc, id, (o) => ({ ...o, hidden: o.hidden ? undefined : true })));
  },
  /** Live edit for property fields; the field wraps it in checkpoint()/commit() so typing is one undo step. */
  patchLabel: (id, patch) => {
    get().liveEdit((doc) => mapShape(doc, id, (o) => (o.type === 'label' ? { ...o, ...patch } : o)));
  },
  setBackground: (bg) => get().act((doc) => ({ ...doc, background: bg })),
  patchBackground: (patch) => {
    get().liveEdit((doc) => (doc.background ? { ...doc, background: { ...doc.background, ...patch } } : doc));
  },
}));
