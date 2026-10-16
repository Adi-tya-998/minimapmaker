import { Eye, EyeOff } from 'lucide-react';
import { useEditorStore } from '../stores/editorStore';
import { SURFACES } from '../types/map';
import type { MapObject } from '../types/map';

/** Names like "Floor 3" (numbered per surface in stacking order) or “label text”. */
export function layerNames(shapes: MapObject[]): string[] {
  const counts: Partial<Record<string, number>> = {};
  return shapes.map((s) => {
    if (s.type === 'label') return `“${s.text}”`;
    const name = s.type === 'line' ? 'Line' : s.type === 'curve' ? 'Curve' : SURFACES[s.kind].name;
    counts[name] = (counts[name] ?? 0) + 1;
    return `${name} ${counts[name]}`;
  });
}

export function LayersPanel() {
  const shapes = useEditorStore((s) => s.doc.shapes);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const toggleHidden = useEditorStore((s) => s.toggleHidden);
  const names = layerNames(shapes);

  return (
    <section className="sec">
      <h2>Layers</h2>
      <ul className="layers">
        {/* Top of the list is the top of the stack. */}
        {shapes
          .map((s, i) => ({ s, name: names[i] }))
          .reverse()
          .map(({ s, name }) => (
            <li key={s.id}>
              <button
                type="button"
                className="layer"
                aria-current={s.id === selectedId ? 'true' : undefined}
                onClick={() => select(s.id)}
              >
                {s.type === 'label' ? (
                  <span className="chip chip-label">T</span>
                ) : (
                  <span className="chip" style={{ background: SURFACES[s.kind].fill }} />
                )}
                <span className="nm">{name}</span>
              </button>
              <button
                type="button"
                className="eye"
                aria-pressed={!!s.hidden}
                aria-label={`${s.hidden ? 'Show' : 'Hide'} ${name}`}
                title={s.hidden ? 'Show' : 'Hide'}
                onClick={() => toggleHidden(s.id)}
              >
                {s.hidden ? <EyeOff /> : <Eye />}
              </button>
            </li>
          ))}
      </ul>
      {shapes.length === 0 && <p className="muted">No shapes yet. Pick Polygon, Rectangle, or Line boundary and draw on the sheet.</p>}
    </section>
  );
}
