# Changelog

## 0.1.1 — touchscreen palm rejection

- Palm rejection on touch screens, without a mode switch: while a stylus is hovering or drawing, touch input is ignored (and for 1.5 s after the pen leaves).
- Contacts larger than 34 CSS px (palm-sized) are dropped before they can start a stroke.
- A second finger arriving mid-stroke cancels the stroke instead of mixing both samples into one line.
- Touch input must travel 5 px before any ink appears, so resting a hand or a light tap leaves no dot; a stylus or mouse tap still makes a dot.
- `pointercancel` now discards the unfinished stroke instead of committing it.

## 0.1.0 — first public release

- Floating landscape canvas and a separate portrait canvas in the right sidebar.
- Pen, line, arrow and eraser with a round eraser cursor; three widths and three inks; Shift snapping.
- Explicit save model: a PNG is encoded only on close or Insert, never while drawing.
- Export is cropped to the ink bounding box with a 26 px margin and upscaled up to 2.5× for small sketches.
- Undo, immediate clear, one-pointer lock, global `Esc`, and a single empty-board hint.
- Images are attached through the host's draft-attachment API; no send method is wrapped and no network request is made.
