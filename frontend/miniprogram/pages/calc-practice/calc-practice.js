// 计算练习题：设置（N / 步骤 / 数量 / 答案）→ 生成 → 预览 → 导出 PDF / 图片
const calc = require("../../utils/calcLogic");
const calcSheet = require("../../utils/calcSheet");
const pdfMaker = require("../../utils/pdfMaker");

const STEP_OPTIONS = [2, 3, 4];
const KIND_OPTIONS = ["混合", "结果未知", "缺数未知"];
const A4 = { w: 1240, h: 1754, pw: 595, ph: 842 }; // 纵向 @150dpi（与 calcSheet 一致）

Page({
  data: {
    N: 20,
    stepOptions: STEP_OPTIONS,
    stepIndex: 1, // 默认 steps = 3
    steps: 3,
    kindOptions: KIND_OPTIONS,
    kindIndex: 0, // 默认 混合
    kindFilter: "mixed",
    count: 100,
    withAnswer: false,
    example: "",
    copies: 1,
    sheets: [],
    problems: [],
  },

  onLoad() {
    this.refreshExample();
  },

  onNChange(e) {
    this.setData({ N: e.detail.value });
    this.refreshExample();
  },
  onStepTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ steps: STEP_OPTIONS[idx], stepIndex: idx });
    this.refreshExample();
  },
  onKindTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const map = ["mixed", "result", "operand"];
    this.setData({ kindIndex: idx, kindFilter: map[idx] });
    this.refreshExample();
  },
  onCountChange(e) {
    this.setData({ count: e.detail.value });
  },
  onCopiesChange(e) {
    this.setData({ copies: e.detail.value });
  },
  onAnswerToggle(e) {
    this.setData({ withAnswer: e.detail.value });
  },

  // 实时示例：让用户一眼确认「步骤」与「题型结构」的含义
  refreshExample() {
    const p = calc.genOne(this.data.N, this.data.steps);
    const bi = calc.randInt(0, p.nums.length - 1);
    const e1 = `${calc.toExpr(p)} = ?`; // 结果未知
    const e2 = `${calc.toExprBlanked(p, bi)} = ${p.result}`; // 缺数未知
    this.setData({ example: `${e1}     ${e2}` });
  },

  generate() {
    const { N, steps, count, kindFilter, copies } = this.data;
    const sheets = [];
    for (let k = 0; k < copies; k++) {
      sheets.push({ problems: calc.genProblems(N, steps, count, kindFilter) });
    }
    this.setData({ sheets, problems: sheets.length ? sheets[0].problems : [] });
    wx.showToast({ title: `已生成 ${sheets.length} 份 · 每份 ${count} 题`, icon: "none" });
  },

  // 把指定题目集画到离屏 canvas → 临时图片，回调 (tempFilePath | null)
  renderToImage(problems, cb) {
    wx.createSelectorQuery()
      .in(this)
      .select("#wsCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0] && res[0].node;
        if (!canvas) return cb(null);
        canvas.width = A4.w;
        canvas.height = A4.h;
        const ctx = canvas.getContext("2d");
        calcSheet.drawSheet(ctx, A4.w, A4.h, problems, this.data.withAnswer, this.data.N, this.data.steps);
        wx.canvasToTempFilePath({
          canvas,
          fileType: "jpg",
          quality: 0.92,
          success: (r) => cb(r.tempFilePath),
          fail: () => cb(null),
        });
      });
  },

  // 单份渲染（第一份），供「保存图片」使用
  renderSheet(cb) {
    if (!this.data.problems.length) return this.toast("请先生成题目");
    wx.showLoading({ title: "生成中…" });
    this.renderToImage(this.data.problems, (file) => {
      wx.hideLoading();
      if (!file) return this.toast("画布未就绪");
      cb(file, A4);
    });
  },

  // 导出 PDF：N 份各自渲染成图 → 多页 A4 PDF → 打开（可打印/转发）。一份一页。
  exportPdf() {
    if (!this.data.sheets.length) return this.toast("请先生成题目");
    wx.showLoading({ title: "生成 PDF…" });
    const fs = wx.getFileSystemManager();
    const images = [];
    const renderNext = (i) => {
      if (i >= this.data.sheets.length) {
        try {
          const pdfBytes = pdfMaker.buildImagePdf(images, A4.w, A4.h, A4.pw, A4.ph);
          const out = `${wx.env.USER_DATA_PATH}/calc-${Date.now()}.pdf`;
          fs.writeFile({
            filePath: out,
            data: pdfBytes.buffer,
            encoding: "binary",
            success: () => {
              wx.hideLoading();
              wx.openDocument({ filePath: out, fileType: "pdf", showMenu: true, success: () => this.toast("已生成 PDF") });
            },
            fail: () => {
              wx.hideLoading();
              this.toast("PDF 写入失败");
            },
          });
        } catch (_e) {
          wx.hideLoading();
          this.toast("生成 PDF 失败");
        }
        return;
      }
      wx.showLoading({ title: `渲染 ${i + 1}/${this.data.sheets.length}…` });
      this.renderToImage(this.data.sheets[i].problems, (file) => {
        if (!file) {
          wx.hideLoading();
          return this.toast("生成失败");
        }
        fs.readFile({
          filePath: file,
          encoding: "base64",
          success: (r) => {
            images.push(new Uint8Array(wx.base64ToArrayBuffer(r.data)));
            renderNext(i + 1);
          },
          fail: () => {
            wx.hideLoading();
            this.toast("读取图片失败");
          },
        });
      });
    };
    renderNext(0);
  },

  // 保存图片到相册（无白边，单张 A4 整页）
  saveImage() {
    this.renderSheet((file) => {
      wx.saveImageToPhotosAlbum({
        filePath: file,
        success: () => this.toast("已存入相册"),
        fail: (e) => {
          if (/auth/i.test(e.errMsg || "")) {
            wx.showModal({
              title: "需要相册权限",
              content: "允许保存到相册后，才能把练习题图片存下来打印",
              success: (r) => {
                if (r.confirm) wx.openSetting();
              },
            });
          } else {
            this.toast("保存失败");
          }
        },
      });
    });
  },

  toast(t) {
    wx.showToast({ title: t, icon: "none" });
  },
});
