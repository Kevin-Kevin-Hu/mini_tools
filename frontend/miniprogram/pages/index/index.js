// 入口/工具页：登录门槛 —— 未登录静默登录，未加入家庭引导去「我的」
const auth = require("../../utils/auth");

Page({
  data: {
    me: null,
    ready: false,
  },

  onShow() {
    this.gate();
  },

  async gate() {
    try {
      const me = await auth.ensureLogin();
      this.setData({ me, ready: true });
      if (!me.family) {
        wx.showToast({ title: "请先加入家庭", icon: "none" });
        wx.switchTab({ url: "/pages/mine/mine" });
      }
    } catch (e) {
      wx.showToast({ title: e.message || "登录失败", icon: "none" });
    }
  },

  goDailyPlan() {
    wx.navigateTo({ url: "/pages/dp-select/dp-select" });
  },
  goEqualSub() {
    wx.navigateTo({ url: "/pages/es-home/es-home" });
  },
});
