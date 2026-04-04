<script lang="ts">
  import { onMount } from "svelte";
  import {
    clonePathData,
    downloadFile,
    getAngle,
    getShapeCenter,
    legacyNodesToPathData,
    niceString,
    pathD,
    pointLineDistance,
    type PathData,
    type Point,
  } from "../lib/utils";
  import { shapeTools } from "../lib/shapes";
  import {
    cubicPoint,
    segmentControls,
    curveDistance,
    segmentDistance,
    findClosestSegmentIndex,
    splitSegment,
  } from "../lib/geometry";

  type ToolKey = keyof typeof shapeTools;

  type ShapeItem = {
    id: number;
    fill: string;
    stroke: string;
    path: PathData;
    tool?: ToolKey;
    toolParams?: Record<string, any>;
  };

  type HandleSide = "in" | "out";

  function isToolMode(mode: string): mode is ToolKey {
    return mode in shapeTools;
  }

  let toolParams = $state<Record<string, any>>(
    JSON.parse(JSON.stringify(shapeTools.square.defaultParams)),
  );

  function selectTool(key: ToolKey) {
    mode = key;
    toolParams = JSON.parse(JSON.stringify(shapeTools[key].defaultParams));
  }

  function setToolParam(name: string, value: number) {
    toolParams = {
      ...toolParams,
      [name]: value,
    };
  }

  let svgEl: SVGSVGElement;
  let _svg: SVGSVGElement | null = null;
  let _path: SVGPathElement | null = null;
  let mode = $state("edit");
  let shift = false;

  let shapes = $state<ShapeItem[]>([]);
  let nextID = 0;

  let selectedShape = $state<ShapeItem | null>(null);
  let selectedSegmentIndex = $state<number | null>(null);
  let selectedHandle = $state<HandleSide | null>(null);
  let shapeStart = $state<Point | null>(null);
  let tempShape = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  let dragOffset = { x: 0, y: 0 };
  let box: any = $derived(
    selectedShape ? getBoundingBox(selectedShape.path, false, 0) : defaultBox(),
  );

  let fillColor = $state("#92e85d");
  let strokeColor = $state("#74b94a");

  const PREVIEW_START = { x: 10, y: 10 };
  const PREVIEW_END = { x: 90, y: 90 };

  function defaultBox() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };
  }

  function pointerPos(event: MouseEvent | any): Point {
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgPoint = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  function selectShape(shape: ShapeItem, event?: MouseEvent) {
    const p = event ? pointerPos(event) : getShapeCenter(shape.path);
    selectedShape = shape;
    selectedSegmentIndex = null;
    selectedHandle = null;
    currentRotationAngle = -Math.PI / 2;
    dragOffset.x = p.x - getShapeCenter(shape.path).x;
    dragOffset.y = p.y - getShapeCenter(shape.path).y;
    event?.stopPropagation?.();
  }

  function selectNode(shape: ShapeItem, index: number, event: MouseEvent) {
    const p = pointerPos(event);
    const node = shape.path.segments[index];
    selectedShape = shape;
    selectedSegmentIndex = index;
    selectedHandle = null;
    dragOffset.x = p.x - node.x;
    dragOffset.y = p.y - node.y;
    event.stopPropagation();
  }

  function selectHandle(
    shape: ShapeItem,
    index: number,
    which: HandleSide,
    event: MouseEvent,
  ) {
    const node = shape.path.segments[index];
    const handle = which === "out" ? node.handleOut : node.handleIn;
    if (!handle) return;

    const p = pointerPos(event);
    selectedShape = shape;
    selectedSegmentIndex = index;
    selectedHandle = which;
    dragOffset.x = p.x - handle.x;
    dragOffset.y = p.y - handle.y;
    event.stopPropagation();
  }

  let canDrag = false;

  let transformMode: "scale" | "rotate" | null = null;
  let transformStart = {
    pointer: null as Point | null,
    path: null as PathData | null,
    bounds: null as any,
    angle: 0,
    center: null as Point | null,
    scaleHandleIndex: null as number | null,
  };
  let currentRotationAngle = 0;
  let mousePos = { x: 0, y: 0 };

  function drag(event: MouseEvent) {
    const pointer = pointerPos(event);
    mousePos = pointer;

    if (shapeStart && shapeTools[mode as keyof typeof shapeTools]) {
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

    if (selectedShape) {
      if (transformMode === "scale" && transformStart.pointer && transformStart.path && transformStart.bounds && transformStart.scaleHandleIndex !== null) {
        scaleShape(pointer, transformStart.scaleHandleIndex);
        return;
      }
      if (transformMode === "rotate") {
        rotateShape(pointer);
        return;
      }
    }

    if (selectedShape && selectedSegmentIndex !== null) {
      const path = selectedShape.path;
      const node = path.segments[selectedSegmentIndex];
      if (!node) return;

      const newX = pointer.x - dragOffset.x;
      const newY = pointer.y - dragOffset.y;

      if (selectedHandle) {
        if (selectedHandle === "out") {
          node.handleOut = { x: newX, y: newY };
          if (!shift && node.handleIn) {
            node.handleIn = {
              x: node.x - (newX - node.x),
              y: node.y - (newY - node.y),
            };
          }
        } else {
          node.handleIn = { x: newX, y: newY };
          if (!shift && node.handleOut) {
            node.handleOut = {
              x: node.x - (newX - node.x),
              y: node.y - (newY - node.y),
            };
          }
        }
      } else {
        const dx = newX - node.x;
        const dy = newY - node.y;
        node.x += dx;
        node.y += dy;
        if (node.handleIn) {
          node.handleIn.x += dx;
          node.handleIn.y += dy;
        }
        if (node.handleOut) {
          node.handleOut.x += dx;
          node.handleOut.y += dy;
        }
      }
      return;
    }

    if (selectedShape) {
      const center = getShapeCenter(selectedShape.path);
      const targetX = pointer.x - dragOffset.x;
      const targetY = pointer.y - dragOffset.y;
      const dx = targetX - center.x;
      const dy = targetY - center.y;

      for (const segment of selectedShape.path.segments) {
        segment.x += dx;
        segment.y += dy;
        if (segment.handleIn) {
          segment.handleIn.x += dx;
          segment.handleIn.y += dy;
        }
        if (segment.handleOut) {
          segment.handleOut.x += dx;
          segment.handleOut.y += dy;
        }
      }
    }
  }

  function release() {
    selectedShape = null;
    selectedSegmentIndex = null;
    selectedHandle = null;
    transformMode = null;
    transformStart = {
      pointer: null,
      path: null,
      bounds: null,
      angle: 0,
      center: null,
      scaleHandleIndex: null,
    };
    canDrag = false;
  }

  function startScaling(handleIndex: number, event: MouseEvent) {
    if (!selectedShape) return;

    canDrag = true;
    transformMode = "scale";
    transformStart.pointer = pointerPos(event);
    transformStart.path = clonePathData(selectedShape.path);
    transformStart.bounds = getBoundingBox(selectedShape.path);
    transformStart.scaleHandleIndex = handleIndex;
    event.stopPropagation();
  }

  function startRotation(event: MouseEvent) {
    if (!selectedShape) return;

    transformMode = "rotate";
    canDrag = true;
    transformStart.center = getShapeCenter(selectedShape.path);
    transformStart.angle = getAngle(transformStart.center, pointerPos(event));
    transformStart.path = clonePathData(selectedShape.path);
    event.stopPropagation();
  }

  function scaleShape(pointer: Point, handleIndex: number) {
    if (!selectedShape || !transformStart.pointer || !transformStart.path || !transformStart.bounds) return;

    const initialBox = transformStart.bounds;
    let fx = 0;
    let fy = 0;

    switch (handleIndex) {
      case 0:
        fx = initialBox.xMax;
        fy = initialBox.yMax;
        break;
      case 1:
        fx = initialBox.xMin;
        fy = initialBox.yMax;
        break;
      case 2:
        fx = initialBox.xMin;
        fy = initialBox.yMin;
        break;
      case 3:
        fx = initialBox.xMax;
        fy = initialBox.yMin;
        break;
      default:
        return;
    }

    let sx = (pointer.x - fx) / (transformStart.pointer.x - fx || 1);
    let sy = (pointer.y - fy) / (transformStart.pointer.y - fy || 1);

    if (shift) {
      const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
      sx = s;
      sy = s;
    }

    selectedShape.path.segments.forEach((segment, i) => {
      const orig = transformStart.path.segments[i];
      if (!orig) return;

      segment.x = fx + (orig.x - fx) * sx;
      segment.y = fy + (orig.y - fy) * sy;

      if (orig.handleIn) {
        segment.handleIn = {
          x: fx + (orig.handleIn.x - fx) * sx,
          y: fy + (orig.handleIn.y - fy) * sy,
        };
      } else {
        segment.handleIn = null;
      }

      if (orig.handleOut) {
        segment.handleOut = {
          x: fx + (orig.handleOut.x - fx) * sx,
          y: fy + (orig.handleOut.y - fy) * sy,
        };
      } else {
        segment.handleOut = null;
      }
    });
  }

  function rotateShape(pointer: Point) {
    if (!selectedShape || !transformStart.center || !transformStart.path) return;

    const rotationCenter = transformStart.center;
    const initialAngle = transformStart.angle;
    const currentAngle = getAngle(rotationCenter, pointer);
    let delta = currentAngle - initialAngle;

    if (shift) {
      const snap = Math.PI / 4;
      delta = Math.round(delta / snap) * snap;
    }

    const cos = Math.cos(delta);
    const sin = Math.sin(delta);

    selectedShape.path.segments.forEach((seg, i) => {
      const orig = transformStart.path!.segments[i];

      function rotatePoint(p: Point): Point {
        const dx = p.x - rotationCenter.x;
        const dy = p.y - rotationCenter.y;
        return {
          x: rotationCenter.x + dx * cos - dy * sin,
          y: rotationCenter.y + dx * sin + dy * cos,
        };
      }

      const rotated = rotatePoint(orig);
      seg.x = rotated.x;
      seg.y = rotated.y;

      if (orig.handleIn) seg.handleIn = rotatePoint(orig.handleIn);
      else seg.handleIn = null;

      if (orig.handleOut) seg.handleOut = rotatePoint(orig.handleOut);
      else seg.handleOut = null;
    });

    currentRotationAngle = currentAngle;
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

  function isPointOnShapeBorder(shape: ShapeItem, point: Point) {
    const d = pathD(shape.path);
    if (!d) return false;

    if (!_path) return false;

    _path.setAttribute("d", d);
    _path.setAttribute("fill", "none");
    _path.setAttribute("stroke", "black");
    _path.setAttribute("stroke-width", "10");

    const testPoint = svgEl.createSVGPoint();
    testPoint.x = point.x;
    testPoint.y = point.y;
    return _path.isPointInStroke(testPoint);
  }

  function addNodeOnBorder(shape: ShapeItem, point: Point) {
    const index = findClosestSegmentIndex(shape.path, point);
    return splitSegment(shape.path, index, 0.5);
  }

  function getBoundingBox(pathLike: any, bboxString = false, margin = 2) {
    const fail = bboxString
      ? "0 0 0 0"
      : { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };

    if (!pathLike || !_path) return fail;

    const d = pathD(pathLike);
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

  function loadButton() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event: any) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const loaded = JSON.parse(text);
        if (!Array.isArray(loaded)) throw new Error("Invalid format");

        const normalized = loaded.map((item, index) => {
          const id = Number.isFinite(item?.id) ? item.id : index;
          if (item?.path?.segments) {
            return {
              id,
              fill: item.fill ?? fillColor,
              stroke: item.stroke ?? strokeColor,
              path: clonePathData(item.path),
            } satisfies ShapeItem;
          }
          if (item?.segments) {
            return {
              id,
              fill: item.fill ?? fillColor,
              stroke: item.stroke ?? strokeColor,
              path: clonePathData(item),
            } satisfies ShapeItem;
          }
          if (Array.isArray(item?.nodes)) {
            return {
              id,
              fill: item.fill ?? fillColor,
              stroke: item.stroke ?? strokeColor,
              path: legacyNodesToPathData(item),
            } satisfies ShapeItem;
          }
          throw new Error(`Unsupported shape at index ${index}`);
        });

        shapes = normalized;
        nextID = normalized.reduce((max, item) => Math.max(max, item.id), -1) + 1;
        release();
      } catch (err: any) {
        alert("Invalid JSON: " + (err?.message ?? String(err)));
      }
    };

    input.click();
  }

  function cloneSvgEl({ fit = true }: { fit?: boolean }) {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll(".wb").forEach(el => el.remove());

    let bbox: { width: number; height: number; x: number; y: number } | undefined;
    if (fit === true) {
      bbox = svgEl.getBBox();
      const width = Math.max(1, bbox.width);
      const height = Math.max(1, bbox.height);
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${width} ${height}`);
    }

    return { element: clone, bbox };
  }

  function downloadSVG() {
    const { element: clone } = cloneSvgEl({ fit: true });
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);

    downloadFile({
      filename: "image.svg",
      source,
      type: "image/svg+xml;charset=utf-8",
    });
  }

  function downloadPNG() {
    const { element: clone, bbox } = cloneSvgEl({ fit: true });
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);

    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const width = Math.max(1, Math.ceil(bbox?.width ?? img.width ?? 1));
      const height = Math.max(1, Math.ceil(bbox?.height ?? img.height ?? 1));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
      }

      canvas.toBlob(blob => {
        if (!blob) return;
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

  let dragSrcIndex: number | null = null;
  function handleDragStart(event: DragEvent, index: number) {
    dragSrcIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const from = dragSrcIndex;
    if (from === null) return;

    const reversed = [...shapes].reverse();
    const moved = reversed.splice(from, 1)[0];
    reversed.splice(index, 0, moved);
    shapes = reversed.reverse();
    dragSrcIndex = null;
  }

  function shapePreviewMarkup(key: string) {
    const def = shapeTools[key as ToolKey];
    if (!def) return "";

    const path = def.createPathData(
      PREVIEW_START,
      PREVIEW_END,
      JSON.parse(JSON.stringify(def.defaultParams)),
    );

    return `<path d="${pathD(path)}" class="previewShape" />`;
  }

  function createShapeFromMode(start: Point, end: Point) {
    if (!isToolMode(mode)) return null;

    const def = shapeTools[mode];
    const path = def.createPathData(start, end, toolParams);

    return {
      id: nextID++,
      fill: fillColor,
      stroke: strokeColor,
      path,
      tool: mode,
      toolParams: JSON.parse(JSON.stringify(toolParams)),
    } satisfies ShapeItem;
  }

  function getRotationHandle() {
    if (!selectedShape) return null;

    const center = getShapeCenter(selectedShape.path);

    if (transformMode === "rotate" && mousePos) {
      return {
        cx: mousePos.x,
        cy: mousePos.y,
        center,
      };
    }

    const dist = Math.max(box.width, box.height) / 2 + 30;
    const angle = currentRotationAngle;

    return {
      cx: center.x + Math.cos(angle) * dist,
      cy: center.y + Math.sin(angle) * dist,
      center,
    };
  }

  onMount(() => {
    _svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    _svg.style.position = "absolute";
    _svg.style.visibility = "hidden";
    _svg.style.pointerEvents = "none";
    _svg.style.width = "0";
    _svg.style.height = "0";
    document.body.appendChild(_svg);

    _path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    _svg.appendChild(_path);

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
</script>

<div class="wrapper top horizontal spacious">
  <div class="horizontal">
    <p>Fill</p>
    <input
      type="color"
      value={fillColor}
      onchange={e => (fillColor = (e.currentTarget as HTMLInputElement).value)}
    />
    <p>Stroke</p>
    <input
      type="color"
      value={strokeColor}
      onchange={e => (strokeColor = (e.currentTarget as HTMLInputElement).value)}
    />
  </div>
  {#if isToolMode(mode) && shapeTools[mode].controls}
    <div class="horizontal">
      {#each Object.entries(shapeTools[mode].controls!) as [name, control]}
        <label class="tool-control">
          <span>{niceString(name)}</span>
          <input
            type="number"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={toolParams[name] ?? shapeTools[mode].defaultParams[name]}
            oninput={e =>
              setToolParam(name, Number((e.currentTarget as HTMLInputElement).value))}
          />
        </label>
      {/each}
    </div>
  {/if}
  <div class="horizontal">
    <button
      onclick={() => {
        shapes = [];
        release();
        nextID = 0;
      }}
    >
      New File
    </button>
    <button
      onclick={() => {
        downloadFile({
          source: JSON.stringify($state.snapshot(shapes)),
          type: "application/json",
          filename: "shapes.json",
        });
      }}
    >
      Save
    </button>
    <button onclick={loadButton}>Load</button>
  </div>
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
        if (!selectedShape) return;
        shapes = shapes.filter(shape => shape.id !== selectedShape!.id);
        release();
      }}
    >
      <img src="/trash.svg" alt="delete" />
    </button>
  </div>

  <p>Shapes</p>
  <div class="grid">
    {#each Object.entries(shapeTools) as [key, def]}
      <button class="shapeButton" onclick={() => selectTool(key as ToolKey)} title={key}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          {@html shapePreviewMarkup(key)}
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
      class={selectedShape === shape ? "shape-preview selected" : "shape-preview"}
      draggable="true"
      ondragstart={e => handleDragStart(e, i)}
      ondragover={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      ondrop={e => handleDrop(e, i)}
    >
      {#key shape.id}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          viewBox={getBoundingBox(shape.path, true) as string}
          onmousedown={() => {
            selectedShape = shape;
            selectedSegmentIndex = null;
            selectedHandle = null;
          }}
        >
          <path
            d={pathD(shape.path)}
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
  onmousemove={event => drag(event)}
  onmousedown={event => {
    const p = pointerPos(event);

    if (!shapeStart && shapeTools[mode as keyof typeof shapeTools]) {
      shapeStart = p;
      tempShape = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }

    if (event.target === svgEl) {
      release();
    } else {
      canDrag = true;
      transformMode = null;
    }
  }}
onmouseup={() => {
      if (shapeStart && tempShape) {
        const end = { x: tempShape.x2, y: tempShape.y2 };
        const newShape = createShapeFromMode(shapeStart, end);
        if (newShape) {
          shapes.push(newShape);
        }
        shapeStart = null;
        tempShape = null;
      }

      canDrag = false;
      transformMode = null;
    }}
>
  {#each shapes as shape}
    <path
      d={pathD(shape.path)}
      fill={shape.fill}
      stroke={shape.stroke}
      stroke-width="2"
onmousedown={e => {
          canDrag = true;
          transformMode = null;
          selectShape(shape, e);

        const p = pointerPos(e);
        if (mode === "edit" && isPointOnShapeBorder(shape, p)) {
          const insertedIndex = addNodeOnBorder(shape, p);
          selectedShape = shape;
          selectedSegmentIndex = insertedIndex;
          selectedHandle = null;
          dragOffset = { x: 0, y: 0 };
        } else if (mode === "paint") {
          shape.fill = fillColor;
          shape.stroke = strokeColor;
        }
      }}
      onmouseup={() => (canDrag = false)}
    />

    {#if mode === "edit" && selectedShape === shape}
      {#each shape.path.segments as segment, index}
        {#if segment.handleIn}
          <line
            x1={segment.x}
            y1={segment.y}
            x2={segment.handleIn.x}
            y2={segment.handleIn.y}
            class="wb"
          />
          <circle
            cx={segment.handleIn.x}
            cy={segment.handleIn.y}
            r="5"
            class="wb"
            onmousedown={e => {
              canDrag = true;
              selectHandle(shape, index, "in", e);
            }}
            onmouseup={() => {
              canDrag = false;
            }}
          />
        {/if}

        {#if segment.handleOut}
          <line
            x1={segment.x}
            y1={segment.y}
            x2={segment.handleOut.x}
            y2={segment.handleOut.y}
            class="wb"
          />
          <circle
            cx={segment.handleOut.x}
            cy={segment.handleOut.y}
            r="5"
            class="wb"
            onmousedown={e => {
              canDrag = true;
              selectHandle(shape, index, "out", e);
            }}
            onmouseup={() => {
              canDrag = false;
            }}
          />
        {/if}

        <circle
          cx={segment.x}
          cy={segment.y}
          r="6"
          class="wb red"
          onmousedown={e => {
            canDrag = true;
            transformMode = null;
            selectNode(shape, index, e);
          }}
          onmouseup={() => (canDrag = false)}
        />
      {/each}
    {/if}
  {/each}

  {#if mode === "transform" && selectedShape}
    {@const rot = getRotationHandle()}

    {#if rot}
      <circle
        cx={rot.cx}
        cy={rot.cy}
        r="6"
        class="wb"
        style="cursor: grab"
        onmousedown={startRotation}
        onmouseup={() => (transformMode = null)}
      />
    {/if}

    {#each [{ x: box.xMin, y: box.yMin, cursor: "nwse-resize" }, { x: box.xMax, y: box.yMin, cursor: "nesw-resize" }, { x: box.xMax, y: box.yMax, cursor: "nwse-resize" }, { x: box.xMin, y: box.yMax, cursor: "nesw-resize" }] as handle, i}
      <rect
        x={handle.x - 5}
        y={handle.y - 5}
        width="10"
        height="10"
        class="wb"
        style={`cursor: ${handle.cursor}`}
        onmousedown={e => startScaling(i, e)}
        onmouseup={() => ((canDrag = false), (transformMode = null))}
      />
    {/each}
  {/if}

  {#if tempShape && isToolMode(mode)}
    <path
      d={pathD(
        shapeTools[mode].createPathData(
          { x: tempShape.x1, y: tempShape.y1 },
          { x: tempShape.x2, y: tempShape.y2 },
          toolParams,
        ),
      )}
      class="previewShape"
    />
  {/if}
</svg>
