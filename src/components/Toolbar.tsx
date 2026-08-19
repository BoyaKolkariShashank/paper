import {
  MousePointer2, Type, ImagePlus, FilePlus, Square, Circle, Minus, ArrowUpRight,
  PenTool, Table2, Undo2, Redo2, Copy, Clipboard, Trash2,
  BringToFront, SendToBack, ZoomIn, ZoomOut, Maximize2, Download, Upload, Share2
} from "lucide-react"
import type { Tool } from "../types"

type Props = {
  tool: Tool
  setTool: (tool: Tool) => void
  zoom: number
  onZoom: (delta: number) => void
  onFit: () => void
  onUndo: () => void
  onRedo: () => void
  onCopy: () => void
  onPaste: () => void
  onDuplicate: () => void
  onDelete: () => void
  onFront: () => void
  onBack: () => void
  onExport: () => void
  onShare: () => void
  onImport: (file: File) => void
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
}

const tools: { id: Tool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "text", label: "Text", icon: Type },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "file", label: "File", icon: FilePlus },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "pen", label: "Pen", icon: PenTool },
  { id: "table", label: "Table", icon: Table2 },
]

export default function Toolbar(p: Props) {
  return (
    <header className="h-14 border-b border-slate-200/80 bg-white/90 backdrop-blur flex items-center px-4 gap-3 shrink-0 z-20">
      <div className="flex items-center gap-2 mr-3">
        <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center font-semibold">∞</div>
        <div className="leading-none">
          <div className="font-semibold tracking-tight text-slate-900">Infinite Paper</div>
          <div className="text-[10px] text-slate-400 mt-1">freeform workspace</div>
        </div>
      </div>

      <div className="h-7 w-px bg-slate-200" />

      <div className="flex items-center gap-1">
        <button className="icon-button" title="Undo" onClick={p.onUndo} disabled={!p.canUndo}><Undo2 size={16}/></button>
        <button className="icon-button" title="Redo" onClick={p.onRedo} disabled={!p.canRedo}><Redo2 size={16}/></button>
      </div>

      <div className="h-7 w-px bg-slate-200 mx-1" />

      <div className="flex items-center gap-1">
        <button className="icon-button" title="Save editable .paper file" onClick={p.onExport}><Download size={16}/></button>
        <button className="icon-button" title="Share editable .paper file" onClick={p.onShare}><Share2 size={16}/></button>
        <label className="icon-button cursor-pointer" title="Import paper file">
          <Upload size={16}/>
          <input
            type="file"
            accept=".paper,.paper.json,application/x-infinite-paper,application/json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) p.onImport(file)
              event.currentTarget.value = ""
            }}
          />
        </label>
      </div>

      <div className="h-7 w-px bg-slate-200 mx-1" />

      <div className="flex items-center gap-1">
        <button className="icon-button" title="Copy" onClick={p.onCopy} disabled={!p.hasSelection}><Copy size={16}/></button>
        <button className="icon-button" title="Paste" onClick={p.onPaste}><Clipboard size={16}/></button>
        <button className="icon-button" title="Duplicate" onClick={p.onDuplicate} disabled={!p.hasSelection}><Copy size={16}/></button>
        <button className="icon-button" title="Delete" onClick={p.onDelete} disabled={!p.hasSelection}><Trash2 size={16}/></button>
        <button className="icon-button" title="Bring forward" onClick={p.onFront} disabled={!p.hasSelection}><BringToFront size={16}/></button>
        <button className="icon-button" title="Send backward" onClick={p.onBack} disabled={!p.hasSelection}><SendToBack size={16}/></button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button className="icon-button" title="Zoom out" onClick={() => p.onZoom(-0.1)}><ZoomOut size={16}/></button>
        <div className="min-w-14 text-center text-xs font-medium text-slate-600">{Math.round(p.zoom * 100)}%</div>
        <button className="icon-button" title="Zoom in" onClick={() => p.onZoom(0.1)}><ZoomIn size={16}/></button>
        <button className="icon-button" title="Fit view" onClick={p.onFit}><Maximize2 size={16}/></button>
      </div>
    </header>
  )
}

export { tools }