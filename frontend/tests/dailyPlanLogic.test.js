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
  const c = fromCommon({ title: "背单词", detail: "list 1", duration_min: 25, kind: "task" });
  assert.equal(c.title, "背单词");
  assert.equal(c.is_preset, 0);
  assert.equal(c.rest_after_min, 20);
});

test("fmtDuration 格式化", () => {
  assert.equal(fmtDuration(45), "45 分钟");
  assert.equal(fmtDuration(60), "1 小时");
  assert.equal(fmtDuration(90), "1 小时 30 分钟");
  assert.equal(fmtDuration(0), "0 分钟");
});
