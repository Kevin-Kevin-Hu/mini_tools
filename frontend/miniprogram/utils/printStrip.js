// 每日计划 · 打印清单：Canvas 生成「小纸条」图片 / A4 方向 PDF（从 dp-editor.js 拆出，压行数）
//
// 设计原则（按用户最终澄清定稿，2026-10-25）：
//   - 打印物就是**一张竖版小纸条**；A4 纸横着放，纸条**靠左**放置即可，
//     不铺满、不居中、不排多张——不为一张小纸条浪费一张纸
//   - 纵向（备选）：A4 竖纸居中放同一张竖版纸条
//   - 单张纸条版式照用户截图：标题（名字+日期+计划）居中 → 副标题
//     （星期 · 开始 · 项数 · 结束）→ 双线 → 灰底表头（时间|任务）→
//     每行一个任务（完成态：绿 √ + 删除线 + 置灰）→ 页脚（打印日期 + 家长签字）
//   - 保存图片 = 单张纸条本身（无白边，可直接转发/贴用）
//   - 导出 PDF  = 标准 A4 横向页面 + 纸条靠左 + 裁切虚线，打印后沿虚线裁下
//
// 对外函数：
//   printStrip.saveImage(page, orient)  —— 绘制单张纸条并存到相册
//   printStrip.exportPdf(page, orient)  —— A4 页面生成 PDF 并打开（可分享/打印）
//   printStrip.drawPreview(page, canvas, orient) —— 打印面板顶部预览（画当前清单纸条）
//   printStrip.orientLabel(orient)      —— 「横向 A4」/「纵向 A4」（面板用）
//   printStrip.stripSize(n, orient, fitH) —— 单张纸条画布像素尺寸（测试/布局用）
//
// orient: "landscape" | "portrait"。A4 画布按 150dpi 定义（位图即物理像素，不乘 dpr）。
const logic = require("./dailyPlanLogic");
const pdfMaker = require("./pdfMaker");

// A4 两种方向的画布像素尺寸（150dpi）与 PDF 页面尺寸（pt）
const A4 = {
  landscape: { w: 1754, h: 1240, pw: 842, ph: 595 },
  portrait: { w: 1240, h: 1754, pw: 595, ph: 842 },
};

// 页面留白（150dpi ≈ 9.7mm）；每页只放 1 张纸条：横向靠左、纵向居中
const MARGIN = 57;
const LAYOUT = {
  landscape: { w: 508, align: "left" }, // 横纸靠左：左边一点地方就够
  portrait: { w: 560, align: "center" },
};
// 纸条在页面里的可用高度（PDF 模式行高收缩的上限基准）
const MAX_H = {
  landscape: A4.landscape.h - 2 * MARGIN,
  portrait: A4.portrait.h - 2 * MARGIN,
};

// 单张纸条结构常数（@基准条宽 434px —— 按用户截图 1599×1059 页里 434×756 竖条的量取；
// 实际绘制按 k = 条宽/434 整体缩放，保证窄条版式不变形）
const BASE_W = 434;
const FIXED = 224; // 条高 - 行区 = 标题区(134) + 表头(36) + 页脚(54)
const ROW_IDEAL = 540; // 行高理想基准：n 项时 540/n（9 项 ≈ 60，与截图行高一致）
const ROW_MAX = 64; // 任务再少，行高也不超过此值（@k=1）
const ROW_MIN = 24; // 任务再多，行高也不低于此值（@k=1）

const INK = "#1a2233";
const MUTED = "#44506a";
const FAINT = "#8a93a6";
const GREEN = "#1f9d55";
const DONE_GREY = "#9aa3b5";
const LINE = "#2a3550";
const HEAD_BG = "#eef1f6";

function orientLabel(orient) {
  return orient === "portrait" ? "纵向 A4" : "横向 A4";
}

// 行高（@k=1 单位）：任务少时舒展（上限 ROW_MAX），任务多时压到下限 ROW_MIN；
// fitH 给定时（PDF 必须放进 A4 页）继续收缩，保证纸条不超出页面
function rowHeightOf(h, n, w) {
  const k = w / BASE_W;
  return (h - FIXED * k) / Math.max(1, n);
}

