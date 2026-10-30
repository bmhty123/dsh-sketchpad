/**
 * Palm-rejection tests for the real client bundle.
 *
 * jsdom has no layout and no 2D canvas, so the test stubs
 * `HTMLCanvasElement.getContext` with an op recorder and gives the canvas a
 * fixed 1000x1333 rect (the sidebar board size). Pointer events are dispatched
 * with explicit `pointerType` / `width` / `height`, which is how browsers
 * describe a palm-sized contact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(here, "..", "lib", "client.js");

/* 可推进的假时钟：笔离开后的 1.5 s 抑制窗口要能跨过。 */
let clock = 1_000_000_000;
Date.now = () => clock;
const advance = (ms) => {
	clock += ms;
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
	pretendToBeVisual: true,
	url: "https://localhost/",
});

const { window } = dom;
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("HTMLElement", window.HTMLElement);
define("Element", window.Element);
define("Node", window.Node);
define("Event", window.Event);
define("MouseEvent", window.MouseEvent);
define("IS_REACT_ACT_ENVIRONMENT", true);
define("requestAnimationFrame", window.requestAnimationFrame.bind(window));
define("cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
window.IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ *
 * 2D 上下文记录器
 * ------------------------------------------------------------------ */

const recorders = new WeakMap();

function makeRecorder(canvas) {
	const recorder = {
		ops: [],
		strokeStyle: "#000",
		fillStyle: "#000",
		lineWidth: 1,
		lineCap: "butt",
		lineJoin: "miter",
	};
	const draw = (name) => (...args) => recorder.ops.push([name, ...args]);
	for (const name of [
		"fillRect", "clearRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill",
		"closePath", "save", "restore", "setTransform", "translate", "scale", "drawImage",
		"quadraticCurveTo", "bezierCurveTo", "rect", "ellipse", "strokeRect", "setLineDash", "clip",
	]) recorder[name] = draw(name);
	recorder.canvas = canvas;
	recorders.set(canvas, recorder);
	return recorder;
}

window.HTMLCanvasElement.prototype.getContext = function getContext() {
	const existing = recorders.get(this);
	if (existing !== undefined) return existing;
	return makeRecorder(this);
};

window.HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
	return { left: 0, top: 0, right: 1000, bottom: 1333, width: 1000, height: 1333, x: 0, y: 0 };
};

/* ------------------------------------------------------------------ *
 * 加载真实 bundle
 * ------------------------------------------------------------------ */

const Dummy = (props) => React.createElement("span", null, props && props.children);
const primitives = { IconEditOutlineRegular: Dummy, Tooltip: Dummy };

let plugin = null;
window.__ModuleLoader__ = {
	load(spec) {
		const loadModule = (id) => {
			if (id === "react") return React;
			if (id === "react-dom") return ReactDOM;
			if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
			throw new Error("unknown module " + id);
		};
		plugin = spec.factory(loadModule);
	},
};

const source = fs.readFileSync(BUNDLE, "utf8");
new Function("window", "document", "navigator", source)(window, window.document, window.navigator);

/* ------------------------------------------------------------------ *
 * 挂载侧栏画板
 * ------------------------------------------------------------------ */

const registered = new Map();
const sidebarTabs = [];
plugin.apply({
	effect(fn) {
		fn();
	},
	slots: {
		inject(_name, fn) {
			fn();
		},
		register(definition, component) {
			registered.set(definition.name, component);
			return {};
		},
	},
	sidebarRightTabs: {
		register(definition) {
			sidebarTabs.push(definition);
			return {};
		},
	},
	get: () => undefined,
});

const Pane = registered.get("sidebar.right.pane.tab");
if (typeof Pane !== "function") throw new Error("sidebar pane component was not registered");

const root = ReactDOM.createRoot(document.getElementById("root"));
await act(async () => {
	root.render(React.createElement(Pane, { sessionId: "test-session" }));
});

const canvases = document.querySelectorAll("canvas");
const canvas = canvases[0];
if (canvas === undefined) throw new Error("canvas was not rendered");
const overlayRec = canvases[1] === undefined ? null : recorders.get(canvases[1]);
const rec = recorders.get(canvas);

const dispatch = (type, init) => {
	const event = new window.MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: init.clientX,
		clientY: init.clientY,
		button: 0,
	});
	for (const [key, value] of Object.entries(init)) {
		if (key === "clientX" || key === "clientY") continue;
		Object.defineProperty(event, key, { value });
	}
	act(() => {
		canvas.dispatchEvent(event);
	});
};

