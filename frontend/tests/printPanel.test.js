// dp-editor 打印面板回归：预览图（打开画一次、不随方向重绘）+ 方向切换 + 两个出口。
// 用真实 dp-editor.js（Page 配置在 vm 沙箱里加载，require 桩掉 api/scrollHelper/printStrip）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, fakeCtx, loadReal } from "./printTestUtils.js";

test("dp-editor 打印面板：预览图 + 方向切换 + 两个出口", () => {
  const calls = { save: [], pdf: [] };
  const preview = { drawn: 0, lastOrient: null };
  const stubs = {
    "utils/api": { dp: {} },
    "utils/scrollHelper": { createTaskScroller: () => ({}) },
    "utils/printStrip": {
      saveImage: (_page, orient) => calls.save.push(orient),
      exportPdf: (_page, orient) => calls.pdf.push(orient),
      drawPreview: (_page, _canvas, orient) => {
        preview.drawn++;
        preview.lastOrient = orient;
        return { w: 508, h: 800 };
      },
      orientLabel: (o) => (o === "portrait" ? "纵向 A4" : "横向 A4"),
    },
  };
  // wx 桩：createSelectorQuery 返回带 getContext 的假 canvas node
  const fakeCanvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => fakeCtx(),
  };
  const wxStub = {
    createSelectorQuery: () => ({
      in: () => ({
        select: () => ({
          fields: () => ({
            exec: (cb) => cb([{ node: fakeCanvas }]),
          }),
        }),
      }),
    }),
  };
  let pageDef = null;
  const file = path.join(ROOT, "pages/dp-editor/dp-editor.js");
  const code = fs.readFileSync(file, "utf8");
  const sb = {
    console,
    // 同步放行 setTimeout：openPrint 里的预览绘制立即执行，便于断言
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
    wx: wxStub,
    module: { exports: {} },
    require: (name) => {
      const key = name.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
      if (stubs[key]) return stubs[key];
      return loadReal(path.resolve(path.dirname(file), name), null);
    },
    Page: (def) => {
      pageDef = def;
    },
  };
  vm.runInNewContext(code, sb, { filename: "dp-editor.js" });

  const page = {
    data: JSON.parse(JSON.stringify(pageDef.data)),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  // 面板预览要读 view.length，给一份最小任务数据
  page.data.view = [
    { kind: "task", title: "英语阅读", timeText: "09:00-09:30", kindLabel: "任务", done: 0 },
  ];
  for (const k of Object.keys(pageDef)) {
    if (typeof pageDef[k] === "function") page[k] = pageDef[k].bind(page);
  }

  assert.equal(page.data.printOrient, "landscape", "默认横向");
  page.openPrint();
  assert.equal(page.data.showPrint, true);
  // openPrint 里的 setTimeout 被同步放行 → 预览立即画一次
  assert.equal(preview.drawn, 1, "打开面板应画一次预览");
  assert.equal(preview.lastOrient, "landscape", "预览与纸张方向无关（固定按横版纸条画）");
  // 显示尺寸走 setData 数据绑定（node.style 在 canvas 2d 上不生效会把竖条拉宽扁）
  assert.equal(page.data.previewW, 140, "预览宽 140px");
  assert.equal(page.data.previewH, 220, "预览高按纸条比例（800×140/508）");
  // 切方向不重绘预览（横纵向只是纸张方向，图片不变）
  page.setOrient({ currentTarget: { dataset: { o: "portrait" } } });
  assert.equal(page.data.printOrient, "portrait");
  assert.equal(preview.drawn, 1, "切换方向不应重绘预览");
  page.onPrintSave();
  assert.equal(page.data.showPrint, false, "点保存后面板应关闭");
  assert.deepEqual(calls.save, ["portrait"]);
  page.setOrient({ currentTarget: { dataset: { o: "landscape" } } });
  page.onPrintPdf();
  assert.equal(page.data.showPrint, false);
  assert.deepEqual(calls.pdf, ["landscape"]);
});
