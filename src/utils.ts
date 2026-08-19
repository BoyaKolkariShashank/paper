import type { CanvasItem } from "./types"

export const uid = (prefix = "item") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const cloneItems = (items: CanvasItem[]) =>
  structuredClone(items) as CanvasItem[]

export function worldPoint(
  stage: { x: () => number; y: () => number; scaleX: () => number },
  screenX: number,
  screenY: number
) {
  const scale = stage.scaleX()
  return {
    x: (screenX - stage.x()) / scale,
    y: (screenY - stage.y()) / scale,
  }
}

export function sorted(items: CanvasItem[]) {
  return [...items].sort((a, b) => a.zIndex - b.zIndex)
}