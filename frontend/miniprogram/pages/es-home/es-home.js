// 等量代换 · 题目构建：形状 + 等量关系 + 求解问题（符号点按插入）
const es = require("../../utils/equalSubLogic");
const auth = require("../../utils/auth");

const GEO = ["☆", "○", "△", "□", "◇", "⬡"];
const FRUITS = ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓"];

const EXAMPLE = {
  shapesStr: "☆ ○ △",
  relations: [
    { left: "☆☆", right: "○○○" },
    { left: "○", right: "△△" },
  ],
  qLeft: "☆☆+○○",
  qRight: "?",
  target: "○",
};

Page({
  onLoad() {
    // 登录门槛：未加入家庭则引导去「我的」
    auth.requireFamily().then((me) => {
      if (!me) {
        wx.showToast({ title: "请先加入家庭", icon: "none" });
        wx.switchTab({ url: "/pages/mine/mine" });
      }
    });
  },

  data: {
    geo: GEO,
    fruits: FRUITS,
    shapesStr: EXAMPLE.shapesStr,
    relations: JSON.parse(JSON.stringify(EXAMPLE.relations)),
    qLeft: EXAMPLE.qLeft,
    qRight: EXAMPLE.qRight,
    target: EXAMPLE.target,
    focusField: "shapes", // shapes | relL:i | relR:i | qLeft | qRight
    shapeOptions: ["☆", "○", "△"],
  },

  syncShapeOptions() {
    this.setData({ shapeOptions: es.parseShapes(this.data.shapesStr) });
  },

  setFocus(e) {
    this.setData({ focusField: e.currentTarget.dataset.f });
  },

  // 把文本插入当前聚焦字段（末尾追加；小程序 input 光标位置难以跨端维护，v1 简化）
  appendTo(field, text) {
    const d = this.data;
    if (field === "shapes") {
      this.setData({ shapesStr: d.shapesStr + text });
      this.syncShapeOptions();
      return;
    }
    const m = /^rel([LR]):(\d+)$/.exec(field);
    if (m) {
      const i = Number(m[2]);
      const key = m[1] === "L" ? "left" : "right";
      const relations = d.relations.map((r, x) =>
        x === i ? Object.assign({}, r, { [key]: r[key] + text }) : r
      );
      this.setData({ relations });
      return;
    }
    if (field === "qLeft") this.setData({ qLeft: d.qLeft + text });
    if (field === "qRight") this.setData({ qRight: d.qRight + text });
  },

  onKey(e) {
    const { sym, op } = e.currentTarget.dataset;
    const text = sym || op;
    let f = this.data.focusField;
    if (f === "shapes" && op) return; // 形状框不放运算符
    if (!f) f = "shapes";
    this.appendTo(f, text);
  },
  onKeyDelete() {
    const f = this.data.focusField || "shapes";
    const d = this.data;
    const cut = (s) => Array.from(s || "").slice(0, -1).join("");
    const m = /^rel([LR]):(\d+)$/.exec(f);
    if (f === "shapes") {
      this.setData({ shapesStr: cut(d.shapesStr) });
      this.syncShapeOptions();
    } else if (m) {
      const i = Number(m[2]);
      const key = m[1] === "L" ? "left" : "right";
      this.setData({
        relations: d.relations.map((r, x) => (x === i ? Object.assign({}, r, { [key]: cut(r[key]) }) : r)),
      });
    } else if (f === "qLeft") this.setData({ qLeft: cut(d.qLeft) });
    else if (f === "qRight") this.setData({ qRight: cut(d.qRight) });
  },

  // 手动输入（input 直接改值）
  onShapesInput(e) {
    this.setData({ shapesStr: e.detail.value });
    this.syncShapeOptions();
  },
  onRelInput(e) {
    const { i, side } = e.currentTarget.dataset;
    const relations = this.data.relations.map((r, x) =>
      x === Number(i) ? Object.assign({}, r, { [side]: e.detail.value }) : r
    );
    this.setData({ relations });
  },
  onQInput(e) {
    this.setData({ [e.currentTarget.dataset.f]: e.detail.value });
  },

  addRelation() {
    this.setData({
      relations: [...this.data.relations, { left: "", right: "" }],
      focusField: `relL:${this.data.relations.length}`,
    });
  },
  delRelation(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ relations: this.data.relations.filter((_, x) => x !== i) });
  },
  setTarget(e) {
    this.setData({ target: this.data.shapeOptions[Number(e.detail.value)] });
  },
  loadExample() {
    this.setData({
      shapesStr: EXAMPLE.shapesStr,
      relations: JSON.parse(JSON.stringify(EXAMPLE.relations)),
      qLeft: EXAMPLE.qLeft,
      qRight: EXAMPLE.qRight,
      target: EXAMPLE.target,
    });
    this.syncShapeOptions();
  },

  start() {
    const sh = es.parseShapes(this.data.shapesStr);
    if (sh.length === 0) return this.toast("请先输入至少一个形状");
    const rels = this.data.relations
      .map((r) => ({ left: r.left.trim(), right: r.right.trim() }))
      .filter((r) => r.left && r.right);
    if (rels.length === 0) return this.toast("请至少填一条等量关系");
    const qL = this.data.qLeft.replace(/个/g, "").trim();
    const qR = this.data.qRight.replace(/个/g, "").trim() || "?";
    if (!qL) return this.toast("请填写求解问题");
    if (qL.includes("?") && qR.includes("?"))
      return this.toast("左右两边不能同时含 ?，请把未知只放在一边");
    if (this.data.target && !sh.includes(this.data.target))
      return this.toast("目标符号要在形状列表里");

    const payload = {
      shapesStr: this.data.shapesStr,
      relations: rels,
      qLeft: qL,
      qRight: qR,
      target: this.data.target || sh[0],
    };
    wx.navigateTo({
      url: `/pages/es-solve/es-solve?data=${encodeURIComponent(JSON.stringify(payload))}`,
    });
  },

  toast(title) {
    wx.showToast({ title, icon: "none" });
  },
});
