// 每日计划 · 选择页：管理「我的」孩子用户 + 选/建/复制计划
// 数据归属：孩子用户 / 计划 / 常用任务在**同家庭内共享**（RLS 策略
// child_users_family / plans_family / common_tasks_family，见 scripts/mp_rls_family_share.sql），
// 家庭外的微信账号互相不可见。
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const logic = require("../../utils/dailyPlanLogic");

Page({
  data: {
    loading: true,
    error: "",
    users: [],
    curUserId: null,
    curUserName: "",
    plans: [],
    today: "",
    showTimePicker: false,
    newPlanDate: "",
    newPlanFirst: "07:00",
    showNewPlan: false,
    // 复制面板：copyPlanId = 正在复制哪份计划；copyDate = 目标日期（选择器选出来的值）
    copyPlanId: null,
    copyDate: "",
  },

  onLoad() {
    this.setData({ today: logic.todayStr() });
    this.bootstrap();
  },

  async bootstrap() {
    try {
      const me = await auth.ensureLogin();
      if (!me.family) {
        wx.showToast({ title: "请先加入家庭", icon: "none" });
        return wx.switchTab({ url: "/pages/mine/mine" });
      }
      const users = await api.dp.users();
      this.setData({ users, loading: false });
      if (users.length) await this.selectUser(users[0].id);
      else this.setData({ loading: false });
    } catch (e) {
      this.setData({ loading: false, error: e.message });
    }
  },

  async selectUser(uid) {
    const u = this.data.users.find((x) => x.id === uid);
    this.setData({ curUserId: uid, curUserName: u ? u.name : "", plans: [], loading: true });
    try {
      const plans = await api.dp.plans(uid);
      this.setData({ plans, loading: false });
    } catch (e) {
      this.setData({ loading: false, error: e.message });
    }
  },

  onPickUser(e) {
    // picker 的 value 是 range 的下标，需先映射到真实 id（云库 id 为 UUID 字符串）
    const idx = Number(e.detail.value);
    const u = this.data.users[idx];
    if (u) this.selectUser(u.id);
  },

  // ---- 孩子用户管理（归属当前微信用户） ----
  async addUser() {
    const r = await this.askText("新建用户", "输入名字");
    if (!r) return;
    const u = await api.dp.createUser(r);
    this.setData({ users: [...this.data.users, u] });
    await this.selectUser(u.id);
  },

  async renameUser() {
    if (!this.data.curUserId) return;
    const r = await this.askText("改名", "输入新名字", this.data.curUserName);
    if (!r) return;
    await api.dp.renameUser(this.data.curUserId, r);
    const users = this.data.users.map((u) =>
      u.id === this.data.curUserId ? Object.assign({}, u, { name: r }) : u
    );
    this.setData({ users, curUserName: r });
  },

  async deleteUser() {
    if (!this.data.curUserId) return;
    const ok = await this.confirm(`删除「${this.data.curUserName}」及其全部计划？`);
    if (!ok) return;
    await api.dp.deleteUser(this.data.curUserId);
    const users = this.data.users.filter((u) => u.id !== this.data.curUserId);
    this.setData({ users, plans: [], curUserId: null, curUserName: "" });
    if (users.length) await this.selectUser(users[0].id);
  },

  // ---- 计划 ----
  toggleNewPlan() {
    if (!this.data.curUserId) return;
    this.setData({ showNewPlan: !this.data.showNewPlan, newPlanDate: this.data.today });
  },
  onNewDate(e) {
    this.setData({ newPlanDate: e.detail.value });
  },
  openNewTime() {
    this.setData({ showTimePicker: true });
  },
  onNewTime(e) {
    this.setData({ newPlanFirst: e.detail.value, showTimePicker: false });
  },
  onNewTimeCancel() {
    this.setData({ showTimePicker: false });
  },
  async createPlan() {
    const p = await api.dp.createPlan(
      this.data.curUserId,
      this.data.newPlanDate || this.data.today,
      this.data.newPlanFirst || "07:00"
    );
    this.setData({ showNewPlan: false });
    this.gotoEditor(p.id);
  },
  // ---- 复制计划：用日期选择器代替原来的手打输入框 ----
  // 旧实现是 wx.showModal({editable:true}) 让人敲 YYYY-MM-DD，慢且易填错；
  // 现在点「复制」就地展开一行：<picker mode="date"> + 确认/取消，默认目标 = 源计划日期 +1 天。
  startCopy(e) {
    const id = e.currentTarget.dataset.id;
    const src = this.data.plans.find((p) => p.id === id);
    const from = (src && src.plan_date) || this.data.today;
    this.setData({
      copyPlanId: id,
      copyDate: logic.addDays(from, 1),
      showNewPlan: false,
    });
  },
  onCopyDate(e) {
    this.setData({ copyDate: e.detail.value });
  },
  cancelCopy() {
    this.setData({ copyPlanId: null, copyDate: "" });
  },
  async doCopy() {
    const id = this.data.copyPlanId;
    const date = this.data.copyDate;
    if (!id || !date) return;
    // 目标日期若已有计划，先确认，避免静默产生同日期的两份计划
    const conflict = this.data.plans.find((p) => p.plan_date === date);
    if (conflict) {
      const ok = await this.confirm(`${date} 已有计划，仍要再复制一份？`);
      if (!ok) return;
    }
    this.setData({ copyPlanId: null, copyDate: "" });
    try {
      await api.dp.copyPlan(id, date);
      await this.refreshPlans();
      wx.showToast({ title: `已复制到 ${date}`, icon: "success" });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "复制失败", icon: "none" });
    }
  },
  async deletePlan(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await this.confirm("删除这份计划？");
    if (!ok) return;
    await api.dp.deletePlan(id);
    this.refreshPlans();
  },
  async refreshPlans() {
    if (this.data.curUserId == null) return;
    const plans = await api.dp.plans(this.data.curUserId);
    this.setData({ plans });
  },

  gotoEditor(e) {
    // 兼容两种调用：wxml bind:tap（传事件，取 data-id）与 createPlan（直接传 id）
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : e;
    wx.navigateTo({
      url: `/pages/dp-editor/dp-editor?planId=${id}&user=${encodeURIComponent(
        this.data.curUserName || ""
      )}`,
    });
  },

  noop() {},

  // ---- 通用弹窗 ----
  askText(title, placeholder, defaultValue) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        editable: true,
        placeholderText: placeholder,
        content: defaultValue || "",
        success: (r) => {
          if (r.confirm) {
            const v = (r.content || "").trim();
            resolve(v || null);
          } else resolve(null);
        },
      });
    });
  },
  confirm(msg) {
    return new Promise((resolve) => {
      wx.showModal({ title: "确认", content: msg, success: (r) => resolve(!!r.confirm) });
    });
  },
});
