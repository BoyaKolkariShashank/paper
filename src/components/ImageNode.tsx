import { useEffect, useState } from "react"
import { Image as KonvaImage } from "react-konva"
import type Konva from "konva"
import type { CanvasItem } from "../types"

export default function ImageNode({ item, common }: { item: CanvasItem; common: Record<string, unknown> }) {
  const [image, setImage] = useState<HTMLImageElement | undefined>()
  useEffect(() => {
    if (!item.src) return
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = item.src
  }, [item.src])
  if (!image) return null
  return <KonvaImage {...common} image={image} width={item.width} height={item.height} cornerRadius={8}/>
}