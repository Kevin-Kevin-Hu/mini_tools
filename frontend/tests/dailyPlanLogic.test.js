import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS,
  blankTask,
  fromCommon,
  parseTimeToMin,
  minToTime,
  fmtRange,
  computeSchedule,
  fmtDuration,
  weekdayStr,
  doneCount,
  addDays,
} from "../src/tools/dailyPlanLogic.js";

test("parseTimeToMin 解析小时分钟", () => {
  assert.equal(parseTimeToMin("07:00"), 420);
  assert.equal(parseTimeToMin("12:30"), 750);
  assert.equal(parseTimeToMin("0:05"), 5);
  assert.equal(parseTimeToMin(""), 0);
  assert.equal(parseTimeToMin("bad"), 0);
});

test("minToTime 处理跨午夜", () => {
  assert.deepEqual(minToTime(420), { text: "07:00", dayOffset: 0 });
  assert.deepEqual(minToTime(1440), { text: "00:00", dayOffset: 1 });
  assert.deepEqual(minToTime(1500), { text: "01:00", dayOffset: 1 });
});

test("fmtRange 标注次日", () => {
  assert.equal(fmtRange(420, 465), "07:00 – 07:45");
  assert.equal(fmtRange(1410, 1455), "23:30 – 00:15 (+1天)");
});

test("computeSchedule 首个手动起，其余自动累加", () => {
  const tasks = [
    { ...blankTask(), title: "A", duration_min: 45, rest_after_min: 20 },
    { ...blankTask(), title: "B", duration_min: 30, rest_after_min: 20 },
    { ...blankTask(), title: "C", duration_min: 60, rest_after_min: 20 },
  ];
  const s = computeSchedule(tasks, "07:00");
  assert.equal(s[0].startMin, 420);
  assert.equal(s[0].endMin, 465); // 07:45
  assert.equal(s[1].startMin, 485); // 07:45 + 20 休息 = 08:05
  assert.equal(s[1].endMin, 515); // 08:35
  assert.equal(s[2].startMin, 535); // 08:35 + 20 = 08:55
  assert.equal(s[2].endMin, 595); // 09:55
});

test("computeSchedule 最后一项目休息不计入排程", () => {
  const tasks = [
    { ...blankTask(), duration_min: 30, rest_after_min: 20 },
    { ...blankTask(), duration_min: 30, rest_after_min: 999 }, // 最后一项，rest 不生效
  ];
  const s = computeSchedule(tasks, "09:00");
  // 第一项（非最后）的 20 分钟休息照常生效：第二项 09:30 + 20 = 09:50
  assert.equal(s[0].startMin, 540);
  assert.equal(s[0].endMin, 570); // 09:30
  assert.equal(s[1].startMin, 590); // 09:50
  assert.equal(s[1].endMin, 620); // 10:00
});

test("computeSchedule 预置项 rest_after=0 不额外插入休息", () => {
  const tasks = [
    { ...blankTask(), duration_min: 60, rest_after_min: 20 }, // 普通任务，自带 20 休息
    { ...PRESETS[1], duration_min: 60 }, // 午餐，rest_after 0
    { ...blankTask(), duration_min: 30, rest_after_min: 20 },
  ];
  const s = computeSchedule(tasks, "12:00");
  assert.equal(s[0].startMin, 720);
  assert.equal(s[0].endMin, 780); // 13:00
  // 午餐前的中场休息来自「第一项」的 rest_after=20：午餐 13:20 开始
  assert.equal(s[1].startMin, 800); // 13:20
  assert.equal(s[1].endMin, 860); // 14:00
  // 午餐 rest_after=0，所以下一项紧接午餐结束，不额外加 20
  assert.equal(s[2].startMin, 860); // 14:00
  assert.equal(s[2].endMin, 890); // 14:50
});

test("blankTask 与 fromCommon 默认值正确", () => {
  const b = blankTask();
  assert.equal(b.kind, "task");
  assert.equal(b.duration_min, 45);
  assert.equal(b.rest_after_min, 20);
  assert.equal(b.is_preset, 0);
  assert.equal(b.done, 0); // 新任务默认未完成
  const c = fromCommon({ title: "背单词", detail: "list 1", duration_min: 25, kind: "task" });
  assert.equal(c.title, "背单词");
  assert.equal(c.is_preset, 0);
  assert.equal(c.rest_after_min, 20);
  assert.equal(c.done, 0);
});

test("doneCount 统计已完成数，容错脏数据", () => {
  const tasks = [{ done: 1 }, { done: 0 }, {}, { done: true }, { done: "1" }];
  assert.equal(doneCount(tasks), 3); // 缺省/0 不算，真值都算
  assert.equal(doneCount([]), 0);
  assert.equal(doneCount(undefined), 0);
  assert.equal(doneCount(null), 0);
});

test("fmtDuration 格式化", () => {
  assert.equal(fmtDuration(45), "45 分钟");
  assert.equal(fmtDuration(60), "1 小时");
  assert.equal(fmtDuration(90), "1 小时 30 分钟");
  assert.equal(fmtDuration(0), "0 分钟");
});

// 计划清单里日期旁边要显示星期几：跨周/闰年/年底都要准
test("weekdayStr 由日期求星期", () => {
  assert.equal(weekdayStr("2026-10-25"), "周日");
  assert.equal(weekdayStr("2026-10-26"), "周一");
  assert.equal(weekdayStr("2026-01-01"), "周四");
  assert.equal(weekdayStr("2024-02-29"), "周四"); // 闰日
  assert.equal(weekdayStr("2025-12-31"), "周三"); // 跨年边界
});

test("weekdayStr 入参非法时返回空串，不抛错", () => {
  assert.equal(weekdayStr(""), "");
  assert.equal(weekdayStr("bad-date"), "");
  assert.equal(weekdayStr(undefined), "");
  assert.equal(weekdayStr("2026-13-01"), ""); // 月份超范围 → Date 非法 → 空串
});

// 复制计划时的目标日期 = 源计划日期 +1 天，必须跨月/跨年/闰年都要准
test("addDays 加减日期", () => {
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01"); // 跨月
  assert.equal(addDays("2026-12-31", 1), "2027-01-01"); // 跨年
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // 闰年
  assert.equal(addDays("2027-02-28", 1), "2027-03-01"); // 平年
  assert.equal(addDays("2026-03-01", -1), "2026-02-28"); // 负数跨月
  assert.equal(addDays("2026-10-25", 0), "2026-10-25");
  // 补零
  assert.equal(addDays("2026-01-09", 1), "2026-01-10");
});

test("addDays 入参非法时退回今天，不产生 Invalid Date", () => {
  const out = addDays("", 1);
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotThrow(() => addDays("bad-date", 3));
  assert.doesNotThrow(() => addDays(undefined, 3));
});
