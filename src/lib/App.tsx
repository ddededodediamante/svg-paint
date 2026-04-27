import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import {
  clonePathData,
  downloadFile,
  getAngle,
  getShapeCenter,
  legacyNodesToPathData,
  niceString,
  pathD,
  PathData,
  Point,
} from "../lib/utils";
import { shapeTools } from "../lib/shapes";
import { findClosestSegmentIndex, splitSegment } from "../lib/geometry";
import { DropdownButton } from "./components/DropdownButton";

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

type BoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
};

function isToolMode(mode: string): mode is ToolKey {
  return mode in shapeTools;
}

export default function App() {
  const [toolParams, setToolParams] = useState<Record<string, any>>(
    JSON.parse(JSON.stringify(shapeTools.square.defaultParams)),
  );
  const [mode, setMode] = useState("edit");
  const [shift, setShift] = useState(false);
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [nextID, setNextID] = useState(0);
  const [selectedShape, setSelectedShape] = useState<ShapeItem | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<HandleSide | null>(null);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [tempShape, setTempShape] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [fillColor, setFillColor] = useState("#92e85d");
  const [strokeColor, setStrokeColor] = useState("#74b94a");
  const [canDrag, setCanDrag] = useState(false);
  const [transformMode, setTransformMode] = useState<"scale" | "rotate" | null>(null);
  const [transformStart, setTransformStart] = useState<{
    pointer: Point | null;
    path: PathData | null;
    bounds: any;
    angle: number;
    center: Point | null;
    scaleHandleIndex: number | null;
  }>({
    pointer: null,
    path: null,
    bounds: null,
    angle: 0,
    center: null,
    scaleHandleIndex: null,
  });
  const [currentRotationAngle, setCurrentRotationAngle] = useState(0);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [dragSrcIndex, setDragSrcIndex] = useState<number | null>(null);

  const svgElRef = useRef<SVGSVGElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  const dragOffset = useRef({ x: 0, y: 0 });

  const PREVIEW_START = { x: 10, y: 10 };
  const PREVIEW_END = { x: 90, y: 90 };

  function defaultBox() {
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };
  }

  const box: BoundingBox = useMemo(
    () =>
      selectedShape
        ? (getBoundingBox(selectedShape.path, false, 0) as any)
        : defaultBox(),
    [selectedShape],
  );

  function selectTool(key: ToolKey) {
    setMode(key);
    setToolParams(JSON.parse(JSON.stringify(shapeTools[key].defaultParams)));
  }

  function setToolParam(name: string, value: number) {
    setToolParams(prev => ({ ...prev, [name]: value }));
  }

  function pointerPos(event: MouseEvent): Point {
    const svgEl = svgElRef.current;
    if (!svgEl) return { x: 0, y: 0 };
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPoint = pt.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  }

  function selectShapeItem(shape: ShapeItem, event?: MouseEvent) {
    const p = event ? pointerPos(event) : getShapeCenter(shape.path);
    setSelectedShape(shape);
    setSelectedSegmentIndex(null);
    setSelectedHandle(null);
    setCurrentRotationAngle(-Math.PI / 2);
    dragOffset.current = {
      x: p.x - getShapeCenter(shape.path).x,
      y: p.y - getShapeCenter(shape.path).y,
    };
    event?.stopPropagation?.();
  }

  function selectNode(shape: ShapeItem, index: number, event: MouseEvent) {
    const p = pointerPos(event);
    const node = shape.path.segments[index];
    setSelectedShape(shape);
    setSelectedSegmentIndex(index);
    setSelectedHandle(null);
    dragOffset.current = { x: p.x - node.x, y: p.y - node.y };
    event.stopPropagation();
  }

  function selectHandleItem(
    shape: ShapeItem,
    index: number,
    which: HandleSide,
    event: MouseEvent,
  ) {
    const node = shape.path.segments[index];
    const handle = which === "out" ? node.handleOut : node.handleIn;
    if (!handle) return;

    const p = pointerPos(event);
    setSelectedShape(shape);
    setSelectedSegmentIndex(index);
    setSelectedHandle(which);
    dragOffset.current = { x: p.x - handle.x, y: p.y - handle.y };
    event.stopPropagation();
  }

  function updateSelectedPath(newSegments: PathData["segments"]) {
    if (!selectedShape) return;
    const updated = {
      ...selectedShape,
      path: { ...selectedShape.path, segments: newSegments },
    };
    setSelectedShape(updated);
    setShapes(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  }

  function release() {
    setSelectedShape(null);
    setSelectedSegmentIndex(null);
    setSelectedHandle(null);
    setTransformMode(null);
    setTransformStart({
      pointer: null,
      path: null,
      bounds: null,
      angle: 0,
      center: null,
      scaleHandleIndex: null,
    });
    setCanDrag(false);
  }

  function startScaling(handleIndex: number, event: MouseEvent) {
    if (!selectedShape) return;

    setCanDrag(true);
    setTransformMode("scale");
    const pointer = pointerPos(event);
    setTransformStart({
      pointer,
      path: clonePathData(selectedShape.path),
      bounds: getBoundingBox(selectedShape.path),
      angle: 0,
      center: null,
      scaleHandleIndex: handleIndex,
    });
    event.stopPropagation();
  }

  function startRotation(event: MouseEvent) {
    if (!selectedShape) return;

    setTransformMode("rotate");
    setCanDrag(true);
    const center = getShapeCenter(selectedShape.path);
    setTransformStart(prev => ({
      ...prev,
      center,
      angle: getAngle(center, pointerPos(event)),
      path: clonePathData(selectedShape.path),
    }));
    event.stopPropagation();
  }

  function scaleShape(pointer: Point, handleIndex: number) {
    if (!selectedShape || !transformStart.bounds) return;

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

    let sx = (pointer.x - fx) / ((transformStart.pointer?.x ?? fx) - fx || 1);
    let sy = (pointer.y - fy) / ((transformStart.pointer?.y ?? fy) - fy || 1);

    if (shift) {
      const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
      sx = s;
      sy = s;
    }

    const newSegments = selectedShape.path.segments.map((segment, i) => {
      const orig = transformStart.path?.segments[i];
      if (!orig) return segment;

      return {
        x: fx + (orig.x - fx) * sx,
        y: fy + (orig.y - fy) * sy,
        handleIn: orig.handleIn
          ? {
              x: fx + (orig.handleIn.x - fx) * sx,
              y: fy + (orig.handleIn.y - fy) * sy,
            }
          : null,
        handleOut: orig.handleOut
          ? {
              x: fx + (orig.handleOut.x - fx) * sx,
              y: fy + (orig.handleOut.y - fy) * sy,
            }
          : null,
      };
    });

    updateSelectedPath(newSegments);
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

    const newSegments = selectedShape.path.segments.map((seg, i) => {
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
      return {
        x: rotated.x,
        y: rotated.y,
        handleIn: orig.handleIn ? rotatePoint(orig.handleIn) : null,
        handleOut: orig.handleOut ? rotatePoint(orig.handleOut) : null,
      };
    });

    updateSelectedPath(newSegments);
    setCurrentRotationAngle(currentAngle);
  }

  function resizeSVG() {
    const ASPECT_RATIO = 800 / 600;
    const svgEl = svgElRef.current;
    if (!svgEl) return;
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
    const _path = pathRef.current;
    if (!_path) return false;

    _path.setAttribute("d", d);
    _path.setAttribute("fill", "none");
    _path.setAttribute("stroke", "black");
    _path.setAttribute("stroke-width", "10");

    const svgEl = svgElRef.current;
    if (!svgEl) return false;
    const testPoint = svgEl.createSVGPoint();
    testPoint.x = point.x;
    testPoint.y = point.y;
    return _path.isPointInStroke(testPoint);
  }

  function addNodeOnBorder(shape: ShapeItem, point: Point) {
    return splitSegment(shape.path, findClosestSegmentIndex(shape.path, point), 0.5);
  }

  function getBoundingBox(
    pathLike: any,
    bboxString = false,
    margin = 2,
  ): object | string {
    const fail = bboxString
      ? "0 0 0 0"
      : { xMin: 0, xMax: 0, yMin: 0, yMax: 0, width: 0, height: 0 };

    if (!pathLike || !pathRef.current) return fail;

    const d = pathD(pathLike);
    if (d && d.trim() !== "") {
      pathRef.current.setAttribute("d", d);
      const bbox = pathRef.current.getBBox();
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

  const loadButton = () => {
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

        const normalized = loaded.map((item: any, index: number) => {
          const id = Number.isFinite(item?.id) ? item.id : index;
          let path: PathData;
          if (item?.path?.segments) {
            path = clonePathData(item.path);
          } else if (item?.segments) {
            path = clonePathData(item);
          } else if (Array.isArray(item?.nodes)) {
            path = legacyNodesToPathData(item);
          } else {
            throw new Error(`Unsupported shape at index ${index}`);
          }
          return {
            id,
            fill: item.fill ?? fillColor,
            stroke: item.stroke ?? strokeColor,
            path,
          };
        });

        setShapes(normalized);
        setNextID(
          normalized.reduce(
            (max: number, item: ShapeItem) => Math.max(max, item.id),
            -1,
          ) + 1,
        );
        release();
      } catch (err: any) {
        alert("Invalid JSON: " + (err?.message ?? String(err)));
      }
    };

    input.click();
  };

  function cloneSvgEl({ fit = true }: { fit?: boolean }) {
    const svgEl = svgElRef.current;
    if (!svgEl) return { element: null, bbox: undefined };
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
    if (!clone) return;
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
    if (!clone) return;
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

  function handleDragStart(event: DragEvent, index: number) {
    setDragSrcIndex(index);
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
    setShapes(reversed.reverse());
    setDragSrcIndex(null);
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
      id: nextID,
      fill: fillColor,
      stroke: strokeColor,
      path,
      tool: mode,
      toolParams: JSON.parse(JSON.stringify(toolParams)),
    };
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

    const box = getBoundingBox(selectedShape.path) as {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
      width: number;
      height: number;
    };
    const dist = Math.max(box.width, box.height) / 2 + 30;
    const angle = currentRotationAngle;

    return {
      cx: center.x + Math.cos(angle) * dist,
      cy: center.y + Math.sin(angle) * dist,
      center,
    };
  }

  useEffect(() => {
    svgRef.current = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgRef.current.style.position = "absolute";
    svgRef.current.style.visibility = "hidden";
    svgRef.current.style.pointerEvents = "none";
    svgRef.current.style.width = "0";
    svgRef.current.style.height = "0";
    document.body.appendChild(svgRef.current);

    pathRef.current = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svgRef.current.appendChild(pathRef.current);

    resizeSVG();

    const handleResize = () => resizeSVG();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShift(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShift(false);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (svgRef.current) {
        svgRef.current.remove();
      }
    };
  }, []);

  const handleMouseMove = (event: MouseEvent) => {
    const pointer = pointerPos(event);
    setMousePos(pointer);

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

      setTempShape({
        x1: shapeStart.x,
        y1: shapeStart.y,
        x2,
        y2,
      });
    }

    if (!canDrag) return;

    if (selectedShape) {
      if (transformMode === "scale" && transformStart.scaleHandleIndex !== null) {
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

      const newX = pointer.x - dragOffset.current.x;
      const newY = pointer.y - dragOffset.current.y;

      if (selectedHandle) {
        const newSegments = [...path.segments];
        if (selectedHandle === "out") {
          newSegments[selectedSegmentIndex] = {
            ...node,
            handleOut: { x: newX, y: newY },
            handleIn:
              !shift && node.handleIn
                ? { x: node.x - (newX - node.x), y: node.y - (newY - node.y) }
                : node.handleIn,
          };
        } else {
          newSegments[selectedSegmentIndex] = {
            ...node,
            handleIn: { x: newX, y: newY },
            handleOut:
              !shift && node.handleOut
                ? { x: node.x - (newX - node.x), y: node.y - (newY - node.y) }
                : node.handleOut,
          };
        }
        updateSelectedPath(newSegments);
      } else {
        const dx = newX - node.x;
        const dy = newY - node.y;
        const newSegments = path.segments.map((seg, i) => {
          if (i !== selectedSegmentIndex) return seg;
          return {
            ...seg,
            x: seg.x + dx,
            y: seg.y + dy,
            handleIn: seg.handleIn
              ? { x: seg.handleIn.x + dx, y: seg.handleIn.y + dy }
              : null,
            handleOut: seg.handleOut
              ? { x: seg.handleOut.x + dx, y: seg.handleOut.y + dy }
              : null,
          };
        });
        updateSelectedPath(newSegments);
      }
      return;
    }

    if (selectedShape) {
      const center = getShapeCenter(selectedShape.path);
      const targetX = pointer.x - dragOffset.current.x;
      const targetY = pointer.y - dragOffset.current.y;
      const dx = targetX - center.x;
      const dy = targetY - center.y;

      const newSegments = selectedShape.path.segments.map(segment => ({
        ...segment,
        x: segment.x + dx,
        y: segment.y + dy,
        handleIn: segment.handleIn
          ? { x: segment.handleIn.x + dx, y: segment.handleIn.y + dy }
          : null,
        handleOut: segment.handleOut
          ? { x: segment.handleOut.x + dx, y: segment.handleOut.y + dy }
          : null,
      }));
      updateSelectedPath(newSegments);
    }
  };

  const handleMouseDown = (event: MouseEvent) => {
    const svgEl = svgElRef.current;
    const p = pointerPos(event);

    if (!shapeStart && shapeTools[mode as keyof typeof shapeTools]) {
      setShapeStart(p);
      setTempShape({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }

    if (event.target === svgEl) {
      release();
    } else {
      setCanDrag(true);
      setTransformMode(null);
    }
  };

  const handleMouseUp = () => {
    if (shapeStart && tempShape) {
      const end = { x: tempShape.x2, y: tempShape.y2 };
      const newShape = createShapeFromMode(shapeStart, end);
      if (newShape) {
        setShapes(prev => [...prev, { ...newShape, id: nextID }]);
        setNextID(prev => prev + 1);
      }
      setShapeStart(null);
      setTempShape(null);
    }

    setCanDrag(false);
    setTransformMode(null);
  };

  const handleShapeMouseDown = (shape: ShapeItem, event: MouseEvent) => {
    setCanDrag(true);
    setTransformMode(null);
    selectShapeItem(shape, event);

    const p = pointerPos(event);
    if (mode === "edit" && isPointOnShapeBorder(shape, p)) {
      const insertedIndex = addNodeOnBorder(shape, p);
      setSelectedShape(shape);
      setSelectedSegmentIndex(insertedIndex);
      setSelectedHandle(null);
      dragOffset.current = { x: 0, y: 0 };
    } else if (mode === "paint") {
      const newShapes = shapes.map(s =>
        s.id === shape.id ? { ...s, fill: fillColor, stroke: strokeColor } : s,
      );
      setShapes(newShapes);
      if (selectedShape?.id === shape.id) {
        setSelectedShape(newShapes.find(s => s.id === shape.id) || null);
      }
    }
  };

  const handleNewFile = () => {
    setShapes([]);
    release();
    setNextID(0);
  };

  const handleSave = () => {
    downloadFile({
      source: JSON.stringify(shapes),
      type: "application/json",
      filename: "shapes.json",
    });
  };

  const handleDelete = () => {
    if (!selectedShape) return;
    setShapes(prev => prev.filter(shape => shape.id !== selectedShape!.id));
    release();
  };

  return (
    <>
      <div class="wrapper top horizontal spacious">
        <div class="horizontal">
          <p>Fill</p>
          <input
            type="color"
            value={fillColor}
            onChange={e => setFillColor((e.target as HTMLInputElement).value)}
          />
          <p>Stroke</p>
          <input
            type="color"
            value={strokeColor}
            onChange={e => setStrokeColor((e.target as HTMLInputElement).value)}
          />
        </div>
        {isToolMode(mode) && shapeTools[mode].controls && (
          <div class="horizontal">
            {Object.entries(shapeTools[mode].controls!).map(([name, control]) => (
              <label class="tool-control" key={name}>
                <span>{niceString(name)}</span>
                <input
                  type="number"
                  min={control.min}
                  max={control.max}
                  step={control.step ?? 1}
                  value={toolParams[name] ?? shapeTools[mode].defaultParams[name]}
                  onInput={e =>
                    setToolParam(name, Number((e.target as HTMLInputElement).value))
                  }
                />
              </label>
            ))}
          </div>
        )}
        <div class="horizontal">
          <DropdownButton label="File" flip={true}>
            <button onClick={handleNewFile}>New File</button>
            <button onClick={handleSave}>Save</button>
            <button onClick={loadButton}>Load</button>
            <DropdownButton label="Export...">
              <button onClick={downloadSVG}>SVG</button>
              <button onClick={downloadPNG}>PNG</button>
            </DropdownButton>
          </DropdownButton>
        </div>
      </div>

      <div class="wrapper left">
        <p>Tools</p>
        <div class="grid">
          <button onClick={() => setMode("edit")}>
            <img src="/edit.svg" alt="Edit" />
          </button>
          <button onClick={() => setMode("transform")}>
            <img src="/scale.svg" alt="Transform" />
          </button>
          <button onClick={() => setMode("paint")}>
            <img src="/paintbrush.svg" alt="Paint" />
          </button>
          <button disabled={!selectedShape} onClick={handleDelete}>
            <img src="/trash.svg" alt="delete" />
          </button>
        </div>

        <p>Shapes</p>
        <div class="grid">
          {Object.entries(shapeTools).map(([key, _def]) => (
            <button
              className="shapeButton"
              onClick={() => selectTool(key as ToolKey)}
              title={key}
              key={key}
            >
              <svg
                viewBox="0 0 100 100"
                width="100%"
                height="100%"
                dangerouslySetInnerHTML={{ __html: shapePreviewMarkup(key) }}
              />
            </button>
          ))}
        </div>
      </div>

      <div class="wrapper right">
        {[...shapes].reverse().map((shape, i) => (
          <div
            key={shape.id}
            className={
              selectedShape === shape ? "shape-preview selected" : "shape-preview"
            }
            draggable={true}
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            }}
            onDrop={e => handleDrop(e, i)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet"
              width="100%"
              height="100%"
              viewBox={getBoundingBox(shape.path, true) as string}
              onMouseDown={() => {
                selectShapeItem(shape);
                setSelectedSegmentIndex(null);
                setSelectedHandle(null);
              }}
            >
              <path
                d={pathD(shape.path)}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth="2"
              />
            </svg>
          </div>
        ))}
      </div>

      <svg
        ref={svgElRef}
        viewBox="0 0 800 600"
        width="800"
        height="600"
        role="application"
        aria-label="SVG editor"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {shapes.map(shape => (
          <path
            key={shape.id}
            d={pathD(shape.path)}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth="2"
            onMouseDown={e => handleShapeMouseDown(shape, e)}
            onMouseUp={() => setCanDrag(false)}
          />
        ))}

        {mode === "edit" &&
          selectedShape &&
          selectedShape.path.segments.map((segment, index) => (
            <g key={index}>
              {segment.handleIn && (
                <>
                  <line
                    x1={segment.x}
                    y1={segment.y}
                    x2={segment.handleIn!.x}
                    y2={segment.handleIn!.y}
                    className="wb"
                  />
                  <circle
                    cx={segment.handleIn!.x}
                    cy={segment.handleIn!.y}
                    r="5"
                    className="wb"
                    onMouseDown={e => {
                      setCanDrag(true);
                      selectHandleItem(selectedShape, index, "in", e);
                    }}
                    onMouseUp={() => setCanDrag(false)}
                  />
                </>
              )}

              {segment.handleOut && (
                <>
                  <line
                    x1={segment.x}
                    y1={segment.y}
                    x2={segment.handleOut!.x}
                    y2={segment.handleOut!.y}
                    className="wb"
                  />
                  <circle
                    cx={segment.handleOut!.x}
                    cy={segment.handleOut!.y}
                    r="5"
                    className="wb"
                    onMouseDown={e => {
                      setCanDrag(true);
                      selectHandleItem(selectedShape, index, "out", e);
                    }}
                    onMouseUp={() => setCanDrag(false)}
                  />
                </>
              )}

              <circle
                cx={segment.x}
                cy={segment.y}
                r="6"
                className="wb red"
                onMouseDown={e => {
                  setCanDrag(true);
                  setTransformMode(null);
                  selectNode(selectedShape, index, e);
                }}
                onMouseUp={() => setCanDrag(false)}
              />
            </g>
          ))}

        {mode === "transform" &&
          selectedShape &&
          (() => {
            const rot = getRotationHandle();
            return (
              <>
                {rot && (
                  <circle
                    cx={rot.cx}
                    cy={rot.cy}
                    r="6"
                    className="wb"
                    style="cursor: grab"
                    onMouseDown={startRotation}
                    onMouseUp={() => setTransformMode(null)}
                  />
                )}
                {[
                  { x: box.xMin, y: box.yMin, cursor: "nwse-resize" },
                  { x: box.xMax, y: box.yMin, cursor: "nesw-resize" },
                  { x: box.xMax, y: box.yMax, cursor: "nwse-resize" },
                  { x: box.xMin, y: box.yMax, cursor: "nesw-resize" },
                ].map((handle, i) => (
                  <rect
                    key={i}
                    x={handle.x - 5}
                    y={handle.y - 5}
                    width="10"
                    height="10"
                    className="wb"
                    style={{ cursor: handle.cursor }}
                    onMouseDown={e => startScaling(i, e)}
                    onMouseUp={() => {
                      setCanDrag(false);
                      setTransformMode(null);
                    }}
                  />
                ))}
              </>
            );
          })()}

        {tempShape && isToolMode(mode) && (
          <path
            d={pathD(
              shapeTools[mode].createPathData(
                { x: tempShape.x1, y: tempShape.y1 },
                { x: tempShape.x2, y: tempShape.y2 },
                toolParams,
              ),
            )}
            className="previewShape"
          />
        )}
      </svg>
    </>
  );
}
