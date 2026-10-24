// 等量代换核心逻辑单测（纯函数，无需浏览器）
// 运行：cd frontend && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/tools/equalSubLogic.js";

const str = (toks) => L.tokensToStr(toks);

test("parseExpr：几何图形连写能正确计数", () => {
  const t = L.parseExpr("☆☆+○○");
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { t: "grp", sym: "☆", n: 2 });
  assert.deepEqual(t[1], { t: "op", v: "+" });
  assert.deepEqual(t[2], { t: "grp", sym: "○", n: 2 });
});

test("parseExpr：emoji 按码点解析，不被代理对劈开", () => {
  const t = L.parseExpr("🍎🍎+🍌");
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { t: "grp", sym: "🍎", n: 2 });
  assert.deepEqual(t[2], { t: "grp", sym: "🍌", n: 1 });
});

test("parseShapes：空格分隔与连写都能识别（含 emoji）", () => {
  assert.deepEqual(L.parseShapes("☆ ○ △"), ["☆", "○", "△"]);
  assert.deepEqual(L.parseShapes("☆○△"), ["☆", "○", "△"]);
  assert.deepEqual(L.parseShapes("🍎🍌"), ["🍎", "🍌"]);
  assert.deepEqual(L.parseShapes("🍎 🍌"), ["🍎", "🍌"]);
});

test("parseShapes：过滤运算符、问号与空白，并去重", () => {
  assert.deepEqual(L.parseShapes("☆○ + − ? ☆"), ["☆", "○"]);
});

test("applicable：整组精确匹配", () => {
  const rel = { left: "☆☆", right: "○○○" };
  const opts = L.applicable({ sym: "☆", n: 2 }, rel);
  assert.ok(opts.some((o) => o.text === "○○○"));
});

test("applicable：单一符号按比例换算（避免分数）", () => {
  const rel = { left: "○", right: "△△" };
  // 4 个 △ 换成 2 个 ○
  const opts = L.applicable({ sym: "△", n: 4 }, rel);
  assert.ok(opts.some((o) => o.text === "○○"));
});

test("expand / runBounds：支持部分选中", () => {
  const toks = L.expand(L.parseExpr("☆☆☆☆"));
  assert.equal(toks.length, 4);
  const r = L.runBounds(toks, 1);
  assert.deepEqual(r, { a: 0, b: 3 });
});

// 自动求解器：贪心选择"让目标符号变多"的合法步骤（模拟孩子点选）
function autoSolve(question, target, relations) {
  let cur = L.expand(L.parseExpr(question));
  for (let step = 0; step < 20; step++) {
    if (L.onlyTarget(cur, target)) break;
    let best = null;
    for (let i = 0; i < cur.length; i++) {
      const tk = cur[i];
      if (!tk || tk.t !== "grp" || tk.sym === target) continue;
      const run = L.runBounds(cur, i);
      const sym = tk.sym;
      const n = run.b - run.a + 1;
      for (const rel of relations) {
        for (const opt of L.applicable({ sym, n }, rel)) {
          const nt = [...cur.slice(0, run.a), ...L.expand(opt.tokens), ...cur.slice(run.b + 1)];
          const score =
            nt.filter((x) => x.t === "grp" && x.sym === target).length -
            nt.filter((x) => x.t === "grp" && x.sym !== target).length;
          if (!best || score > best.score) best = { nt, score };
        }
      }
    }
    if (!best) break;
    cur = best.nt;
  }
  return { ok: L.onlyTarget(cur, target), ans: L.evalTarget(cur, target), expr: str(cur) };
}

const REL_WORKBOOK = [
  { left: "☆☆", right: "○○○" },
  { left: "○", right: "△△" },
];

test("练习册原题：☆☆+○○ = ? 个○ → 5", () => {
  const r = autoSolve("☆☆+○○", "○", REL_WORKBOOK);
  assert.equal(r.ok, true, r.expr);
  assert.equal(r.ans, 5);
});

test("练习册原题：○○○○−☆☆ = ? 个○ → 1", () => {
  const r = autoSolve("○○○○−☆☆", "○", REL_WORKBOOK);
  assert.equal(r.ok, true, r.expr);
  assert.equal(r.ans, 1);
});

test("练习册原题：☆☆−△△△△ = ? 个○ → 1", () => {
  const r = autoSolve("☆☆−△△△△", "○", REL_WORKBOOK);
  assert.equal(r.ok, true, r.expr);
  assert.equal(r.ans, 1);
});

test("水果场景：🍎🍎=🍌🍌🍌 时，🍎🍎+🍌 → 4 个🍌", () => {
  const r = autoSolve("🍎🍎+🍌", "🍌", [{ left: "🍎🍎", right: "🍌🍌🍌" }]);
  assert.equal(r.ok, true, r.expr);
  assert.equal(r.ans, 4);
});

test("三级链条：☆☆=○○○、○=△△、△△△=♦ 时，☆☆☆☆+○−△△△ → 11 个△", () => {
  const rels = [
    { left: "☆☆", right: "○○○" },
    { left: "○", right: "△△" },
    { left: "△△△", right: "♦" },
  ];
  const r = autoSolve("☆☆☆☆+○−△△△", "△", rels);
  assert.equal(r.ok, true, r.expr);
  assert.equal(r.ans, 11);
});

test("solveUnknown：另一侧含 ? 的线性求解", () => {
  // 已知侧化成 5 个○；另一侧是 ?+○ → ? = 4
  const other = L.parseExpr("?+○");
  assert.equal(L.solveUnknown(other, 5, "○"), 4);
});
