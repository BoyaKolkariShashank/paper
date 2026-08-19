export type Tool =
  | "select"
  | "text"
  | "image"
  | "file"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "pen"
  | "table"

export type TextAlign = "left" | "center" | "right"

export type CanvasItem = {
  id: string
  type: Tool
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  content?: string
  style?: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    opacity?: number
    fontFamily?: string
    fontSize?: number
    fontStyle?: "normal" | "bold" | "italic"
    textDecoration?: "none" | "underline"
    align?: TextAlign
    lineHeight?: number
  }
  points?: number[]
  src?: string
  fileName?: string
  mimeType?: string
  fileData?: string
  previewText?: string
  previewSheets?: Array<{
    name: string
    rows: string[][]
  }>
  table?: {
    rows: number
    cols: number
    cells: string[][]
  }
}

export type HistoryState = CanvasItem[]