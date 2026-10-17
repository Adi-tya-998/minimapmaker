import { SHEET_SIZE, SURFACES } from '../types/map';
import type { LabelObject, MapObject } from '../types/map';
import type { MapDocument } from '../types/project';
import { circleRadius, LABEL_FONT } from './geometry';

function tracePath(c: CanvasRenderingContext2D, pts: MapObject['pts']) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.closePath();
}

function traceCurve(c: CanvasRenderingContext2D, pts: MapObject['pts']) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    c.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 12;
    const c1y = p1[1] + (p2[1] - p0[1]) / 12;
    const c2x = p2[0] - (p3[0] - p1[0]) / 12;
    const c2y = p2[1] - (p3[1] - p1[1]) / 12;
    c.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
}

function paintLabel(c: CanvasRenderingContext2D, s: LabelObject) {
  c.save();
  c.font = `600 ${s.size}px ${LABEL_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  const outlineColor = s.outline === 'white' ? '#ffffff' : s.outline === 'black' ? '#1d1d1d' : s.outline === 'none' ? null : s.tone === 'dark' ? 'rgba(255,255,255,.75)' : 'rgba(30,30,30,.55)';
  if (outlineColor) {
    c.lineWidth = Math.max(1, s.size * 0.2);
    c.strokeStyle = outlineColor;
    c.strokeText(s.text, s.pts[0][0], s.pts[0][1]);
  }
  c.fillStyle = s.tone === 'dark' ? '#1d1d1d' : '#ffffff';
  c.fillText(s.text, s.pts[0][0], s.pts[0][1]);
  c.restore();
}

/** Paint only the created map (no sheet fill, reference image, grid, or editor overlays). */
export function paintSheet(c: CanvasRenderingContext2D, doc: MapDocument) {
  for (const s of doc.shapes) {
    if (s.hidden) continue;
    if (s.type === 'label') {
      paintLabel(c, s);
      continue;
    }
    const fill = SURFACES[s.kind].fill;
    const outlineColor = s.outline === 'white' ? '#ffffff' : s.outline === 'black' ? '#1d1d1d' : null;
    if (s.type === 'line' || s.type === 'curve') {
      if (s.type === 'curve') traceCurve(c, s.pts);
      else {
        c.beginPath();
        c.moveTo(s.pts[0][0], s.pts[0][1]);
        c.lineTo(s.pts[1][0], s.pts[1][1]);
      }
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (s.outline === 'none') {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
      } else if (s.outline === 'black') {
        c.strokeStyle = '#1d1d1d';
        c.lineWidth = 1.8;
      } else if (s.outline === 'white') {
        c.strokeStyle = 'rgba(25,35,38,.8)';
        c.lineWidth = 2.8;
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
      } else {
        c.strokeStyle = 'rgba(25,35,38,.8)';
        c.lineWidth = 2.8;
        c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
      }
      c.stroke();
      continue;
    }
    if (s.type === 'circle') {
      c.beginPath();
      c.arc(s.pts[0][0], s.pts[0][1], circleRadius(s.pts), 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      if (outlineColor) {
        c.strokeStyle = outlineColor;
        c.lineWidth = 1.5;
        c.stroke();
      } else if (s.outline !== 'none') {
        c.strokeStyle = fill;
        c.lineWidth = 0.35;
        c.stroke();
      }
      continue;
    }
    tracePath(c, s.pts);
    c.fillStyle = fill;
    c.fill();
    if (outlineColor) {
      c.strokeStyle = outlineColor;
      c.lineWidth = 1.5;
      c.lineJoin = 'miter';
      c.stroke();
    } else if (s.outline !== 'none') {
      c.strokeStyle = fill;
      c.lineWidth = 0.35;
      c.lineJoin = 'miter';
      c.stroke();
    }
  }
}

/** Render the map to a square PNG of `pixels` x `pixels`. */
export async function renderPng(doc: MapDocument, pixels: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.setTransform(pixels / SHEET_SIZE, 0, 0, pixels / SHEET_SIZE, 0, 0);

  try {
    await document.fonts?.load('600 12px "IBM Plex Sans"');
  } catch {
    /* fall back to the system sans-serif */
  }
  paintSheet(ctx, doc);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the image.'))), 'image/png');
  });
}
