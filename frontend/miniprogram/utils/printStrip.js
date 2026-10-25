// 每日计划 · 打印清单：Canvas 生成纸条样式图片（从 dp-editor.js 拆出，压行数）
// 用法：printStrip.genPrint(page) —— 内部读 page.data 的 plan / view / userName / endText
const logic = require("./dailyPlanLogic");

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 生成并预览图片（view 来自 page.data.view，即已排程+装饰的任务）
function genPrint(page) {
  const view = page.data.view;
  if (!view.length) {
    wx.showToast({ title: "没有任务可打印", icon: "none" });
    return;
  }
  wx.showLoading({ title: "生成中…" });
  const query = wx.createSelectorQuery().in(page);
  query
    .select("#printCanvas")
    .fields({ node: true, size: true })
    .exec((res) => {
      const canvas = res[0] && res[0].node;
      if (!canvas) {
        wx.hideLoading();
        wx.showToast({ title: "画布未就绪", icon: "none" });
        return;
      }
      const dpr = wx.getWindowInfo().pixelRatio || 2;
      const W = 375;
      const rowH = 52;
      const H = 130 + view.length * rowH + 90;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      drawStrip(page, ctx, W, H, rowH);
      wx.canvasToTempFilePath({
        canvas,
        success: (r) => {
          wx.hideLoading();
          wx.previewImage({ urls: [r.tempFilePath] });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: "生成失败", icon: "none" });
        },
      });
    });
}

function drawStrip(page, ctx, W, H, rowH) {
  const plan = page.data.plan;
  const view = page.data.view;
  const name = page.data.userName;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a2233";
  ctx.textBaseline = "middle";

  // 标题
  ctx.font = "bold 19px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${name ? name + "的" : ""}${plan.plan_date}计划`, W / 2, 32);
  // 副标题
  let week = "";
  try {
    const p = plan.plan_date.split("-");
    week = WEEK[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
  } catch (_e) {
    week = "";
  }
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#44506a";
  ctx.fillText(
    `${week ? "星期" + week + " · " : ""}${plan.first_start || "07:00"} 开始 · ${view.length} 项 · ${page.data.endText} 结束`,
    W / 2,
    56
  );
  // 双线
  ctx.strokeStyle = "#1a2233";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(14, 74);
  ctx.lineTo(W - 14, 74);
  ctx.stroke();

  // 表头
  const y0 = 92;
  const colX = 14;
  const colW = W - 28;
  const tW = 118;
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#eef1f6";
  ctx.fillRect(colX, y0, colW, 30);
  ctx.fillStyle = "#1a2233";
  ctx.textAlign = "left";
  ctx.fillText("时间", colX + 10, y0 + 15);
  ctx.fillText("任务", colX + tW + 10, y0 + 15);

  // 行
  ctx.font = "13px sans-serif";
  view.forEach((t, i) => {
    const y = y0 + 30 + i * rowH;
    ctx.strokeStyle = "#2a3550";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(colX, y, colW, rowH);
    ctx.strokeRect(colX, y, tW, rowH); // 时间列分隔
    ctx.fillStyle = "#1a2233";
    ctx.font = "12px sans-serif";
    ctx.fillText(t.timeText, colX + 10, y + rowH / 2);
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(t.title || "（未命名任务）", colX + tW + 10, y + rowH / 2);
    if (t.kindLabel && t.kindLabel !== "任务") {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#44506a";
      ctx.fillText(`［${t.kindLabel}］`, colX + tW + 10 + ctx.measureText(t.title || "").width * 2.1 + 14, y + rowH / 2);
      ctx.fillStyle = "#1a2233";
      ctx.font = "bold 13px sans-serif";
    }
  });

  // 页脚
  const fy = y0 + 30 + view.length * rowH + 34;
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#44506a";
  ctx.textAlign = "left";
  ctx.fillText(`打印：${logic.todayStr()}`, colX, fy);
  ctx.textAlign = "right";
  ctx.fillText("家长签字：＿＿＿＿＿＿", W - colX, fy);

  // 裁切参考虚线框
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.setLineDash([]);
}

module.exports = { genPrint };
