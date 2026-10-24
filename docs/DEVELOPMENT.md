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
- **橡皮光标**：一个跟随指针的 SVG 圆，直径 = `STROKE_WIDTH[weight] * widthScale * ERASER_SCALE`（默认 4 倍笔宽）；用 `vector-effect="non-scaling-stroke"` 保证描边不随缩放变粗。
- **清空按钮**：不是图标，是 `.dsh-sketchpad-clear` 胶囊；`data-armed` 由 `hasInk` 控制，CSS 在 armed 时改红色描边和文字，底色保持相同的灰色。
- **状态提示**：只在空白画板或出错时渲染；文本只有 `空白画板 · 按住鼠标拖动书写` 和错误信息两种。

## 性能取舍

- 绘制、撤销、清空、换色、直线预览、橡皮圆全部在浏览器本地完成，不经过 Host 往返。
- 抬笔不编码、不碰附件：PNG 编码和 `createDrafts`/`addAttachments` 只在关闭/插入时各做一次。
- 自由笔画一次 `pointermove` 只 stroke 一条路径，合并 `getCoalescedEvents` 的同帧采样点；直线/箭头画在独立 overlay canvas 上。
- 起笔时缓存画布矩形，`pointermove` 不再反复触发 `getBoundingClientRect`；橡皮圆只在橡皮模式下更新。
- 编码只重绘包围盒区域，裁切后的图片像素和上传体积都更小。

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

调试：浏览器控制台里 `dsh-sketchpad` 开头的告警都来自本插件；画板状态不进 Redux，刷新页面即重置。

## 卸载

1. 删掉 profile `cordis.patch.yml` 里的 `dsh-sketchpad` insert 段；
2. `dsh plugin --profile web remove dsh-sketchpad`（或删掉 `package.json` 里的 `link:` 依赖再 install）；
3. 重启 `dsh web`。

## 版本约束

`engines.dsh` 写的是 `>=0.2.1-rc.2`：草稿附件 API（`createDrafts` / `addAttachments` / `removeAttachment` / `releaseDraftAttachment`）和 `input.phase` 在这个版本上验证过。DSH 升级后如果这些接口变动，画板本身不受影响，附件桥可能需要小改。
