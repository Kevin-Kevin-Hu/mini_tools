// 每日计划 · 任务页：查看/编辑 + 自动排程 + 防抖保存 + 拖动排序 + 常用任务管理 + 打印清单图
// 与网页版功能对齐（技术栈迁移，功能不变）。保存一律读 this.data（执行时快照），切换前 flush。
const api = require("../../utils/api");
const logic = require("../../utils/dailyPlanLogic");
const { createTaskScroller } = require("../../utils/scrollHelper");
const { KIND_LABEL, PRESETS, blankTask, fromCommon } = logic;

function decorate(scheduled) {
  return scheduled.map((t) => ({
    ...t,
    kindLabel: KIND_LABEL[t.kind] || "任务",
    timeText: logic.fmtRange(t.startMin, t.endMin),
    durText: logic.fmtDuration(t.duration_min),
    restText: t._isLast || !(Number(t.rest_after_min) > 0) ? "" : `${t.rest_after_min}`,
    canRest: !t._isLast,
    isFirst: false,
    isLastOne: false,
  }));
}

function markFirstLast(view) {
  return view.map((t, i) => ({
    ...t,
    isFirst: i === 0,
    isLastOne: i === view.length - 1,
  }));
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

Page({
  data: {
    loading: true,
    error: "",
    planId: null,
    plan: null,
    userName: "",
    tasks: [],
    view: [],
    common: [],
    viewMode: "view",
    saveState: "saved",
    showTimePicker: false,
    presets: PRESETS,
    endText: "",
    // 常用任务管理
    showCommon: false,
    commonTitle: "",
    commonDur: 30,
    // 拖动排序
    dragging: -1,
    focusIndex: -1,
  },

  onLoad(query) {
    this.setData({ planId: query.planId, userName: decodeURIComponent(query.user || "") });
    this._saveTimer = null;
    this._metaTimer = null;
    this.load();
  },

  async load() {
    try {
      const d = await api.dp.plan(this.data.planId);
      this.setData({ loading: false, plan: d.plan, tasks: d.tasks, userId: d.plan.user_id });
      this.resched();
      this.loadCommon();
    } catch (e) {
      this.setData({ loading: false, error: e.message });
    }
  },

  async loadCommon() {
    try {
      const common = await api.dp.commonTasks(this.data.userId || (this.data.plan || {}).user_id);
      this.setData({ common });
    } catch (_e) {
      /* 常用任务失败不阻塞 */
    }
  },

  resched() {
    const scheduled = logic.computeSchedule(
      this.data.tasks,
      (this.data.plan || {}).first_start || "07:00"
    );
    const view = markFirstLast(decorate(scheduled));
    const last = scheduled[scheduled.length - 1];
    let endText = "";
    if (last) {
      const mt = logic.minToTime(last.endMin);
      endText = mt.text + (mt.dayOffset ? " (+1天)" : "");
    }
    this.setData({ view, endText });
  },

  // ---------- 模式 ----------
  setView() {
    // 回查看态前收掉键盘：focusIndex 驱动着 input 的 focus 属性，置 -1 即 blur
    this.setData({ viewMode: "view", focusIndex: -1 });
    this.flushAll();
  },
  setEdit() {
    this.setData({ viewMode: "edit" });
  },
  // 查看态点编辑按钮：进入编辑态 + 定位 + 聚焦到该任务
  editTask(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (i < 0 || i >= this.data.tasks.length) return;
    // 顺序很重要：先切到编辑态并把任务滚到可视区顶部，再聚焦输入框。
    // 反过来（先聚焦）会让键盘弹出的页面顶起把滚动位置冲掉，结果标题落在可视区外。
    // ⚠️ 必须 reset：scroller 会缓存任务的「绝对位置」，不清的话第二次点别的任务
    //    （比如先点第 8 个、再点第 2 个）会滚到上一次记住的位置，定位就错了。
    if (this._scroller) this._scroller.reset();
    this.setData({ viewMode: "edit" }, () => {
      this.scrollToTask(i);
      // 等滚动动画走完再聚焦，避免聚焦引发二次滚动
      setTimeout(() => {
        this.setData({ focusIndex: i });
        // 键盘弹起后校正一次滚动：键盘占掉下半屏，确认标题还露在上面
        setTimeout(() => this.scrollToTask(i), 300);
        // ⚠️ 不要在这里把 focusIndex 复位成 -1！
        //    input 的 focus 属性由它驱动，true→false 等于主动 blur，
        //    键盘就会「弹出一下又消失」（2026-10-25 用户反馈的闪烁就是这么来的）。
      }, 220);
    });
  },
  scrollToTask(i) {
    if (!this._scroller) this._scroller = createTaskScroller(this);
    this._scroller.scrollToTask(i);
  },

  // ---------- 元信息（开始时间 / 日期备注） ----------
  openFirstTime() {
    this.setData({ showTimePicker: true });
  },
  onFirstTime(e) {
    this.setData({ showTimePicker: false });
    this.patchPlan({ first_start: e.detail.value });
  },
  onFirstTimeCancel() {
    this.setData({ showTimePicker: false });
  },
  onDayLabel(e) {
    this.patchPlan({ day_label: e.detail.value });
  },
  patchPlan(patch) {
    this.setData({ plan: Object.assign({}, this.data.plan, patch) });
    this.scheduleMetaSave();
  },
  scheduleMetaSave() {
    if (this._metaTimer) clearTimeout(this._metaTimer);
    this._metaTimer = setTimeout(() => this.doMetaSave(), 400);
  },
  async doMetaSave() {
    const p = this.data.plan;
    if (!p) return;
    try {
      await api.dp.updatePlan(p.id, { first_start: p.first_start, day_label: p.day_label || "" });
      this.setData({ saveState: "saved" });
    } catch (_e) {
      this.setData({ saveState: "error" });
    }
  },

  // ---------- 任务编辑 ----------
  updateTask(index, patch) {
    this.setData({
      tasks: this.data.tasks.map((t, i) => (i === index ? Object.assign({}, t, patch) : t)),
    });
    this.resched();
    this.scheduleSave();
  },
  scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.doSave(), 400);
  },
  async doSave() {
    try {
      await api.dp.saveTasks(this.data.planId, this.stripTasks());
      this.setData({ saveState: "saved" });
    } catch (_e) {
      this.setData({ saveState: "error" });
    }
  },
  stripTasks() {
    return this.data.tasks.map((t) => ({
      kind: t.kind,
      title: t.title || "",
      detail: t.detail || "",
      duration_min: Number(t.duration_min) || 0,
      rest_after_min: Number(t.rest_after_min) || 0,
      is_preset: t.is_preset || 0,
    }));
  },
  async flushAll() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._metaTimer) clearTimeout(this._metaTimer);
    this._saveTimer = this._metaTimer = null;
    try {
      await api.dp.saveTasks(this.data.planId, this.stripTasks());
      const p = this.data.plan;
      await api.dp.updatePlan(p.id, { first_start: p.first_start, day_label: p.day_label || "" });
    } catch (_e) {
      /* 静默：返回列表时会重新拉取 */
    }
  },

  insertTask(task) {
    this.setData({ tasks: [...this.data.tasks, task], viewMode: "edit" });
    this.resched();
    this.scheduleSave();
  },
  addCustom() {
    this.insertTask(blankTask());
  },
  addPreset(e) {
    this.insertTask(Object.assign({}, PRESETS[Number(e.currentTarget.dataset.i)]));
  },
  addCommon(e) {
    this.insertTask(fromCommon(this.data.common[Number(e.currentTarget.dataset.i)]));
  },

  onTitle(e) {
    this.updateTask(Number(e.currentTarget.dataset.i), { title: e.detail.value });
  },
  onDetail(e) {
    this.updateTask(Number(e.currentTarget.dataset.i), { detail: e.detail.value });
  },
  onDuration(e) {
    this.updateTask(Number(e.currentTarget.dataset.i), { duration_min: e.detail.value });
  },
  onRest(e) {
    this.updateTask(Number(e.currentTarget.dataset.i), { rest_after_min: e.detail.value });
  },
  noRest(e) {
    // 事件由 stepper 组件触发：index 从 e.detail 取（currentTarget 是组件节点，读不到 data-i）
    const i = e && e.detail && e.detail.index !== undefined
      ? Number(e.detail.index)
      : Number(e.currentTarget.dataset.i);
    this.updateTask(i, { rest_after_min: 0 });
  },

  // ---------- 排序：↑↓ + 长按拖动 ----------
  moveTask(e) {
    this.swap(Number(e.currentTarget.dataset.i), Number(e.currentTarget.dataset.dir));
  },
  swap(i, dir) {
    const j = i + dir;
    const arr = this.data.tasks;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    this.setData({ tasks: arr });
    this.resched();
    this.scheduleSave();
  },

  dragStart(e) {
    const i = Number(e.currentTarget.dataset.i);
    this._dragIdx = i;
    this._startY = e.touches[0].clientY;
    this.setData({ dragging: i });
    this.captureRects();
    wx.vibrateShort({ type: "light" });
  },
  captureRects() {
    wx
      .createSelectorQuery()
      .in(this)
      .selectAll(".task")
      .boundingClientRect((rects) => {
        this._rects = (rects || []).map((r) => ({ top: r.top, bottom: r.bottom }));
      })
      .exec();
  },
  dragMove(e) {
    if (this.data.dragging < 0 || !this._rects) return;
    const y = e.touches[0].clientY;
    let target = -1;
    for (let j = 0; j < this._rects.length; j++) {
      if (y >= this._rects[j].top && y <= this._rects[j].bottom) {
        target = j;
        break;
      }
    }
    if (target >= 0 && target !== this._dragIdx) {
      const arr = this.data.tasks;
      const tmp = arr[this._dragIdx];
      arr[this._dragIdx] = arr[target];
      arr[target] = tmp;
      this._dragIdx = target;
      this._startY = y;
      this.setData({ tasks: arr, dragging: target });
      this.resched();
      this.captureRects(); // 位置变了，重新量
    }
  },
  dragEnd() {
    if (this.data.dragging < 0) return;
    this.setData({ dragging: -1 });
    this._rects = null;
    this.scheduleSave();
  },

  async dupTask(e) {
    const i = Number(e.currentTarget.dataset.i);
    const arr = [...this.data.tasks];
    arr.splice(i + 1, 0, Object.assign({}, arr[i]));
    this.setData({ tasks: arr });
    this.resched();
    this.scheduleSave();
  },
  async delTask(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ tasks: this.data.tasks.filter((_, x) => x !== i) });
    this.resched();
    this.scheduleSave();
  },

  // ---------- 常用任务管理 ----------
  toggleManage() {
    this.setData({ showCommon: !this.data.showCommon });
  },
  onCommonTitle(e) {
    this.setData({ commonTitle: e.detail.value });
  },
  onCommonDur(e) {
    this.setData({ commonDur: e.detail.value });
  },
  async addCommonTask() {
    const title = (this.data.commonTitle || "").trim();
    if (!title) return wx.showToast({ title: "先填标题", icon: "none" });
    const c = await api.dp.createCommon({
      title,
      detail: "",
      duration_min: this.data.commonDur,
      kind: "task",
    });
    this.setData({ common: [...this.data.common, c], commonTitle: "" });
  },
  async delCommonTask(e) {
    const i = Number(e.currentTarget.dataset.i);
    const c = this.data.common[i];
    const ok = await new Promise((r) =>
      wx.showModal({ title: "确认", content: `删除常用任务「${c.title}」？`, success: (x) => r(!!x.confirm) })
    );
    if (!ok) return;
    await api.dp.deleteCommon(c.id);
    this.setData({ common: this.data.common.filter((_, x) => x !== i) });
  },

  // ---------- 打印清单（Canvas 生成纸条图片） ----------
  async genPrint() {
    const view = this.data.view;
    if (!view.length) return wx.showToast({ title: "没有任务可打印", icon: "none" });
    wx.showLoading({ title: "生成中…" });
    try {
      const query = wx.createSelectorQuery().in(this);
      query
        .select("#printCanvas")
        .fields({ node: true, size: true })
        .exec(async (res) => {
          const canvas = res[0].node;
          const dpr = wx.getWindowInfo().pixelRatio || 2;
          const W = 375;
          const rowH = 52;
          const H = 130 + view.length * rowH + 90;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          const ctx = canvas.getContext("2d");
          ctx.scale(dpr, dpr);
          this.drawStrip(ctx, W, H, rowH);
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
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && e.message) || "生成失败", icon: "none" });
    }
  },

  drawStrip(ctx, W, H, rowH) {
    const plan = this.data.plan;
    const view = this.data.view;
    const name = this.data.userName;
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
      `${week ? "星期" + week + " · " : ""}${plan.first_start || "07:00"} 开始 · ${view.length} 项 · ${this.data.endText} 结束`,
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
  },

  onUnload() {
    this.flushAll();
  },

  noop() {},
});
