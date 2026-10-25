// printStrip（小程序小纸条打印：保存图片 / 导出 A4 PDF）沙箱测试。
// 用真实 printStrip.js + pdfMaker.js + dailyPlanLogic.js，桩掉 wx / canvas / 文件系统。
// dp-editor 打印面板逻辑回归见 printPanel.test.js；公共 helper 见 printTestUtils.js。
import test from "node:test";
import assert from "node:assert/strict";
import pdfMaker from "../miniprogram/utils/pdfMaker.js";
import {
  VIEW,
  fakeCtx,
  makePage,
  makeWx,
  loadPrintStrip,
  canvasSize,
  assertSize,
} from "./printTestUtils.js";

test("stripSize：竖版小纸条（版式照用户截图 434×756 比例）；任务越多行越紧", () => {
  const ps = loadPrintStrip(makeWx({ toasts: [], saved: [], modals: [], opened: [] }));
  // 横向页单张条宽 508（3×(508+57)+57=1754 铺满页宽）；纵向 560
  assertSize(ps.stripSize(4, "landscape"), 508, 562, "横向 4 项");
  assertSize(ps.stripSize(4, "portrait"), 560, 619, "纵向 4 项");
  // 任务少 → 行高到顶（74.9/82.6）；任务多 → 压到理想值
  assertSize(ps.stripSize(1, "landscape"), 508, 337, "横向 1 项");
  assertSize(ps.stripSize(20, "landscape"), 508, 894, "横向 20 项");
  assertSize(ps.stripSize(20, "portrait"), 560, 986, "纵向 20 项");
  // 宽高比：都是竖条（高>宽），不是宽扁条
  const L = ps.stripSize(4, "landscape");
  const P = ps.stripSize(4, "portrait");
  assert.ok(L.h / L.w > 1, "横向页里也应是竖版纸条");
  assert.ok(P.h / P.w > 1 && P.w < 700, "纵向应为竖版纸条");
});

test("stripSize：fitH 限制下超多任务也放得进 A4 页", () => {
  const ps = loadPrintStrip(makeWx({ toasts: [], saved: [], modals: [], opened: [] }));
  const noFit = ps.stripSize(30, "landscape");
  assert.ok(noFit.h > 0);
  const fit = ps.stripSize(30, "landscape", 1240 - 114);
  assert.ok(fit.h <= 1240 - 114, "PDF 模式必须收缩到页内");
  // 40 项压满可用高度也刚好放得下
  assert.equal(ps.stripSize(40, "landscape", 1240 - 114).h, 1240 - 114);
  // 纵向 40 项同样要收进竖页
  assert.ok(ps.stripSize(40, "portrait", 1754 - 114).h <= 1754 - 114);
});

test("saveImage：画布=单张纸条（无白边）+ 存相册 + 成功提示", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null };
  const ps = loadPrintStrip(makeWx(log));
  ps.saveImage(makePage(VIEW), "landscape");
  assert.deepEqual(log.saved, ["/tmp/strip.jpg"]);
  assert.ok(log.toasts.includes("已存入相册"));
  // 存图不套 A4 页面：画布就是一张纸条的尺寸
  const strip = ps.stripSize(VIEW.length, "landscape");
  assertSize(canvasSize(log.ctx), strip.w, strip.h, "存图画布应等于单张纸条尺寸");
  // 存图不要裁切虚线/裁切提示（那些只属于 PDF 页面）
  assert.equal(log.ctx.calls.filter((c) => c[0] === "setLineDash").length, 0);
  assert.ok(
    !log.ctx.calls.some((c) => c[0] === "fillText" && String(c[1]).includes("裁切")),
    "存图不应出现裁切提示文字"
  );
  // 存图只画一张：卡片外框 strokeRect 只出现 1 次（宽=条宽）
  const cards = log.ctx.calls.filter((c) => c[0] === "strokeRect" && c[3] === strip.w - 1);
  assert.equal(cards.length, 1, "存图只应画一张纸条");
  // 存图模式画布即纸条：卡片必须贴 (0.5,0.5)，右边不得被画布裁掉（曾因沿用 PDF 的
  // 靠左偏移 57px 导致右侧裁切、左侧空白——真机反馈"图片不完整"）
  assert.equal(cards[0][1], 0.5, "存图卡片应贴画布左边");
  assert.equal(cards[0][2], 0.5, "存图卡片应贴画布顶边");
  assert.ok(cards[0][1] + cards[0][3] <= strip.w, "存图不得横向溢出画布");
  // 所有绘制元素都必须在画布内（fake 记录: fillText=[t,x,y]，fillRect=[x,y,w,h]）
  for (const c of log.ctx.calls) {
    if (c[0] === "fillText") {
      assert.ok(c[3] <= strip.h, `fillText 超出画布底部: y=${c[3]}`);
    } else if (c[0] === "fillRect") {
      assert.ok(c[2] + c[4] <= strip.h + 1, `fillRect 超出画布底部: y=${c[2]} h=${c[4]}`);
    }
  }
});