function stripHeight(n, w, fitH) {
  const k = w / BASE_W;
  const rows = Math.max(1, n);
  let rowH = Math.min(ROW_MAX * k, (ROW_IDEAL / rows) * k);
  rowH = Math.max(ROW_MIN * k, rowH);
  if (fitH) rowH = Math.min(rowH, Math.max(16 * k, (fitH - FIXED * k) / rows));
  return Math.round(FIXED * k + rows * rowH);
}

// 单张纸条画布尺寸（150dpi 像素）
function stripSize(n, orient, fitH) {
  const w = (LAYOUT[orient] || LAYOUT.landscape).w;
  return { w, h: stripHeight(n, w, fitH) };
}

// ---------- 绘制 → 临时文件（保存图片 / PDF 共用） ----------
// mode: "image" = 画布即单张纸条尺寸（无白边）；"pdf" = 画布即 A4 页面（纸条+裁切虚线）
function renderToFile(page, orient, mode, cb) {
  const view = page.data.view;
  if (!view.length) {
    wx.showToast({ title: "没有任务可打印", icon: "none" });
    return;
  }
  wx.showLoading({ title: "生成中…" });
  wx.createSelectorQuery()
    .in(page)
    .select("#printCanvas")
    .fields({ node: true, size: true })
    .exec((res) => {
      const canvas = res[0] && res[0].node;
      if (!canvas) {
        wx.hideLoading();
        wx.showToast({ title: "画布未就绪", icon: "none" });
        return;
      }
      const sheet = A4[orient] || A4.landscape;
      const strip = stripSize(view.length, orient, mode === "pdf" ? MAX_H[orient] : 0);
      const size = mode === "pdf" ? sheet : strip;
      // 画布位图直接按物理像素给：2d 模式下设置 width/height 会重置 ctx 状态，
      // 所以先设尺寸再 getContext，随后按 1:1 绘制（不需要 scale(dpr)）
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext("2d");
      drawSheet(page, ctx, size, strip, orient, mode);
      // fileType 固定 jpg：PDF 嵌入走 DCTDecode，且体积远小于 png
      wx.canvasToTempFilePath({
        canvas,
        fileType: "jpg",
        quality: 0.92,
        success: (r) => {
          wx.hideLoading();
          cb(r.tempFilePath, size);
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: "生成失败", icon: "none" });
        },
      });
    });
}

function drawSheet(page, ctx, size, strip, orient, mode) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  // 一页只放一张纸条：PDF 模式在 A4 页面上排版（横向靠左/纵向居中）；
  // 存图模式画布就是纸条本身，偏移必须为 0——否则右边会被画布裁掉、左边多出空白
  const isPdf = mode === "pdf";
  const L = LAYOUT[orient] || LAYOUT.landscape;
  const x = isPdf && L.align === "left" ? MARGIN : isPdf ? Math.round((size.w - strip.w) / 2) : 0;
  const y = isPdf ? Math.round((size.h - strip.h) / 2) : 0;
  drawStripCard(ctx, page, x, y, strip.w, strip.h);
  if (isPdf) {
    // 裁切参考虚线 + 提示（仅 PDF 页面有；存图只要纸条本身）
    cutGuides(ctx, x, y, strip.w, strip.h);
    ctx.save();
    ctx.fillStyle = FAINT;
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("— 沿虚线裁切 —", x + strip.w / 2, y + strip.h + 52);
    ctx.restore();
  }
}

