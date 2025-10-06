<script>
  import { onMount } from "svelte";

  let svgEl;
  let mode = $state("edit");

  let shapes = $state([
    {
      nodes: [
        { x: 50, y: 50, type: "rect" },
        { x: 150, y: 50, type: "rect" },
        { x: 150, y: 130, type: "rect" },
        { x: 50, y: 130, type: "rect" },
      ],
      id: 0,
    },
    {
      nodes: [
        { x: 450, y: 100, type: "curve" },
        { x: 400, y: 150, type: "curve" },
        { x: 350, y: 100, type: "curve" },
        { x: 400, y: 50, type: "curve" },
      ],
      id: 1,
    },
    {
      nodes: [
        { x: 250, y: 200, type: "curve" },
        { x: 200, y: 250, type: "curve" },
        { x: 150, y: 200, type: "curve" },
        { x: 200, y: 150, type: "rect" },
      ],
      id: 2,
    },
    {
      nodes: [
        { x: 100, y: 200, type: "curve" },
        { x: 150, y: 250, type: "curve" },
        { x: 125, y: 310, type: "curve" },
        { x: 75, y: 310, type: "curve" },
        { x: 50, y: 250, type: "curve" },
      ],
      id: 3,
    },
  ]);

  let selectedShape = $state(null);
  let selectedNode = null;
  let selectedHandle = null;
  let dragOffset = { x: 0, y: 0 };
  let box = $derived(getBoundingBox(selectedShape));

  function colorFromID(id = 0, light = false) {
    const colors = [
      "#eb3434",
      "#eb9834",
      "#7aeb34",
      "#34c0eb",
      "#344feb",
      "#eb34b1",
    ];
    const lightcolors = [
      "#e35d5d",
      "#e3a356",
      "#92e85d",
      "#64c5e3",
      "#566be8",
      "#e356b6",
    ];
    const arr = light ? lightcolors : colors;
    return arr[id % arr.length];
  }

  function pointerPos(event) {
    const rect = svgEl.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function getShapeCenter(shape) {
    const sum = shape.nodes.reduce(
      (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / shape.nodes.length, y: sum.y / shape.nodes.length };
  }

  function selectShape(shape, event) {
    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = null;
    selectedHandle = null;

    const center = getShapeCenter(shape);
    dragOffset.x = p.x - center.x;
    dragOffset.y = p.y - center.y;

    event.stopPropagation();
  }

  function selectNode(shape, node, event) {
    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = node;
    selectedHandle = null;
    dragOffset.x = p.x - node.x;
    dragOffset.y = p.y - node.y;
    event.stopPropagation();
  }

  function selectHandle(shape, node, which, event) {
    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = node;
    selectedHandle = which;

    const h = which === "out" ? node.handleOut : node.handleIn;
    dragOffset.x = p.x - h.x;
    dragOffset.y = p.y - h.y;
    event.stopPropagation();
  }

  let canDrag = false;
  function drag(event) {
    if (!canDrag) return;

    const pointer = pointerPos(event);

    if (scalingHandle != null && selectedShape) {
      scaleShape(pointer);
      return;
    }

    if (selectedHandle && selectedNode) {
      const which = selectedHandle;
      const moved =
        which === "out" ? selectedNode.handleOut : selectedNode.handleIn;

      const newX = pointer.x - dragOffset.x;
      const newY = pointer.y - dragOffset.y;

      if (which === "out") {
        selectedNode.handleOut.x = newX;
        selectedNode.handleOut.y = newY;
      } else {
        selectedNode.handleIn.x = newX;
        selectedNode.handleIn.y = newY;
      }

      const nx = selectedNode.x;
      const ny = selectedNode.y;

      const mirror = {
        x: nx - (moved.x - nx),
        y: ny - (moved.y - ny),
      };

      if (which === "out") {
        selectedNode.handleIn.x = mirror.x;
        selectedNode.handleIn.y = mirror.y;
      } else {
        selectedNode.handleOut.x = mirror.x;
        selectedNode.handleOut.y = mirror.y;
      }
    } else if (selectedNode) {
      const newX = pointer.x - dragOffset.x;
      const newY = pointer.y - dragOffset.y;

      const dx = newX - selectedNode.x;
      const dy = newY - selectedNode.y;

      selectedNode.x += dx;
      selectedNode.y += dy;

      if (selectedNode.handleIn) {
        selectedNode.handleIn.x += dx;
        selectedNode.handleIn.y += dy;
      }
      if (selectedNode.handleOut) {
        selectedNode.handleOut.x += dx;
        selectedNode.handleOut.y += dy;
      }
    } else if (selectedShape) {
      const center = getShapeCenter(selectedShape);
      const targetX = pointer.x - dragOffset.x;
      const targetY = pointer.y - dragOffset.y;
      const dx = targetX - center.x;
      const dy = targetY - center.y;
      selectedShape.nodes.forEach((n) => {
        n.x += dx;
        n.y += dy;
        if (n.handleIn) {
          n.handleIn.x += dx;
          n.handleIn.y += dy;
        }
        if (n.handleOut) {
          n.handleOut.x += dx;
          n.handleOut.y += dy;
        }
      });
    }
  }

  function release() {
    selectedShape = null;
    selectedNode = null;
    selectedHandle = null;
    scalingHandle = null;
    canDrag = false;
  }

  const CIRCLE_C = 0.552284749831;
  function addHandles(shape) {
    const nodes = shape.nodes;
    if (!nodes || nodes.length < 2) return;

    let cx = 0,
      cy = 0;
    nodes.forEach((n) => {
      cx += n.x;
      cy += n.y;
    });
    cx /= nodes.length;
    cy /= nodes.length;

    nodes.forEach((n, i) => {
      if (n.type !== "curve" || (n.handleIn && n.handleOut)) return;

      const prev = nodes[(i - 1 + nodes.length) % nodes.length];
      const next = nodes[(i + 1) % nodes.length];

      const dx = n.x - cx;
      const dy = n.y - cy;

      const tx = (next.x - prev.x) / 2;
      const ty = (next.y - prev.y) / 2;

      const handleLength = Math.hypot(dx, dy) * CIRCLE_C;

      const len = Math.hypot(tx, ty);
      const nx = (tx / len) * handleLength;
      const ny = (ty / len) * handleLength;

      n.handleOut = { x: n.x + nx, y: n.y + ny };
      n.handleIn = { x: n.x - nx, y: n.y - ny };
    });
  }

  function pathD(shape) {
    const nodes = shape.nodes;
    if (!nodes || nodes.length < 2) return "";

    if (shape.type === "rect") {
      return (
        nodes
          .map((n, i) => (i === 0 ? `M ${n.x} ${n.y}` : `L ${n.x} ${n.y}`))
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

  function getBoundingBox(shape) {
    const xs = shape.nodes.map((n) => n.x);
    const ys = shape.nodes.map((n) => n.y);
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  let scalingHandle = null;
  let initialMouse = null;
  let initialNodes = null;
  let initialBox = null;

  function startScaling(handleIndex, event) {
    if (!selectedShape) return;

    event.stopPropagation();
    canDrag = true;
    scalingHandle = handleIndex;
    initialMouse = pointerPos(event);
    initialNodes = selectedShape.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      handleIn: n.handleIn ? { ...n.handleIn } : null,
      handleOut: n.handleOut ? { ...n.handleOut } : null,
    }));
    initialBox = getBoundingBox(selectedShape);
  }

  function scaleShape(pointer) {
    let fx, fy;
    const box = initialBox;

    switch (scalingHandle) {
      case 0:
        fx = box.xMax;
        fy = box.yMax;
        break;
      case 1:
        fx = box.xMin;
        fy = box.yMax;
        break;
      case 2:
        fx = box.xMin;
        fy = box.yMin;
        break;
      case 3:
        fx = box.xMax;
        fy = box.yMin;
        break;
    }

    const sx = (pointer.x - fx) / (initialMouse.x - fx);
    const sy = (pointer.y - fy) / (initialMouse.y - fy);

    selectedShape.nodes.forEach((n, i) => {
      const orig = initialNodes[i];

      n.x = fx + (orig.x - fx) * sx;
      n.y = fy + (orig.y - fy) * sy;

      if (orig.handleIn) {
        n.handleIn.x = fx + (orig.handleIn.x - fx) * sx;
        n.handleIn.y = fy + (orig.handleIn.y - fy) * sy;
      }
      if (orig.handleOut) {
        n.handleOut.x = fx + (orig.handleOut.x - fx) * sx;
        n.handleOut.y = fy + (orig.handleOut.y - fy) * sy;
      }
    });
  }

  function syncHandles() {
    shapes.forEach((s) => {
      addHandles(s);
    });
  }

  onMount(() => {
    syncHandles();
  });

  function saveButton() {
    navigator.clipboard.writeText(JSON.stringify($state.snapshot(shapes)));
  }

  function loadButton() {
    const input = prompt("Paste shapes JSON");
    if (!input) return;

    try {
      const loadedShapes = JSON.parse(input);
      if (!Array.isArray(loadedShapes)) throw new Error("Invalid format");

      shapes = loadedShapes;

      release();
      syncHandles();
    } catch (err) {
      alert("Invalid JSON: " + err.message);
    }
  }

  function downloadSVG() {
    const clone = svgEl.cloneNode(true);
    clone
      .querySelectorAll(".wb")
      .forEach((/** @type {{ remove: () => any; }} */ el) => el.remove());

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);

    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "image.svg";
    a.click();

    URL.revokeObjectURL(url);
  }

  function downloadPNG() {
    const clone = svgEl.cloneNode(true);
    clone
      .querySelectorAll(".wb")
      .forEach((/** @type {{ remove: () => any; }} */ el) => el.remove());

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svgEl.clientWidth;
      canvas.height = svgEl.clientHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = "image.png";
      a.click();

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
</script>

<div class="wrapper">
  <div class="bar">
    <p>Tools</p>
    <button onclick={() => (mode = "edit")}>Edit</button>
    <button onclick={() => (mode = "transform")}>Transform</button>
    <button
      onclick={() => {
        if (!selectedShape) {
          alert("Select a shape first");
          return;
        }

        let index = shapes.findIndex((s) => s.id === selectedShape.id);
        if (index !== -1) shapes.splice(index, 1);
      }}>Delete</button
    >
    <p>Shapes</p>
    <button
      onclick={() => {
        shapes.push({
          nodes: [
            { x: 25, y: 25, type: "rect" },
            { x: 75, y: 25, type: "rect" },
            { x: 75, y: 75, type: "rect" },
            { x: 25, y: 75, type: "rect" },
          ],
          id: shapes.length,
        });
        syncHandles();
      }}>New Square</button
    >
    <button
      onclick={() => {
        if (!selectedShape) {
          alert("Select a shape first");
          return;
        }

        const shape = selectedShape;
        const lastNode = shape.nodes[shape.nodes.length - 1];
        const newNode = {
          x: lastNode.x + 40,
          y: lastNode.y,
          type: lastNode.type,
        };

        if (newNode.type === "curve") {
          newNode.handleIn = { x: newNode.x - 20, y: newNode.y };
          newNode.handleOut = { x: newNode.x + 20, y: newNode.y };
        }

        shape.nodes.push(newNode);
        syncHandles();
      }}
    >
      Add Node
    </button>
    <p>Download</p>
    <button onclick={saveButton}>Save</button>
    <button onclick={loadButton}>Load</button>
    <button onclick={downloadPNG}>PNG</button>
    <button onclick={downloadSVG}>SVG</button>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svgEl}
    width="800"
    height="600"
    role="application"
    aria-label="SVG editor"
    onmousemove={drag}
    onmousedown={(event) => {
      if (event.target === svgEl) release();
      else {
        canDrag = true;
        scalingHandle = null;
      }
    }}
    onmouseup={() => (canDrag = false)}
    onmouseleave={() => ((canDrag = false), (scalingHandle = null))}
  >
    {#each shapes as shape}
      <path
        d={pathD(shape)}
        fill={colorFromID(shape.id, true)}
        stroke={colorFromID(shape.id)}
        stroke-width="2"
        onmousedown={(e) => {
          selectShape(shape, e);
          canDrag = true;
        }}
        onmouseup={() => (canDrag = false)}
      />

      {#each shape["nodes"] as node}
        {#if mode === "edit" && selectedShape === shape}
          {#if node.handleIn}
            <line
              x1={node.x}
              y1={node.y}
              x2={node.handleIn.x}
              y2={node.handleIn.y}
              class="wb"
            />
            <circle
              cx={node.handleIn.x}
              cy={node.handleIn.y}
              r="5"
              class="wb"
              onmousedown={(e) => {
                canDrag = true;
                selectHandle(shape, node, "in", e);
              }}
              onmouseup={() => {
                canDrag = false;
              }}
            />
          {/if}

          {#if node.handleOut}
            <line
              x1={node.x}
              y1={node.y}
              x2={node.handleOut.x}
              y2={node.handleOut.y}
              stroke="rgba(0,0,0,0.25)"
              stroke-width="1"
            />
            <circle
              cx={node.handleOut.x}
              cy={node.handleOut.y}
              r="5"
              class="wb"
              onmousedown={(e) => {
                canDrag = true;
                selectHandle(shape, node, "out", e);
              }}
              onmouseup={() => {
                canDrag = false;
              }}
            />
          {/if}
        {/if}

        <circle
          cx={node.x}
          cy={node.y}
          r="6"
          class="wb red"
          onmousedown={(e) => {
            canDrag = true;
            scalingHandle = null;
            selectNode(shape, node, e);
          }}
          onmouseup={() => (canDrag = false)}
        />
      {/each}
    {/each}

    {#if mode === "transform" && selectedShape}
      {#each [{ x: box.xMin, y: box.yMin, cursor: "nwse-resize" }, { x: box.xMax, y: box.yMin, cursor: "nesw-resize" }, { x: box.xMax, y: box.yMax, cursor: "nwse-resize" }, { x: box.xMin, y: box.yMax, cursor: "nesw-resize" }] as handle, i}
        <rect
          x={handle.x - 5}
          y={handle.y - 5}
          width="10"
          height="10"
          class="wb"
          style="cursor: {handle.cursor}"
          onmousedown={(e) => startScaling(i, e)}
          onmouseup={() => ((canDrag = false), (scalingHandle = null))}
        />
      {/each}
    {/if}
  </svg>
</div>
