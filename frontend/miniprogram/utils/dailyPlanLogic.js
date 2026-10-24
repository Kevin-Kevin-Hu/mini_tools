// ============================================================
// daily_plan 核心纯逻辑 —— CommonJS 移植版
// 源文件: frontend/src/tools/dailyPlanLogic.js（函数一一对应，改逻辑请两边同步）
// ============================================================

const KIND_LABEL = { task: "任务", break: "休息", meal: "用餐" };

const PRESETS = [
  { kind: "break", title: "休息", detail: "", duration_min: 20, rest_after_min: 0, is_preset: 1 },
  { kind: "meal", title: "午餐", detail: "", duration_min: 60, rest_after_min: 0, is_preset: 1 },
  { kind: "meal", title: "晚餐", detail: "", duration_min: 60, rest_after_min: 0, is_preset: 1 },
];

const DEFAULT_REST = 20;

function blankTask() {
  return {
    kind: "task",
    title: "",
    detail: "",
    duration_min: 45,
    rest_after_min: DEFAULT_REST,
    is_preset: 0,
  };
}

function fromCommon(c) {
  return {
    kind: c.kind || "task",
    title: c.title || "",
    detail: c.detail || "",
    duration_min: c.duration_min || 30,
    rest_after_min: c.kind === "task" ? DEFAULT_REST : 0,
    is_preset: 0,
  };
}

function parseTimeToMin(t) {
  if (!t) return 0;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return 0;
  return +m[1] * 60 + +m[2];
}

function minToTime(min) {
  const dayOffset = Math.floor(min / 1440);
  const mm = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return {
    text: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    dayOffset,
  };
}

function fmtRange(startMin, endMin) {
  const s = minToTime(startMin);
  const e = minToTime(endMin);
  let txt = `${s.text} – ${e.text}`;
  if (e.dayOffset > s.dayOffset) txt += " (+1天)";
  return txt;
}

function computeSchedule(tasks, firstStart) {
  let cur = parseTimeToMin(firstStart);
  return tasks.map((t, i) => {
    const dur = Math.max(0, Number(t.duration_min) || 0);
    const start = cur;
    const end = cur + dur;
    const isLast = i === tasks.length - 1;
    const rest = isLast ? 0 : Math.max(0, Number(t.rest_after_min) || 0);
    cur = end + rest;
    return Object.assign({}, t, { startMin: start, endMin: end, _isLast: isLast });
  });
}

function fmtDuration(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} 小时 ${r} 分钟`;
  if (h) return `${h} 小时`;
  return `${r} 分钟`;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 日期加减：入参/出参均为 YYYY-MM-DD，n 可为负数。
// 走 UTC 构造 + UTC 读回，避开夏令时/时区把「加一天」算错（本地时区在部分日期会少/多一小时）。
function addDays(dateStr, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  let base;
  if (m) base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else {
    const d = new Date();
    base = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const t = new Date(base + (Number(n) || 0) * 86400000);
  const y = t.getUTCFullYear();
  const mo = String(t.getUTCMonth() + 1).padStart(2, "0");
  const day = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

module.exports = {
  KIND_LABEL,
  PRESETS,
  DEFAULT_REST,
  blankTask,
  fromCommon,
  parseTimeToMin,
  minToTime,
  fmtRange,
  computeSchedule,
  fmtDuration,
  todayStr,
  addDays,
};