// 裁切参考虚线（仅 PDF 页面有；存图只要纸条本身）
function cutGuides(ctx, x, y, w, h) {
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = "#b6bdc9";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 14, y - 14, w + 28, h + 28);
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------- 单张竖版小纸条（版式照用户截图） ----------
function drawStripCard(ctx, page, x, y, w, h) {
  const plan = page.data.plan;
  const view = page.data.view;
  const name = page.data.userName;
  const n = view.length;
  const doneN = view.filter((t) => t.done).length;
  const k = w / BASE_W;
  const pad = Math.round(26 * k);
  const right = w - pad;
  const rowH = rowHeightOf(h, n, w);
  const innerW = w - pad * 2;

  // 卡片细边框（纸条感）
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // ---- 标题 / 副标题（居中；超宽时自适应缩字号，保底再截断） ----
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  const titleText = `${name ? name + "的" : ""}${plan.plan_date}计划`;
  const titleFs = fitFontSize(ctx, titleText, innerW, Math.round(40 * k), Math.round(24 * k));
  ctx.font = `bold ${titleFs}px sans-serif`;
  ctx.fillText(ellipsize(ctx, titleText, innerW), x + w / 2, y + Math.round(56 * k));
  const week = logic.weekdayStr(plan.plan_date);
  const sub =
    `${week ? week + " · " : ""}${plan.first_start || "07:00"} 开始 · ${n} 项 · ` +
    `${page.data.endText || "--:--"} 结束` +
    (doneN ? ` · 完成 ${doneN}` : "");
  ctx.fillStyle = MUTED;
  const subFs = fitFontSize(ctx, sub, innerW, Math.round(17 * k), Math.round(11 * k));
  ctx.font = `${subFs}px sans-serif`;
  ctx.fillText(ellipsize(ctx, sub, innerW), x + w / 2, y + Math.round(96 * k));

  // ---- 双线 ----
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, Math.round(3 * k));
  ctx.beginPath();
  ctx.moveTo(x + pad, y + 124 * k);
  ctx.lineTo(x + right, y + 124 * k);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad, y + 130 * k);
  ctx.lineTo(x + right, y + 130 * k);
  ctx.stroke();

  // ---- 表头 ----
  const tColW = Math.round(118 * k);
  const hy = y + Math.round(134 * k);
  const headH = Math.round(36 * k);
  ctx.fillStyle = HEAD_BG;
  ctx.fillRect(x + pad, hy, w - pad * 2, headH);
  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.round(20 * k)}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("时间", x + pad + Math.round(10 * k), hy + headH / 2);
  ctx.fillText("任务", x + pad + tColW + Math.round(10 * k), hy + headH / 2);

  // ---- 任务行（每行一个任务） ----
  view.forEach((t, i) => {
    const ry = hy + headH + i * rowH;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, ry, w - pad * 2, rowH);
    ctx.beginPath();
    ctx.moveTo(x + pad + tColW, ry);
    ctx.lineTo(x + pad + tColW, ry + rowH);
    ctx.stroke();

    const cy = ry + rowH / 2;
    ctx.textAlign = "left";
    // 时间列：超宽先缩字号，保底截断（绝不允许画出列边框）
    const timeMaxW = tColW - Math.round(20 * k);
    const timeFs = fitFontSize(ctx, t.timeText, timeMaxW, Math.round(19 * k), Math.round(13 * k));
    ctx.font = `${timeFs}px sans-serif`;
    ctx.fillStyle = t.done ? DONE_GREY : INK;
    ctx.fillText(ellipsize(ctx, t.timeText, timeMaxW), x + pad + Math.round(10 * k), cy);

    let tx = x + pad + tColW + Math.round(10 * k);
    if (t.done) {
      ctx.fillStyle = GREEN;
      ctx.font = `bold ${Math.round(24 * k)}px sans-serif`;
      ctx.fillText("√", tx, cy);
      tx += ctx.measureText("√").width + Math.round(8 * k);
    }
    // 任务名：预留类型标签宽度，超宽缩字号 + 截断
    const tagText = t.kindLabel && t.kindLabel !== "任务" ? `［${t.kindLabel}］` : "";
    let titleMaxW = x + w - pad - Math.round(10 * k) - tx;
    if (tagText) {
      ctx.font = `${Math.round(16 * k)}px sans-serif`;
      titleMaxW -= ctx.measureText(tagText).width + Math.round(10 * k);
    }
    const rawTitle = t.title || "（未命名任务）";
    const nameFs = fitFontSize(ctx, rawTitle, titleMaxW, Math.round(26 * k), Math.round(18 * k));
    ctx.font = `bold ${nameFs}px sans-serif`;
    ctx.fillStyle = t.done ? DONE_GREY : INK;
    const title = ellipsize(ctx, rawTitle, titleMaxW);
    ctx.fillText(title, tx, cy);
    // 删除线：必须在标题字号下量实际宽度，否则线会比文字短
    const titleW = ctx.measureText(title).width;
    if (t.done) {
      ctx.fillRect(tx, cy + Math.round(3 * k), titleW, Math.max(2, Math.round(3 * k)));
    }
    if (tagText) {
      ctx.fillStyle = MUTED;
      ctx.font = `${Math.round(16 * k)}px sans-serif`;
      ctx.fillText(tagText, tx + titleW + Math.round(10 * k), cy);
    }
  });

  // ---- 页脚（左右两端，各自不得越过中线） ----
  const fy = hy + headH + n * rowH;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad, fy);
  ctx.lineTo(x + right, fy);
  ctx.stroke();
  const footMaxW = Math.floor(innerW / 2);
  const footFs = fitFontSize(
    ctx,
    `打印：${logic.todayStr()}`,
    footMaxW,
    Math.round(16 * k),
    Math.round(10 * k)
  );
  ctx.font = `${footFs}px sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "left";
  ctx.fillText(`打印：${logic.todayStr()}`, x + pad, fy + Math.round(30 * k));
  ctx.textAlign = "right";
  ctx.fillText("家长签字：＿＿＿＿＿＿", x + right, fy + Math.round(30 * k));
}

// 文本自适应：从 baseFs 逐磅下降直到放得进 maxW，返回可用字号。
// 真实 canvas 的 measureText 随 ctx.font 变化；降到 minFs 仍超时由调用方 ellipsize 兜底。
function fitFontSize(ctx, text, maxW, baseFs, minFs) {
  let fs = baseFs;
  while (fs > minFs) {
    ctx.font = `${fs}px sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    fs -= 1;
  }
  return fs;
}

