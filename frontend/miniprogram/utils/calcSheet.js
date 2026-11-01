// 计算练习题 · A4 工作表绘制（5 列 × 20 行，列优先纵向填充）
//
// 与 printStrip 同套思路：把内容画到一张 A4 纵向位图（150dpi），
// 再由 pdfMaker.buildImagePdf 嵌成单页 PDF。这里只负责「画」，不碰 PDF / 文件。
//
// 画布像素：A4 纵向 @150dpi = 1240 × 1754（与 printStrip.A4.portrait 一致）。

const INK = "#1a2233";
const MUTED = "#6b7488"; // 副标题灰

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 文本自适应：从 baseFs 逐磅下降直到放得进 maxW，返回可用字号（与 printStrip 同款）
function fitFontSize(ctx, text, maxW, baseFs, minFs) {
  let fs = baseFs;
  while (fs > minFs) {
    ctx.font = `${fs}px sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    fs -= 1;
  }
  return fs;
}

// 在 (x, y) 处画一段填空下划线，返回下划线末端 x
function drawBlank(ctx, x, y, w) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 11);
  ctx.lineTo(x + w, y + 11);
  ctx.stroke();
  return x + w;
}

// 单个输入栏：标签 + 一条填空线
function field(ctx, x, y, label, blankW) {
  ctx.fillStyle = INK;
  ctx.font = "22px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);
  const lw = ctx.measureText(label).width;
  return drawBlank(ctx, x + lw + 4, y, blankW) + 14;
}

// 时间栏：标签 + 空 + 分 + 空 + 秒（如「时间：__ 分 __ 秒」）
function fieldTime(ctx, x, y, label, b1, b2) {
  ctx.fillStyle = INK;
  ctx.font = "22px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);
  let cx = x + ctx.measureText(label).width + 4;
  cx = drawBlank(ctx, cx, y, b1) + 4;
  ctx.fillText("分", cx, y);
  cx += ctx.measureText("分").width + 4;
  cx = drawBlank(ctx, cx, y, b2) + 4;
  ctx.fillText("秒", cx, y);
  cx += ctx.measureText("秒").width;
  return cx + 14;
}

// 顶部四个输入栏：姓名 / 日期 / 时间(分秒) / 错误数
function drawHeader(ctx, left, right, y) {
  ctx.textBaseline = "middle";
  let x = left;
  x = field(ctx, x, y, "姓名：", 220);
  x = field(ctx, x, y, "日期：", 150);
  x = fieldTime(ctx, x, y, "时间：", 56, 56);
  field(ctx, x, y, "错误数：", 120);
}

/**
 * 绘制整张工作表。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W 画布宽（像素）
 * @param {number} H 画布高（像素）
 * @param {Array<{expr:string, answer:number, side:string, line:string, lineAns:string}>} problems
 * @param {boolean} withAnswer 是否在等号后填答案
 * @param {number} N 数字上限（用于副标题与字号估算）
 * @param {number} steps 算式数字个数（副标题）
 */
function drawSheet(ctx, W, H, problems, withAnswer, N, steps) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const M = 48; // 页边距（@150dpi ≈ 8mm）
  const headerH = 60; // 顶部输入栏高度
  const titleH = 96; // 标题区高度
  const gridTop = M + headerH + titleH;
  const gridBottom = H - M;
  const gridLeft = M;
  const gridRight = W - M;
  const gridW = gridRight - gridLeft;

  const cols = 5;
  const rowsPerCol = Math.max(1, Math.ceil(problems.length / cols));
  const rowH = (gridBottom - gridTop) / rowsPerCol;
  const colW = gridW / cols;

  // ---- 顶部四个输入栏 ----
  drawHeader(ctx, gridLeft, gridRight, M + headerH / 2);

  // ---- 标题 + 副标题 ----
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "bold 46px sans-serif";
  ctx.fillText("计算练习题", W / 2, M + headerH + 38);
  ctx.fillStyle = MUTED;
  ctx.font = "22px sans-serif";
  const sub = `${N} 以内 · ${steps} 个数字 · 共 ${problems.length} 题`;
  ctx.fillText(sub, W / 2, M + headerH + 74);

  // ---- 统一字号（按「最宽一题」自适应；覆盖结果未知/缺数未知两种结构与空/答案两种情形） ----
  const digits = String(Math.floor(N)).length;
  const maxNum = "9".repeat(digits);
  let worstExpr = "";
  for (let i = 0; i < steps; i++) worstExpr += (i ? " + " : "") + maxNum;
  const firstPlus = worstExpr.indexOf(" + ");
  const restExpr = firstPlus >= 0 ? worstExpr.slice(firstPlus + 3) : "";
  const worstAns = `${worstExpr} = ${maxNum}`; // 结果未知（填答案）
  const worstBlank = `${worstExpr} = ( )`; // 结果未知（空白）
  // 缺数未知且空白在最左端：( ) + 余下表达式 = 结果（步骤≥2 才可能出现）
  const worstOperandLeft = firstPlus >= 0 ? `( ) + ${restExpr} = ${maxNum}` : worstAns;
  const padX = 16;
  const innerW = colW - padX * 2;
  const exprFont = Math.min(
    fitFontSize(ctx, worstAns, innerW, 30, 16),
    fitFontSize(ctx, worstBlank, innerW, 30, 16),
    fitFontSize(ctx, worstOperandLeft, innerW, 30, 16)
  );

  // ---- 题目（列优先：先填满第 1 列 20 行，再第 2 列…） ----
  ctx.textAlign = "left";
  problems.forEach((p, i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const x = gridLeft + col * colW;
    const yTop = gridTop + row * rowH;
    const cy = yTop + rowH / 2;

    // 表达式 + 答案 / 空白（空随机在等号左或右，line/lineAns 已含该布局）
    ctx.fillStyle = INK;
    ctx.font = `${exprFont}px sans-serif`;
    ctx.fillText(withAnswer ? p.lineAns : p.line, x + padX, cy);
  });
}

module.exports = { drawSheet, todayStr };
