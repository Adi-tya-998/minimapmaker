import { useEffect } from 'react';
import type { RefObject } from 'react';
import { hitTest, hitVertex, moveRectCorner, nearestEdge, rectPts, snapValue, HIT_PX } from '../../lib/geometry';
import { createId } from '../../lib/id';
import { findShape, mapShape, useEditorStore } from '../../stores/editorStore';
import type { Point, XY } from '../../types/map';

type Drag =
  | { mode: 'pan'; x: number; y: number }
  | { mode: 'move'; id: string; start: XY; orig: Point[] }
  | { mode: 'vertex'; id: string; index: number };

/**
 * Pointer interactions for the map sheet: drawing, selecting, moving, vertex editing, panning and zooming.
 * Listeners are native (not Konva events) so pointer capture works and handlers always read fresh store state.
 * Coordinates are converted to map units through the current view transform, so objects never depend on window size.
 */
export function useCanvasInteractions(hostRef: RefObject<HTMLDivElement>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const st = useEditorStore.getState;
    let drag: Drag | null = null;

    const baseCursor = () => (st().tool === 'select' ? 'default' : 'crosshair');
    host.style.cursor = baseCursor();

    const toUnits = (e: { clientX: number; clientY: number }): XY => {
      const r = host.getBoundingClientRect();
      const { view } = st();
      return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale };
    };
    const snapOpts = () => {
      const s = st();
      return { snap: s.snap, alt: s.altKey, gridSize: s.gridSize };
    };
    const snapPoint = (p: XY): XY => {
      const o = snapOpts();
      return { x: snapValue(p.x, o), y: snapValue(p.y, o) };
    };

    const onPointerDown = (e: PointerEvent) => {
      // Pan: middle button, or left button while Space is held.
      if (e.button === 1 || (e.button === 0 && st().spaceHeld)) {
        e.preventDefault();
        host.setPointerCapture(e.pointerId);
        drag = { mode: 'pan', x: e.clientX, y: e.clientY };
        host.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;
      host.setPointerCapture(e.pointerId);
      const s = st();
      s.setAlt(e.altKey);
      const p = toUnits(e);
      const sp = snapPoint(p);
      s.setCursor(sp, p);

      if (s.tool === 'select') {
        const sel = findShape(s.doc.shapes, s.selectedId);
        if (sel && !sel.hidden && sel.type !== 'label') {
          const vi = hitVertex(sel, p, s.view.scale);
          if (vi >= 0) {
            if (e.shiftKey && sel.type !== 'rect' && sel.pts.length > 3) {
              s.act((doc) => mapShape(doc, sel.id, (o) => ({ ...o, pts: o.pts.filter((_, i) => i !== vi) })));
              return;
            }
            s.checkpoint();
            drag = { mode: 'vertex', id: sel.id, index: vi };
            return;
          }
        }
        const hit = hitTest(s.doc.shapes, p, s.view.scale);
        if (hit) {
          s.select(hit.id);
          s.checkpoint();
          drag = { mode: 'move', id: hit.id, start: p, orig: hit.pts.map((q) => [q[0], q[1]] as Point) };
        } else {
          s.select(null);
        }
      } else if (s.tool === 'rect') {
        s.setDraft({ type: 'rect', a: sp, b: sp });
      } else if (s.tool === 'line') {
        s.setDraft({ type: 'line', a: sp, b: sp });
      } else if (s.tool === 'curve') {
        s.setDraft({ type: 'curve', pts: [[sp.x, sp.y]] });
      } else if (s.tool === 'poly') {
        const d = s.draft;
        if (!d || d.type !== 'poly') {
          s.setDraft({ type: 'poly', pts: [[sp.x, sp.y]] });
          return;
        }
        const first = d.pts[0];
        const last = d.pts[d.pts.length - 1];
        const nearFirst = d.pts.length >= 3 && Math.hypot(p.x - first[0], p.y - first[1]) * s.view.scale <= HIT_PX;
        const same = Math.abs(sp.x - last[0]) < 1e-6 && Math.abs(sp.y - last[1]) < 1e-6;
        if (nearFirst || (same && d.pts.length >= 3)) {
          s.finishPolygon();
          return;
        }
        if (!same) s.setDraft({ type: 'poly', pts: [...d.pts, [sp.x, sp.y]] });
      } else if (s.tool === 'label') {
        s.addShape({ id: createId(), type: 'label', pts: [[sp.x, sp.y]], text: 'Label', size: 12, tone: 'light' });
        s.setTool('select');
        // Wait for the properties panel to render the new label's text field, then focus it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const input = document.getElementById('label-text') as HTMLInputElement | null;
            input?.focus();
            input?.select();
          }),
        );
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag?.mode === 'pan') {
        st().panBy(e.clientX - drag.x, e.clientY - drag.y);
        drag = { mode: 'pan', x: e.clientX, y: e.clientY };
        return;
      }
      const s = st();
      s.setAlt(e.altKey);
      const p = toUnits(e);
      const sp = snapPoint(p);
      s.setCursor(sp, p);

      if (drag?.mode === 'move') {
        const d = drag;
        const f = d.orig[0];
        const rx = p.x - d.start.x;
        const ry = p.y - d.start.y;
        const o = snapOpts();
        const dx = o.snap && !o.alt ? snapValue(f[0] + rx, o) - f[0] : Math.round(rx * 10) / 10;
        const dy = o.snap && !o.alt ? snapValue(f[1] + ry, o) - f[1] : Math.round(ry * 10) / 10;
        s.liveEdit((doc) => mapShape(doc, d.id, (sh) => ({ ...sh, pts: d.orig.map((q) => [q[0] + dx, q[1] + dy] as Point) })));
      } else if (drag?.mode === 'vertex') {
        const d = drag;
        s.liveEdit((doc) =>
          mapShape(doc, d.id, (sh) => {
            if (sh.type === 'rect') return { ...sh, pts: moveRectCorner(sh.pts, d.index, sp) };
            return { ...sh, pts: sh.pts.map((q, i) => (i === d.index ? ([sp.x, sp.y] as Point) : q)) };
          }),
        );
      } else if (s.draft?.type === 'rect') {
        s.setDraft({ type: 'rect', a: s.draft.a, b: sp });
      } else if (s.draft?.type === 'line') {
        s.setDraft({ type: 'line', a: s.draft.a, b: sp });
      } else if (s.draft?.type === 'curve') {
        const last = s.draft.pts[s.draft.pts.length - 1];
        if (Math.hypot(sp.x - last[0], sp.y - last[1]) * s.view.scale >= 3) {
          s.setDraft({ type: 'curve', pts: [...s.draft.pts, [sp.x, sp.y]] });
        }
      }

      if (s.tool === 'select' && !drag) {
        const sel = findShape(s.doc.shapes, s.selectedId);
        const overHandle = !!sel && sel.type !== 'label' && hitVertex(sel, p, s.view.scale) >= 0;
        host.style.cursor = overHandle ? 'pointer' : hitTest(s.doc.shapes, p, s.view.scale) ? 'move' : 'default';
      }
    };

    const endDrag = () => {
      const s = st();
      if (s.draft?.type === 'rect') {
        const { a, b } = s.draft;
        s.setDraft(null);
        if (Math.abs(b.x - a.x) >= 1 && Math.abs(b.y - a.y) >= 1) {
          s.addShape({ id: createId(), type: 'rect', kind: s.kind, pts: rectPts(a.x, a.y, b.x, b.y) });
        }
      }
      if (s.draft?.type === 'line') {
        const { a, b } = s.draft;
        s.setDraft(null);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) {
          s.addShape({ id: createId(), type: 'line', kind: s.kind, pts: [[a.x, a.y], [b.x, b.y]] });
        }
      }
      if (s.draft?.type === 'curve') {
        const pts = s.draft.pts;
        s.setDraft(null);
        if (pts.length >= 2) s.addShape({ id: createId(), type: 'curve', kind: s.kind, pts });
      }
      if (drag) {
        const wasPan = drag.mode === 'pan';
        drag = null;
        if (wasPan) host.style.cursor = baseCursor();
        else s.commit();
      }
    };

    const onPointerLeave = () => {
      if (!drag) st().setCursor(null, null);
    };

    const onDoubleClick = (e: MouseEvent) => {
      const s = st();
      if (s.tool !== 'select') return;
      const sel = findShape(s.doc.shapes, s.selectedId);
      if (!sel || sel.type !== 'poly') return; // rectangles keep exactly four corners
      const best = nearestEdge(sel.pts, toUnits(e));
      if (best && best.d * s.view.scale <= HIT_PX) {
        const at = snapPoint({ x: best.x, y: best.y });
        s.act((doc) =>
          mapShape(doc, sel.id, (o) => {
            const pts = o.pts.slice();
            pts.splice(best.i + 1, 0, [at.x, at.y]);
            return { ...o, pts };
          }),
        );
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = host.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      st().zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);
    host.addEventListener('pointerleave', onPointerLeave);
    host.addEventListener('dblclick', onDoubleClick);
    host.addEventListener('wheel', onWheel, { passive: false });
    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool && !drag) host.style.cursor = baseCursor();
    });

    return () => {
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endDrag);
      host.removeEventListener('pointercancel', endDrag);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('dblclick', onDoubleClick);
      host.removeEventListener('wheel', onWheel);
      unsubscribe();
    };
  }, [hostRef]);
}