// 标题超宽时截断加省略号（按码点切，emoji 不会被劈成乱码）
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = Array.from(text);
  let s = "";
  for (const ch of chars) {
    if (ctx.measureText(s + ch + "…").width > maxW) break;
    s += ch;
  }
  return s + "…";
}

// ---------- 打印面板预览：把当前清单画成小纸条（= 保存图片的产物） ----------
// canvas 传 2d canvas node（面板里的离屏小画布）；返回纸条尺寸供调用方缩放显示。
function drawPreview(page, canvas, orient) {
  const view = page.data.view;
  if (!view.length) return null;
  const strip = stripSize(view.length, orient, 0);
  canvas.width = strip.w;
  canvas.height = strip.h;
  const ctx = canvas.getContext("2d");
  drawStripCard(ctx, page, 0, 0, strip.w, strip.h);
  return strip;
}

// ---------- 保存图片到相册（单张纸条本身，无白边） ----------
function saveImage(page, orient) {
  renderToFile(page, orient, "image", (file) => {
    wx.saveImageToPhotosAlbum({
      filePath: file,
      success: () => wx.showToast({ title: "已存入相册", icon: "success" }),
      fail: (e) => {
        // 相册权限被拒时引导去设置（否则用户点了没反应，以为功能坏了）
        if (/auth/i.test(e.errMsg || "")) {
          wx.showModal({
            title: "需要相册权限",
            content: "允许保存到相册后，才能把清单图片存下来打印",
            success: (r) => {
              if (r.confirm) wx.openSetting();
            },
          });
        } else {
          wx.showToast({ title: "保存失败", icon: "none" });
        }
      },
    });
  });
}

// ---------- 生成 A4 方向 PDF 并打开（横向纸上放一张竖版小纸条，靠左，沿虚线裁切） ----------
function exportPdf(page, orient) {
  renderToFile(page, orient, "pdf", (file, size) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: file,
      encoding: "base64",
      success: (r) => {
        try {
          const jpegBytes = new Uint8Array(wx.base64ToArrayBuffer(r.data));
          const pdfBytes = pdfMaker.buildImagePdf(jpegBytes, size.w, size.h, size.pw, size.ph);
          const out = `${wx.env.USER_DATA_PATH}/plan-${page.data.plan.id}.pdf`;
          fs.writeFile({
            filePath: out,
            data: pdfBytes.buffer,
            encoding: "binary",
            success: () => {
              wx.openDocument({
                filePath: out,
                fileType: "pdf",
                showMenu: true,
                success: () =>
                  wx.showToast({ title: `已生成${orientLabel(orient)} PDF`, icon: "success" }),
              });
            },
            fail: () => wx.showToast({ title: "PDF 写入失败", icon: "none" }),
          });
        } catch (_e) {
          wx.showToast({ title: "生成 PDF 失败", icon: "none" });
        }
      },
      fail: () => wx.showToast({ title: "读取图片失败", icon: "none" }),
    });
  });
}

module.exports = { saveImage, exportPdf, drawPreview, orientLabel, stripSize };
