# Changelog

## 0.1.1 — touchscreen palm rejection

- Palm rejection on touch screens, without a mode switch: while the pen is down, touch input is ignored (and for 0.3 s after it lifts).
- Palm-sized contacts are dropped, using a threshold that adapts to the finger size this device reports (`max(55 px, median × 1.5)`), so a large finger is not mistaken for a palm.
- Touch input must travel 5 px before any ink appears, so resting a hand or a light tap leaves no dot; a stylus or mouse tap still makes a dot.
- A finger landing on a resting palm takes the stroke over, so the palm never blocks drawing.
- `pointercancel` now discards the unfinished stroke instead of committing it.

## 0.1.0 — first public release

- Floating landscape canvas and a separate portrait canvas in the right sidebar.
- Pen, line, arrow and eraser with a round eraser cursor; three widths and three inks; Shift snapping.
- Explicit save model: a PNG is encoded only on close or Insert, never while drawing.
- Export is cropped to the ink bounding box with a 26 px margin and upscaled up to 2.5× for small sketches.
- Undo, immediate clear, one-pointer lock, global `Esc`, and a single empty-board hint.
- Images are attached through the host's draft-attachment API; no send method is wrapped and no network request is made.
