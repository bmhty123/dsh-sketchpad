# Changelog

## Unreleased

- **入口收进「+」菜单**：在输入框「+」菜单里注册一项（`commandUi` 的 action），同时得到 `/sketchpad`；
  输入框左侧原来那个铅笔按钮已经去掉。宿主没有 `commandUi` 时退化为只有右侧栏入口。
- **中英文**：所有界面文案进了一本字典，按 `<html lang>` 选择，切换语言即时生效。
- **选中态**：工具、笔宽、色板三处统一成一层淡色底（品牌色 14%），不再用反色胶囊，
  色板也不再画圆环。
- **颜色快捷键**：`1` `2` `3` 切黑/红/蓝；在橡皮状态下按数字会顺带切回画笔。
- **重做**：撤销右边加了镜像图标（`Cmd/Ctrl+Shift+Z`、`Ctrl+Y`）；撤销掉的一笔进 redo 栈，
  落新笔时清空该栈。
- **清空**：从文字胶囊改成垃圾桶图标，挪到撤销左边，只有画布上真有笔画时可点；
  清空这一步本身可撤销（撤销把整把笔画还回来），也能再重做回去。
- **浮层尺寸**：遮罩上方留 48px 让开窗口按钮；面板宽度取 `min(1040px, 视口宽 - 64px, (视口高 - 160px) × 1.6 + 24px)`，
  高度跟着画布走 —— 窗口再大，浮层也不会撑出多余的空白。
- **确认按钮**：主操作推到工具条最右端，文案改成「完成」，
  右侧跟一个缩小变暗的 ↵ 作为快捷键提示；浮窗里按 **Enter** 等同于点它，焦点在文本输入里时让给输入框。
- **关闭不再插入图片**：`×`、`Esc`、点遮罩都只是收起窗口，输入框不受影响；
  只有「完成」才把画面挂成附件。原来"关闭即保存"的那条管线整段删掉了。
- **每次打开都是新画布，但撤销能回去**：结束一轮的两种方式（点「完成」、点 × 或 Esc）都会把
  这一轮的笔画移进 `cleared`，等于一次可撤销的清空；画布清空、`liveId` 断开。
  所以空白画板上点撤销，就能把上一轮那张拿回来，再重做又变回空。
  这一轮什么都没画就退出的话不清 `cleared`，所以「第 1 轮画了 → 第 2 轮进来又退出 → 第 3 轮再进来」
  依然能撤销回第 1 轮；撤销一次后 `cleared` 就空了，不会一路撤到白板。
  原来那个「上一张」胶囊因此不再需要，已经删掉。

---

## 0.1.0 — first public release

- Floating landscape canvas and a separate portrait canvas in the right sidebar.
- Pen, line, arrow and eraser with a round eraser cursor; three widths and three inks; Shift snapping.
- Explicit save model: a PNG is encoded only on close or Insert, never while drawing.
- Export is cropped to the ink bounding box with a 26 px margin and upscaled up to 2.5× for small sketches.
- Undo, immediate clear, one-pointer lock, global `Esc`, and a single empty-board hint.
- Images are attached through the host's draft-attachment API; no send method is wrapped and no network request is made.
