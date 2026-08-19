import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react"
import type { CanvasItem, TextAlign } from "../types"

type Props = {
  item?: CanvasItem
  onChange: (patch: Partial<CanvasItem> & { style?: CanvasItem["style"] }) => void
}

export default function Inspector({ item, onChange }: Props) {
  if (!item) {
    return (
      <aside className="inspector-panel w-64 shrink-0 border-l border-slate-200/80 bg-white p-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inspector</div>
        <div className="mt-8 text-sm text-slate-400 leading-6">
          Select an object to edit its properties.
        </div>
      </aside>
    )
  }

  const style = item.style ?? {}
  const setStyle = (patch: CanvasItem["style"]) => onChange({ style: { ...style, ...patch } })
  const openFile = () => {
    if (!item.fileData) return
    const link = document.createElement("a")
    link.href = item.fileData
    link.download = item.fileName ?? "infinite-paper-file"
    link.click()
  }

  const isPdf = item.mimeType === "application/pdf" || item.fileName?.toLowerCase().endsWith(".pdf")
  const isVideo = item.mimeType?.startsWith("video/")
  const isAudio = item.mimeType?.startsWith("audio/")

  return (
    <aside className="inspector-panel w-64 shrink-0 border-l border-slate-200/80 bg-white p-4 overflow-auto">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inspector</div>
      <div className="mt-4 text-sm font-medium text-slate-800 capitalize">{item.type}</div>

      {item.type === "file" && (
        <section className="inspector-section">
          <div className="text-sm font-semibold text-slate-800 break-words">
            {item.fileName ?? "Untitled file"}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 break-all">
            {item.mimeType ?? "File attachment"}
          </div>

          {item.mimeType?.startsWith("image/") && item.fileData ? (
            <img
              src={item.fileData}
              alt={item.fileName ?? "Selected file"}
              className="mt-3 max-h-64 w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
            />
          ) : isVideo && item.fileData ? (
            <video controls src={item.fileData} className="mt-3 max-h-64 w-full rounded-lg border border-slate-200 bg-black" />
          ) : isAudio && item.fileData ? (
            <audio controls src={item.fileData} className="mt-3 w-full" />
          ) : isPdf && item.fileData ? (
            <div className="mt-3 space-y-2">
              <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-sm border border-slate-200 bg-white p-6 text-[11px] leading-6 text-slate-700 shadow-sm">
                {item.previewText ?? "PDF preview is loading..."}
              </pre>
              <iframe
                title={item.fileName ?? "PDF viewer"}
                src={item.fileData}
                className="h-64 w-full rounded-lg border border-slate-200 bg-white"
              />
            </div>
          ) : item.previewSheets?.length ? (
            <div className="mt-3 max-h-[32rem] space-y-6 overflow-auto rounded-sm border border-slate-200 bg-slate-100 p-3">
              {item.previewSheets.map(sheet => (
                <div key={sheet.name} className="bg-white p-5 shadow-sm">
                  <div className="mb-3 text-xs font-semibold text-slate-700">{sheet.name}</div>
                  <div className="overflow-auto border border-slate-300">
                    <table className="min-w-full border-collapse text-[11px] text-slate-700">
                      <tbody>
                        {sheet.rows.map((row, rowIndex) => (
                          <tr key={`${sheet.name}-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={`${rowIndex}-${cellIndex}`} className="border-b border-r border-slate-200 px-2 py-1.5 align-top whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-sm border border-slate-200 bg-white p-6 text-[11px] leading-6 text-slate-700 shadow-sm">
              {item.previewText ?? "Preview is loading..."}
            </pre>
          )}

          <button className="mt-3 h-9 w-full rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-700" onClick={openFile}>
            Download original file
          </button>
        </section>
      )}

      <section className="inspector-section">
        <label className="field-label">Position</label>
        <div className="grid grid-cols-2 gap-2">
          <input className="field" type="number" value={Math.round(item.x)} onChange={e => onChange({ x: +e.target.value })}/>
          <input className="field" type="number" value={Math.round(item.y)} onChange={e => onChange({ y: +e.target.value })}/>
        </div>
      </section>

      <section className="inspector-section">
        <label className="field-label">Size</label>
        <div className="grid grid-cols-2 gap-2">
          <input className="field" type="number" value={Math.round(item.width)} onChange={e => onChange({ width: Math.max(8, +e.target.value) })}/>
          <input className="field" type="number" value={Math.round(item.height)} onChange={e => onChange({ height: Math.max(8, +e.target.value) })}/>
        </div>
      </section>

      <section className="inspector-section">
        <label className="field-label">Rotation</label>
        <input className="field w-full" type="number" value={Math.round(item.rotation)} onChange={e => onChange({ rotation: +e.target.value })}/>
      </section>

      {(item.type === "text") && (
        <>
          <section className="inspector-section">
            <label className="field-label">Font</label>
            <select className="field w-full" value={style.fontFamily ?? "Inter"} onChange={e => setStyle({ fontFamily: e.target.value })}>
              <option>Inter</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option>
            </select>
            <input className="field w-full mt-2" type="number" min="8" value={style.fontSize ?? 28} onChange={e => setStyle({ fontSize: +e.target.value })}/>
          </section>

          <section className="inspector-section">
            <label className="field-label">Style</label>
            <div className="flex gap-1">
              <button className={`mini-button ${style.fontStyle === "bold" ? "mini-active" : ""}`} onClick={() => setStyle({ fontStyle: style.fontStyle === "bold" ? "normal" : "bold" })}><Bold size={15}/></button>
              <button className={`mini-button ${style.fontStyle === "italic" ? "mini-active" : ""}`} onClick={() => setStyle({ fontStyle: style.fontStyle === "italic" ? "normal" : "italic" })}><Italic size={15}/></button>
              <button className={`mini-button ${style.textDecoration === "underline" ? "mini-active" : ""}`} onClick={() => setStyle({ textDecoration: style.textDecoration === "underline" ? "none" : "underline" })}><Underline size={15}/></button>
              {(["left","center","right"] as TextAlign[]).map((a, i) => {
                const I = [AlignLeft, AlignCenter, AlignRight][i]
                return <button key={a} className={`mini-button ${style.align === a ? "mini-active" : ""}`} onClick={() => setStyle({ align: a })}><I size={15}/></button>
              })}
            </div>
          </section>

          <section className="inspector-section">
            <label className="field-label">Text color</label>
            <input className="h-9 w-full p-1 border border-slate-200 rounded-lg" type="color" value={style.fill ?? "#111827"} onChange={e => setStyle({ fill: e.target.value })}/>
          </section>
        </>
      )}

      {(item.type === "rectangle" || item.type === "circle" || item.type === "table") && (
        <section className="inspector-section">
          <label className="field-label">Fill</label>
          <input className="h-9 w-full p-1 border border-slate-200 rounded-lg" type="color" value={style.fill ?? "#ffffff"} onChange={e => setStyle({ fill: e.target.value })}/>
          <label className="field-label mt-3">Stroke</label>
          <input className="h-9 w-full p-1 border border-slate-200 rounded-lg" type="color" value={style.stroke ?? "#94a3b8"} onChange={e => setStyle({ stroke: e.target.value })}/>
        </section>
      )}
    </aside>
  )
}