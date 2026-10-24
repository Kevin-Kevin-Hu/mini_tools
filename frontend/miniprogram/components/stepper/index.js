// 数字步进器：− / 输入 / + + 快捷刻度。与网页版同款防呆：
// 输入中允许空值/中间态（draft），合法且 ≥min 才实时提交，失焦钳位。
Component({
  properties: {
    value: { type: Number, value: 0 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 9999 },
    step: { type: Number, value: 5 },
    unit: { type: String, value: "分钟" },
    quick: { type: Array, value: [] },
    label: { type: String, value: "" },
    // 标签后的附加内容：extraText 是提示文字，extraBtn 是可点击按钮
    extraText: { type: String, value: "" },
    extraBtn: { type: String, value: "" },
    // 任务序号：extraBtn 点击时回传给父层（组件事件读不到父层标签上的 data-i）
    index: { type: Number, value: -1 },
  },
  data: {
    draft: "",
    focused: false,
  },
  observers: {
    value(v) {
      if (!this.data.focused) this.setData({ draft: String(v) });
    },
  },
  lifetimes: {
    attached() {
      this.setData({ draft: String(this.data.value) });
    },
  },
  methods: {
    commit(v) {
      const clamped = Math.min(this.data.max, Math.max(this.data.min, Math.round(v)));
      if (clamped !== this.data.value) this.triggerEvent("change", { value: clamped });
      else this.setData({ draft: String(clamped) });
    },
    onMinus() {
      this.commit(this.data.value - this.data.step);
    },
    onPlus() {
      this.commit(this.data.value + this.data.step);
    },
    onQuick(e) {
      const v = Number(e.currentTarget.dataset.v);
      if (!isNaN(v)) this.commit(v);
    },
    onExtraBtn() {
      // 把 index 一起带出去：事件由组件触发，currentTarget 是组件节点，
      // 父层读不到组件标签上的 data-i，必须从 detail 里取。
      this.triggerEvent("extrabtn", { index: this.data.index });
    },
    onInput(e) {
      const raw = e.detail.value;
      this.setData({ draft: raw });
      const n = parseInt(raw, 10);
      if (!isNaN(n) && String(n) === raw && n >= this.data.min) {
        this.commit(n); // 合法值实时提交（父层会回写 value，observed 后 draft 不动）
      }
    },
    onFocus() {
      this.setData({ focused: true });
    },
    onBlur() {
      const n = parseInt(this.data.draft, 10);
      this.setData({ focused: false });
      this.commit(isNaN(n) ? this.data.min : n);
    },
  },
});
