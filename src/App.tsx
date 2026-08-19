import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Toolbar from "./components/Toolbar"
import ToolRail from "./components/ToolRail"
import Inspector from "./components/Inspector"
import CanvasStage from "./components/CanvasStage"
import type { CanvasItem, Tool } from "./types"
import { cloneItems } from "./utils"

const STORAGE_KEY = "infinite-paper-document-v2"
const PAPER_FILE_VERSION = 1
const PAPER_MIME_TYPE = "application/x-infinite-paper"

const canvasCommand = (type: string, detail?: unknown) => {
  window.dispatchEvent(
    new CustomEvent(type, {
      detail,
    })
  )
}

const createId = (type: string) => {
  return `${type}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null

  if (!element) return false

  return (
    element.isContentEditable ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  )
}

const getNextZIndex = (items: CanvasItem[]) => {
  if (!items.length) return 1

  return Math.max(...items.map(item => item.zIndex ?? 0)) + 1
}

type PaperLaunchQueue = {
  setConsumer: (consumer: (launchParams: { files: FileSystemFileHandle[] }) => Promise<void>) => void
}

type PaperWindow = Window & {
  launchQueue?: PaperLaunchQueue
}

export default function App() {
  const [tool, setTool] = useState<Tool>("select")

  const [items, setItems] = useState<CanvasItem[]>([])

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [history, setHistory] = useState<CanvasItem[][]>([])

  const [future, setFuture] = useState<CanvasItem[][]>([])

  const [clipboard, setClipboard] = useState<CanvasItem[]>([])

  const [zoom, setZoom] = useState(1)

  const [saved, setSaved] = useState(true)

  const [documentReady, setDocumentReady] = useState(false)

  /*
   * Used to avoid stale state when multiple operations
   * happen very quickly.
   */
  const itemsRef = useRef<CanvasItem[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  /*
   * -------------------------------------------------------
   * LOAD DOCUMENT
   * -------------------------------------------------------
   */

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)

      if (stored) {
        const parsed = JSON.parse(stored)

        if (Array.isArray(parsed)) {
          setItems(parsed)
          itemsRef.current = parsed
        }
      }
    } catch (error) {
      console.warn("Unable to restore Infinite Paper document:", error)
    } finally {
      setDocumentReady(true)
    }
  }, [])

  /*
   * -------------------------------------------------------
   * AUTOSAVE
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!documentReady) return

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items))

        setSaved(true)
      } catch (error) {
        console.warn("Unable to autosave Infinite Paper document:", error)
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [items, documentReady])

  /*
   * -------------------------------------------------------
   * HISTORY
   * -------------------------------------------------------
   */

  const commit = useCallback(
    (next: CanvasItem[], options?: { history?: boolean }) => {
      const shouldSaveHistory = options?.history !== false

      if (shouldSaveHistory) {
        setHistory(previous => [
          ...previous.slice(-99),
          cloneItems(itemsRef.current),
        ])
      }

      setFuture([])

      setItems(next)
      itemsRef.current = next

      setSaved(false)
    },
    []
  )

  /*
   * -------------------------------------------------------
   * ADD
   * -------------------------------------------------------
   */

  const addItem = useCallback(
    (item: CanvasItem) => {
      const current = itemsRef.current

      const normalizedItem = {
        ...item,
        id: item.id || createId(item.type),
        zIndex:
          typeof item.zIndex === "number"
            ? item.zIndex
            : getNextZIndex(current),
      }

      commit([...current, normalizedItem])

      setSelectedIds([normalizedItem.id])
    },
    [commit]
  )

  /*
   * -------------------------------------------------------
   * UPDATE
   * -------------------------------------------------------
   */

  const updateItem = useCallback(
    (
      id: string,
      patch: Partial<CanvasItem> & {
        style?: CanvasItem["style"]
      }
    ) => {
      const current = itemsRef.current

      const next = current.map(item => {
        if (item.id !== id) return item

        return {
          ...item,
          ...patch,
          style: patch.style
            ? {
                ...item.style,
                ...patch.style,
              }
            : item.style,
        }
      })

      commit(next)
    },
    [commit]
  )

  /*
   * -------------------------------------------------------
   * DELETE
   * -------------------------------------------------------
   */

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return

    const current = itemsRef.current

    const next = current.filter(
      item => !selectedIds.includes(item.id)
    )

    commit(next)

    setSelectedIds([])
  }, [selectedIds, commit])

  /*
   * -------------------------------------------------------
   * COPY
   * -------------------------------------------------------
   */

  const copy = useCallback(() => {
    if (!selectedIds.length) return

    const current = itemsRef.current

    const selected = current.filter(item =>
      selectedIds.includes(item.id)
    )

    if (!selected.length) return

    setClipboard(cloneItems(selected))
  }, [selectedIds])

  /*
   * -------------------------------------------------------
   * PASTE
   * -------------------------------------------------------
   */

  const paste = useCallback(() => {
    if (!clipboard.length) return

    const current = itemsRef.current

    const baseZIndex = getNextZIndex(current)

    const pasted = clipboard.map((item, index) => ({
      ...structuredClone(item),

      id: createId(item.type),

      x: item.x + 32,

      y: item.y + 32,

      zIndex: baseZIndex + index,
    }))

    commit([...current, ...pasted])

    setSelectedIds(pasted.map(item => item.id))
  }, [clipboard, commit])

  /*
   * -------------------------------------------------------
   * DUPLICATE
   * -------------------------------------------------------
   */

  const duplicate = useCallback(() => {
    if (!selectedIds.length) return

    const current = itemsRef.current

    const selected = current.filter(item =>
      selectedIds.includes(item.id)
    )

    if (!selected.length) return

    const baseZIndex = getNextZIndex(current)

    const copies = selected.map((item, index) => ({
      ...structuredClone(item),

      id: createId(item.type),

      x: item.x + 24,

      y: item.y + 24,

      zIndex: baseZIndex + index,
    }))

    commit([...current, ...copies])

    setSelectedIds(copies.map(item => item.id))
  }, [selectedIds, commit])

  /*
   * -------------------------------------------------------
   * LAYER MANAGEMENT
   * -------------------------------------------------------
   */

  const moveZ = useCallback(
    (direction: "front" | "back") => {
      if (!selectedIds.length) return

      const current = itemsRef.current

      if (direction === "front") {
        const highest = getNextZIndex(current)

        const next = current.map(item =>
          selectedIds.includes(item.id)
            ? {
                ...item,
                zIndex: highest,
              }
            : item
        )

        commit(next)

        return
      }

      const lowest = Math.min(
        ...current.map(item => item.zIndex ?? 0)
      )

      const next = current.map(item =>
        selectedIds.includes(item.id)
          ? {
              ...item,
              zIndex: lowest - 1,
            }
          : item
      )

      commit(next)
    },
    [selectedIds, commit]
  )

  const bringForward = useCallback(() => {
    if (!selectedIds.length) return

    const current = itemsRef.current

    const selected = current
      .filter(item => selectedIds.includes(item.id))
      .sort((a, b) => a.zIndex - b.zIndex)

    const next = [...current]

    selected.forEach(item => {
      const index = next.findIndex(i => i.id === item.id)

      if (index < next.length - 1) {
        const other = next[index + 1]

        const currentZ = item.zIndex
        item.zIndex = other.zIndex
        other.zIndex = currentZ
      }
    })

    commit(next)
  }, [selectedIds, commit])

  const sendBackward = useCallback(() => {
    if (!selectedIds.length) return

    const current = itemsRef.current

    const selected = current
      .filter(item => selectedIds.includes(item.id))
      .sort((a, b) => a.zIndex - b.zIndex)

    const next = [...current]

    selected.forEach(item => {
      const index = next.findIndex(i => i.id === item.id)

      if (index > 0) {
        const other = next[index - 1]

        const currentZ = item.zIndex
        item.zIndex = other.zIndex
        other.zIndex = currentZ
      }
    })

    commit(next)
  }, [selectedIds, commit])

  /*
   * -------------------------------------------------------
   * SELECT ALL
   * -------------------------------------------------------
   */

  const selectAll = useCallback(() => {
    const current = itemsRef.current

    setSelectedIds(current.map(item => item.id))
  }, [])

  /*
   * -------------------------------------------------------
   * UNDO
   * -------------------------------------------------------
   */

  const undo = useCallback(() => {
    if (!history.length) return

    const previous = history[history.length - 1]

    setHistory(current => current.slice(0, -1))

    setFuture(current => [
      cloneItems(itemsRef.current),
      ...current,
    ])

    setItems(cloneItems(previous))

    itemsRef.current = cloneItems(previous)

    setSelectedIds([])

    setSaved(false)
  }, [history])

  /*
   * -------------------------------------------------------
   * REDO
   * -------------------------------------------------------
   */

  const redo = useCallback(() => {
    if (!future.length) return

    const next = future[0]

    setFuture(current => current.slice(1))

    setHistory(current => [
      ...current,
      cloneItems(itemsRef.current),
    ])

    setItems(cloneItems(next))

    itemsRef.current = cloneItems(next)

    setSelectedIds([])

    setSaved(false)
  }, [future])

  /*
   * -------------------------------------------------------
   * MOVE SELECTED
   * -------------------------------------------------------
   */

  const moveSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedIds.length) return

      const current = itemsRef.current

      const next = current.map(item => {
        if (!selectedIds.includes(item.id)) {
          return item
        }

        return {
          ...item,
          x: item.x + dx,
          y: item.y + dy,
        }
      })

      commit(next)
    },
    [selectedIds, commit]
  )

  /*
   * -------------------------------------------------------
   * ZOOM
   * -------------------------------------------------------
   */

  useEffect(() => {
    const onZoomChanged = (event: Event) => {
      const value = (event as CustomEvent<number>).detail

      if (typeof value === "number") {
        setZoom(value)
      }
    }

    window.addEventListener(
      "infinite-paper-zoom-changed",
      onZoomChanged
    )

    return () => {
      window.removeEventListener(
        "infinite-paper-zoom-changed",
        onZoomChanged
      )
    }
  }, [])

  /*
   * -------------------------------------------------------
   * SAVE
   * -------------------------------------------------------
   */

  const saveDocument = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(itemsRef.current)
      )

      setSaved(true)

      canvasCommand("infinite-paper-saved")
    } catch (error) {
      console.warn("Unable to save document:", error)
    }
  }, [])

  const newDocument = useCallback(() => {
    if (itemsRef.current.length && !window.confirm("Start a new paper? Unsaved changes will be cleared.")) return
    setHistory([])
    setFuture([])
    setSelectedIds([])
    setItems([])
    itemsRef.current = []
    setSaved(false)
  }, [])

  const exportDocument = useCallback(() => {
    const projectDocument = JSON.stringify({
      app: "infinite-paper",
      version: PAPER_FILE_VERSION,
      items: itemsRef.current,
    }, null, 2)
    const blob = new Blob([projectDocument], { type: PAPER_MIME_TYPE })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement("a")
    link.href = url
    link.download = `infinite-paper-${new Date().toISOString().slice(0, 10)}.paper`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const shareDocument = useCallback(async () => {
    const projectDocument = JSON.stringify({
      app: "infinite-paper",
      version: PAPER_FILE_VERSION,
      items: itemsRef.current,
    }, null, 2)
    const file = new File([projectDocument], "infinite-paper.paper", { type: PAPER_MIME_TYPE })

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: "Infinite Paper workspace",
          text: "Editable Infinite Paper workspace",
          files: [file],
        })
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.warn("Unable to share Infinite Paper file:", error)
    }

    exportDocument()
  }, [exportDocument])

  const importDocument = useCallback(async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const importedItems = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "items" in parsed
          ? (parsed as { items: unknown }).items
          : null

      if (!Array.isArray(importedItems) || importedItems.some(item => !item || typeof item !== "object" || typeof (item as CanvasItem).id !== "string" || typeof (item as CanvasItem).type !== "string")) {
        throw new Error("Invalid Infinite Paper file")
      }

      const next = cloneItems(importedItems as CanvasItem[])
      setHistory([])
      setFuture([])
      setSelectedIds([])
      setItems(next)
      itemsRef.current = next
      setSaved(false)
    } catch (error) {
      console.warn("Unable to import Infinite Paper document:", error)
      window.alert("This file is not a valid Infinite Paper document.")
    }
  }, [])

  useEffect(() => {
    const launchQueue = (window as PaperWindow).launchQueue
    if (!launchQueue) return

    launchQueue.setConsumer(async ({ files }) => {
      const handle = files[0]
      if (handle) await importDocument(await handle.getFile())
    })
  }, [importDocument])

  /*
   * -------------------------------------------------------
   * KEYBOARD SHORTCUTS
   * -------------------------------------------------------
   */

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey

      /*
       * Don't interfere with text editing.
       */
      if (isEditableTarget(event.target)) {
        if (
          modifier &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault()
          saveDocument()
        }

        return
      }

      /*
       * SAVE
       */
      if (
        modifier &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault()
        saveDocument()
        return
      }

      /*
       * UNDO
       */
      if (
        modifier &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault()

        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }

        return
      }

      /*
       * REDO
       */
      if (
        modifier &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault()
        redo()
        return
      }

      /*
       * COPY
       */
      if (
        modifier &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault()
        copy()
        return
      }

      /*
       * PASTE
       */
      if (
        modifier &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault()
        paste()
        return
      }

      /*
       * DUPLICATE
       */
      if (
        modifier &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault()
        duplicate()
        return
      }

      /*
       * SELECT ALL
       */
      if (
        modifier &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault()
        selectAll()
        return
      }

      /*
       * BRING TO FRONT
       */
      if (
        modifier &&
        event.key === "]"
      ) {
        event.preventDefault()
        moveZ("front")
        return
      }

      /*
       * SEND TO BACK
       */
      if (
        modifier &&
        event.key === "["
      ) {
        event.preventDefault()
        moveZ("back")
        return
      }

      /*
       * DELETE
       */
      if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        event.preventDefault()
        deleteSelected()
        return
      }

      /*
       * ESCAPE
       */
      if (event.key === "Escape") {
        setSelectedIds([])
        return
      }

      /*
       * TOOL SHORTCUTS
       */
      if (!modifier && !event.shiftKey) {
        switch (event.key.toLowerCase()) {
          case "v":
            setTool("select")
            return

          case "h":
            /*
             * Only change this if your Tool type contains "hand".
             */
            canvasCommand("infinite-paper-hand-tool")
            return

          case "t":
            canvasCommand("infinite-paper-text-tool")
            return

          case "0":
            canvasCommand("infinite-paper-fit")
            return

          case "1":
            canvasCommand("infinite-paper-zoom-to", 1)
            return

          case "2":
            canvasCommand("infinite-paper-fit")
            return
        }
      }

      /*
       * NUDGE
       */
      if (selectedIds.length) {
        const amount = event.shiftKey ? 10 : 1

        switch (event.key) {
          case "ArrowLeft":
            event.preventDefault()
            moveSelected(-amount, 0)
            return

          case "ArrowRight":
            event.preventDefault()
            moveSelected(amount, 0)
            return

          case "ArrowUp":
            event.preventDefault()
            moveSelected(0, -amount)
            return

          case "ArrowDown":
            event.preventDefault()
            moveSelected(0, amount)
            return
        }
      }
    }

    window.addEventListener("keydown", key)

    return () => {
      window.removeEventListener("keydown", key)
    }
  }, [
    undo,
    redo,
    copy,
    paste,
    duplicate,
    selectAll,
    moveZ,
    deleteSelected,
    moveSelected,
    saveDocument,
    selectedIds.length,
  ])

  /*
   * -------------------------------------------------------
   * SELECTED ITEM
   * -------------------------------------------------------
   */

  const selected = useMemo(() => {
    if (selectedIds.length !== 1) {
      return undefined
    }

    return items.find(
      item => item.id === selectedIds[0]
    )
  }, [items, selectedIds])

  /*
   * -------------------------------------------------------
   * MULTI-SELECTION
   * -------------------------------------------------------
   */

  const selectedCount = selectedIds.length

  /*
   * -------------------------------------------------------
   * RENDER
   * -------------------------------------------------------
   */

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f5f5f3] text-slate-900 flex flex-col">

      {/* TOP APPLICATION BAR */}

      <Toolbar
        tool={tool}
        setTool={setTool}
        zoom={zoom}

        onZoom={(delta) =>
          canvasCommand(
            "infinite-paper-zoom",
            delta
          )
        }

        onFit={() =>
          canvasCommand(
            "infinite-paper-fit"
          )
        }

        onUndo={undo}
        onRedo={redo}

        onCopy={copy}
        onPaste={paste}
        onDuplicate={duplicate}

        onDelete={deleteSelected}

        onFront={() =>
          moveZ("front")
        }

        onBack={() =>
          moveZ("back")
        }

        onExport={exportDocument}
        onShare={shareDocument}
        onNew={newDocument}
        onImport={importDocument}

        canUndo={history.length > 0}
        canRedo={future.length > 0}

        hasSelection={
          selectedIds.length > 0
        }
      />

      {/* MAIN WORKSPACE */}

      <div className="flex min-h-0 flex-1">

        {/* LEFT TOOL RAIL */}

        <ToolRail
          tool={tool}
          setTool={setTool}
        />

        {/* CANVAS */}

        <main className="relative min-w-0 min-h-0 flex-1">

          <CanvasStage
            items={items}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            updateItem={updateItem}
            addItem={addItem}
            deleteSelected={deleteSelected}
            tool={tool}
            setTool={setTool}
          />

          {/* SELECTION INFORMATION */}

          {selectedCount > 1 && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
              {selectedCount} objects selected
            </div>
          )}

          {/* SAVE STATUS */}

          <div className="pointer-events-none absolute bottom-4 left-4">

            <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">

              <span
                className={[
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                  saved
                    ? "bg-emerald-500"
                    : "bg-amber-500",
                ].join(" ")}
              />

              {saved
                ? "Saved"
                : "Saving…"}
            </div>

          </div>

        </main>

        {/* RIGHT INSPECTOR */}

        <Inspector
          item={selected}
          onChange={(patch) =>
            selected &&
            updateItem(
              selected.id,
              patch
            )
          }
        />

      </div>

      {/* PROFESSIONAL STATUS BAR */}

      <footer className="app-footer h-9 shrink-0 border-t border-slate-200 bg-white flex items-center justify-between px-4 text-[11px] text-slate-400">

        <div className="flex items-center gap-4">

          <span>
            {items.length}{" "}
            {items.length === 1
              ? "object"
              : "objects"}
          </span>

          {selectedCount > 0 && (
            <span>
              {selectedCount} selected
            </span>
          )}

          <span>
            {Math.round(zoom * 100)}%
          </span>

        </div>

        <div className="hidden md:flex items-center gap-4">

          <span>
            Space + Drag · Pan
          </span>

          <span>
            Shift + Click · Multi-select
          </span>

          <span>
            Ctrl/Cmd + D · Duplicate
          </span>

          <span>
            Ctrl/Cmd + S · Save
          </span>

        </div>

      </footer>
    </div>
  )
}