const reset = () => {
	rec.ops.length = 0;
	if (overlayRec) overlayRec.ops.length = 0;
};
const inkOps = () => rec.ops.filter((op) => ["stroke", "fill", "lineTo", "arc"].includes(op[0]));

const undoButton = () => document.querySelector('[title^="撤销"]');
const clearButton = () => document.querySelector(".dsh-sketchpad-clear");
const clearBoard = () => {
	const button = clearButton();
	if (button !== null && button.disabled !== true) act(() => button.click());
};
const selectTool = (prefix) => {
	const button = document.querySelector(`[title^="${prefix}"]`);
	act(() => button.click());
};
let nextPointerId = 700;
/** 画一条三点直线笔画（鼠标，直接落墨）。 */
const drawPenStroke = (x1, y1, x2, y2) => {
	const pointerId = nextPointerId++;
	dispatch("pointerdown", { pointerId, pointerType: "mouse", width: 1, height: 1, clientX: x1, clientY: y1 });
	dispatch("pointermove", { pointerId, pointerType: "mouse", width: 1, height: 1, clientX: (x1 + x2) / 2, clientY: (y1 + y2) / 2 });
	dispatch("pointermove", { pointerId, pointerType: "mouse", width: 1, height: 1, clientX: x2, clientY: y2 });
	dispatch("pointerup", { pointerId, pointerType: "mouse", width: 1, height: 1, clientX: x2, clientY: y2 });
};

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail: detail ?? "" });
/** 双指轻点：两个触摸点同时按下、几乎同时抬起。 */
const twoFingerTap = (x, y) => {
	const first = nextPointerId++;
	const second = nextPointerId++;
	dispatch("pointerdown", { pointerId: first, pointerType: "touch", width: 12, height: 12, clientX: x, clientY: y });
	dispatch("pointerdown", { pointerId: second, pointerType: "touch", width: 12, height: 12, clientX: x + 40, clientY: y });
	dispatch("pointerup", { pointerId: first, pointerType: "touch", width: 12, height: 12, clientX: x, clientY: y });
	dispatch("pointerup", { pointerId: second, pointerType: "touch", width: 12, height: 12, clientX: x + 40, clientY: y });
};

/* 1. 手掌（大面积）按下并移动：一个墨点都不能有 */
reset();
dispatch("pointerdown", { pointerId: 1, pointerType: "touch", width: 60, height: 55, clientX: 100, clientY: 100 });
dispatch("pointermove", { pointerId: 1, pointerType: "touch", width: 60, height: 55, clientX: 160, clientY: 140 });
dispatch("pointerup", { pointerId: 1, pointerType: "touch", width: 60, height: 55, clientX: 160, clientY: 140 });
check("palm down + move leaves no ink", inkOps().length === 0, JSON.stringify(inkOps().slice(0, 4)));

/* 2. 手指轻点：不留点 */
reset();
dispatch("pointerdown", { pointerId: 2, pointerType: "touch", width: 12, height: 12, clientX: 200, clientY: 200 });
dispatch("pointerup", { pointerId: 2, pointerType: "touch", width: 12, height: 12, clientX: 200, clientY: 200 });
check("finger tap leaves no dot", inkOps().length === 0);

/* 3. 手指拖动：先攒过 5 px 阈值，再一次性出墨 */
reset();
dispatch("pointerdown", { pointerId: 3, pointerType: "touch", width: 12, height: 12, clientX: 300, clientY: 300 });
dispatch("pointermove", { pointerId: 3, pointerType: "touch", width: 12, height: 12, clientX: 302, clientY: 302 });
check("below slop still no ink", inkOps().length === 0, JSON.stringify(inkOps()));
dispatch("pointermove", { pointerId: 3, pointerType: "touch", width: 12, height: 12, clientX: 360, clientY: 360 });
check("drag past slop inks", inkOps().length > 0, JSON.stringify(rec.ops.slice(0, 6)));
dispatch("pointerup", { pointerId: 3, pointerType: "touch", width: 12, height: 12, clientX: 360, clientY: 360 });

