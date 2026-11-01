// 小程序版 dailyPlanLogic 单测（CommonJS 移植版）
// 覆盖本次新增的科目标签：SUBJECTS / blankTask.subject / fromCommon.subject / subjectMinutes
import { test } from "node:test";
import assert from "node:assert/strict";
import logic from "../miniprogram/utils/dailyPlanLogic.js";

const { SUBJECTS, blankTask, fromCommon, subjectMinutes, PRESETS } = logic;

test("SUBJECTS 为固定的三科", () => {
  assert.deepEqual(SUBJECTS, ["语文", "数学", "英语"]);
});

test("blankTask 默认带科目（语文）", () => {
  const b = blankTask();
  assert.equal(b.subject, "语文");
});

test("fromCommon 继承常用任务的科目，缺省回退语文", () => {
  const a = fromCommon({ title: "背单词", kind: "task", subject: "英语" });
  assert.equal(a.subject, "英语");
  const b = fromCommon({ title: "抄写", kind: "task" });
  assert.equal(b.subject, "语文");
});

test("subjectMinutes 按科目汇总，仅统计 kind=task", () => {
  const tasks = [
    { kind: "task", subject: "语文", duration_min: 45 },
    { kind: "task", subject: "数学", duration_min: 30 },
    { kind: "task", subject: "英语", duration_min: 60 },
    { kind: "task", subject: "语文", duration_min: 15 },
    { kind: "break", duration_min: 20 }, // 休息不计入
    { kind: "meal", duration_min: 60 }, // 用餐不计入
    { kind: "task", subject: "物理", duration_min: 25 }, // 非法科目 → 未分类
    { kind: "task", duration_min: 10 }, // 缺科目 → 未分类
  ];
  const s = subjectMinutes(tasks);
  assert.equal(s.语文, 60); // 45 + 15
  assert.equal(s.数学, 30);
  assert.equal(s.英语, 60);
  assert.equal(s.未分类, 35); // 25 + 10
  // 休息/用餐合计 80 分钟不应出现在任何科目里
  const total = s.语文 + s.数学 + s.英语 + s.未分类;
  assert.equal(total, 45 + 30 + 60 + 15 + 25 + 10);
});

test("subjectMinutes 容错空/非法入参", () => {
  assert.deepEqual(subjectMinutes([]), { 语文: 0, 数学: 0, 英语: 0, 未分类: 0 });
  assert.deepEqual(subjectMinutes(undefined), { 语文: 0, 数学: 0, 英语: 0, 未分类: 0 });
  assert.deepEqual(subjectMinutes(null), { 语文: 0, 数学: 0, 英语: 0, 未分类: 0 });
  // 脏 duration 按 0 处理
  assert.equal(subjectMinutes([{ kind: "task", subject: "数学", duration_min: "abc" }]).数学, 0);
});

test("PRESETS 不带科目（休息/用餐不属于科目）", () => {
  PRESETS.forEach((p) => {
    assert.ok(p.subject === undefined || p.subject === "");
  });
});
