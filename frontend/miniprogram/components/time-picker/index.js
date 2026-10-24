// 时间选择器：picker-view 两列（时 00–23 / 分 00–59），天然不循环
const logic = require("../../utils/dailyPlanLogic");

Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: "07:00" }, // "HH:MM"
  },
  data: {
    hours: [],
    minutes: [],
    idx: [7, 0],
  },
  lifetimes: {
    attached() {
      const hours = [];
      const minutes = [];
      for (let i = 0; i < 24; i++) hours.push(String(i).padStart(2, "0"));
      for (let i = 0; i < 60; i++) minutes.push(String(i).padStart(2, "0"));
      this.setData({ hours, minutes });
    },
  },
  observers: {
    visible(v) {
      if (v) {
        const m = logic.parseTimeToMin(this.data.value);
        this.setData({ idx: [Math.floor(m / 60), m % 60] });
      }
    },
  },
  methods: {
    onPick(e) {
      this.setData({ idx: e.detail.value });
    },
    onConfirm() {
      const [h, m] = this.data.idx;
      this.triggerEvent("change", {
        value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      });
    },
    onCancel() {
      this.triggerEvent("cancel");
    },
  },
});