test("saveImage：纵向画布=竖版纸条尺寸", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null };
  const ps = loadPrintStrip(makeWx(log));
  ps.saveImage(makePage(VIEW), "portrait");
  const strip = ps.stripSize(VIEW.length, "portrait");
  assertSize(canvasSize(log.ctx), strip.w, strip.h, "纵向存图画布应等于竖版纸条尺寸");
});

test("saveImage：相册权限被拒时引导 openSetting", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null };
  const ps = loadPrintStrip(makeWx(log, { denyAuth: true }));
  ps.saveImage(makePage(VIEW), "portrait");
  assert.equal(log.modals.length, 1);
  assert.match(log.modals[0].content, /相册/);
  log.modals[0].success({ confirm: true });
  assert.deepEqual(log.opened, ["openSetting"]);
});

test("exportPdf：画布=A4 页面（纸条靠左）+ PDF 字节与基准一致（横向）", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null, jpegB64: "" };
  // 假 JPEG（FFD8FF 魔数 + 填充），与 pdfMaker 测试同一思路
  const jpeg = new Uint8Array(200);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < jpeg.length; i++) jpeg[i] = i % 256;
  log.jpegB64 = Buffer.from(jpeg).toString("base64");

  const ps = loadPrintStrip(makeWx(log));
  ps.exportPdf(makePage(VIEW), "landscape");

  assert.equal(log.fileType, "jpg", "canvasToTempFilePath 必须用 jpg（PDF DCTDecode）");
  assert.equal(log.readEncoding, "base64");
  assert.equal(log.written.encoding, "binary");
  assert.match(log.written.filePath, /\.pdf$/);
  assert.equal(Object.prototype.toString.call(log.written.data), "[object ArrayBuffer]");
  assert.equal(log.opened.length, 1);
  assert.equal(log.opened[0].fileType, "pdf");
  assert.equal(log.opened[0].filePath, log.written.filePath);

  // PDF 模式画布是标准 A4 横页
  assertSize(canvasSize(log.ctx), 1754, 1240, "PDF 画布应为 A4 横页");
  // 裁切虚线 + 提示只在 PDF 页面出现
  assert.ok(
    log.ctx.calls.some((c) => c[0] === "setLineDash"),
    "PDF 页面应有裁切虚线"
  );
  assert.ok(
    log.ctx.calls.some((c) => c[0] === "fillText" && String(c[1]).includes("裁切")),
    "PDF 页面应有裁切提示"
  );
  // 横向一页只放一张，靠左：纸条左边距 = MARGIN(57)，虚线外框左缘 = 57-14 = 43
  const strip = ps.stripSize(VIEW.length, "landscape");
  const guides = log.ctx.calls.filter((c) => c[0] === "strokeRect" && c[3] === strip.w + 28);
  assert.equal(guides.length, 1, "一页只应有一张纸条");
  assert.equal(guides[0][1], 57 - 14, "纸条应靠页面左侧放置");
  // 垂直居中
  const cards = log.ctx.calls.filter((c) => c[0] === "strokeRect" && c[3] === strip.w - 1);
  assert.equal(cards.length, 1, "只画一张卡片");
  // 卡片框 y = 居中偏移 + 0.5（strokeRect 半像素锐利）
  assert.equal(cards[0][2], Math.round((1240 - strip.h) / 2) + 0.5, "纸条应垂直居中");

  const expect = pdfMaker.buildImagePdf(jpeg, 1754, 1240, 842, 595);
  const got = new Uint8Array(log.written.data);
  assert.equal(got.length, expect.length);
  assert.ok(
    got.every((b, i) => b === expect[i]),
    "PDF 字节应与 Node 基准完全一致"
  );
  assert.ok(Buffer.from(got).toString("latin1").includes("/MediaBox [0 0 842 595]"));
});

test("exportPdf：纵向输出 MediaBox 595x842，画布为 A4 竖页", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null, jpegB64: "" };
  const jpeg = new Uint8Array(64);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  log.jpegB64 = Buffer.from(jpeg).toString("base64");
  const ps = loadPrintStrip(makeWx(log));
  ps.exportPdf(makePage(VIEW), "portrait");
  assertSize(canvasSize(log.ctx), 1240, 1754, "PDF 画布应为 A4 竖页");
  assert.ok(
    Buffer.from(new Uint8Array(log.written.data))
      .toString("latin1")
      .includes("/MediaBox [0 0 595 842]")
  );
});

