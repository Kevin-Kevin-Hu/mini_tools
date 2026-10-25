// printStrip / printPanel 两个沙箱测试的公共 helper：
// 在 vm 里加载真实 CommonJS 小程序模块，桩掉 wx / canvas / 文件系统。
// 说明：本文件不是测试（不被 node --test 收集），只被 *.test.js import。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../miniprogram");

// ---------- 加载真实 CommonJS 模块（桩优先，相对路径 require 自动补 .js） ----------
export function loadReal(file, stubs) {
  if (!path.extname(file)) file += ".js";
  const code = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const requireStub = (name) => {
    const key = name.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
    if (stubs && stubs[key]) return stubs[key];
    return loadReal(path.resolve(dir, name), stubs);
  };
  const ctx = { module: { exports: {} }, require: requireStub, console, setTimeout, clearTimeout };
  vm.runInNewContext(code, ctx, { filename: file });
  return ctx.module.exports;
}

// 假 canvas 2d ctx（记录绘制调用，供坐标/尺寸断言）
export function fakeCtx() {
  const calls = [];
  return {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "",
    textBaseline: "",
    font: "",
    fillText: (t, x, y) => calls.push(["fillText", t, x, y]),
    fillRect: (x, y, w, h) => calls.push(["fillRect", x, y, w, h]),
    strokeRect: (x, y, w, h) => calls.push(["strokeRect", x, y, w, h]),
    measureText: (s) => ({ width: Array.from(s).length * 20 }),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    stroke: () => calls.push(["stroke"]),
    setLineDash: () => calls.push(["setLineDash"]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    scale: () => calls.push(["scale"]),
  };
}

// 构造 dp-editor 风格的 page 桩（printStrip 只读 data）
export function makePage(view) {
  return {
    data: {
      plan: { id: 42, plan_date: "2026-10-25", first_start: "07:30", day_label: "" },
      view,
      userName: "小雨",
      endText: "20:45",
    },
  };
}

export const VIEW = [
  { kind: "task", title: "晨读英语", timeText: "07:30-08:00", kindLabel: "任务", done: 1 },
  { kind: "meal", title: "早餐", timeText: "08:00-08:30", kindLabel: "用餐", done: 0 },
  { kind: "task", title: "数学练习册 P12-14", timeText: "08:30-09:15", kindLabel: "任务", done: 0 },
  { kind: "task", title: "围棋网课", timeText: "10:20-11:20", kindLabel: "任务", done: 0 },
];

// 真实 wx.base64ToArrayBuffer 返回精确大小的 ArrayBuffer。
// 注意不能用 Buffer.from(b64,"base64").buffer：Node 的 Buffer 池化会让 .buffer
// 远大于有效视图，new Uint8Array(ab) 会把池中无关字节也包进 PDF。
export function base64ToExactArrayBuffer(b64) {
  const buf = Buffer.from(b64, "base64");
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

// 组装 wx 桩：ctxRef 拿绘制上下文，log 收事件
export function makeWx(log, opts = {}) {
  return {
    showLoading: () => {},
    hideLoading: () => {},
    showToast: (o) => log.toasts.push(o.title),
    showModal: (o) => log.modals.push(o),
    openSetting: () => log.opened.push("openSetting"),
    createSelectorQuery: () => ({
      in: () => ({
        select: () => ({
          fields: () => ({
            exec: (cb) => cb([{ node: { getContext: () => (log.ctx = fakeCtx()) } }]),
          }),
        }),
      }),
    }),
    canvasToTempFilePath: (o) => {
      log.fileType = o.fileType;
      o.success({ tempFilePath: "/tmp/strip.jpg" });
    },
    saveImageToPhotosAlbum: (o) => {
      if (opts.denyAuth) o.fail({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
      else {
        log.saved.push(o.filePath);
        o.success();
      }
    },
    getFileSystemManager: () => ({
      readFile: (o) => {
        log.readEncoding = o.encoding;
        o.success({ data: log.jpegB64 });
      },
      writeFile: (o) => {
        log.written = o;
        o.success();
      },
    }),
    base64ToArrayBuffer: base64ToExactArrayBuffer,
    openDocument: (o) => {
      log.opened.push(o);
      o.success();
    },
    env: { USER_DATA_PATH: "/tmp/wxuser" },
    getWindowInfo: () => ({ pixelRatio: 2 }),
  };
}

export function loadPrintStrip(wxStub) {
  const file = path.join(ROOT, "utils/printStrip.js");
  const code = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const sb = {
    wx: wxStub,
    console,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    require: (name) => loadReal(path.resolve(dir, name), null),
  };
  vm.runInNewContext(code, sb, { filename: "printStrip.js" });
  return sb.module.exports;
}

// 第一笔 fillRect(0,0,W,H) 即画布尺寸（drawSheet 先铺白底）
export function canvasSize(ctx) {
  const c = ctx.calls.find((c) => c[0] === "fillRect" && c[1] === 0 && c[2] === 0);
  return c ? { w: c[3], h: c[4] } : null;
}

// 跨 vm realm 的对象原型不同，deepStrictEqual 会误判 → 逐字段比
export function assertSize(actual, w, h, msg) {
  assert.ok(actual, msg + "：取不到尺寸");
  assert.equal(actual.w, w, msg + " 宽度");
  assert.equal(actual.h, h, msg + " 高度");
}
