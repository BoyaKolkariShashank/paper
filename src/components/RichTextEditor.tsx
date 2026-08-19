import { useEffect, useRef } from "react"

type Props = {
  value: string
  x: number
  y: number
  width: number
  height: number
  zoom: number
  fontFamily: string
  fontSize: number
  color: string
  align: "left" | "center" | "right"
  bold: boolean
  italic: boolean
  underline: boolean
  onChange: (html: string) => void
  onCommit: () => void
}

export default function RichTextEditor(p: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== p.value) ref.current.innerHTML = p.value || "Type here…"
  }, [p.value])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={e => p.onChange(e.currentTarget.innerHTML)}
      onBlur={p.onCommit}
      onKeyDown={e => {
        if (e.key === "Escape") p.onCommit()
      }}
      className="absolute outline-none bg-white/95 border border-slate-300 rounded-md px-2 py-1 shadow-paper overflow-auto"
      style={{
        left: p.x,
        top: p.y,
        width: p.width,
        minHeight: p.height,
        transform: `scale(${p.zoom})`,
        transformOrigin: "top left",
        fontFamily: p.fontFamily,
        fontSize: p.fontSize,
        color: p.color,
        textAlign: p.align,
        fontWeight: p.bold ? 700 : 400,
        fontStyle: p.italic ? "italic" : "normal",
        textDecoration: p.underline ? "underline" : "none",
      }}
    />
  )
}