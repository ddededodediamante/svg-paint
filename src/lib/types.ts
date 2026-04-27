import { shapeTools } from "./shapes";
import { PathData } from "./utils";

export type ToolKey = keyof typeof shapeTools;

export type ShapeItem = {
  id: number;
  fill: string;
  stroke: string;
  path: PathData;
  tool?: ToolKey;
  toolParams?: Record<string, any>;
};

export type HandleSide = "in" | "out";

export type BoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
};