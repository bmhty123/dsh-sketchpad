# 开发说明

这份文档写给要改 `dsh-sketchpad` 的人；面向用户的安装与使用说明在 [README.zh.md](../README.zh.md)。

## 结构

```
package.json       # dsh.bundle.patch / dsh.client / engines.dsh
cordis.patch.yml   # 作为 bundle 安装时插入的 Loader 行
lib/index.js       # 宿主半侧：export name + 空 apply
lib/client.js      # 浏览器半侧：画板、工具、附件桥、入口（手写，无构建）
docs/              # 本文件、CHANGELOG、README 用截图
```

## 客户端模块格式

`lib/client.js` 不是普通 ESM，而是 DSH Web 的客户端 bundle 格式：

```js
window.__ModuleLoader__.load({
  id: "dsh-sketchpad",
  factory: (require) => {
    const React = require("react");
    const { createPortal } = require("react-dom");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    // ...
    return { inject: ["slots", "sidebarRightTabs"], apply };
  },
});
```

`require` 只解析平台模块表里的白名单模块（见 `package.json` 的 `dsh.client.external`）：`react`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives`。不要 `import` 其他包，也不要依赖构建工具。

## 注册点

- `conversation.input.left`：输入框左侧的铅笔按钮（`DrawTrigger`），点击后用 `createPortal` 打开浮动画板。
- `conversation.input.right`：两个不可见组件（浮动 / 侧栏各一个），负责把画板快照挂成输入框附件。
- `sidebar.right.pane.tab`：右侧栏的「画板」面板。
- `sidebarRightTabs.register`：注册 tab 类型，`guide` 字段提供右侧栏开始页入口。

## 状态模型

模块级 `boards: Map<string, Board>`，key 是 `${sessionId}::${surface}`，`surface` 为 `float` 或 `pane`。每块画板的 state：

```
strokes        已提交笔画（自由笔为点数组，直线/箭头为 [起点, 终点]）
revision       笔画版本号，每次增删 +1
snapshot       最近一次编码的 PNG dataURL
liveId         输入框里「当前画板」附件 id
syncedRevision 该附件对应的笔画版本
detached       用户手动删了当前附件后置 true
insertSeq/saveSeq/clearSeq  明确动作的一次性信号
status/message 仅用于错误提示
```

`useSyncExternalStore` 订阅 `board.subscribe`，所以浮窗和侧栏可以同时观察同一块画板。

## 保存管线

绘制过程完全不编码：`commitStroke` 只把笔画 push 进 `strokes` 并把 status 置为 `dirty`。

只有三种明确动作会让附件桥做事：

1. **关闭浮窗**（`save()`）：编码 → `saveSeq+1`。`ComposerBridgeInner` 监听 `saveSeq`，把 PNG 变成 `File`，`conversation.createDrafts` + `inputActions.addAttachments`，再把旧的 `liveId` 从输入框移除。
2. **插入**（`insert()`）：编码 → `insertSeq+1`；桥把图作为冻结附件挂上，然后清空画板。浮窗的插入还会通过 `onCloseWithoutSave` 自动收起窗口，且不会二次保存。
3. **清空**（`clearBoard()`）：`clearSeq+1`，桥把当前 `liveId` 从输入框移除。

`save()` 在 `liveId` 存在、`syncedRevision === revision` 且未 detached 时直接返回，不会重复编码。

附件从输入框消失时，用 `input.phase` 区分「发送后清空」和「用户点 ×」：提交期间 phase 离开 `plain`，手动删除不会。插件不包裹宿主的发送方法。

## 编码与裁切

`encodeSnapshot()`：

1. 用 `inkBounds(strokes)` 求笔画包围盒（白色橡皮笔迹和非箭头笔画按笔宽加 slack，箭头按箭头头部尺寸放宽）；
2. 四周加 `CROP_PADDING = 26`，并夹到画布边界；
3. `scale = max(1, min(2.5, 900 / max(width, height)))`，小图最多放大 2.5 倍；
4. 画到临时 canvas（先填白底），`toDataURL("image/png")`。

坐标系是画板内部坐标（浮动 1600×1000，侧栏 1000×1333）；指针位置按 `getBoundingClientRect` 的显示尺寸换算。

## 交互细节

- **Esc**：监听挂在 `window` 的捕获阶段（只在浮窗挂载期间存在），因此焦点在铅笔按钮或页面其他位置也能关闭；卸载时移除。
- **自动聚焦**：浮窗打开后 `canvas.focus()`，`[`/`]`/`B`/`L`/`A`/`E` 和 `Ctrl+Z` 立即可用。
- **单一触点**：`activePointerRef` 锁住起笔的 `pointerId`，其他 pointer 的 down/move/up 被忽略；只有在匹配的 pointerup/cancel 才结束当前笔画。
- **触摸防误触**四道闸，按顺序生效：
  1. 笔优先：`penActiveRef` 在笔按下期间挡住全部触摸，`penSeenAtRef` 再挡抬起后 0.3 s（落笔瞬间的手掌往往还没抬）；
  2. 接触面积：`PointerEvent.width/height` 长边超过 `max(55, 本机手指中位数 × 1.5)` 视为手掌。基线来自真正画出笔画的触摸（`touchSizesRef`，保留最近 20 个、不足 3 个时按 55 处理），所以大号手指不会被误伤；
  3. 拖动阈值：触摸起笔只攒点不落墨，位移超过 5 CSS 像素才一次性画出攒下的路径；没到阈值就抬笔不提交任何笔画，轻点和掌压都不留点；
  4. 接手：手掌先压下来时会有一条没出墨的触摸笔画，此时笔或另一根手指落下会作废它并接手（`abandonDraft` 用已提交笔画重绘画布），所以手掌不会把手指挡在外面。
- **pointercancel**：系统打断（来电、手势切换）按作废处理，不把半截笔画当画完提交。
- **删除工具（E）**：不再往画布上涂白，而是整条删除。按下/移动时用 `findStrokeIndex` 做命中测试：先过 `strokeBox`（按引用缓存的包围盒），再算点到折线的最短距离 ≤ `deleteRadius() + 笔画宽/2`，从后往前找，命中画得最晚的那条。删除后只重画这条笔画的包围盒（`repaintRegion`：裁切 + 补白底 + 重画相交笔画），不整块重绘，所以一路划过去删多笔也不会随笔画总数变慢。
- **撤销**：`historyRef` 存操作而不是快照，`{type:"add"}` 或 `{type:"delete", before}`（`before` 是删除前的整份笔画数组，只存引用）。一次删除手势里删掉的笔画合成一条历史，撤销时整块重绘一次。历史上限 40；发送/插入/清空会清空历史，免得撤销把已经发出去的画面拉回来。
- **双击/双触撤销**：`lastTapRef` 记上一次轻点（≤400 ms、≤26 CSS 像素），在删除工具或触摸时成立（这两种情况下轻点本来不落墨，不会和画东西抢）。第二次按下时置 `undoOnTapRef`，抬起时走 `undo()`，所以“删错了再点一下”就能退回来。
- **删除光标**：一个跟随指针的 SVG 圆，直径 = `STROKE_WIDTH[weight] * widthScale * ERASER_SCALE`（默认 4 倍笔宽），也就是命中直径；用 `vector-effect="non-scaling-stroke"` 保证描边不随缩放变粗。
- **清空按钮**：不是图标，是 `.dsh-sketchpad-clear` 胶囊；`data-armed` 由 `hasInk` 控制，CSS 在 armed 时改红色描边和文字，底色保持相同的灰色。
- **状态提示**：只在空白画板或出错时渲染；文本只有 `空白画板 · 按住鼠标拖动书写` 和错误信息两种。

## 性能取舍

- 绘制、撤销、清空、换色、直线预览、删除光标全部在浏览器本地完成，不经过 Host 往返。
- 抬笔不编码、不碰附件：PNG 编码和 `createDrafts`/`addAttachments` 只在关闭/插入时各做一次。
- 自由笔画一次 `pointermove` 只 stroke 一条路径，合并 `getCoalescedEvents` 的同帧采样点；直线/箭头画在独立 overlay canvas 上。
- 起笔时缓存画布矩形，`pointermove` 不再反复触发 `getBoundingClientRect`；删除光标只在删除模式下更新。
- 删除只重绘被删笔画的包围盒（`repaintRegion`），撤销/清空才整块重绘。
- **提交不重绘整块画布**：抬笔时笔画已经在画布上，`commitStroke` 只置 `skipRepaintRef`，`[state.strokes]` 的 `useLayoutEffect` 跳过 `paintBoard`；只有撤销/清空才整块重绘（它们自己也已经画过一遍，置同样的标记避免重绘两次）。改之前每提交一笔都要重绘全部笔画，代价随笔画数线性增长。
- 重绘用 `useLayoutEffect` 而不是 `useEffect`：首帧在浏览器绘制前就把白底铺上，避免 `alpha:false` 的画布闪一帧黑。
- 主画布用 `getContext("2d", { alpha: false, desynchronized: true })`：不透明画布在 Chromium 上能走低延迟合成路径，笔尖到像素的延迟更小；Safari/Firefox 忽略这个选项，行为不变。导出仍然靠 `drawImage` 读回，实测可读（`test` 之外用 Chromium 量过）。
- 直线/箭头预览只清上一帧的包围盒（`previewBoxRef`），不再每次 `pointermove` 清空 1600×1000 的覆盖层。
- 编码只重绘包围盒区域，裁切后的图片像素和上传体积都更小。

基准（Chromium headless，DPR 2，1000 条 120 点笔画，桌面 CPU；平板会更慢，但倍率关系不变）：

| 场景 | 0.1.0 | 0.1.1 |
| --- | --- | --- |
| 每个 `pointermove`（含笔画采样与 stroke） | ~0.01 ms | ~0.01 ms |
| 抬笔提交（含 React 渲染 + 重绘） | 0.2 ms → 4.4 ms（随笔画数涨） | ~0.1 ms（恒定） |
| 撤销一次（整块重绘） | 8.1 ms | 3.3 ms |

## 本地开发

在 profile 里用 `link:` 指向本目录，并在 profile 的 `cordis.patch.yml` 末尾插入：

```yaml
- insert:
    - id: dsh-sketchpad
      name: dsh-sketchpad
