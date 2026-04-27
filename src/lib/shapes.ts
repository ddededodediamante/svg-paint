import { scalePathData, type PathData, type Point, type Segment } from "./utils";
import { importSVGPath } from "./svg-path";

export interface ShapeControl {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
}

export interface ShapeTool<TParams extends Record<string, any> = any> {
  defaultParams: TParams;
  controls?: Record<keyof TParams, ShapeControl>;
  createPathData: (start: Point, end: Point, params: TParams) => PathData;
}

const heart = importSVGPath(
  "M65 29c6-10 16-17 28-17 17 0 30 13 30 30 0 33-18 38-58 76C25 80 7 75 7 42 7 25 20 12 37 12c12 0 22 7 28 17Z",
);

const crescent = importSVGPath(
  "M245.1 279.1c-57.5 0-104.3-46.8-104.3-104.3 0-39.8 22.2-75.6 57.9-93.4 1.6-.8 3.5-.5 4.8.8s1.6 3.2.8 4.8c-6.5 13.2-9.8 27.5-9.8 42.3 0 52.9 43.1 96 96 96 15 0 29.4-3.4 42.7-10 1.6-.8 3.5-.5 4.8.8s1.6 3.2.8 4.8c-17.7 36-53.6 58.4-93.7 58.4Z",
);

const speechbubble = importSVGPath(
  "M249.4 72.8c73.4 0 132.9 41.4 132.9 92.5 0 51.1-59.5 92.5-132.9 92.5-23 0-44.7-4.1-63.5-11.2-37.3 14-88.1 40.5-88.1 40.5s33.2-18.8 46.8-41.6c3.5-5.8 5.5-11.9 6.7-17.8-21.6-16.5-34.8-38.4-34.8-62.4 0-51.1 59.5-92.5 132.9-92.5",
);

const tools: Record<string, ShapeTool> = {
  line: {
    defaultParams: {},
    createPathData(start, end) {
      return {
        closed: false,
        segments: [
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
        ],
      };
    },
  },
  square: {
    defaultParams: { radius: 0 },
    controls: {
      radius: { type: "number", min: 0, max: 200, step: 1 },
    },
    createPathData(start, end, { radius }) {
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);

      const w = x2 - x1;
      const h = y2 - y1;
      const r = Math.min(radius, w / 2, h / 2);

      if (r === 0) {
        return {
          closed: true,
          segments:[
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ],
        };
      }

      const k = 0.552284749831;

      return {
        closed: true,
        segments:[
          {
            x: x1 + r,
            y: y1,
            handleIn: { x: x1 + r - r * k, y: y1 },
          },
          {
            x: x2 - r,
            y: y1,
            handleOut: { x: x2 - r + r * k, y: y1 },
          },
          {
            x: x2,
            y: y1 + r,
            handleIn: { x: x2, y: y1 + r - r * k },
          },
          {
            x: x2,
            y: y2 - r,
            handleOut: { x: x2, y: y2 - r + r * k },
          },
          {
            x: x2 - r,
            y: y2,
            handleIn: { x: x2 - r + r * k, y: y2 },
          },
          {
            x: x1 + r,
            y: y2,
            handleOut: { x: x1 + r - r * k, y: y2 },
          },
          {
            x: x1,
            y: y2 - r,
            handleIn: { x: x1, y: y2 - r + r * k },
          },
          {
            x: x1,
            y: y1 + r,
            handleOut: { x: x1, y: y1 + r - r * k },
          },
        ],
      };
    },
  },
  ellipse: {
    defaultParams: {},
    createPathData(start, end) {
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);

      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = (x2 - x1) / 2;
      const ry = (y2 - y1) / 2;

      const k = 0.552284749831;

      return {
        closed: true,
        segments: [
          {
            x: cx,
            y: cy - ry,
            handleIn: { x: cx - rx * k, y: cy - ry },
            handleOut: { x: cx + rx * k, y: cy - ry },
          },
          {
            x: cx + rx,
            y: cy,
            handleIn: { x: cx + rx, y: cy - ry * k },
            handleOut: { x: cx + rx, y: cy + ry * k },
          },
          {
            x: cx,
            y: cy + ry,
            handleIn: { x: cx + rx * k, y: cy + ry },
            handleOut: { x: cx - rx * k, y: cy + ry },
          },
          {
            x: cx - rx,
            y: cy,
            handleIn: { x: cx - rx, y: cy + ry * k },
            handleOut: { x: cx - rx, y: cy - ry * k },
          },
        ],
      };
    },
  },
  polygon: {
    defaultParams: { sides: 5 },
    controls: {
      sides: { type: "number", min: 3, max: 20, step: 1 },
    },
    createPathData(start, end, { sides }) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;

      const segments: Segment[] = [];

      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        segments.push({
          x: cx + Math.cos(angle) * rx,
          y: cy + Math.sin(angle) * ry,
        });
      }

      return { segments, closed: true };
    },
  },
  star: {
    defaultParams: { points: 5, innerRatio: 0.4 },
    controls: {
      points: { type: "number", min: 3, max: 20, step: 1 },
      innerRatio: { type: "number", min: 0.1, max: 0.9, step: 0.05 },
    },
    createPathData(start, end, { points, innerRatio }) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;

      const segments: Segment[] = [];

      for (let i = 0; i < points * 2; i++) {
        const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 1 : innerRatio;

        segments.push({
          x: cx + Math.cos(angle) * rx * r,
          y: cy + Math.sin(angle) * ry * r,
        });
      }

      return { segments, closed: true };
    },
  },
  heart: {
    defaultParams: {},
    createPathData(start, end) {
      return scalePathData(heart, start, end);
    },
  },
  crescent: {
    defaultParams: {},
    createPathData(start, end) {
      return scalePathData(crescent, start, end);
    },
  },
  speechbubble: {
    defaultParams: {},
    createPathData(start, end) {
      return scalePathData(speechbubble, start, end);
    },
  },
};

export const shapeTools = tools;
