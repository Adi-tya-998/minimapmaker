import { Eye, EyeOff, Plus } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { SURFACES } from '../types/map';
import type { MapObject } from '../types/map';

/** Names like "Floor 3" (numbered per surface in stacking order) or “label text”. */
export function layerNames(shapes: MapObject[]): string[] {
  const counts: Partial<Record<string, number>> = {};
  return shapes.map((s) => {
    if (s.type === 'label') return `“${s.text}”`;
    const name = s.type === 'line' ? 'Line' : s.type === 'curve' ? 'Curve' : s.type === 'circle' ? 'Circle' : SURFACES[s.kind].name;
    counts[name] = (counts[name] ?? 0) + 1;
    return `${name} ${counts[name]}`;
  });
}

export function LayersPanel() {
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const shapes = useEditorStore((s) => s.doc.shapes);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const toggleHidden = useEditorStore((s) => s.toggleHidden);
  const groupingSelection = useEditorStore((s) => s.groupingSelection);
  const toggleGroupingSelection = useEditorStore((s) => s.toggleGroupingSelection);
  const groupSelectedLayers = useEditorStore((s) => s.groupSelectedLayers);
  const addLayerToGroup = useEditorStore((s) => s.addLayerToGroup);
  const ungroupSelectedLayers = useEditorStore((s) => s.ungroupSelectedLayers);
  const canUngroup = shapes.some((shape) => groupingSelection.includes(shape.id) && !!shape.groupId);
  const names = layerNames(shapes);
  const groupCounts = new Map<string, number>();
  shapes.forEach((shape) => {
    if (shape.groupId) groupCounts.set(shape.groupId, (groupCounts.get(shape.groupId) ?? 0) + 1);
  });
  const groupNumbers = new Map<string, number>();
  shapes.slice().reverse().forEach((shape) => {
    if (shape.groupId && !groupNumbers.has(shape.groupId)) groupNumbers.set(shape.groupId, groupNumbers.size + 1);
  });

  return (
    <section className="sec">
      <h2>Layers</h2>
      <div className="layer-group-actions">
        <button type="button" disabled={groupingSelection.length < 2} onClick={groupSelectedLayers}>Group selected</button>
        <button type="button" disabled={!canUngroup} onClick={ungroupSelectedLayers}>Ungroup</button>
      </div>
      <ul className="layers">
        {/* Top of the list is the top of the stack. */}
        {shapes
          .map((s, i) => ({ s, name: names[i] }))
          .reverse()
          .map(({ s, name }) => (
            <li key={s.id}>
              <div className="layer-row">
                <input
                  className="layer-group-check"
                  type="checkbox"
                  checked={groupingSelection.includes(s.id)}
                  aria-label={`Select ${name} for grouping`}
                  title="Select layer for grouping"
                  onChange={() => toggleGroupingSelection(s.id)}
                />
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
                  {s.groupId && (
                    <span className="layer-group-badge" title={`Group ${groupNumbers.get(s.groupId)}, ${groupCounts.get(s.groupId)} layers`}>
                      Group {groupNumbers.get(s.groupId)} · {groupCounts.get(s.groupId)} layers
                    </span>
                  )}
                </button>
                {s.groupId && (
                  <button
                    type="button"
                    className="layer-add"
                    aria-label={`Add a layer to Group ${groupNumbers.get(s.groupId)}`}
                    aria-expanded={addingToGroup === s.groupId}
                    title={`Add one layer to Group ${groupNumbers.get(s.groupId)}`}
                    onClick={() => setAddingToGroup(addingToGroup === s.groupId ? null : s.groupId!)}
                  >
                    <Plus />
                  </button>
                )}
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
              </div>
              {s.groupId && addingToGroup === s.groupId && (
                <div className="layer-add-menu">
                  <span>Add one layer to Group {groupNumbers.get(s.groupId)}</span>
                  {shapes.filter((candidate) => candidate.groupId !== s.groupId).map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        addLayerToGroup(candidate.id, s.groupId!);
                        setAddingToGroup(null);
                      }}
                    >
                      {names[shapes.indexOf(candidate)]}
                    </button>
                  ))}
                  {shapes.every((candidate) => candidate.groupId === s.groupId) && <span className="muted">No other layers to add.</span>}
                </div>
              )}
            </li>
          ))}
      </ul>
      {shapes.length === 0 && <p className="muted">No shapes yet. Pick a drawing tool and draw on the sheet.</p>}
    </section>
  );
}