```

然后：

```sh
dsh plugin --profile web install   # 建立 link
dsh web                            # 或重启正在运行的 dsh web
```

改 `lib/client.js` 后刷新页面即可；宿主半侧（`lib/index.js`）改动需要重启 host。不要同时把包放进 `dsh.profile.bundles`，否则会和 patch 行重复插入。

调试：浏览器控制台里 `dsh-sketchpad` 开头的告警都来自本插件；画板状态不进 Redux，刷新页面即重置。防误触如果在某台设备上表现不对，先在控制台执行 `localStorage.setItem("dsh-sketchpad.debug","1")` 再刷新，之后每次落笔都会打印 `pointerType` 和接触尺寸（`width×height`），据此判断是该调 `PALM_CONTACT` 还是设备本来就不报尺寸。

## 测试

```sh
npm install
npm test
```

`test/palm-rejection.test.mjs` 把真实 bundle 加载进 jsdom，用带 `pointerType` / `width` / `height` 的合成 PointerEvent 覆盖防误触和删除/撤销：手掌大面积接触、轻点、低于拖动阈值、笔按下时触摸、手指画到一半手掌压上来、手掌先到由手指接手、45 px 的手指能画而 88 px 的手掌被丢弃、鼠标单击仍然落点、点一下删掉整笔、撤销放回、再点一下撤销这次删除、拖着一路删多笔后一次撤销全部放回。jsdom 没有布局和 canvas，测试里给画布固定 1000×1333 的矩形、用 ops 记录器替代 2D 上下文（要支持 `clip`），所以断言看的是画布操作序列而不是像素。

## 卸载

1. 删掉 profile `cordis.patch.yml` 里的 `dsh-sketchpad` insert 段；
2. `dsh plugin --profile web remove dsh-sketchpad`（或删掉 `package.json` 里的 `link:` 依赖再 install）；
3. 重启 `dsh web`。

## 版本约束

`engines.dsh` 写的是 `>=0.2.1-rc.2`：草稿附件 API（`createDrafts` / `addAttachments` / `removeAttachment` / `releaseDraftAttachment`）和 `input.phase` 在这个版本上验证过。DSH 升级后如果这些接口变动，画板本身不受影响，附件桥可能需要小改。
