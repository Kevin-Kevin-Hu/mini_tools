// 计算练习题 · 生成逻辑单测（ESM，与 dailyPlanLogicMini.test.js 同款写法）
// 运行：在 frontend/ 目录下 `node --test tests/calcLogicMini.test.js`
import { test } from "node:test";
import assert from "node:assert/strict";
import calc from "../miniprogram/utils/calcLogic.js";

// 对一批随机题做全量约束校验
function checkBatch(N, steps, sample) {
  for (let i = 0; i < sample; i++) {
    const p = calc.genOne(N, steps);
    // 结构：nums 长度 = steps，ops 长度 = steps - 1
    assert.strictEqual(p.nums.length, steps, "nums 长度应为 steps");
    assert.strictEqual(p.ops.length, steps - 1, "ops 长度应为 steps-1");
    // 所有数字 ≤ N 且 ≥ 0
    for (const v of p.nums) {
      assert.ok(v >= 0 && v <= N, `数字 ${v} 应落在 [0, ${N}]`);
    }
    // 过程 / 结果约束
    const err = calc.validate(p, N);
    assert.strictEqual(err, null, `约束校验未通过：${err} (N=${N}, steps=${steps})`);
  }
}

test("genOne 结构正确且约束恒成立（多种 N/steps）", () => {
  const cases = [
    [20, 2],
    [20, 3],
    [20, 4],
    [100, 2],
    [100, 4],
    [9, 3],
    [1, 2], // 极端：N=1 也能生成且合法
    [2, 4],
  ];
  for (const [N, steps] of cases) checkBatch(N, steps, 400);
});

test("结果绝不越界、过程绝不出现负数（大样本压力）", () => {
  for (let i = 0; i < 2000; i++) {
    const N = calc.randInt(2, 50);
    const steps = calc.randInt(2, 4);
    const p = calc.genOne(N, steps);
    assert.strictEqual(calc.validate(p, N), null);
  }
});

test("toExpr / toExprBlanked 渲染格式（填空用圆括号）", () => {
  const p = { nums: [12, 5, 3], ops: ["+", "-"] };
  assert.strictEqual(calc.toExpr(p), "12 + 5 − 3");
  assert.strictEqual(calc.toExprBlanked(p, 1), "12 + ( ) − 3");
  assert.strictEqual(calc.toExprBlanked(p, 0), "( ) + 5 − 3");
});

test("buildProblem 两类结构正确（填空用圆括号）", () => {
  const p = { nums: [12, 5, 3], ops: ["+", "-"], result: 14 };
  const r = calc.buildProblem(p, "result", -1);
  assert.strictEqual(r.line, "12 + 5 − 3 = ( )");
  assert.strictEqual(r.lineAns, "12 + 5 − 3 = 14");

  const m = calc.buildProblem(p, "operand", 1);
  assert.strictEqual(m.line, "12 + ( ) − 3 = 14"); // 缺数未知：空白在左、结果写右
  assert.strictEqual(m.lineAns, "12 + 5 − 3 = 14");
});

test("genProblems：两类题型都出现，且绝不出现整条翻左的 ( ) = 表达式", () => {
  const probs = calc.genProblems(20, 3, 200);
  let hasResult = false;
  let hasOperand = false;
  for (const it of probs) {
    assert.ok(it.kind === "result" || it.kind === "operand", "kind 合法");
    // 禁止：以 "( ) = " 开头（整条翻到等号左边的写法）
    assert.ok(!/^\( \)\s*=/.test(it.line), `不应出现整条翻左：${it.line}`);
    if (it.kind === "result") {
      hasResult = true;
      assert.ok(it.line.endsWith("= ( )"), "结果未知：空白应在等号右");
      assert.strictEqual(it.blankIndex, -1);
    } else {
      hasOperand = true;
      // 缺数未知：空白在等号左侧（等号前出现 ( )），等号右侧是结果数字
      assert.ok(/\( \)/.test(it.line.split("=")[0]), "缺数未知：空白应在等号左");
      assert.ok(/= \d+$/.test(it.line), "缺数未知：等号右应为结果数字");
      assert.ok(it.blankIndex >= 0 && it.blankIndex < it.nums.length);
      // 解出的完整算式仍合法（空白填回原数后 validate 通过）
      assert.strictEqual(calc.validate({ nums: it.nums, ops: it.ops, result: it.answer }, 20), null);
    }
  }
  assert.ok(hasResult, "应出现结果未知题");
  assert.ok(hasOperand, "应出现缺数未知题");
});

test("genProblems 返回数量达标且默认无重复（N=20,steps=3,100题）", () => {
  const probs = calc.genProblems(20, 3, 100);
  assert.strictEqual(probs.length, 100);
  const set = new Set(probs.map((x) => `${x.kind}:${x.blankIndex}:${x.expr}`));
  assert.strictEqual(set.size, 100, "默认 100 题应全部不重复");
  for (const it of probs) {
    assert.ok(typeof it.answer === "number" && it.answer >= 0 && it.answer <= 20);
  }
});

test("genProblems 极小空间也能补足数量（N=1,steps=2,100题）", () => {
  const probs = calc.genProblems(1, 2, 100);
  assert.strictEqual(probs.length, 100); // 即使去重后空间极小，也要补足
  for (const it of probs) {
    assert.strictEqual(it.expr, "1 − 1");
    assert.strictEqual(it.answer, 0);
  }
});

test("genProblems kindFilter 生效（只出结果未知 / 只出缺数未知）", () => {
  const onlyR = calc.genProblems(20, 3, 60, "result");
  assert.ok(onlyR.every((x) => x.kind === "result"));
  const onlyM = calc.genProblems(20, 3, 60, "operand");
  assert.ok(onlyM.every((x) => x.kind === "operand"));
});