/* 4. 笔按着时触摸一律不画（只有笔的落点） */
reset();
dispatch("pointerdown", { pointerId: 9, pointerType: "pen", width: 1, height: 1, clientX: 500, clientY: 500 });
const opsAfterPenDown = rec.ops.map((op) => op[0]);
dispatch("pointerdown", { pointerId: 4, pointerType: "touch", width: 12, height: 12, clientX: 300, clientY: 400 });
dispatch("pointermove", { pointerId: 4, pointerType: "touch", width: 12, height: 12, clientX: 420, clientY: 480 });
dispatch("pointerup", { pointerId: 4, pointerType: "touch", width: 12, height: 12, clientX: 420, clientY: 480 });
check("pen down suppresses touch", rec.ops.length === opsAfterPenDown.length, JSON.stringify(rec.ops.map((o) => o[0])));
dispatch("pointerup", { pointerId: 9, pointerType: "pen", width: 1, height: 1, clientX: 500, clientY: 500 });

/* 5. 鼠标单击仍然落一个点（没有被防误触误伤） */
advance(1000);
reset();
dispatch("pointerdown", { pointerId: 5, pointerType: "mouse", width: 1, height: 1, clientX: 600, clientY: 600 });
dispatch("pointerup", { pointerId: 5, pointerType: "mouse", width: 1, height: 1, clientX: 600, clientY: 600 });
check("mouse tap still draws a dot", rec.ops.some((op) => op[0] === "arc" || op[0] === "fill"), JSON.stringify(rec.ops.map((o) => o[0])));

/* 6. 手指画到一半手掌压上来：手指笔画不受影响，抬起后正常提交 */
clearBoard();
reset();
dispatch("pointerdown", { pointerId: 6, pointerType: "touch", width: 12, height: 12, clientX: 100, clientY: 700 });
dispatch("pointermove", { pointerId: 6, pointerType: "touch", width: 12, height: 12, clientX: 200, clientY: 760 });
const inkBeforePalm = inkOps().length;
dispatch("pointerdown", { pointerId: 7, pointerType: "touch", width: 70, height: 60, clientX: 600, clientY: 900 });
dispatch("pointermove", { pointerId: 6, pointerType: "touch", width: 12, height: 12, clientX: 260, clientY: 800 });
dispatch("pointerup", { pointerId: 6, pointerType: "touch", width: 12, height: 12, clientX: 260, clientY: 800 });
dispatch("pointerup", { pointerId: 7, pointerType: "touch", width: 70, height: 60, clientX: 600, clientY: 900 });
/* 提交后不会再整块重绘，靠撤销按钮变为可用来确认这一笔真的进了画板。 */
check("palm landing mid-stroke keeps the finger stroke", inkBeforePalm > 0 && undoButton()?.disabled === false, String(undoButton()?.disabled));

/* 7. 手掌先压下来（没出墨），手指再落：手指接手，手掌那条不留痕 */
reset();
dispatch("pointerdown", { pointerId: 12, pointerType: "touch", width: 70, height: 60, clientX: 400, clientY: 1000 });
check("palm first leaves no ink", inkOps().length === 0, JSON.stringify(rec.ops.map((o) => o[0])));
dispatch("pointerdown", { pointerId: 13, pointerType: "touch", width: 12, height: 12, clientX: 500, clientY: 1050 });
dispatch("pointermove", { pointerId: 13, pointerType: "touch", width: 12, height: 12, clientX: 560, clientY: 1110 });
check("finger takes over a resting palm", inkOps().length > 0, JSON.stringify(rec.ops.map((o) => o[0])));
dispatch("pointerup", { pointerId: 13, pointerType: "touch", width: 12, height: 12, clientX: 560, clientY: 1110 });
dispatch("pointerup", { pointerId: 12, pointerType: "touch", width: 70, height: 60, clientX: 400, clientY: 1000 });

/* 8. 攒够手指样本后，明显更大的接触面仍然按手掌丢掉 */
reset();
for (const [index, size] of [[21, 45], [22, 45], [23, 45]]) {
	dispatch("pointerdown", { pointerId: index, pointerType: "touch", width: size, height: size, clientX: 300 + index, clientY: 600 });
	dispatch("pointermove", { pointerId: index, pointerType: "touch", width: size, height: size, clientX: 360 + index, clientY: 660 });
	dispatch("pointerup", { pointerId: index, pointerType: "touch", width: size, height: size, clientX: 360 + index, clientY: 660 });
}
const bigFingerWorked = rec.ops.length > 0;
reset();
dispatch("pointerdown", { pointerId: 24, pointerType: "touch", width: 88, height: 80, clientX: 200, clientY: 200 });
dispatch("pointermove", { pointerId: 24, pointerType: "touch", width: 88, height: 80, clientX: 320, clientY: 300 });
dispatch("pointerup", { pointerId: 24, pointerType: "touch", width: 88, height: 80, clientX: 320, clientY: 300 });
check("45 px finger draws, 88 px palm is dropped", bigFingerWorked && inkOps().length === 0, JSON.stringify(rec.ops.map((o) => o[0])));

