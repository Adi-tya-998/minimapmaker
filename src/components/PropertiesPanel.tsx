import { useRef } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Trash2 } from 'lucide-react';
import { importBackgroundImage } from '../features/projects/projectIO';
import { sizeOf } from '../lib/geometry';
import { findShape, useEditorStore } from '../stores/editorStore';
import { LABEL_LIMITS, SURFACES, SURFACE_KINDS } from '../types/map';

export function PropertiesPanel() {
  const kind = useEditorStore((s) => s.kind);
  const shapes = useEditorStore((s) => s.doc.shapes);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedEdgeIndex = useEditorStore((s) => s.selectedEdgeIndex);
  const background = useEditorStore((s) => s.doc.background);
  const st = useEditorStore.getState;
  const setKind = useEditorStore((s) => s.setKind);
  const imageInput = useRef<HTMLInputElement>(null);

  const sel = findShape(shapes, selectedId);

  // Typing in a field or dragging a slider is one undo step: checkpoint when it starts, commit when it ends.
  const textHistory = { onFocus: () => st().checkpoint(), onBlur: () => st().commit() };
  const sliderHistory = {
    onPointerDown: () => st().checkpoint(),
    onKeyDown: () => st().checkpoint(),
    onPointerUp: () => st().commit(),
    onKeyUp: () => st().commit(),
    onBlur: () => st().commit(),
  };
  const setTone = (id: string, tone: 'light' | 'dark') => {
    st().checkpoint();
    st().patchLabel(id, { tone });
    st().commit();
  };

  return (
    <>
      <section className="sec">
        <h2>Surface</h2>
        <div className="kinds">
          {SURFACE_KINDS.map((k) => (
            <button key={k} type="button" className="kind" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <span className="chip" style={{ background: SURFACES[k].fill }} />
              {SURFACES[k].name}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Sets the surface for new shapes and the selected shape.
        </p>
      </section>

      <section className="sec">
        <h2>Selection</h2>
        {!sel ? (
          <p className="muted">Nothing selected. Click a shape on the sheet or in the layer list.</p>
        ) : (
          <div>
            {sel.type === 'label' && (
              <>
                <div className="field">
                  <label htmlFor="label-text">Label text</label>
                  <input
                    id="label-text"
                    type="text"
                    maxLength={LABEL_LIMITS.maxText}
                    autoComplete="off"
                    value={sel.text}
                    {...textHistory}
                    onChange={(e) => st().patchLabel(sel.id, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="label-size">
                    Size <span className="mono">{sel.size} u</span>
                  </label>
                  <input
                    id="label-size"
                    type="range"
                    min={LABEL_LIMITS.minSize}
                    max={LABEL_LIMITS.maxSize}
                    step={1}
                    value={sel.size}
                    {...sliderHistory}
                    onChange={(e) => st().patchLabel(sel.id, { size: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <span className="lbl">Text color</span>
                  <div className="row">
                    {(['light', 'dark'] as const).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        className="btn"
                        aria-pressed={sel.tone === tone}
                        onClick={() => setTone(sel.id, tone)}
                      >
                        {tone === 'light' ? 'Light' : 'Dark'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {sel.type !== 'label' && (() => {
              const edgeCount = sel.type === 'circle' || sel.type === 'line' || sel.type === 'curve' ? 1 : sel.pts.length;
              const edgeLabel = sel.type === 'circle' ? 'Circle edge' : sel.type === 'line' || sel.type === 'curve' ? 'Boundary line' : `Side ${selectedEdgeIndex === null ? '' : selectedEdgeIndex + 1}`;
              const defaultOutline = sel.type === 'line' || sel.type === 'curve' ? 'white' : 'none';
              const currentOutline = selectedEdgeIndex === null
                ? (sel.outline ?? defaultOutline)
                : (sel.edgeOutlines?.[selectedEdgeIndex] ?? sel.outline ?? defaultOutline);
              return <>
                <div className="field">
                  <span className="lbl">Select a side</span>
                  <div className="row" role="group" aria-label="Select shape side">
                    {Array.from({ length: edgeCount }, (_, i) => (
                      <button key={i} type="button" className="btn" aria-pressed={selectedEdgeIndex === i} onClick={() => st().selectEdge(selectedEdgeIndex === i ? null : i)}>
                        {sel.type === 'circle' ? 'Circle edge' : sel.type === 'line' || sel.type === 'curve' ? 'Boundary line' : `Side ${i + 1}`}
                      </button>
                    ))}
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>Click a side on the map or choose it here.</p>
                </div>
                <div className="field">
                  <span className="lbl">{selectedEdgeIndex === null ? 'Outline for all sides' : `${edgeLabel} outline`}</span>
                  <div className="row" role="group" aria-label={selectedEdgeIndex === null ? 'Shape outline' : 'Selected side outline'}>
                {(['none', 'white', 'black'] as const).map((outline) => (
                  <button
                    key={outline}
                    type="button"
                    className="btn"
                    aria-pressed={currentOutline === outline}
                    onClick={() => selectedEdgeIndex === null ? st().setSelectedOutline(outline) : st().setSelectedEdgeOutline(outline)}
                  >
                    {outline === 'none' ? 'Clear' : outline === 'white' ? 'White' : 'Black'}
                  </button>
                ))}
                  </div>
                </div>
              </>;
            })()}
            {sel.type === 'label' && <div className="field">
              <span className="lbl">Text outline</span>
              <div className="row" role="group" aria-label="Text outline">
                {(['none', 'white', 'black'] as const).map((outline) => (
                  <button key={outline} type="button" className="btn" aria-pressed={(sel.outline ?? (sel.tone === 'dark' ? 'white' : 'black')) === outline} onClick={() => st().setSelectedOutline(outline)}>
                    {outline === 'none' ? 'Clear' : outline === 'white' ? 'White' : 'Black'}
                  </button>
                ))}
              </div>
            </div>}
            <p className="mono" style={{ margin: '0 0 10px' }}>
              {sel.type === 'label' ? 'Text box ' : `${sel.pts.length} points · `}
              {sizeOf(sel).w.toFixed(1)} × {sizeOf(sel).h.toFixed(1)} units
            </p>
            <div className="row">
              <button type="button" className="btn" title="Bring forward (])" onClick={() => st().reorderSelected(1)}>
                <ArrowUp /> Forward
              </button>
              <button type="button" className="btn" title="Send back ([)" onClick={() => st().reorderSelected(-1)}>
                <ArrowDown /> Back
              </button>
              <button type="button" className="btn" title="Duplicate (Ctrl+D)" onClick={() => st().duplicateSelected()}>
                <Copy /> Duplicate
              </button>
              <button type="button" className="btn danger" title="Delete (Del)" onClick={() => st().removeSelected()}>
                <Trash2 /> Delete
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="sec">
        <h2>Background</h2>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importBackgroundImage(file);
          }}
        />
        {!background ? (
          <>
            <button type="button" className="btn" onClick={() => imageInput.current?.click()}>
              <ImagePlus /> Import image
            </button>
            <p className="muted" style={{ marginTop: 8 }}>
              Use a reference image to trace. It is stored locally and fitted inside the sheet.
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="bg-opacity">
                Opacity <span className="mono">{Math.round(background.opacity * 100)}%</span>
              </label>
              <input
                id="bg-opacity"
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={background.opacity}
                {...sliderHistory}
                onChange={(e) => st().patchBackground({ opacity: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <button
                type="button"
                className="btn"
                aria-pressed={!background.visible}
                onClick={() => st().setBackground({ ...background, visible: !background.visible })}
              >
                {background.visible ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn" onClick={() => imageInput.current?.click()}>
                Replace
              </button>
              <button type="button" className="btn danger" onClick={() => st().setBackground(null)}>
                Remove
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
