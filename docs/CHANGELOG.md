# Changelog

## 0.1.0 — first public release

- Floating landscape canvas and a separate portrait canvas in the right sidebar.
- Pen, line, arrow and eraser with a round eraser cursor; three widths and three inks; Shift snapping.
- Explicit save model: a PNG is encoded only on close or Insert, never while drawing.
- Export is cropped to the ink bounding box with a 26 px margin and upscaled up to 2.5× for small sketches.
- Undo, immediate clear, one-pointer lock, global `Esc`, and a single empty-board hint.
- Images are attached through the host's draft-attachment API; no send method is wrapped and no network request is made.