/* 9. 删除工具：点一下整笔消失，撤销能把它放回来 */
clearBoard();
selectTool("水笔");
drawPenStroke(200, 900, 400, 900);
check("delete tool: stroke is on the board", clearButton()?.disabled === false);
selectTool("删除笔画");
reset();
dispatch("pointerdown", { pointerId: 900, pointerType: "mouse", width: 1, height: 1, clientX: 300, clientY: 900 });
dispatch("pointerup", { pointerId: 900, pointerType: "mouse", width: 1, height: 1, clientX: 300, clientY: 900 });
check("delete tool removes the whole stroke", clearButton()?.disabled === true);

/* 10. 双指轻点撤销：删掉后两指一起点一下，把删除撤回来 */
act(() => undoButton().click());
check("undo restores the deleted stroke", clearButton()?.disabled === false);
dispatch("pointerdown", { pointerId: 901, pointerType: "mouse", width: 1, height: 1, clientX: 300, clientY: 900 });
dispatch("pointerup", { pointerId: 901, pointerType: "mouse", width: 1, height: 1, clientX: 300, clientY: 900 });
const emptyAfterTap = clearButton()?.disabled === true;
twoFingerTap(600, 1100);
check("two-finger tap undoes the deletion", emptyAfterTap && clearButton()?.disabled === false);

/* 11. 拖着一路删：一个手势删多笔，一次撤销全部放回 */
clearBoard();
selectTool("水笔");
drawPenStroke(150, 700, 450, 700);
drawPenStroke(150, 760, 450, 760);
drawPenStroke(150, 820, 450, 820);
const threeStrokes = clearButton()?.disabled === false;
selectTool("删除笔画");
reset();
dispatch("pointerdown", { pointerId: 910, pointerType: "mouse", width: 1, height: 1, clientX: 200, clientY: 700 });
dispatch("pointermove", { pointerId: 910, pointerType: "mouse", width: 1, height: 1, clientX: 200, clientY: 760 });
dispatch("pointermove", { pointerId: 910, pointerType: "mouse", width: 1, height: 1, clientX: 200, clientY: 820 });
dispatch("pointerup", { pointerId: 910, pointerType: "mouse", width: 1, height: 1, clientX: 200, clientY: 820 });
const allDeleted = clearButton()?.disabled === true;
reset();
act(() => undoButton().click());
const restoredStrokes = rec.ops.filter((op) => op[0] === "stroke").length;
check("one undo restores a multi-stroke delete", threeStrokes && allDeleted && restoredStrokes >= 3, `restored=${restoredStrokes}`);

/* 12. 触摸轻点也能删：按下时先不删，抬起确认不是双指才删 */
clearBoard();
selectTool("水笔");
drawPenStroke(200, 500, 500, 500);
selectTool("删除笔画");
dispatch("pointerdown", { pointerId: 920, pointerType: "touch", width: 12, height: 12, clientX: 350, clientY: 500 });
dispatch("pointerup", { pointerId: 920, pointerType: "touch", width: 12, height: 12, clientX: 350, clientY: 500 });
check("touch tap deletes a stroke", clearButton()?.disabled === true);
twoFingerTap(650, 1150);
check("two-finger tap restores the touch deletion", clearButton()?.disabled === false);

/* 13. 笔工具下双指轻点同样撤销上一笔 */
clearBoard();
selectTool("水笔");
drawPenStroke(200, 400, 500, 400);
twoFingerTap(700, 1150);
check("two-finger tap undoes a drawn stroke", clearButton()?.disabled === true);

for (const result of results) {
	console.log((result.ok ? "PASS " : "FAIL ") + result.name + (result.ok ? "" : " :: " + result.detail));
}
const failed = results.filter((result) => !result.ok);
console.log(failed.length === 0 ? `ALL PASS (${results.length})` : `${failed.length} FAILED`);
process.exitCode = failed.length === 0 ? 0 : 1;
