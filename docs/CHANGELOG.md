# Changelog

## 0.1.1 — touchscreen palm rejection

- Palm rejection on touch screens, without a mode switch: while the pen is down, touch input is ignored (and for 0.3 s after it lifts).
- Palm-sized contacts are dropped, using a threshold that adapts to the finger size this device reports (`max(55 px, median × 1.5)`), so a large finger is not mistaken for a palm.
- Touch input must travel 5 px before any ink appears, so resting a hand or a light tap leaves no dot; a stylus or mouse tap still makes a dot.
- A finger landing on a resting palm takes the stroke over, so the palm never blocks drawing.
- `pointercancel` now discards the unfinished stroke instead of committing it.
- Latency: committing a stroke no longer repaints the whole board, so the cost of finishing a stroke stays flat as the drawing grows (about 0.1 ms instead of 4.4 ms at 1000 strokes in a Chromium benchmark). Undo and clear repaint once instead of twice, the shape preview clears only its previous bounds, and the eraser ring skips redundant style writes.
- The eraser is now a stroke deleter: tap a stroke or drag across several to remove them whole, with a hit area that matches the round cursor. Deleting repaints only the removed stroke's bounding box, so dragging across a busy board stays cheap.
- Undo keeps the last 40 steps as before/after snapshots, so strokes, deletions and clears are all undoable; redo puts them back (`Ctrl/Cmd+Shift+Z`). A two-finger tap on the board still undoes.
- New entry points: a **Sketchpad** row in the composer's `+` menu and a `/sketchpad` command. UI copy follows the host language (Chinese and English).
- Clearing the board is now undoable, and the toolbar gained a redo button.
- The `+` menu entry, bilingual copy, redo and the layout fixes come from the community PR #1 by @dyguests.
- The main canvas uses an opaque, desynchronized 2D context, which lets Chromium take the low-latency compositing path.

## 0.1.0 — first public release

- Floating landscape canvas and a separate portrait canvas in the right sidebar.
- Pen, line, arrow and eraser with a round eraser cursor; three widths and three inks; Shift snapping.
- Explicit save model: a PNG is encoded only on close or Insert, never while drawing.
- Export is cropped to the ink bounding box with a 26 px margin and upscaled up to 2.5× for small sketches.
- Undo, immediate clear, one-pointer lock, global `Esc`, and a single empty-board hint.
- Images are attached through the host's draft-attachment API; no send method is wrapped and no network request is made.
