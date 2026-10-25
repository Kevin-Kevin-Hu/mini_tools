// 我的：微信登录状态 + 家庭（新建/加入/家庭码复制/成员/退出）+ 昵称
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const { checkNickname } = require("../../utils/nickname");

Page({
  data: {
    me: null, // {user, family, members}
    busy: false,
  },

  onShow() {
    this.bootstrap();
  },

  async bootstrap() {
    try {
      const me = await auth.ensureLogin();
      this.setData({ me });
    } catch (e) {
      wx.showToast({ title: e.message || "登录失败", icon: "none" });
    }
  },

  async refresh() {
    const me = await auth.refreshMe();
    this.setData({ me });
  },

  copyCode() {
    const code = this.data.me && this.data.me.family && this.data.me.family.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: "家庭码已复制", icon: "success" }),
    });
  },

  async createFamily() {
    const name = await this.ask("新建家庭", "输入家庭名称，如：琪琪家");
    if (!name) return;
    const nickname = await this.askNickname();
    if (!nickname) return; // 昵称不合法已提示，中止创建
    this.run(() => api.mp.createFamily(name, nickname));
  },

  async joinFamily() {
    const code = await this.ask("加入家庭", "输入 6 位家庭码");
    if (!code) return;
    const nickname = await this.askNickname();
    if (!nickname) return; // 昵称不合法已提示，中止加入
    this.run(() => api.mp.joinFamily(code.toUpperCase(), nickname));
  },

  async renameFamily() {
    const cur = this.data.me.family ? this.data.me.family.name : "";
    const name = await this.ask("修改家庭名称", "输入新名称", cur);
    if (!name) return;
    this.run(() => api.mp.renameFamily(name));
  },

  async leaveFamily() {
    const ok = await new Promise((r) =>
      wx.showModal({
        title: "退出家庭",
        content: "退出后你自己的数据仍然保留，只是不再属于这个家庭。确定退出？",
        success: (x) => r(!!x.confirm),
      })
    );
    if (!ok) return;
    this.run(() => api.mp.leaveFamily());
  },

  async renameMe() {
    const cur = this.data.me.user.nickname;
    const nick = await this.ask("修改我的昵称", "输入昵称", cur);
    if (!nick) return;
    this.run(() => api.mp.updateMe(nick));
  },

  // 创建/加入家庭前的昵称输入。返回规范化后的昵称；不合法时 toast 原因并返回 null。
  async askNickname() {
    const nick = await this.ask("设置昵称", "家人怎么称呼你？如：爸爸、妈妈");
    if (!nick) return null;
    try {
      return checkNickname(nick);
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
      return null;
    }
  },

  // 统一执行 + 刷新 + 错误提示
  async run(fn) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      await fn();
      await this.refresh();
    } catch (e) {
      wx.showToast({ title: e.message || "操作失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },

  ask(title, placeholder, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        editable: true,
        placeholderText: placeholder,
        content: content || "",
        success: (r) => {
          if (r.confirm) {
            const v = (r.content || "").trim();
            resolve(v || null);
          } else resolve(null);
        },
      });
    });
  },
});
