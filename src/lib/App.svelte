<script lang="ts">
  import { onMount } from "svelte";
  import {
    downloadFile,
    getShapeCenter,
    pathD,
    pointLineDistance,
  } from "../lib/utils";
  import { shapeDefs } from "../lib/shapes.js";

  let svgEl: SVGSVGElement;
  let mode = $state("edit");
  let shift = false;

  let shapes = $state([]);
  let nextID = 0;

  let selectedShape = $state(null);
  let selectedNode = null;
  let selectedHandle = null;
  let shapeStart = $state(null);
  let tempShape = $state(null);

  let dragOffset = { x: 0, y: 0 };
  let box = $derived(getBoundingBox(selectedShape, false, 0) as any);

  let fillColor = $state("#92e85d"),
    strokeColor = $state("#74b94a");

  function pointerPos(event) {
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;

    const svgPoint = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  function selectShape(shape, event) {
    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = null;
    selectedHandle = null;
    const center = getShapeCenter(shape);
    dragOffset.x = p.x - center.x;
    dragOffset.y = p.y - center.y;
    event?.stopPropagation?.();
  }

  function selectNode(shape, node, event) {
    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = node;
    selectedHandle = null;
    dragOffset.x = p.x - node.x;
    dragOffset.y = p.y - node.y;
    event?.stopPropagation?.();
  }

  function selectHandle(shape, node, which, event) {
    const handle = which === "out" ? node.handleOut : node.handleIn;
    if (!handle) return;

    const p = pointerPos(event);
    selectedShape = shape;
    selectedNode = node;
    selectedHandle = which;
    dragOffset.x = p.x - handle.x;
    dragOffset.y = p.y - handle.y;
    event?.stopPropagation?.();
  }

  let canDrag = false;
  function drag(event) {
    const pointer = pointerPos(event);

    if (Object.keys(shapeDefs).includes(mode) && shapeStart) {
      let x2 = pointer.x;
      let y2 = pointer.y;

      if (shift) {
        const dx = x2 - shapeStart.x;
        const dy = y2 - shapeStart.y;

        const size = Math.max(Math.abs(dx), Math.abs(dy));

        x2 = shapeStart.x + Math.sign(dx || 1) * size;
        y2 = shapeStart.y + Math.sign(dy || 1) * size;
      }

      tempShape = {
        x1: shapeStart.x,
        y1: shapeStart.y,
        x2,
        y2,
      };
    }

    if (!canDrag) return;

    if (scalingHandle !== null && selectedShape) {
      scaleShape(pointer);
      return;
    }

    if (selectedHandle && selectedNode) {
      const which = selectedHandle;
      const moved =
        which === "out" ? selectedNode.handleOut : selectedNode.handleIn;

      if (!moved) return;

      const newX = pointer.x - dragOffset.x;
      const newY = pointer.y - dragOffset.y;

      if (which === "out") {
        selectedNode.handleOut.x = newX;
        selectedNode.handleOut.y = newY;

        if (!shift && selectedNode.handleIn) {
          selectedNode.handleIn.x = selectedNode.x - (newX - selectedNode.x);
          selectedNode.handleIn.y = selectedNode.y - (newY - selectedNode.y);
        }
      } else {
        selectedNode.handleIn.x = newX;
        selectedNode.handleIn.y = newY;

        if (!shift && selectedNode.handleOut) {
          selectedNode.handleOut.x = selectedNode.x - (newX - selectedNode.x);
          selectedNode.handleOut.y = selectedNode.y - (newY - selectedNode.y);
        }
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

  const _svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  _svg.style.position = "absolute";
  _svg.style.visibility = "hidden";
  _svg.style.pointerEvents = "none";
  _svg.style.width = "0";
  _svg.style.height = "0";
  document.body.appendChild(_svg);

  const _path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  _svg.appendChild(_path);

  function getBoundingBox(shape, bboxString = false, margin = 2) {
    let fail = bboxString
      ? "0 0 0 0"
      : { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };
    if (!shape || !_path) return fail;

    const d = pathD(shape);
    if (d && d.trim() !== "") {
      _path.setAttribute("d", d);
      const bbox = _path.getBBox();

      const xMin = bbox.x - margin;
      const yMin = bbox.y - margin;
      const width = bbox.width + margin * 2;
      const height = bbox.height + margin * 2;
      const xMax = xMin + width;
      const yMax = yMin + height;

      return bboxString
        ? `${xMin} ${yMin} ${width} ${height}`
        : { xMin, xMax, yMin, yMax, width, height };
    }

    return fail;
  }

  let scalingHandle = null;
  let initialMouse = null;
  let initialNodes = null;
  let initialBox = null;

  function startScaling(handleIndex, event) {
    if (!selectedShape) return;

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
    event?.stopPropagation?.();
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

    let sx = (pointer.x - fx) / (initialMouse.x - fx);
    let sy = (pointer.y - fy) / (initialMouse.y - fy);

    if (shift) {
      const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
      sx = sy = s;
    }

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

  function resizeSVG() {
    const ASPECT_RATIO = 800 / 600;
    let width = Math.min(document.documentElement.clientWidth, 800);
    let height = Math.min(document.documentElement.clientHeight, 600);

    if (width / height > ASPECT_RATIO) {
      width = height * ASPECT_RATIO;
    } else {
      height = width / ASPECT_RATIO;
    }

    svgEl.style.width = width - 10 + "px";
    svgEl.style.height = height - 10 + "px";
  }

  onMount(() => {
    syncHandles();
    resizeSVG();

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shift = true;
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === "Shift") shift = false;
    };

    window.addEventListener("resize", resizeSVG);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);

    return () => {
      window.removeEventListener("resize", resizeSVG);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  });

  function loadButton() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event: any) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const loadedShapes = JSON.parse(text);

        if (!Array.isArray(loadedShapes)) throw new Error("Invalid format");

        shapes = loadedShapes;

        release();
        syncHandles();
      } catch (err) {
        alert("Invalid JSON: " + err.message);
      }
    };

    input.click();
  }

  function cloneSvgEl({ fit = false }) {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone
      .querySelectorAll(".wb")
      .forEach((el: { remove: () => any }) => el.remove());

    let bbox: { width: any; height: any; x: any; y: any };
    if (fit === true) {
      bbox = svgEl.getBBox();
      clone.setAttribute("width", bbox.width);
      clone.setAttribute("height", bbox.height);
      clone.setAttribute(
        "viewBox",
        `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`
      );
    }

    return { element: clone, bbox };
  }

  function downloadSVG() {
    const clone = cloneSvgEl({ fit: false }).element;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);

    downloadFile({
      filename: "image.svg",
      source,
      type: "image/svg+xml;charset=utf-8",
    });
  }

  function downloadPNG() {
    const { element: clone, bbox } = cloneSvgEl({ fit: false });
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);

    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = bbox.width;
      canvas.height = bbox.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);

      canvas.toBlob((blob) => {
        downloadFile({
          filename: "image.png",
          source: blob,
          type: "image/png",
        });
      }, "image/png");

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  let dragSrcIndex = null;
  function handleDragStart(event, index) {
    dragSrcIndex = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", index);
  }

  function handleDrop(event, index) {
    event.preventDefault();
    const from = dragSrcIndex;
    if (from === null) return;

    const reversed = [...shapes].reverse();
    const moved = reversed.splice(from, 1)[0];
    reversed.splice(index, 0, moved);
    shapes = reversed.reverse();
    dragSrcIndex = null;
  }

  function isPointOnShapeBorder(shape, point) {
    function pointSVG(point) {
      const pt = svgEl.createSVGPoint();
      pt.x = point.x;
      pt.y = point.y;
      return pt;
    }

    const d = pathD(shape);
    _path.setAttribute("d", d);
    _path.setAttribute("stroke-width", "5");
    return (
      _path.isPointInStroke(
        svgEl.createSVGPoint().matrixTransform(svgEl.getScreenCTM().inverse())
      ) || _path.isPointInStroke(pointSVG(point))
    );
  }

  function addNodeOnBorder(shape, point) {
    let bestIndex = 0;
    let minDist = Infinity;

    for (let i = 0; i < shape.nodes.length; i++) {
      const curr = shape.nodes[i];
      const next = shape.nodes[(i + 1) % shape.nodes.length];
      const dist = pointLineDistance(point, curr, next);
      if (dist < minDist) {
        minDist = dist;
        bestIndex = i + 1;
      }
    }

    const prev =
      shape.nodes[(bestIndex - 1 + shape.nodes.length) % shape.nodes.length];
    const next = shape.nodes[bestIndex % shape.nodes.length];

    const type =
      prev.type === next.type ? prev.type : prev.type || next.type || "rect";
    const newNode = { x: point.x, y: point.y, type };
    shape.nodes.splice(bestIndex, 0, newNode);

    syncHandles();
  }
