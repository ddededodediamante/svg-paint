export function getShapeCenter(shape: { nodes: any[] }) {
  const sum = shape.nodes.reduce(
    (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / shape.nodes.length, y: sum.y / shape.nodes.length };
}

export function pathD(shape: { nodes: any; type: string }) {
  const nodes = shape.nodes;
  if (!nodes || nodes.length < 2) return "";

  if (shape.type === "rect") {
    return (
      nodes
        .map((n: { x: number; y: number }, i: number) =>
          i === 0 ? `M ${n.x} ${n.y}` : `L ${n.x} ${n.y}`
        )
        .join(" ") + " Z"
    );
  } else {
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 0; i < nodes.length; i++) {
      const curr = nodes[i];
      const next = nodes[(i + 1) % nodes.length];

      const h1 = curr.handleOut || { x: curr.x, y: curr.y };
      const h2 = next.handleIn || { x: next.x, y: next.y };

      if (curr.type !== "curve" && next.type !== "curve") {
        d += ` L ${next.x} ${next.y}`;
      } else {
        d += ` C ${h1.x} ${h1.y}, ${h2.x} ${h2.y}, ${next.x} ${next.y}`;
      }
    }
    d += " Z";
    return d;
  }
}

export function downloadFile({ source, type, filename }) {
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

/* wow, i dont understand this! */
export function pointLineDistance(p, a, b) {
  const A = p.x - a.x;
  const B = p.y - a.y;
  const C = b.x - a.x;
  const D = b.y - a.y;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  const param = len_sq !== 0 ? dot / len_sq : -1;

  let xx, yy;

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
