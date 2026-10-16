import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';
import { BackgroundImage, EditorOverlay, GridLines, SheetShapes } from '../features/drawing/CanvasNodes';
import { useCanvasInteractions } from '../features/drawing/useCanvasInteractions';
import { handleDroppedFile } from '../features/projects/projectIO';
import { loadImage } from '../lib/image';
import { findShape, useEditorStore } from '../stores/editorStore';
import { SHEET_SIZE } from '../types/map';
import { Toast } from './Toast';

function useBackgroundImage(dataUrl: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setImage(null);
      return;
    }
    let alive = true;
    loadImage(dataUrl).then(
      (img) => alive && setImage(img),
      () => alive && setImage(null),
    );
    return () => {
      alive = false;
    };
  }, [dataUrl]);
  return image;
}

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const [fontTick, setFontTick] = useState(0);

  const { doc, selectedId, tool, kind, grid, gridSize, view, viewport, draft, cursor, rawCursor } = useEditorStore(
    useShallow((s) => ({
      doc: s.doc,
      selectedId: s.selectedId,
      tool: s.tool,
      kind: s.kind,
      grid: s.grid,
      gridSize: s.gridSize,
      view: s.view,
      viewport: s.viewport,
      draft: s.draft,
      cursor: s.cursor,
      rawCursor: s.rawCursor,
    })),
  );
  const setViewport = useEditorStore((s) => s.setViewport);
  const bgImage = useBackgroundImage(doc.background?.dataUrl);

  useCanvasInteractions(hostRef);

  // Track the available space. Object coordinates are in map units, so resizing never moves them.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setViewport(host.clientWidth, host.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [setViewport]);

  // Labels are measured with the UI font; measure again once it has loaded.
  useEffect(() => {
    document.fonts?.load('600 12px "IBM Plex Sans"').then(() => setFontTick((t) => t + 1)).catch(() => {});
  }, []);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDropping(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    void handleDroppedFile(e.dataTransfer.files[0]);
  };

  const selected = findShape(doc.shapes, selectedId);
  const { scale } = view;

  return (
    <div
      ref={hostRef}
      role="application"
      className={`stage${dropping ? ' drop' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      aria-label="Map sheet, 360 by 360 units"
    >
      {viewport.w > 0 && (
        <Stage width={viewport.w} height={viewport.h} x={view.x} y={view.y} scaleX={scale} scaleY={scale} listening={false}>
          {/* Sheet backdrop with drop shadow */}
          <Layer listening={false}>
            <Rect
              width={SHEET_SIZE}
              height={SHEET_SIZE}
              fill="#ffffff"
              shadowColor="#000000"
              shadowOpacity={0.25}
              shadowBlur={18 / scale}
              shadowOffsetY={5 / scale}
            />
          </Layer>
          {/* Map content, clipped to the sheet like the exported PNG */}
          <Layer listening={false} clipX={0} clipY={0} clipWidth={SHEET_SIZE} clipHeight={SHEET_SIZE}>
            <BackgroundImage image={bgImage} background={doc.background} />
            {grid && <GridLines gridSize={gridSize} scale={scale} />}
            <SheetShapes shapes={doc.shapes} fontTick={fontTick} />
          </Layer>
          <Layer listening={false}>
            <EditorOverlay
              selected={selected}
              draft={draft}
              cursor={cursor}
              rawCursor={rawCursor}
              crosshair={tool !== 'select'}
              kind={kind}
              scale={scale}
            />
          </Layer>
        </Stage>
      )}
      <Toast />
    </div>
  );
}
