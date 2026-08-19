# Infinite Paper

A freeform workspace built with React, TypeScript, Tailwind CSS, and Konva/react-konva. It combines text, drawings, tables, images, and imported documents in one editable canvas.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Production

Build the deployable website with:

```bash
npm run build
```

Deploy the generated `dist` folder to a static HTTPS host such as Vercel or Netlify. The app includes PWA support and can be installed from a supported browser.

## Save and share

Use the toolbar to save or share an editable `.paper` file. The file preserves canvas objects and embeds imported images, Word documents, PDFs, spreadsheets, and other attachments. A receiver opens the deployed Infinite Paper website and imports the `.paper` file. Installed PWAs on supporting browsers can associate `.paper` files with the app and open them directly.

## Architecture

- `App.tsx` — document state, history/future stacks, clipboard, keyboard shortcuts.
- `types.ts` — independent `CanvasItem` object model.
- `CanvasStage.tsx` — Konva stage, object rendering, selection, transform, pan/zoom and creation interactions.
- `ToolRail.tsx` — canvas tools.
- `Toolbar.tsx` — document commands.
- `Inspector.tsx` — object properties and text styling.
- `RichTextEditor.tsx` — DOM-backed editing surface separated from the Konva display layer.
- `utils.ts` — IDs, cloning and coordinate conversion.

## Current capabilities

Select, multi-select, drag, resize, rotate, delete, duplicate, copy/paste, undo/redo, z-order, text insertion/editing, image upload, rectangle, circle, line, arrow, freehand pen, basic table insertion, project autosave, `.paper` import/export, PWA support, and previews for images, DOCX, PDF, XLSX, XLS, and CSV files.

## Intentional prototype limitations

1. The table grid is currently visual/basic rather than a spreadsheet-style cell editor.
2. Rich text editing is represented as an independent DOM editor layer and the canvas display uses a normalized text representation; full per-character rich-text rendering on Konva is a future model/rendering step.
3. Image rendering is wired through the item model; advanced crop/mask controls are not included.
4. The stage is "infinite-style" through a very large coordinate space rather than a literal infinite bitmap.
5. Imported office files are preserved and previewed; they are not fully edited as native Word, PowerPoint, or Excel documents inside the canvas.
6. There is no cloud collaboration, authentication, AI, audio/video, payments, or backend.
7. History is in-memory for the current session; the document itself autosaves locally and can be exported as `.paper`.
