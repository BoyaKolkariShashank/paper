import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Konva from "konva"
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Arrow,
  Text,
  Transformer,
  Group,
} from "react-konva"

import type { CanvasItem, Tool } from "../types"
import { worldPoint } from "../utils"
import RichTextEditor from "./RichTextEditor"
import ImageNode from "./ImageNode"
import * as mammoth from "mammoth"
import ExcelJS from "exceljs"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"

type Props = {
  items: CanvasItem[]
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void

  updateItem: (
    id: string,
    patch: Partial<CanvasItem> & {
      style?: CanvasItem["style"]
    }
  ) => void

  addItem: (item: CanvasItem) => void
  deleteSelected: () => void

  tool: Tool
  setTool: (t: Tool) => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

const GRID_SIZE = 8
const LARGE_GRID_SIZE = 40
const FILE_CARD_WIDTH = 320
const FILE_CARD_HEIGHT = 180

const createId = (type: string) =>
  `${type}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, value))

const snap = (value: number) =>
  Math.round(value / GRID_SIZE) * GRID_SIZE

const getDocumentPreview = async (file: File) => {
  const name = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json")) {
    return new TextDecoder().decode(buffer)
  }

  if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer })
    return result.value
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
    if (name.endsWith(".csv")) {
      const text = new TextDecoder().decode(buffer)
      return text
    }
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const rows: string[] = []
    workbook.worksheets.forEach(worksheet => {
      rows.push(`[${worksheet.name}]`)
      worksheet.eachRow(row => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : []
        rows.push(values.map(value => String(value ?? "")).join("\t"))
      })
    })
    return rows.join("\n")
  }

  if (name.endsWith(".pdf")) {
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
    }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(`Page ${pageNumber}\n${content.items
        .map(item => "str" in item ? item.str : "")
        .join(" ")}`)
    }
    return pages.join("\n\n")
  }

  return ""
}

const getSpreadsheetSheets = async (file: File) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  return workbook.worksheets.map(worksheet => {
    const rows: string[][] = []
    worksheet.eachRow(row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      rows.push(values.map(value => String(value ?? "")))
    })
    return { name: worksheet.name, rows }
  })
}

export default function CanvasStage(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  const [size, setSize] = useState({
    width: 1000,
    height: 700,
  })

  const [zoom, setZoom] = useState(1)

  const [editingText, setEditingText] =
    useState<string | null>(null)

  const [draftText, setDraftText] =
    useState("")

  const [editingCell, setEditingCell] =
    useState<{
      id: string
      row: number
      col: number
    } | null>(null)

  const [drawing, setDrawing] =
    useState<string | null>(null)

  const [spacePressed, setSpacePressed] =
    useState(false)

  const [isPanning, setIsPanning] =
    useState(false)

  const [marquee, setMarquee] =
    useState<{
      x: number
      y: number
      width: number
      height: number
    } | null>(null)

  const [duplicatePreview, setDuplicatePreview] =
    useState<string | null>(null)

  /*
   * -------------------------------------------------------
   * KEYBOARD / SPACE PAN
   * -------------------------------------------------------
   */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        ) {
          return
        }

        e.preventDefault()
        setSpacePressed(true)
      }
    }

    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault()
        setSpacePressed(false)
      }
    }

    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)

    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  /*
   * -------------------------------------------------------
   * RESIZE
   * -------------------------------------------------------
   */

  useEffect(() => {
    const updateSize = () => {
      if (!wrapRef.current) return

      setSize({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)

    if (wrapRef.current) {
      observer.observe(wrapRef.current)
    }

    return () => observer.disconnect()
  }, [])

  /*
   * -------------------------------------------------------
   * ZOOM EVENTS
   * -------------------------------------------------------
   */

  const syncZoom = useCallback((value: number) => {
    const next = clamp(value, MIN_ZOOM, MAX_ZOOM)

    setZoom(next)

    document.body.dataset.canvasZoom =
      String(next)

    window.dispatchEvent(
      new CustomEvent(
        "infinite-paper-zoom-changed",
        {
          detail: next,
        }
      )
    )
  }, [])

  const zoomAtPoint = useCallback(
    (
      newScale: number,
      pointer: {
        x: number
        y: number
      }
    ) => {
      const stage = stageRef.current

      if (!stage) return

      const oldScale = stage.scaleX()

      const worldPoint = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      }

      const scale = clamp(
        newScale,
        MIN_ZOOM,
        MAX_ZOOM
      )

      stage.scale({
        x: scale,
        y: scale,
      })

      stage.position({
        x:
          pointer.x -
          worldPoint.x * scale,

        y:
          pointer.y -
          worldPoint.y * scale,
      })

      syncZoom(scale)

      stage.batchDraw()
    },
    [syncZoom]
  )

  useEffect(() => {
    const onZoom = (event: Event) => {
      const delta =
        (event as CustomEvent<number>).detail

      const stage = stageRef.current

      if (!stage) return

      const center = {
        x: size.width / 2,
        y: size.height / 2,
      }

      zoomAtPoint(
        stage.scaleX() + delta,
        center
      )
    }

    const onFit = () => {
      const stage = stageRef.current

      if (!stage) return

      if (!p.items.length) {
        stage.position({
          x: 0,
          y: 0,
        })

        stage.scale({
          x: 1,
          y: 1,
        })

        syncZoom(1)

        return
      }

      const padding = 100

      const minX = Math.min(
        ...p.items.map(i => i.x)
      )

      const minY = Math.min(
        ...p.items.map(i => i.y)
      )

      const maxX = Math.max(
        ...p.items.map(
          i => i.x + i.width
        )
      )

      const maxY = Math.max(
        ...p.items.map(
          i => i.y + i.height
        )
      )

      const contentWidth =
        maxX - minX

      const contentHeight =
        maxY - minY

      const availableWidth =
        size.width - padding * 2

      const availableHeight =
        size.height - padding * 2

      const fitScale = clamp(
        Math.min(
          availableWidth / Math.max(contentWidth, 1),
          availableHeight /
            Math.max(contentHeight, 1)
        ),
        MIN_ZOOM,
        1
      )

      stage.scale({
        x: fitScale,
        y: fitScale,
      })

      stage.position({
        x:
          size.width / 2 -
          (minX + contentWidth / 2) *
            fitScale,

        y:
          size.height / 2 -
          (minY + contentHeight / 2) *
            fitScale,
      })

      syncZoom(fitScale)
    }

    window.addEventListener(
      "infinite-paper-zoom",
      onZoom
    )

    window.addEventListener(
      "infinite-paper-fit",
      onFit
    )

    document.body.dataset.canvasZoom =
      String(zoom)

    return () => {
      window.removeEventListener(
        "infinite-paper-zoom",
        onZoom
      )

      window.removeEventListener(
        "infinite-paper-fit",
        onFit
      )
    }
  }, [
    size.width,
    size.height,
    p.items,
    syncZoom,
    zoom,
    zoomAtPoint,
  ])

  /*
   * -------------------------------------------------------
   * WHEEL ZOOM
   * -------------------------------------------------------
   */

  const handleWheel = (
    e: Konva.KonvaEventObject<WheelEvent>
  ) => {
    e.evt.preventDefault()

    const stage = stageRef.current

    if (!stage) return

    /*
     * Ctrl/Cmd + wheel = zoom
     */
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pointer =
        stage.getPointerPosition()

      if (!pointer) return

      const oldScale =
        stage.scaleX()

      const direction =
        e.evt.deltaY > 0 ? -1 : 1

      const factor =
        direction > 0 ? 1.08 : 0.92

      zoomAtPoint(
        oldScale * factor,
        pointer
      )

      return
    }

    /*
     * Normal wheel remains natural scrolling.
     */
    const deltaX = e.evt.deltaX
    const deltaY = e.evt.deltaY

    stage.position({
      x: stage.x() - deltaX,
      y: stage.y() - deltaY,
    })

    stage.batchDraw()
  }

  /*
   * -------------------------------------------------------
   * WORLD POSITION
   * -------------------------------------------------------
   */

  const getWorldPosition = (
    event: Konva.KonvaEventObject<PointerEvent>
  ) => {
    const stage = stageRef.current

    if (!stage) {
      return {
        x: 0,
        y: 0,
      }
    }

    const pointer =
      stage.getPointerPosition()

    if (!pointer) {
      return {
        x: 0,
        y: 0,
      }
    }

    return {
      x:
        (pointer.x - stage.x()) /
        stage.scaleX(),

      y:
        (pointer.y - stage.y()) /
        stage.scaleY(),
    }
  }

  /*
   * -------------------------------------------------------
   * SELECTION
   * -------------------------------------------------------
   */

  const select = (
    id: string,
    additive = false
  ) => {
    if (additive) {
      p.setSelectedIds(
        p.selectedIds.includes(id)
          ? p.selectedIds.filter(
              x => x !== id
            )
          : [...p.selectedIds, id]
      )

      return
    }

    p.setSelectedIds([id])
  }

  /*
   * -------------------------------------------------------
   * CREATE OBJECT
   * -------------------------------------------------------
   */

  const createItem = (
    type: Tool,
    x: number,
    y: number
  ) => {
    const id = createId(type)

    const common = {
      id,
      type,
      x: snap(x),
      y: snap(y),
      rotation: 0,
      zIndex:
        p.items.length + 1,
    }

    if (type === "text") {
      p.addItem({
        ...common,
        width: 280,
        height: 70,
        content: "New text",
        style: {
          fill: "#111827",
          fontFamily: "Inter",
          fontSize: 28,
          align: "left",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: 1.2,
        },
      })
    }

    if (type === "rectangle") {
      p.addItem({
        ...common,
        width: 180,
        height: 120,
        style: {
          fill: "#ffffff",
          stroke: "#64748b",
          strokeWidth: 2,
        },
      })
    }

    if (type === "circle") {
      p.addItem({
        ...common,
        width: 140,
        height: 140,
        style: {
          fill: "#ffffff",
          stroke: "#64748b",
          strokeWidth: 2,
        },
      })
    }

    if (type === "line") {
      p.addItem({
        ...common,
        width: 220,
        height: 4,
        points: [
          0,
          0,
          220,
          0,
        ],
        style: {
          stroke: "#334155",
          strokeWidth: 3,
        },
      })
    }

    if (type === "arrow") {
      p.addItem({
        ...common,
        width: 220,
        height: 30,
        points: [
          0,
          15,
          220,
          15,
        ],
        style: {
          stroke: "#334155",
          strokeWidth: 3,
        },
      })
    }

    if (type === "table") {
      p.addItem({
        ...common,
        width: 360,
        height: 180,
        style: {
          fill: "#ffffff",
          stroke: "#cbd5e1",
          strokeWidth: 1,
        },
        table: {
          rows: 4,
          cols: 4,
          cells: Array.from(
            { length: 4 },
            () =>
              Array(4).fill("")
          ),
        },
      })
    }

    p.setSelectedIds([id])
    p.setTool("select")
  }

  /*
   * -------------------------------------------------------
   * POINTER DOWN
   * -------------------------------------------------------
   */

  const pointerDown = (
    e: Konva.KonvaEventObject<PointerEvent>
  ) => {
    const stage = stageRef.current

    if (!stage) return

    const target = e.target

    /*
     * Middle/right mouse = pan
     */
    if (
      e.evt.button === 1 ||
      e.evt.button === 2 ||
      spacePressed
    ) {
      e.evt.preventDefault()

      setIsPanning(true)

      stage.startDrag()

      return
    }

    const pos = getWorldPosition(e)

    if (
      e.evt.pointerType === "touch" &&
      (target === stage || target.name() === "canvas-background")
    ) {
      e.evt.preventDefault()
      stage.draggable(true)
      setIsPanning(true)
      stage.startDrag()
      return
    }

    /*
     * PEN
     */
    if (p.tool === "pen") {
      const id = createId("pen")

      setDrawing(id)

      p.addItem({
        id,
        type: "pen",
        x: pos.x,
        y: pos.y,
        width: 1,
        height: 1,
        rotation: 0,
        zIndex:
          p.items.length + 1,
        points: [0, 0],
        style: {
          stroke: "#111827",
          strokeWidth: 3,
        },
      })

      return
    }

    /*
     * IMAGE
     */
    if (
      target === stage ||
      target.name() ===
        "canvas-background"
    ) {
      if (p.tool === "select") {
        setMarquee({
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
        })

        return
      }

      if (p.tool === "file") {
        ;(window as any).__infinitePaperPendingFile = pos
        document.getElementById("file-upload-input")?.click()
        return
      }

      if (
        [
          "text",
          "rectangle",
          "circle",
          "line",
          "arrow",
          "table",
        ].includes(p.tool)
      ) {
        createItem(
          p.tool,
          pos.x,
          pos.y
        )
      }
    }
  }

  /*
   * -------------------------------------------------------
   * POINTER MOVE
   * -------------------------------------------------------
   */

  const pointerMove = (
    e: Konva.KonvaEventObject<PointerEvent>
  ) => {
    const stage = stageRef.current

    if (!stage) return

    /*
     * Pen
     */
    if (drawing) {
      const pos =
        getWorldPosition(e)

      const item = p.items.find(
        i => i.id === drawing
      )

      if (!item) return

      const localX =
        pos.x - item.x

      const localY =
        pos.y - item.y

      const points = [
        ...(item.points ?? []),
        localX,
        localY,
      ]

      p.updateItem(
        drawing,
        {
          points,
          width: Math.max(
            item.width,
            Math.abs(localX)
          ),
          height: Math.max(
            item.height,
            Math.abs(localY)
          ),
        }
      )

      return
    }

    /*
     * Marquee selection
     */
    if (marquee) {
      const pos =
        getWorldPosition(e)

      setMarquee({
        x: Math.min(
          marquee.x,
          pos.x
        ),

        y: Math.min(
          marquee.y,
          pos.y
        ),

        width: Math.abs(
          pos.x - marquee.x
        ),

        height: Math.abs(
          pos.y - marquee.y
        ),
      })
    }
  }

  /*
   * -------------------------------------------------------
   * POINTER UP
   * -------------------------------------------------------
   */

  const pointerUp = () => {
    const stage = stageRef.current

    /*
     * Finish pan
     */
    if (isPanning) {
      setIsPanning(false)

      stage?.stopDrag()
      stage?.draggable(false)

      return
    }

    /*
     * Finish pen
     */
    if (drawing) {
      setDrawing(null)

      return
    }

    /*
     * Finish marquee
     */
    if (marquee) {
      const box = marquee

      const selected = p.items
        .filter(item => {
          const left =
            item.x

          const top =
            item.y

          const right =
            item.x +
            item.width

          const bottom =
            item.y +
            item.height

          const boxRight =
            box.x + box.width

          const boxBottom =
            box.y + box.height

          return (
            left < boxRight &&
            right > box.x &&
            top < boxBottom &&
            bottom > box.y
          )
        })
        .map(item => item.id)

      p.setSelectedIds(selected)

      setMarquee(null)
    }
  }

  /*
   * -------------------------------------------------------
   * DRAG
   * -------------------------------------------------------
   */

  const handleDrag = (
    id: string,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    const node = e.target

    let x = node.x()
    let y = node.y()

    /*
     * Snap unless holding Shift.
     */
    if (!e.evt.shiftKey) {
      x = snap(x)
      y = snap(y)
    }

    /*
     * Alt/Option duplicate.
     */
    if (
      e.evt.altKey &&
      duplicatePreview !== id
    ) {
      setDuplicatePreview(id)

      const original =
        p.items.find(
          item => item.id === id
        )

      if (original) {
        const copy: CanvasItem = {
          ...structuredClone(
            original
          ),

          id: createId(
            original.type
          ),

          x: x + 24,
          y: y + 24,

          zIndex:
            p.items.length + 1,
        }

        p.addItem(copy)

        p.setSelectedIds([
          copy.id,
        ])
      }

      return
    }

    p.updateItem(id, {
      x,
      y,
    })
  }

  /*
   * -------------------------------------------------------
   * TRANSFORM
   * -------------------------------------------------------
   */

  const handleTransform = (
    id: string,
    node: Konva.Node
  ) => {
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    const width =
      Math.max(
        8,
        node.width() * scaleX
      )

    const height =
      Math.max(
        8,
        node.height() * scaleY
      )

    node.scale({
      x: 1,
      y: 1,
    })

    let rotation =
      node.rotation()

    /*
     * Snap rotation to 15 degrees.
     */
    if (
      Math.abs(
        rotation % 15
      ) < 3
    ) {
      rotation =
        Math.round(
          rotation / 15
        ) * 15
    }

    p.updateItem(id, {
      x: snap(node.x()),
      y: snap(node.y()),
      width,
      height,
      rotation,
    })
  }

  /*
   * -------------------------------------------------------
   * TRANSFORMER
   * -------------------------------------------------------
   */

  useEffect(() => {
    const transformer =
      transformerRef.current

    const stage =
      stageRef.current

    if (
      !transformer ||
      !stage
    ) {
      return
    }

    const nodes = p.selectedIds
      .map(id =>
        stage.findOne(
          `#${id}`
        )
      )
      .filter(Boolean) as Konva.Node[]

    transformer.nodes(nodes)

    transformer.getLayer()?.batchDraw()
  }, [
    p.selectedIds,
    p.items,
  ])

  useEffect(() => {
    let cancelled = false

    const restoreMissingPreviews = async () => {
      const files = p.items.filter(item =>
        item.type === "file" && item.fileData && item.previewText === undefined
      )

      for (const item of files) {
        try {
          const response = await fetch(item.fileData!)
          const blob = await response.blob()
          const file = new File([blob], item.fileName ?? "document", {
            type: item.mimeType || blob.type,
          })
          const previewText = await getDocumentPreview(file)
          const previewSheets = /\.(xlsx|xls)$/i.test(file.name)
            ? await getSpreadsheetSheets(file)
            : undefined
          if (!cancelled) {
            p.updateItem(item.id, {
              previewText: previewText || "Preview unavailable. Double-click to open.",
              previewSheets,
            })
          }
        } catch {
          if (!cancelled) {
            p.updateItem(item.id, {
              previewText: "Preview unavailable. Double-click to open.",
            })
          }
        }
      }
    }

    void restoreMissingPreviews()
    return () => {
      cancelled = true
    }
  }, [p.items, p.updateItem])

  /*
   * -------------------------------------------------------
   * OBJECTS
   * -------------------------------------------------------
   */

  const renderedItems = useMemo(
    () =>
      [...p.items]
        .sort(
          (a, b) =>
            a.zIndex -
            b.zIndex
        ),
    [p.items]
  )

  /*
   * -------------------------------------------------------
   * STAGE POSITION
   * -------------------------------------------------------
   */

  const stageX =
    stageRef.current?.x() ?? 0

  const stageY =
    stageRef.current?.y() ?? 0

  /*
   * -------------------------------------------------------
   * CURSOR
   * -------------------------------------------------------
   */

  const cursorClass =
    isPanning || spacePressed
      ? "cursor-grabbing"
      : p.tool === "select"
        ? "cursor-default"
        : p.tool === "pen"
          ? "cursor-crosshair"
          : "cursor-crosshair"

  const openFile = (item: CanvasItem) => {
    if (!item.fileData) return

    const link = document.createElement("a")
    link.href = item.fileData
    link.download = item.fileName ?? "infinite-paper-file"
    link.click()
  }

  return (
    <div
      ref={wrapRef}
      className={`relative flex-1 overflow-hidden canvas-grid ${cursorClass}`}
      style={{ touchAction: "none" }}
      onContextMenu={e =>
        e.preventDefault()
      }
    >

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}

        draggable={
          spacePressed ||
          isPanning
        }

        onWheel={handleWheel}

        onPointerDown={
          pointerDown
        }

        onPointerMove={
          pointerMove
        }

        onPointerUp={
          pointerUp
        }

        onDblClick={e => {
          const id =
            e.target.id()

          const item =
            p.items.find(
              i => i.id === id
            )

          if (
            item?.type ===
            "text"
          ) {
            setEditingText(id)

            setDraftText(
              item.content ?? ""
            )
          }

        }}
      >

        <Layer>

          {/* HUGE CANVAS BACKGROUND */}

          <Rect
            name="canvas-background"
            x={-100000}
            y={-100000}
            width={200000}
            height={200000}
            fill="#f7f7f5"
          />

          {/* GRID */}

          {Array.from(
            {
              length: Math.ceil(
                size.width /
                  LARGE_GRID_SIZE
              ) + 20,
            }
          ).map((_, index) => {
            const x =
              -10 *
                LARGE_GRID_SIZE +
              index *
                LARGE_GRID_SIZE

            return (
              <Line
                key={`grid-x-${index}`}
                points={[
                  x,
                  -100000,
                  x,
                  100000,
                ]}
                stroke="#e8e8e5"
                strokeWidth={
                  0.7
                }
                listening={false}
              />
            )
          })}

          {Array.from(
            {
              length: Math.ceil(
                size.height /
                  LARGE_GRID_SIZE
              ) + 20,
            }
          ).map((_, index) => {
            const y =
              -10 *
                LARGE_GRID_SIZE +
              index *
                LARGE_GRID_SIZE

            return (
              <Line
                key={`grid-y-${index}`}
                points={[
                  -100000,
                  y,
                  100000,
                  y,
                ]}
                stroke="#e8e8e5"
                strokeWidth={
                  0.7
                }
                listening={false}
              />
            )
          })}

          {/* OBJECTS */}

          {renderedItems.map(
            item => {
              const common = {
                id: item.id,

                x: item.x,
                y: item.y,

                rotation:
                  item.rotation,

                draggable:
                  p.tool ===
                    "select" &&
                  !spacePressed,

                onClick: (
                  e: Konva.KonvaEventObject<MouseEvent>
                ) => {
                  e.cancelBubble =
                    true

                  select(
                    item.id,
                    e.evt.shiftKey ||
                      e.evt.metaKey ||
                      e.evt.ctrlKey
                  )
                },

                onTap: (
                  e: Konva.KonvaEventObject<PointerEvent>
                ) => {
                  e.cancelBubble =
                    true

                  select(
                    item.id,
                    e.evt.shiftKey ||
                      e.evt.metaKey ||
                      e.evt.ctrlKey
                  )
                },

                onDragEnd: (
                  e: Konva.KonvaEventObject<DragEvent>
                ) =>
                  handleDrag(
                    item.id,
                    e
                  ),

                onTransformEnd: (
                  e: Konva.KonvaEventObject<Event>
                ) =>
                  handleTransform(
                    item.id,
                    e.target
                  ),
              }

              /*
               * RECTANGLE
               */

              if (
                item.type ===
                "rectangle"
              ) {
                return (
                  <Rect
                    key={item.id}
                    {...common}
                    width={
                      item.width
                    }
                    height={
                      item.height
                    }
                    fill={
                      item.style
                        ?.fill
                    }
                    stroke={
                      item.style
                        ?.stroke
                    }
                    strokeWidth={
                      item.style
                        ?.strokeWidth ??
                      2
                    }
                    cornerRadius={
                      10
                    }
                  />
                )
              }

              /*
               * CIRCLE
               */

              if (
                item.type ===
                "circle"
              ) {
                return (
                  <Circle
                    key={item.id}
                    {...common}
                    radius={
                      Math.min(
                        item.width,
                        item.height
                      ) / 2
                    }
                    offsetX={
                      -item.width /
                      2
                    }
                    offsetY={
                      -item.height /
                      2
                    }
                    fill={
                      item.style
                        ?.fill
                    }
                    stroke={
                      item.style
                        ?.stroke
                    }
                    strokeWidth={
                      item.style
                        ?.strokeWidth ??
                      2
                    }
                  />
                )
              }

              /*
               * LINE
               */

              if (
                item.type ===
                "line"
              ) {
                return (
                  <Line
                    key={item.id}
                    {...common}
                    points={
                      item.points ??
                      [
                        0,
                        0,
                        item.width,
                        0,
                      ]
                    }
                    stroke={
                      item.style
                        ?.stroke
                    }
                    strokeWidth={
                      item.style
                        ?.strokeWidth ??
                      3
                    }
                    lineCap="round"
                  />
                )
              }

              /*
               * ARROW
               */

              if (
                item.type ===
                "arrow"
              ) {
                return (
                  <Arrow
                    key={item.id}
                    {...common}
                    points={
                      item.points ??
                      [
                        0,
                        15,
                        item.width,
                        15,
                      ]
                    }
                    stroke={
                      item.style
                        ?.stroke
                    }
                    fill={
                      item.style
                        ?.stroke
                    }
                    strokeWidth={
                      item.style
                        ?.strokeWidth ??
                      3
                    }
                    pointerLength={
                      12
                    }
                    pointerWidth={
                      12
                    }
                  />
                )
              }

              /*
               * PEN
               */

              if (
                item.type ===
                "pen"
              ) {
                return (
                  <Line
                    key={item.id}
                    {...common}
                    points={
                      item.points ??
                      []
                    }
                    stroke={
                      item.style
                        ?.stroke
                    }
                    strokeWidth={
                      item.style
                        ?.strokeWidth ??
                      3
                    }
                    lineCap="round"
                    lineJoin="round"
                    tension={
                      0.15
                    }
                  />
                )
              }

              /*
               * IMAGE
               */

              if (
                item.type ===
                "image"
              ) {
                return (
                  <ImageNode
                    key={item.id}
                    item={item}
                    common={common}
                  />
                )
              }

              if (item.type === "file") {
                if (item.mimeType?.startsWith("image/") && item.fileData) {
                  return (
                    <ImageNode
                      key={item.id}
                      item={{ ...item, src: item.fileData }}
                      common={{ ...common, onDblClick: () => openFile(item) }}
                    />
                  )
                }

                const extension = item.fileName?.split(".").pop()?.toUpperCase() ?? "FILE"
                return (
                  <Group key={item.id} {...common} onDblClick={() => openFile(item)}>
                    <Rect
                      width={item.width}
                      height={item.height}
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth={1}
                      cornerRadius={12}
                      shadowColor="#0f172a"
                      shadowBlur={12}
                      shadowOpacity={0.08}
                      shadowOffsetY={4}
                    />
                    <Rect x={20} y={20} width={54} height={68} fill="#e2e8f0" cornerRadius={8} />
                    <Text x={20} y={42} width={54} text={extension.slice(0, 5)} align="center" fontSize={12} fontStyle="bold" fill="#475569" />
                    <Text x={92} y={24} width={item.width - 112} text={item.fileName ?? "Untitled file"} fontSize={18} fontStyle="bold" fill="#0f172a" wrap="word" ellipsis />
                    <Text x={92} y={78} width={item.width - 112} text="Select to preview · double-click to download" fontSize={12} fill="#64748b" />
                    {item.previewText && (
                      <Text x={20} y={112} width={item.width - 40} height={item.height - 150} text={item.previewText} fontSize={13} fill="#334155" lineHeight={1.35} wrap="word" ellipsis />
                    )}
                    <Text x={20} y={item.height - 30} width={item.width - 40} text={item.mimeType ?? "File attachment"} fontSize={11} fill="#94a3b8" ellipsis />
                  </Group>
                )
              }

              /*
               * TEXT
               */

              if (
                item.type ===
                "text"
              ) {
                return (
                  <Text
                    key={item.id}
                    {...common}
                    text={
                      (
                        item.content ??
                        ""
                      ).replace(
                        /<[^>]+>/g,
                        ""
                      )
                    }
                    width={
                      item.width
                    }
                    height={
                      item.height
                    }
                    fontFamily={
                      item.style
                        ?.fontFamily ??
                      "Inter"
                    }
                    fontSize={
                      item.style
                        ?.fontSize ??
                      28
                    }
                    fill={
                      item.style
                        ?.fill ??
                      "#111827"
                    }
                    fontStyle={
                      item.style
                        ?.fontStyle ??
                      "normal"
                    }
                    textDecoration={
                      item.style
                        ?.textDecoration ??
                      "none"
                    }
                    align={
                      item.style
                        ?.align ??
                      "left"
                    }
                    verticalAlign="middle"
                    lineHeight={
                      item.style
                        ?.lineHeight ??
                      1.2
                    }
                  />
                )
              }

              /*
               * TABLE
               */

              if (
                item.type ===
                  "table" &&
                item.table
              ) {
                const cw =
                  item.width /
                  item.table
                    .cols

                const ch =
                  item.height /
                  item.table
                    .rows

                return (
                  <Group
                    key={item.id}
                    {...common}
                  >
                    {Array.from(
                      {
                        length:
                          item.table
                            .rows,
                      }
                    ).flatMap(
                      (_, r) =>
                        Array.from(
                          {
                            length:
                              item
                                .table!
                                .cols,
                          }
                        ).map(
                          (_, c) => (
                            <Group
                              key={`${r}-${c}`}
                            >
                              <Rect
                                x={
                                  c *
                                  cw
                                }
                                y={
                                  r *
                                  ch
                                }
                                width={
                                  cw
                                }
                                height={
                                  ch
                                }
                                fill={
                                  item
                                    .style
                                    ?.fill ??
                                  "#ffffff"
                                }
                                stroke={
                                  item
                                    .style
                                    ?.stroke ??
                                  "#cbd5e1"
                                }
                                strokeWidth={
                                  1
                                }
                                onDblClick={e => {
                                  e.cancelBubble =
                                    true

                                  setEditingCell(
                                    {
                                      id: item.id,
                                      row: r,
                                      col: c,
                                    }
                                  )
                                }}
                              />

                              <Text
                                x={
                                  c *
                                    cw +
                                  8
                                }
                                y={
                                  r *
                                    ch +
                                  7
                                }
                                width={
                                  cw -
                                  16
                                }
                                height={
                                  ch -
                                  14
                                }
                                text={
                                  item
                                    .table!
                                    .cells[
                                      r
                                    ][c]
                                }
                                fontSize={
                                  14
                                }
                                fill="#334155"
                                verticalAlign="middle"
                                listening={
                                  false
                                }
                              />
                            </Group>
                          )
                        )
                    )}
                  </Group>
                )
              }

              return null
            }
          )}

          {/* SELECTION TRANSFORMER */}

          <Transformer
            ref={
              transformerRef
            }
            rotateEnabled
            rotateAnchorOffset={28}
            rotateAnchorCursor="crosshair"
            enabledAnchors={[
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right",
            ]}
            boundBoxFunc={(
              oldBox,
              newBox
            ) => {
              if (
                newBox.width <
                  8 ||
                newBox.height <
                  8
              ) {
                return oldBox
              }

              return newBox
            }}
            borderStroke="#2563eb"
            anchorStroke="#2563eb"
            anchorFill="#ffffff"
            anchorSize={13}
            anchorCornerRadius={7}
            anchorStrokeWidth={2}
            shouldOverdrawWholeArea
            borderDash={[
              4,
              4,
            ]}
            padding={4}
          />

          {/* MARQUEE */}

          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={
                marquee.width
              }
              height={
                marquee.height
              }
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              strokeWidth={1}
              dash={[
                5,
                5,
              ]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* TEXT EDITOR */}

      {editingText &&
        (() => {
          const item =
            p.items.find(
              i =>
                i.id ===
                editingText
            )

          if (!item) return null

          const style =
            item.style ?? {}

          return (
            <RichTextEditor
              value={draftText}
              x={
                stageX +
                item.x *
                  zoom
              }
              y={
                stageY +
                item.y *
                  zoom
              }
              width={
                item.width *
                zoom
              }
              height={
                item.height *
                zoom
              }
              zoom={1}
              fontFamily={
                style.fontFamily ??
                "Inter"
              }
              fontSize={
                (style.fontSize ??
                  28) *
                zoom
              }
              color={
                style.fill ??
                "#111827"
              }
              align={
                style.align ??
                "left"
              }
              bold={
                style.fontStyle ===
                "bold"
              }
              italic={
                style.fontStyle ===
                "italic"
              }
              underline={
                style.textDecoration ===
                "underline"
              }
              onChange={
                setDraftText
              }
              onCommit={() => {
                p.updateItem(
                  editingText,
                  {
                    content:
                      draftText,
                  }
                )

                setEditingText(
                  null
                )
              }}
            />
          )
        })()}

      {/* TABLE CELL EDITOR */}

      {editingCell &&
        (() => {
          const tableItem =
            p.items.find(
              i =>
                i.id ===
                editingCell.id
            )

          if (
            !tableItem?.table
          ) {
            return null
          }

          const cw =
            tableItem.width /
            tableItem.table
              .cols

          const ch =
            tableItem.height /
            tableItem.table
              .rows

          const cellValue =
            tableItem.table
              .cells[
                editingCell.row
              ][
                editingCell.col
              ]

          return (
            <input
              autoFocus

              className="absolute z-50 rounded-md border border-blue-500 bg-white px-2 text-sm outline-none shadow-lg"

              style={{
                left:
                  stageX +
                  (
                    tableItem.x +
                    editingCell.col *
                      cw
                  ) *
                    zoom,

                top:
                  stageY +
                  (
                    tableItem.y +
                    editingCell.row *
                      ch
                  ) *
                    zoom,

                width:
                  cw * zoom,

                height:
                  ch * zoom,
              }}

              defaultValue={
                cellValue
              }

              onBlur={e => {
                const cells =
                  tableItem.table!.cells.map(
                    row => [
                      ...row,
                    ]
                  )

                cells[
                  editingCell.row
                ][
                  editingCell.col
                ] =
                  e.target.value

                p.updateItem(
                  tableItem.id,
                  {
                    table: {
                      ...tableItem.table!,
                      cells,
                    },
                  }
                )

                setEditingCell(
                  null
                )
              }}

              onKeyDown={e => {
                if (
                  e.key ===
                  "Enter"
                ) {
                  e.currentTarget.blur()
                }

                if (
                  e.key ===
                  "Escape"
                ) {
                  setEditingCell(
                    null
                  )
                }
              }}
            />
          )
        })()}

      <input
        id="file-upload-input"
        type="file"
        accept="*/*"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0]
          if (!file) return

          let previewText = ""
          let previewSheets: CanvasItem["previewSheets"]
          try {
            previewText = await getDocumentPreview(file)
            if (/\.(xlsx|xls)$/i.test(file.name)) {
              previewSheets = await getSpreadsheetSheets(file)
            }
          } catch (error) {
            console.warn("Unable to preview document:", error)
          }

          const reader = new FileReader()
          reader.onload = () => {
            const pos = (window as any).__infinitePaperPendingFile ?? { x: 120, y: 120 }
            const item: CanvasItem = {
              id: createId("file"),
              type: "file",
              x: snap(pos.x),
              y: snap(pos.y),
              width: FILE_CARD_WIDTH,
              height: FILE_CARD_HEIGHT,
              rotation: 0,
              zIndex: p.items.length + 1,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              fileData: reader.result as string,
              previewText,
              previewSheets,
            }
            p.addItem(item)
            p.setTool("select")
            p.setSelectedIds([item.id])
          }
          reader.readAsDataURL(file)
          event.currentTarget.value = ""
        }}
      />

      {/* CANVAS HUD */}

      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">

        <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">

          {Math.round(
            zoom * 100
          )}
          %
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-400 shadow-sm backdrop-blur">

          {p.items.length}{" "}
          objects
        </div>

      </div>
    </div>
  )
}