test("exportPdf：30 项任务时纸条收缩后仍完整落在页面内", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    kind: "task",
    title: `任务 ${i + 1}`,
    timeText: "07:30-08:00",
    kindLabel: "任务",
    done: i % 5 === 0 ? 1 : 0,
  }));
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null, jpegB64: "" };
  log.jpegB64 = Buffer.from(new Uint8Array(64)).toString("base64");
  const ps = loadPrintStrip(makeWx(log));
  ps.exportPdf(makePage(many), "landscape");
  // 所有任务行外框都不能超出 A4 画布（1754×1240）
  const rows = log.ctx.calls.filter((c) => c[0] === "strokeRect" && c[4] < 200);
  assert.equal(rows.length, 30, "应有 30 个任务行外框");
  for (const r of rows) {
    assert.ok(r[2] + r[4] <= 1240, `行底 ${r[2] + r[4]} 超出页面`);
    assert.ok(r[1] >= 0 && r[1] + r[3] <= 1754, "行不能横向溢出");
  }
});

test("drawPreview：面板预览画当前清单纸条（与方向无关，只画一次）", () => {
  const ps = loadPrintStrip(makeWx({ toasts: [], saved: [], modals: [], opened: [] }));
  let ctxCalls = null;
  const fakeNode = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => {
      ctxCalls = fakeCtx();
      return ctxCalls;
    },
  };
  const strip = ps.drawPreview(makePage(VIEW), fakeNode, "landscape");
  const want = ps.stripSize(VIEW.length, "landscape");
  assertSize(strip, want.w, want.h, "预览=纸条尺寸");
  assert.equal(fakeNode.width, strip.w, "canvas 位图按纸条物理像素设置");
  assert.equal(fakeNode.height, strip.h);
  // 画了卡片（外框 strokeRect）与全部任务名
  assert.ok(ctxCalls.calls.some((c) => c[0] === "strokeRect" && c[3] === strip.w - 1));
  for (const t of VIEW) {
    assert.ok(
      ctxCalls.calls.some((c) => c[0] === "fillText" && c[1] === t.title),
      `预览应包含任务「${t.title}」`
    );
  }
  // 预览不套 A4 页面、不画裁切虚线
  assert.equal(ctxCalls.calls.filter((c) => c[0] === "setLineDash").length, 0);
  // 空清单不画
  assert.equal(ps.drawPreview(makePage([]), fakeNode, "landscape"), null);
});

test("drawPreview：超长文本不得画出单元格（缩字号/截断兜底）", () => {
  const ps = loadPrintStrip(makeWx({ toasts: [], saved: [], modals: [], opened: [] }));
  const longView = [
    {
      kind: "task",
      title: "超级无敌长的任务名称一定要超过单元格边框宽度",
      timeText: "09:00-09:30",
      kindLabel: "任务",
      done: 0,
    },
    { kind: "task", title: "数学错题复习", timeText: "07:00-08:30", kindLabel: "任务", done: 0 },
  ];
  const ctxRef = { ctx: null };
  const fakeNode = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => {
      ctxRef.ctx = fakeCtx();
      return ctxRef.ctx;
    },
  };
  ps.drawPreview(
    {
      data: {
        plan: { id: 1, plan_date: "2026-10-25", first_start: "09:00" },
        view: longView,
        userName: "琪琪",
        endText: "16:25",
      },
    },
    fakeNode,
    "landscape"
  );
  const texts = ctxRef.ctx.calls.filter((c) => c[0] === "fillText");
  // 副标题 37 字符 × 20px = 740 > 内宽 448 → 必须截断
  const sub = texts.find((c) => String(c[1]).startsWith("周日"));
  assert.ok(sub && String(sub[1]).endsWith("…"), "副标题超宽应被截断");
  // 超长任务名不允许完整画出单元格
  assert.ok(
    !texts.some((c) => c[1] === "超级无敌长的任务名称一定要超过单元格边框宽度"),
    "超长任务名不得完整画出单元格"
  );
  // 时间列文本超宽（fake 下 220px > 列宽 115px）也被截断，不允许完整出现
  const time = texts.find((c) => String(c[1]).startsWith("09:"));
  assert.ok(time, "时间文本应存在");
  assert.ok(!String(time[1]).includes("09:30"), "时间文本超宽应被截断");
});

test("空任务：不渲染、不落盘", () => {
  const log = { toasts: [], saved: [], modals: [], opened: [], ctx: null };
  const wx = makeWx(log);
  let canvasTouched = 0;
  wx.createSelectorQuery = () => ({
    in: () => ({ select: () => ({ fields: () => ({ exec: () => canvasTouched++ }) }) }),
  });
  const ps = loadPrintStrip(wx);
  ps.saveImage(makePage([]), "landscape");
  assert.ok(log.toasts.includes("没有任务可打印"));
  assert.equal(canvasTouched, 0);
});