</script>

<div class="wrapper top horizontal">
  <p>Fill</p>
  <input
    type="color"
    value={fillColor}
    onchange={(e) => (fillColor = e.currentTarget.value)}
  />
  <p>Stroke</p>
  <input
    type="color"
    value={strokeColor}
    onchange={(e) => (strokeColor = e.currentTarget.value)}
  />
  <button
    onclick={() => {
      shapes = [];
      release();
    }}>New File</button
  >
  <button
    onclick={() => {
      downloadFile({
        source: JSON.stringify($state.snapshot(shapes)),
        type: "application/json",
        filename: "shapes.json",
      });
    }}>Save</button
  >
  <button onclick={loadButton}>Load</button>
</div>

<div class="wrapper left">
  <p>Tools</p>
  <div class="grid">
    <button onclick={() => (mode = "edit")}>
      <img src="/edit.svg" alt="Edit" />
    </button>
    <button onclick={() => (mode = "transform")}>
      <img src="/scale.svg" alt="Transform" />
    </button>
    <button onclick={() => (mode = "paint")}>
      <img src="/paintbrush.svg" alt="Paint" />
    </button>
    <button
      disabled={!selectedShape}
      onclick={() => {
        if (!selectedShape) {
          alert("Select a shape first");
          return;
        }

        let index = shapes.findIndex((s) => s.id === selectedShape.id);
        if (index !== -1) {
          shapes.splice(index, 1);
          selectedShape = null;
        }
      }}
    >
      <img src="/trash.svg" alt="delete" />
    </button>
  </div>
  <p>Shapes</p>
  <div class="grid">
    {#each Object.entries(shapeDefs) as [key, def]}
      <button class="shapeButton" onclick={() => (mode = key)} title={key}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          {@html def.preview({ x: 10, y: 10 }, { x: 90, y: 90 })}
        </svg>
      </button>
    {/each}
  </div>
</div>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wrapper right">
  {#each [...shapes].reverse() as shape, i (shape.id)}
    <div
      class={selectedShape === shape
        ? "shape-preview selected"
        : "shape-preview"}
      draggable="true"
      ondragstart={(e) => handleDragStart(e, i)}
      ondragover={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      ondrop={(e) => handleDrop(e, i)}
    >
      {#key shape.id}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          viewBox={getBoundingBox(shape, true) as string}
          onmousedown={() => {
            selectedShape = shape;
            selectedNode = null;
            selectedHandle = null;
          }}
        >
          <path
            d={pathD(shape)}
            fill={shape.fill}
            stroke={shape.stroke}
            stroke-width="2"
          />
        </svg>
      {/key}
    </div>
  {/each}
</div>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  viewBox="0 0 800 600"
  width="800"
  height="600"
  role="application"
  aria-label="SVG editor"
  onmousemove={(event) => drag(event)}
  onmousedown={(event) => {
    const p = pointerPos(event);

    if (!shapeStart && Object.keys(shapeDefs).includes(mode)) {
      shapeStart = p;
      tempShape = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }

    if (event.target === svgEl) release();
    else {
      canDrag = true;
      scalingHandle = null;
    }
  }}
  onmouseup={(e) => {
    if (shapeStart) {
      const end = { x: tempShape.x2, y: tempShape.y2 };
      const def = shapeDefs[mode];
      if (def) {
        const nodes = def.create(shapeStart, end);
        shapes.push({
          id: nextID++,
          fill: fillColor,
          stroke: strokeColor,
          nodes,
        });
      }

      shapeStart = null;
      tempShape = null;
      syncHandles();
    }

    canDrag = false;
  }}
  onmouseleave={() => {
    canDrag = false;
    scalingHandle = null;
    shapeStart = null;
    tempShape = null;
  }}
>
  {#each shapes as shape}
    <path
      d={pathD(shape)}
      fill={shape.fill}
      stroke={shape.stroke}
      stroke-width="2"
      onmousedown={(e) => {
        canDrag = true;
        scalingHandle = null;
        selectShape(shape, e);

        const p = pointerPos(e);

        if (mode === "edit" && isPointOnShapeBorder(shape, p)) {
          addNodeOnBorder(shape, p);
        } else if (mode === "paint") {
          shape.fill = fillColor;
          shape.stroke = strokeColor;
        }
      }}
      onmouseup={() => (canDrag = false)}
    />

    {#if mode === "edit"}
      {#each shape.nodes as node}
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
              class="wb"
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
    {/if}
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

  {#if tempShape}
    {@html shapeDefs[mode]?.preview(
      { x: tempShape.x1, y: tempShape.y1 },
      { x: tempShape.x2, y: tempShape.y2 }
    )}
  {/if}
</svg>
