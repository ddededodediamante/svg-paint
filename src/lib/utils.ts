export interface Point {
  x: number;
  y: number;
}

export interface Handle {
  x: number;
  y: number;
}

export interface Segment {
  x: number;
  y: number;
  handleIn?: Handle | null;
  handleOut?: Handle | null;
}

export interface PathData {
  segments: Segment[];
  closed: boolean;
}

function isPathData(value: any): value is PathData {
  return value && Array.isArray(value.segments) && typeof value.closed === "boolean";
}

function cloneHandle(handle?: Handle | null): Handle | null {
  return handle ? { x: handle.x, y: handle.y } : null;
}

export function clonePathData(path: PathData): PathData {
  return {
    closed: !!path.closed,
    segments: path.segments.map(segment => ({
      x: segment.x,
      y: segment.y,
      handleIn: cloneHandle(segment.handleIn ?? null),
      handleOut: cloneHandle(segment.handleOut ?? null),
    })),
  };
}

function extractPathData(input: any): PathData | null {
  if (!input) return null;
  if (isPathData(input)) return input;
  if (input.path && isPathData(input.path)) return input.path;
  if (Array.isArray(input.nodes)) return legacyNodesToPathData(input);
  return null;
}

export function legacyNodesToPathData(shape: any): PathData {
  const nodes = Array.isArray(shape?.nodes) ? shape.nodes : [];
  if (!nodes.length) return { segments: [], closed: false };

  const segments = nodes.map((node: any) => ({
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    handleIn: node.handleIn
      ? { x: Number(node.handleIn.x) || 0, y: Number(node.handleIn.y) || 0 }
      : null,
    handleOut: node.handleOut
      ? { x: Number(node.handleOut.x) || 0, y: Number(node.handleOut.y) || 0 }
      : null,
  }));

  const closed = nodes.length > 2 && shape?.type !== "line";

  if (closed && segments.length > 1) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const eps = 1e-6;
    if (Math.abs(first.x - last.x) < eps && Math.abs(first.y - last.y) < eps) {
      if (last.handleIn && !first.handleIn) {
        first.handleIn = cloneHandle(last.handleIn);
      }
      segments.pop();
    }
  }

  return { segments, closed };
}

export function getShapeCenter(input: any): Point {
  const path = extractPathData(input);
  if (!path || !path.segments.length) return { x: 0, y: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const pushPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const segment of path.segments) {
    pushPoint(segment.x, segment.y);
    if (segment.handleIn) pushPoint(segment.handleIn.x, segment.handleIn.y);
    if (segment.handleOut) pushPoint(segment.handleOut.x, segment.handleOut.y);
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0 };

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

export function pathD(input: any): string {
  const path = extractPathData(input);
  if (!path || !path.segments.length) return "";

  const segments = path.segments;
  const closed = !!path.closed;
  const n = segments.length;

  let d = `M ${segments[0].x} ${segments[0].y}`;

  if (n === 1) {
    return closed ? `${d} Z` : d;
  }

  const steps = closed ? n : n - 1;
  for (let i = 0; i < steps; i++) {
    const curr = segments[i];
    const next = segments[(i + 1) % n];
    const c1 = curr.handleOut ?? { x: curr.x, y: curr.y };
    const c2 = next.handleIn ?? { x: next.x, y: next.y };

    if (!curr.handleOut && !next.handleIn) {
      d += ` L ${next.x} ${next.y}`;
    } else {
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${next.x} ${next.y}`;
    }
  }

  if (closed) d += " Z";
  return d;
}

export function scalePathData(path: PathData, start: Point, end: Point): PathData {
  const width = Math.abs(end.x - start.x) || 1;
  const height = Math.abs(end.y - start.y) || 1;
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);

  return {
    closed: path.closed,
    segments: path.segments.map(segment => {
      const baseX = x1 + segment.x * width;
      const baseY = y1 + segment.y * height;

      return {
        x: baseX,
        y: baseY,
        handleIn: segment.handleIn
          ? {
              x: baseX + (segment.handleIn.x - segment.x) * width,
              y: baseY + (segment.handleIn.y - segment.y) * height,
            }
          : null,
        handleOut: segment.handleOut
          ? {
              x: baseX + (segment.handleOut.x - segment.x) * width,
              y: baseY + (segment.handleOut.y - segment.y) * height,
            }
          : null,
      };
    }),
  };
}

export function downloadFile({
  source,
  type,
  filename,
}: {
  source: BlobPart;
  type: string;
  filename: string;
}) {
  const blob = new Blob([source], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function pointLineDistance(p: Point, a: Point, b: Point) {
  const A = p.x - a.x;
  const B = p.y - a.y;
  const C = b.x - a.x;
  const D = b.y - a.y;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  const param = len_sq !== 0 ? dot / len_sq : -1;

  let xx: number, yy: number;

  if (param < 0) {
    xx = a.x;
    yy = a.y;
  } else if (param > 1) {
    xx = b.x;
    yy = b.y;
  } else {
    xx = a.x + param * C;
    yy = a.y + param * D;
  }

  const dx = p.x - xx;
  const dy = p.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function niceString(input: string): string {
  // replace first letter with uppercase
  // for every other uppercase, add a space before it
  return input
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

export function getAngle(center: Point, p: Point) {
  return Math.atan2(p.y - center.y, p.x - center.x);
}

export function clamp(min: number = -Infinity, num: number = 0, max: number = Infinity) {
  return Math.min(max, Math.max(min, num));
}
