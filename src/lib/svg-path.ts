import { parseSVG, makeAbsolute } from "svg-path-parser";
import type { PathData, Point, Segment } from "./utils";

export function importSVGPath(d: string): PathData {
  const commands = makeAbsolute(parseSVG(d));
  const segments: Segment[] = [];

  function push(x: number, y: number): Segment {
    const seg = { x, y, handleIn: null, handleOut: null };
    segments.push(seg);
    return seg;
  }

  let last: Segment | null = null;
  let lastControl: Point | null = null;

  function reflect(p: Point, around: Point) {
    return {
      x: 2 * around.x - p.x,
      y: 2 * around.y - p.y,
    };
  }

  function arcToCubic(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    phi: number,
    fa: any,
    fs: any,
    x2: number,
    y2: number,
  ) {
    const rad = (phi * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    let dx = (x1 - x2) / 2;
    let dy = (y1 - y2) / 2;

    let x1p = cos * dx + sin * dy;
    let y1p = -sin * dx + cos * dy;

    rx = Math.abs(rx);
    ry = Math.abs(ry);

    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);

    if (lambda > 1) {
      const s = Math.sqrt(lambda);
      rx *= s;
      ry *= s;
    }

    const sign = fa === fs ? -1 : 1;
    const sq =
      (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) /
      (rx * rx * y1p * y1p + ry * ry * x1p * x1p);

    const coef = sign * Math.sqrt(Math.max(0, sq));

    const cxp = (coef * rx * y1p) / ry;
    const cyp = (-coef * ry * x1p) / rx;

    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

    function angle(u: Point, v: Point) {
      const dot = u.x * v.x + u.y * v.y;
      const len = Math.sqrt(u.x * u.x + u.y * u.y) * Math.sqrt(v.x * v.x + v.y * v.y);
      return Math.acos(Math.max(-1, Math.min(1, dot / len)));
    }

    const v1 = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
    const v2 = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };

    let startAngle = Math.atan2(v1.y, v1.x);
    let deltaAngle = angle(v1, v2);

    if (!fs && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
    if (fs && deltaAngle < 0) deltaAngle += 2 * Math.PI;

    const segments = Math.ceil(Math.abs(deltaAngle / (Math.PI / 2)));
    const result = [];

    for (let i = 0; i < segments; i++) {
      const t1 = startAngle + (i * deltaAngle) / segments;
      const t2 = startAngle + ((i + 1) * deltaAngle) / segments;

      const cos1 = Math.cos(t1);
      const sin1 = Math.sin(t1);
      const cos2 = Math.cos(t2);
      const sin2 = Math.sin(t2);

      const p1 = {
        x: cx + rx * cos1 * cos - ry * sin1 * sin,
        y: cy + rx * cos1 * sin + ry * sin1 * cos,
      };

      const p2 = {
        x: cx + rx * cos2 * cos - ry * sin2 * sin,
        y: cy + rx * cos2 * sin + ry * sin2 * cos,
      };

      const alpha = (4 / 3) * Math.tan((t2 - t1) / 4);

      const c1 = {
        x: p1.x - alpha * (rx * sin1 * cos + ry * cos1 * sin),
        y: p1.y - alpha * (rx * sin1 * sin - ry * cos1 * cos),
      };

      const c2 = {
        x: p2.x + alpha * (rx * sin2 * cos + ry * cos2 * sin),
        y: p2.y + alpha * (rx * sin2 * sin - ry * cos2 * cos),
      };

      result.push({ c1, c2, p: p2 });
    }

    return result;
  }

  for (const c of commands) {
    switch (c.code) {
      case "M":
        last = push(c.x, c.y);
        lastControl = null;
        break;

      case "L":
        last = push(c.x, c.y);
        lastControl = null;
        break;

      case "H":
        last = push(c.x, last?.y || 0);
        lastControl = null;
        break;

      case "V":
        last = push(last?.x || 0, c.y);
        lastControl = null;
        break;

      case "C": {
        if (last === null) break;

        const seg = push(c.x, c.y);
        last.handleOut = { x: c.x1, y: c.y1 };
        seg.handleIn = { x: c.x2, y: c.y2 };
        last = seg;
        lastControl = { x: c.x2, y: c.y2 };
        break;
      }

      case "S": {
        if (last === null) break;

        const reflected = lastControl ? reflect(lastControl, last) : last;

        const seg = push(c.x, c.y);

        last.handleOut = reflected;
        seg.handleIn = { x: c.x2, y: c.y2 };

        last = seg;
        lastControl = { x: c.x2, y: c.y2 };
        break;
      }

      case "Q": {
        if (last === null) break;
        const p0 = last;

        const c1x = p0.x + (2 / 3) * (c.x1 - p0.x);
        const c1y = p0.y + (2 / 3) * (c.y1 - p0.y);
        const c2x = c.x + (2 / 3) * (c.x1 - c.x);
        const c2y = c.y + (2 / 3) * (c.y1 - c.y);

        p0.handleOut = { x: c1x, y: c1y };

        const seg = push(c.x, c.y);
        seg.handleIn = { x: c2x, y: c2y };

        last = seg;
        lastControl = { x: c.x1, y: c.y1 };
        break;
      }

      case "T": {
        if (last === null) break;
        const q: Point = lastControl ? reflect(lastControl, last) : last;

        const c1x = last.x + (2 / 3) * (q.x - last.x);
        const c1y = last.y + (2 / 3) * (q.y - last.y);
        const c2x = c.x + (2 / 3) * (q.x - c.x);
        const c2y = c.y + (2 / 3) * (q.y - c.y);

        last.handleOut = { x: c1x, y: c1y };

        const seg = push(c.x, c.y);
        seg.handleIn = { x: c2x, y: c2y };

        last = seg;
        lastControl = q;
        break;
      }

      case "A": {
        if (last === null) break;
        const arcs = arcToCubic(
          last.x,
          last.y,
          c.rx,
          c.ry,
          c.xAxisRotation,
          c.largeArc,
          c.sweep,
          c.x,
          c.y,
        );

        for (const a of arcs) {
          const seg = push(a.p.x, a.p.y);
          last.handleOut = a.c1;
          seg.handleIn = a.c2;
          last = seg;
        }

        lastControl = null;
        break;
      }

      case "Z":
        lastControl = null;
        break;
    }
  }

  const closed = commands.some((c: any) => c?.code === "Z");

  const xs = [];
  const ys = [];

  for (const s of segments) {
    xs.push(s.x);
    ys.push(s.y);
    if (s.handleIn) {
      xs.push(s.handleIn.x);
      ys.push(s.handleIn.y);
    }
    if (s.handleOut) {
      xs.push(s.handleOut.x);
      ys.push(s.handleOut.y);
    }
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  const normalized = segments.map(s => ({
    x: (s.x - minX) / w,
    y: (s.y - minY) / h,
    handleIn: s.handleIn
      ? {
        x: (s.handleIn.x - minX) / w,
        y: (s.handleIn.y - minY) / h,
      }
      : null,
    handleOut: s.handleOut
      ? {
        x: (s.handleOut.x - minX) / w,
        y: (s.handleOut.y - minY) / h,
      }
      : null,
  }));

  return {
    segments: normalized,
    closed,
  };
}
