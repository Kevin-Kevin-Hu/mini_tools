// 计算练习题 · 题目生成（纯函数，无 DOM / 无 wx 依赖，可 node --test 单测）
//
// 约束（用户硬性要求）：
//   - 每个数字（首项与每一步的项）都在 [0, N] 内
//   - 每一步的累计值（过程）都在 [0, N] 内，绝不出现负数
//   - 最终结果也在 [0, N] 内
//
// 题型结构（用户 2026-11-01 明确）：
//   算式允许加减混合（2/3/4 个数字，由「步骤」控制；每一步随机选 + 或 −），但空白 ? 只允许两种角色：
//     · 结果未知：  a ○ b ○ c = ?      （空白在等号右，是运算结果）
//     · 缺数未知：  a ○ ? ○ c = 结果    （空白在等号左，是其中一个运算数，结果已知写在右边）
//   绝不允许「 ? = 表达式 」这种把整条算式翻到等号左边的写法（与右侧结果未知等价、不符合习惯）。

function randInt(min, max) {
  // 闭区间 [min, max] 的整数；max < min 时退化为 min
  if (max < min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 生成单题。steps = 算式里的「数字个数」（步骤，2~8）；N = 数字上限。
// 返回 { nums:[...], ops:["+"/"-",...], result }，ops 长度 = steps - 1。
// 每一步都满足：累计值 ∈ [0, N]、无负数；最终 result ∈ [0, N]。
function genOne(N, steps) {
  const n = clamp(Math.floor(N), 1, 1e9);
  const k = clamp(Math.floor(steps), 2, 8);
  const nums = [];
  const ops = [];
  let cur = randInt(1, n); // 首项 [1, N]：避免以 0 开头显得奇怪
  nums.push(cur);
  for (let i = 1; i < k; i++) {
    const canAdd = cur < n; // 还能 +至少 1 且不超过 N
    const canSub = cur > 0; // 还能 −至少 1 且不为负
    let op;
    if (canAdd && canSub) op = Math.random() < 0.5 ? "+" : "-";
    else if (canAdd) op = "+";
    else op = "-";
    let term;
    if (op === "+") {
      term = randInt(1, n - cur); // cur + term ≤ N
      cur += term;
    } else {
      term = randInt(1, cur); // cur - term ≥ 0
      cur -= term;
    }
    ops.push(op);
    nums.push(term);
  }
  return { nums, ops, result: cur };
}

// 把单题渲染成完整展示串（无空白），如 "12 + 5 − 3"
function toExpr(p) {
  let s = String(p.nums[0]);
  for (let i = 0; i < p.ops.length; i++) {
    s += (p.ops[i] === "+" ? " + " : " − ") + p.nums[i + 1];
  }
  return s;
}

// 同 toExpr，但把第 j 个运算数（0-based）替换成 ____，用于「缺数未知」题型的空白展示
function toExprBlanked(p, j) {
  let s = j === 0 ? "____" : String(p.nums[0]);
  for (let i = 0; i < p.ops.length; i++) {
    s += (p.ops[i] === "+" ? " + " : " − ") + (i + 1 === j ? "____" : String(p.nums[i + 1]));
  }
  return s;
}

// 逐题校验约束（供单测 / 自检用）。返回 null 表示通过，否则返回错误描述。
function validate(p, N) {
  const n = Math.floor(N);
  let cur = p.nums[0];
  if (cur < 0 || cur > n) return "首项越界";
  for (let i = 0; i < p.ops.length; i++) {
    const term = p.nums[i + 1];
    if (term < 0 || term > n) return "项越界";
    if (p.ops[i] === "+") cur += term;
    else cur -= term;
    if (cur < 0) return "过程出现负数";
    if (cur > n) return "过程超过 N";
  }
  if (cur !== p.result) return "结果不一致";
  if (p.result < 0 || p.result > n) return "结果越界";
  return null;
}

// 由一道完整题 + 题型，构造对外输出对象（含展示串 line / lineAns）。
// kind: "result" → 结果未知（空白在右）；"operand" → 缺数未知（空白在左、结果写右）
// blankIndex: 缺数未知时空格所在的运算数下标；结果未知时为 -1
function buildProblem(p, kind, blankIndex) {
  const expr = toExpr(p);
  let line, lineAns;
  if (kind === "result") {
    line = `${expr} = ____`;
    lineAns = `${expr} = ${p.result}`;
  } else {
    line = `${toExprBlanked(p, blankIndex)} = ${p.result}`;
    lineAns = `${expr} = ${p.result}`;
  }
  return { nums: p.nums, ops: p.ops, expr, answer: p.result, kind, blankIndex, line, lineAns };
}

// 批量生成。kindFilter: "mixed"(默认) | "result" | "operand"。
// 带轻量去重（同一可见题不重复）；极小空间兜底补足数量。
// 每题随机选结果未知 / 缺数未知两种结构（除非 kindFilter 限定），且绝不出现整条翻左的 "? = 表达式"。
function genProblems(N, steps, count, kindFilter) {
  const c = clamp(Math.floor(count), 1, 10000);
  const filter = kindFilter === "result" || kindFilter === "operand" ? kindFilter : "mixed";
  const pickKind = () =>
    filter === "mixed" ? (Math.random() < 0.5 ? "result" : "operand") : filter;
  const seen = new Set();
  const out = [];
  let guard = 0;
  const limit = c * 20 + 100;
  while (out.length < c && guard < limit) {
    guard++;
    const p = genOne(N, steps);
    const kind = pickKind();
    const blankIndex = kind === "operand" ? randInt(0, p.nums.length - 1) : -1;
    const key = `${kind}:${blankIndex}:${toExpr(p)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(buildProblem(p, kind, blankIndex));
  }
  while (out.length < c) {
    const p = genOne(N, steps);
    const kind = pickKind();
    const blankIndex = kind === "operand" ? randInt(0, p.nums.length - 1) : -1;
    out.push(buildProblem(p, kind, blankIndex));
  }
  return out;
}

module.exports = {
  randInt,
  clamp,
  genOne,
  toExpr,
  toExprBlanked,
  validate,
  genProblems,
  buildProblem,
};
