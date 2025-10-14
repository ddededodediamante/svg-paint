import { parseSVG, makeAbsolute } from "svg-path-parser";

export function importSVGPath(d) {
  const commands = makeAbsolute(parseSVG(d));
  const points = [];

  function pushPoint(x, y, type = "line") {
    const p = { x, y, type, handleIn: { x, y }, handleOut: { x, y } };
    points.push(p);
    return p;
  }

  let lastPoint = null;

  for (const c of commands) {
    if (c.code === "M") {
      lastPoint = pushPoint(c.x, c.y, "move");
    } else if (c.code === "L") {
      lastPoint = pushPoint(c.x, c.y, "line");
    } else if (c.code === "C") {
      const endpoint = pushPoint(c.x, c.y, "curve");
      if (lastPoint) lastPoint.handleOut = { x: c.x1, y: c.y1 };
      endpoint.handleIn = { x: c.x2, y: c.y2 };
      lastPoint = endpoint;
    } else if (c.code === "Q") {
      if (!lastPoint) {
        lastPoint = pushPoint(c.x, c.y, "line");
        continue;
      }
      const p0 = lastPoint;
      const qx = c.x1,
        qy = c.y1;
      const p2x = c.x,
        p2y = c.y;

      const c1x = p0.x + (2 / 3) * (qx - p0.x);
      const c1y = p0.y + (2 / 3) * (qy - p0.y);
      const c2x = p2x + (2 / 3) * (qx - p2x);
      const c2y = p2y + (2 / 3) * (qy - p2y);

      p0.handleOut = { x: c1x, y: c1y };
      const endpoint = pushPoint(p2x, p2y, "curve");
      endpoint.handleIn = { x: c2x, y: c2y };
      lastPoint = endpoint;
    }
  }

  const closedCmd = commands.some((c) => c.code === "Z");

  const allXs = [];
  const allYs = [];
  for (const p of points) {
    allXs.push(p.x);
    allYs.push(p.y);
    if (p.handleIn) {
      allXs.push(p.handleIn.x);
      allYs.push(p.handleIn.y);
    }
    if (p.handleOut) {
      allXs.push(p.handleOut.x);
      allYs.push(p.handleOut.y);
    }
  }

  const minX = Math.min(...allXs);
  const maxX = Math.max(...allXs);
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  const normalized = points.map((p) => ({
    type: p.type,
    x: (p.x - minX) / width,
    y: (p.y - minY) / height,
    handleIn: p.handleIn
      ? { x: (p.handleIn.x - minX) / width, y: (p.handleIn.y - minY) / height }
      : null,
    handleOut: p.handleOut
      ? {
          x: (p.handleOut.x - minX) / width,
          y: (p.handleOut.y - minY) / height,
        }
      : null,
  }));

  function create(start, end) {
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    return normalized.map((p) => {
      const baseX = x1 + p.x * w;
      const baseY = y1 + p.y * h;
      return {
        type: p.type,
        x: baseX,
        y: baseY,
        handleIn: p.handleIn
          ? {
              x: baseX + (p.handleIn.x - p.x) * w,
              y: baseY + (p.handleIn.y - p.y) * h,
            }
          : null,
        handleOut: p.handleOut
          ? {
              x: baseX + (p.handleOut.x - p.x) * w,
              y: baseY + (p.handleOut.y - p.y) * h,
            }
          : null,
      };
    });
  }

  function preview(start, end) {
    const pts = create(start, end);
    if (!pts.length) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.type === "curve") {
        const prev = pts[i - 1];
        const c1 = prev.handleOut ?? { x: prev.x, y: prev.y };
        const c2 = p.handleIn ?? { x: p.x, y: p.y };
        d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p.x} ${p.y}`;
      } else if (p.type === "line" || p.type === "move") {
        d += ` L ${p.x} ${p.y}`;
      }
    }

    if (closedCmd) d += " Z";
    return `<path d="${d}" class="previewShape" />`;
  }

  return { create, preview };
}

export const shapeDefs = {
  line: {
    create(start, end) {
      return [
        { x: start.x, y: start.y, type: "rect" },
        { x: end.x, y: end.y, type: "rect" },
      ];
    },
    preview(start, end) {
      return `<line
        x1=${start.x}
        y1=${start.y}
        x2=${end.x}
        y2=${end.y}
        class="previewShape"
      />`;
    },
  },
  square: {
    create(start, end) {
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);
      return [
        { x: x1, y: y1, type: "rect" },
        { x: x2, y: y1, type: "rect" },
        { x: x2, y: y2, type: "rect" },
        { x: x1, y: y2, type: "rect" },
      ];
    },
    preview(start, end) {
      return `<rect
        x="${Math.min(start.x, end.x)}"
        y="${Math.min(start.y, end.y)}"
        width="${Math.abs(end.x - start.x)}"
        height="${Math.abs(end.y - start.y)}"
        class="previewShape"
      />`;
    },
  },
  circle: {
    create(start, end) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const k = 0.552284749831;
      return [
        {
          x: cx + rx,
          y: cy,
          type: "curve",
          handleIn: { x: cx + rx, y: cy - ry * k },
          handleOut: { x: cx + rx, y: cy + ry * k },
        },
        {
          x: cx,
          y: cy + ry,
          type: "curve",
          handleIn: { x: cx + rx * k, y: cy + ry },
          handleOut: { x: cx - rx * k, y: cy + ry },
        },
        {
          x: cx - rx,
          y: cy,
          type: "curve",
          handleIn: { x: cx - rx, y: cy + ry * k },
          handleOut: { x: cx - rx, y: cy - ry * k },
        },
        {
          x: cx,
          y: cy - ry,
          type: "curve",
          handleIn: { x: cx - rx * k, y: cy - ry },
          handleOut: { x: cx + rx * k, y: cy - ry },
        },
      ];
    },
    preview(start, end) {
      return `<ellipse
        cx="${(start.x + end.x) / 2}"
        cy="${(start.y + end.y) / 2}"
        rx="${Math.abs(end.x - start.x) / 2}"
        ry="${Math.abs(end.y - start.y) / 2}"
        class="previewShape"
      />`;
    },
  },
  star: {
    create(start, end) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? 1 : 0.4;
        points.push({
          x: cx + Math.cos(angle - Math.PI / 2) * rx * radius,
          y: cy + Math.sin(angle - Math.PI / 2) * ry * radius,
        });
      }
      return points;
    },
    preview(start, end) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const points = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? 1 : 0.4;
        points.push(
          `${cx + Math.cos(angle - Math.PI / 2) * rx * radius},${
            cy + Math.sin(angle - Math.PI / 2) * ry * radius
          }`
        );
      }
      return `<polygon points="${points.join(" ")}" class="previewShape" />`;
    },
  },
  arrow: {
    create(start, end) {
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);

      const base = [
        [7.5, 0],
        [0, 6],
        [5, 6],
        [5, 15],
        [10, 15],
        [10, 6],
        [15, 6],
        [7.5, 0],
      ];

      const points = base.map(([px, py]) => ({
        x: x1 + (px / 15) * w,
        y: y1 + (py / 15) * h,
        type: "rect",
      }));

      return points;
    },

    preview(start, end) {
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);

      const base = [
        [7.5, 0],
        [0, 6],
        [5, 6],
        [5, 15],
        [10, 15],
        [10, 6],
        [15, 6],
        [7.5, 0],
      ];

      const points = base.map(
        ([px, py]) => `${x1 + (px / 15) * w},${y1 + (py / 15) * h}`
      );

      return `<polygon points="${points.join(" ")}" class="previewShape" />`;
    },
  },
  heart: importSVGPath(
    "M 60.83 17.19 C 68.84 8.84 74.45 1.62 86.79 0.21 C 109.96 -2.45 131.27 21.27 119.57 44.62 C 116.24 51.27 109.46 59.18 101.96 66.94 C 93.73 75.46 84.62 83.81 78.24 90.14 L 60.84 107.4 L 46.46 93.56 C 29.16 76.9 0.95 55.93 0.02 29.95 C -0.63 11.75 13.73 0.09 30.25 0.3 C 45.01 0.5 51.22 7.84 60.83 17.19 Z"
  ),
};