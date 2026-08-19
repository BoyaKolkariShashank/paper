import type { Tool } from "../types"
import { tools } from "./Toolbar"

export default function ToolRail({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  return (
    <aside className="tool-rail w-16 shrink-0 border-r border-slate-200/80 bg-white flex flex-col items-center py-3 gap-1 z-10">
      {tools.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          title={label}
          onClick={() => setTool(id)}
          className={`rail-button ${tool === id ? "rail-button-active" : ""}`}
        >
          <Icon size={18} strokeWidth={1.8}/>
          <span>{label}</span>
        </button>
      ))}
    </aside>
  )
}