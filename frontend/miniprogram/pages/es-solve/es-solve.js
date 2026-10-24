// 等量代换 · 阶梯求解：字符级选中 → 应用等量关系 → 逐步化简
// 与网页版 EqualSubstitution.jsx 同一套逻辑（equalSubLogic.js 移植版）
const es = require("../../utils/equalSubLogic");
const api = require("../../utils/api");

Page({
  data: {
    target: "",
    rels: [],
    knownRels: [], // 顶部常驻「已知关系」
    steps: [], // {cells:[{sym,isOp,cls}], text}
    stepMetas: [], // {relationText, srcText, replText}
    sel: null, // {anchor,start,end}
    selText: "",
    selK: 0,
    selTotal: 0,
    options: [], // {relText, text, relIdx}
    isDone: false,
    resultText: "",
    hasUnknown: false,
    workSide: "left",
    undoable: false,
    recorded: false,
  },

  onLoad(query) {
    const p = JSON.parse(decodeURIComponent(query.data));
    const shapes = es.parseShapes(p.shapesStr);
    const qL = p.qLeft;
    const qR = p.qRight;
    const lhsQ = qL.includes("?");
    const ws = lhsQ ? "right" : "left";
    const ot = es.expand(es.parseExpr(lhsQ ? qL : qR));
    const st = es.expand(es.parseExpr(lhsQ ? qR : qL));

    this._shapes = shapes;
    this._relations = p.relations;
    this._otherTokens = ot;
    this._raw = p;

    this.setData({
      target: p.target,
      rels: p.relations,
      knownRels: p.relations.map((r) => `${r.left.trim()} = ${r.right.trim()}`),
      hasUnknown: qL.includes("?") || qR.includes("?"),
      workSide: ws,
      steps: [this.renderStep(st)],
      stepMetas: [],
      undoable: false,
    });
  },

  // 把 token 数组渲染成带样式的格子
  renderStep(tokens, replIdx, srcMark) {
    const replSet = new Set(replIdx || []);
    const cells = tokens.map((t, i) => {
      let cls = "";
      if (srcMark && i >= srcMark.start && i <= srcMark.end) cls = "src";
      else if (replSet.has(i)) cls = "repl";
      return {
        sym: t.t === "op" ? t.v : t.sym,
        isOp: t.t === "op",
        cls,
        src: cls === "src",
        repl: cls === "repl",
      };
    });
    return { tokens, replIdx: replIdx || null, cells, text: es.tokensToStr(tokens) };
  },

  cur() {
    return this.data.steps[this.data.steps.length - 1];
  },

  // ---------- 选中 ----------
  tapCell(e) {
    const idx = Number(e.currentTarget.dataset.i);
    const cur = this.cur();
    const t = cur.tokens[idx];
    if (!t || t.t !== "grp") return;
    const run = es.runBounds(cur.tokens, idx);
    const sel = this.data.sel;
    const a = sel ? sel.anchor : null;
    let next;
    if (a === null || idx < run.a || idx > run.b || cur.tokens[a].sym !== t.sym) {
      next = { anchor: idx, start: idx, end: idx };
    } else if (idx === a) {
      next = { anchor: a, start: a, end: a };
    } else {
      next = { anchor: a, start: Math.min(a, idx), end: Math.max(a, idx) };
    }
    this.applySel(next);
  },
  applySel(sel) {
    const cur = this.cur();
    const t0 = cur.tokens[sel.start];
    const k = sel.end - sel.start + 1;
    const run = es.runBounds(cur.tokens, sel.start);
    const total = run.b - run.a + 1;
    const options = [];
    this._relations.forEach((rel, relIdx) => {
      es.applicable({ sym: t0.sym, n: k }, rel).forEach((a) => {
        options.push({ relIdx, relText: `${rel.left} = ${rel.right}`, text: a.text, a });
      });
    });
    this.setData({
      sel,
      selText: t0.sym.repeat(k),
      selK: k,
      selTotal: total,
      options: options.map((o) => ({
        relIdx: o.relIdx,
        relText: o.relText,
        text: o.text,
        payload: { tokens: o.a.tokens, text: o.a.text },
      })),
    });
    this.refreshCells();
  },
  refreshCells() {
    // 更新当前步骤格子的选中态（保留 src/repl 底色）
    const sel = this.data.sel;
    const i = this.data.steps.length - 1;
    const cur = this.data.steps[i];
    const cells = cur.cells.map((c, x) => {
      let cls = c.src ? "src" : c.repl ? "repl" : "";
      if (!c.src && !c.repl && sel && x >= sel.start && x <= sel.end) cls = "sel";
      return Object.assign({}, c, { cls });
    });
    this.setData({ [`steps[${i}].cells`]: cells });
  },
  clearSel() {
    this.setData({ sel: null, selText: "", options: [] });
    this.refreshCells();
  },
  selAllRun() {
    const sel = this.data.sel;
    const run = es.runBounds(this.cur().tokens, sel.start);
    this.applySel({ anchor: run.a, start: run.a, end: run.b });
  },
  selOne() {
    const sel = this.data.sel;
    this.applySel({ anchor: sel.start, start: sel.start, end: sel.start });
  },

  // ---------- 应用转换 ----------
  applyOption(e) {
    const idx = Number(e.currentTarget.dataset.i);
    const opt = this.data.options[idx];
    if (!opt) return;
    const sel = this.data.sel;
    const cur = this.cur();
    const start = sel.start;
    const end = sel.end;
    const sym = cur.tokens[start].sym;
    const k = end - start + 1;
    const rel = this._relations[opt.relIdx];

    const inserted = es
      .expand(opt.payload.tokens)
      .map((t) => (t.t === "grp" ? { t: "grp", sym: t.sym, n: 1 } : { t: "op", v: t.v }));
    const newTokens = [...cur.tokens.slice(0, start), ...inserted, ...cur.tokens.slice(end + 1)];
    const replIdx = inserted.map((_, j) => start + j);

    const steps = [...this.data.steps];
    const prevStep = this.renderStep(cur.tokens, cur.replIdx, { start, end });
    steps[steps.length - 1] = prevStep;
    steps.push(this.renderStep(newTokens, replIdx, null));

    const metas = [...this.data.stepMetas];
    metas.push({
      relationText: `${rel.left} = ${rel.right}`,
      srcText: sym.repeat(k),
      replText: inserted
        .map((t) => (t.t === "op" ? " " + t.v + " " : t.sym))
        .join("")
        .trim(),
    });

    this.setData({ steps, stepMetas: metas, sel: null, selText: "", options: [], undoable: true });
    this.checkDone();
  },

  undo() {
    if (this.data.steps.length > 1) {
      const steps = [...this.data.steps];
      steps.pop();
      const metas = [...this.data.stepMetas];
      metas.pop();
      const last = steps[steps.length - 1];
      // 撤销后最后一步恢复为"当前"（去掉它曾带的替换高亮）
      steps[steps.length - 1] = this.renderStep(last.tokens, last.replIdx, null);
      this.setData({
        steps,
        stepMetas: metas,
        undoable: steps.length > 1,
        sel: null,
        selText: "",
        options: [],
        isDone: false,
      });
      this.checkDone();
    }
  },

  // ---------- 完成判定 + 记录 ----------
  checkDone() {
    const last = this.cur();
    const target = this.data.target;
    const done = es.onlyTarget(last.tokens, target) && last.tokens.some((t) => t.t === "grp");
    if (!done) {
      this.setData({ isDone: false, resultText: "" });
      return;
    }
    const ans = es.evalTarget(last.tokens, target);
    let resultText = `${ans} 个${target}`;
    if (this.data.hasUnknown) {
      const unk = es.solveUnknown(this._otherTokens, ans, target);
      resultText = `? = ${unk === null ? "?" : unk} 个${target}`;
    }
    this.setData({ isDone: true, resultText });
    if (!this.data.recorded) {
      this.setData({ recorded: true });
      const p = this._raw;
      api
        .addExperiment(
          "equal-substitution",
          JSON.stringify({ shapes: this._shapes, relations: p.relations, qLeft: p.qLeft, qRight: p.qRight, target: p.target }),
          resultText,
          1
        )
        .catch(() => {});
    }
  },

  restart() {
    const first = this.data.steps[0];
    this.setData({
      steps: [this.renderStep(first.tokens, null, null)],
      stepMetas: [],
      sel: null,
      selText: "",
      options: [],
      undoable: false,
      isDone: false,
      resultText: "",
      recorded: false,
    });
  },

  goBack() {
    wx.navigateBack();
  },

  noop() {},
});
