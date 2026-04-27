import type { PathData, Point } from "./utils";

export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

export function segmentControls(path: PathData, index: number) {
  const n = path.segments.length;
  const curr = path.segments[index];
  const next = path.segments[(index + 1) % n];
  return {
    curr,
    next,
    p0: { x: curr.x, y: curr.y },
    p1: curr.handleOut ?? { x: curr.x, y: curr.y },
    p2: next.handleIn ?? { x: next.x, y: next.y },
    p3: { x: next.x, y: next.y },
  };
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

export function curveDistance(path: PathData, index: number, point: Point) {
  const { p0, p1, p2, p3 } = segmentControls(path, index);
  let prev = p0;
  let min = Infinity;
  for (let i = 1; i <= 24; i++) {
    const sample = cubicPoint(p0, p1, p2, p3, i / 24);
    min = Math.min(min, pointLineDistance(point, prev, sample));
    prev = sample;
  }
  return min;
}

export function segmentDistance(path: PathData, index: number, point: Point) {
  const { curr, next } = segmentControls(path, index);
  if (!curr.handleOut && !next.handleIn) {
    return pointLineDistance(point, curr, next);
  }
  return curveDistance(path, index, point);
}

export function findClosestSegmentIndex(path: PathData, point: Point) {
  const n = path.segments.length;
  const steps = path.closed ? n : Math.max(0, n - 1);
  let bestIndex = 0;
  let minDist = Infinity;

  for (let i = 0; i < steps; i++) {
    const dist = segmentDistance(path, i, point);
    if (dist < minDist) {
      minDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function lerpPoint(a: Point, b: Point, amount: number): Point {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  };
}

export function splitSegment(path: PathData, index: number, t = 0.5) {
  const n = path.segments.length;
  if (!n || index < 0 || index >= (path.closed ? n : n - 1)) return index;

  const curr = path.segments[index];
  const nextIndex = (index + 1) % n;
  const next = path.segments[nextIndex];

  const p0 = { x: curr.x, y: curr.y };
  const p1 = curr.handleOut ?? { x: curr.x, y: curr.y };
  const p2 = next.handleIn ?? { x: next.x, y: next.y };
  const p3 = { x: next.x, y: next.y };

  if (!curr.handleOut && !next.handleIn) {
    const mid = {
      x: p0.x + (p3.x - p0.x) * t,
      y: p0.y + (p3.y - p0.y) * t,
    };
    const insertAt = path.closed ? index + 1 : index + 1;
    path.segments.splice(insertAt, 0, { x: mid.x, y: mid.y });
    return insertAt;
  }

  const a = lerpPoint(p0, p1, t);
  const b = lerpPoint(p1, p2, t);
  const c = lerpPoint(p2, p3, t);
  const d = lerpPoint(a, b, t);
  const e = lerpPoint(b, c, t);
  const s = lerpPoint(d, e, t);

  curr.handleOut = { x: a.x, y: a.y };
  next.handleIn = { x: c.x, y: c.y };

  const insertAt = path.closed ? index + 1 : index + 1;
  path.segments.splice(insertAt, 0, {
    x: s.x,
    y: s.y,
    handleIn: { x: d.x, y: d.y },
    handleOut: { x: e.x, y: e.y },
  });

  return insertAt;
}
