import { useState, useRef, useMemo, useLayoutEffect, useEffect } from "react";
import {
  parseExpr,
  expand,
  runBounds,
  applicable,
  onlyTarget,
  evalTarget,
  solveUnknown,
  isOpChar,
  parseShapes,
} from "./equalSubLogic.js";
import { useExperiment } from "../shared/useExperiment.js";
import "./EqualSubstitution.css";

const PALETTE = ["★", "☆", "○", "●", "◇", "◆", "△", "▲", "□", "■", "♥", "♦", "⬟", "⬢", "✿", "⬤"];
// 日常水果。emoji 是代理对（JS 里 length=2），所以形状解析一律按「码点」判断，
// 不能用 s.length===1，否则水果会被整组过滤掉。
const FRUITS = ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🍍", "🥝"];
const OPERATORS = [
  { k: "+", label: "+", tip: "加号" },
  { k: "−", label: "−", tip: "减号" },
  { k: "?", label: "?", tip: "未知数" },
];

function TokensView({ tokens, isCurrent, selCur, green, mark, onClick }) {
  return tokens.map((t, idx) => {
    if (t.t === "op")
      return (
        <span className="op" key={idx}>
          {t.v}
        </span>
      );
    let cls = "grp";
    if (green.has(idx)) cls += " repl";
    else if (mark && idx >= mark.start && idx <= mark.end) cls += " src";
    if (selCur && idx >= selCur.start && idx <= selCur.end) cls += " sel";
    return (
      <span
        key={idx}
        className={cls}
        data-idx={idx}
        onClick={isCurrent ? () => onClick(idx) : undefined}
        style={{ cursor: isCurrent ? "pointer" : "default" }}
      >
        {t.sym}
      </span>
    );
  });
}

export default function EqualSubstitution({ tool }) {
  const { saved, record, reset } = useExperiment(tool.id);

  // ---------- 构建区状态 ----------
  const [shapesStr, setShapesStr] = useState("☆ ○ △");
  const [relations, setRelations] = useState([
    { left: "☆☆", right: "○○○" },
    { left: "○", right: "△△" },
  ]);
  const [qLeft, setQLeft] = useState("☆☆+○○");
  const [qRight, setQRight] = useState("?");
  const [target, setTarget] = useState("○");

  // ---------- 解题区状态 ----------
  const [view, setView] = useState("builder"); // 'builder' | 'solver'
  const [hasUnknown, setHasUnknown] = useState(false);
  const [workSide, setWorkSide] = useState("left");
  const [otherTokens, setOtherTokens] = useState([]);
  const [steps, setSteps] = useState([]); // 每个 step: {tokens, replIdx, srcMark, relationText, srcText, replText}
  const [sel, setSel] = useState(null); // {anchor, start, end}

  // 当前激活的输入框（点符号按钮时填到这里）
  const activeRef = useRef(null);
  const pendingSel = useRef(null);
  const shapesInputRef = useRef(null);

  const shapes = useMemo(() => parseShapes(shapesStr), [shapesStr]);

  // 解析后的"另一边"（题目含 ? 时，化简不含 ? 的那一侧得到 N，另一侧含 ?）
  const otherView = useMemo(() => {
    if (otherTokens.length === 1 && otherTokens[0].t === "grp" && otherTokens[0].sym === "?") {
      return <span className="grp qmark">? 个{target}</span>;
    }
    return (
      <TokensView
        tokens={otherTokens}
        isCurrent={false}
        selCur={null}
        green={new Set()}
        mark={null}
        onClick={() => {}}
      />
    );
  }, [otherTokens, target]);

  // 光标恢复（受控输入框 + 点击插入时保住光标位置）
  useLayoutEffect(() => {
    if (pendingSel.current) {
      const { node, pos } = pendingSel.current;
      try {
        node.setSelectionRange(pos, pos);
      } catch (e) {
        /* noop */
      }
      pendingSel.current = null;
    }
  });

  // ---------- 操作区按钮：插入图形/运算符到当前输入框 ----------
  function setFieldValue(field, value) {
    if (field === "shapes") setShapesStr(value);
    else if (field === "qLeft") setQLeft(value);
    else if (field === "qRight") setQRight(value);
    else if (field.startsWith("rel-")) {
      const [, i, side] = field.split("-");
      setRelations((rs) => rs.map((r, idx) => (idx === +i ? { ...r, [side]: value } : r)));
    }
  }

  function insertText(text) {
    let node = activeRef.current;
    if (!node || !document.body.contains(node)) node = shapesInputRef.current;
    if (!node) return;
    const field = node.dataset.field;
    if (field === "shapes" && isOpChar(text)) return; // 形状框不放运算符
    const v = node.value;
    const start = node.selectionStart == null ? v.length : node.selectionStart;
    const end = node.selectionEnd == null ? v.length : node.selectionEnd;
    const nv = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;
    setFieldValue(field, nv);
    pendingSel.current = { node, pos };
  }

  function paletteClick(btn) {
    if (btn.dataset.op) {
      insertText(btn.dataset.op);
      return;
    }
    const sym = btn.dataset.s;
    if (!sym) return;
    if (!shapes.includes(sym)) setShapesStr((s) => (s ? s + " " : "") + sym);
    insertText(sym);
  }

  // ---------- 构建区：关系行 / 目标单位 ----------
  function renderRels() {
    return relations.map((r, idx) => (
      <div className="rel-row" key={idx}>
        <input
          type="text"
          className="sym-input"
          data-field={`rel-${idx}-left`}
          value={r.left}
          placeholder="如 ☆☆"
          onChange={(e) =>
            setRelations((rs) =>
              rs.map((x, i2) => (i2 === idx ? { ...x, left: e.target.value } : x))
            )
          }
          onFocus={(e) => (activeRef.current = e.target)}
        />
        <span className="eq">=</span>
        <input
          type="text"
          className="sym-input"
          data-field={`rel-${idx}-right`}
          value={r.right}
          placeholder="如 ○○○"
          onChange={(e) =>
            setRelations((rs) =>
              rs.map((x, i2) => (i2 === idx ? { ...x, right: e.target.value } : x))
            )
          }
          onFocus={(e) => (activeRef.current = e.target)}
        />
        <button
          className="x"
          title="删除"
          onClick={() => setRelations((rs) => rs.filter((_, i2) => i2 !== idx))}
        >
          ×
        </button>
      </div>
    ));
  }

  // ---------- 开始解题 ----------
  function start() {
    const sh = parseShapes(shapesStr);
    if (sh.length === 0) {
      alert("请先输入至少一个形状");
      return;
    }
    const rels = relations
      .map((r) => ({ left: r.left.trim(), right: r.right.trim() }))
      .filter((r) => r.left && r.right);
    if (rels.length === 0) {
      alert("请至少填一条等量关系");
      return;
    }
    const qL = qLeft.replace(/个/g, "").trim();
    const qR = qRight.replace(/个/g, "").trim() || "?";
    if (!qL) {
      alert("请填写求解问题");
      return;
    }
    const lhsQ = qL.includes("?");
    const rhsQ = qR.includes("?");
    if (lhsQ && rhsQ) {
      alert("左右两边不能同时含 ?，请把未知只放在一边");
      return;
    }
    const hasU = lhsQ || rhsQ;
    let ws;
    let ot;
    let st;
    if (lhsQ) {
      ws = "right";
      ot = expand(parseExpr(qL));
      st = expand(parseExpr(qR));
    } else {
      ws = "left";
      ot = expand(parseExpr(qR));
      st = expand(parseExpr(qL));
    }
    setHasUnknown(hasU);
    setWorkSide(ws);
    setOtherTokens(ot);
    setSteps([{ tokens: st }]);
    setSel(null);
    setView("solver");
    reset();
  }

  // ---------- 选中字符（支持只选一组里的一部分）----------
  function selectChar(idx) {
    const cur = steps[steps.length - 1];
    const t = cur.tokens[idx];
    if (!t || t.t !== "grp") return;
    const run = runBounds(cur.tokens, idx);
    const a = sel ? sel.anchor : null;
    let next;
    if (a === null || idx < run.a || idx > run.b || cur.tokens[a].sym !== t.sym) {
      next = { anchor: idx, start: idx, end: idx };
    } else if (idx === a) {
      next = { anchor: a, start: a, end: a };
    } else {
      next = { anchor: a, start: Math.min(a, idx), end: Math.max(a, idx) };
    }
    setSel(next);
  }

  // ---------- 执行一次转换，生成新的一步（支持只换一部分）----------
  function applyConversion(selObj, opt) {
    const cur = steps[steps.length - 1];
    const start = selObj.start;
    const end = selObj.end;
    const sym = cur.tokens[start].sym;
    const k = end - start + 1;
    const inserted = expand(opt.a.tokens).map((t) =>
      t.t === "grp" ? { t: "grp", sym: t.sym, n: 1 } : { t: "op", v: t.v }
    );
    const newTokens = [...cur.tokens.slice(0, start), ...inserted, ...cur.tokens.slice(end + 1)];
    const replIdx = [];
    for (let j = 0; j < inserted.length; j++) replIdx.push(start + j);
    const prevStep = { ...cur, srcMark: { start, end } };
    const newStep = {
      tokens: newTokens,
      replIdx,
      relationText: `${opt.rel.left} = ${opt.rel.right}`,
      srcText: sym.repeat(k),
      replText: inserted
        .map((t) => (t.t === "op" ? " " + t.v + " " : t.sym))
        .join("")
        .trim(),
    };
    setSteps((prev) => [...prev.slice(0, -1), prevStep, newStep]);
    setSel(null);
  }

  // ---------- 选中后展示可做的转换 ----------
  function renderOptions() {
    if (!sel) return null;
    const cur = steps[steps.length - 1];
    const t0 = cur.tokens[sel.start];
    if (!t0 || t0.t !== "grp") return null;
    const sym = t0.sym;
    const k = sel.end - sel.start + 1;
    const run = runBounds(cur.tokens, sel.start);
    const total = run.b - run.a + 1;
    const opts = [];
    relations.forEach((rel) =>
      applicable({ sym, n: k }, rel).forEach((a) => opts.push({ rel, a }))
    );
    const selText = sym.repeat(k);
    let head = (
      <div className="selbar">
        已选 <b>{selText}</b>（{k} 个{sym}
        {total > k ? `，本组共 ${total} 个` : ""}）
        <button className="mini" onClick={() => setSel(null)}>
          取消选择
        </button>
        {k < total && (
          <button
            className="mini"
            onClick={() => setSel({ anchor: run.a, start: run.a, end: run.b })}
          >
            全选本组（{total}）
          </button>
        )}
        {k > 1 && (
          <button
            className="mini"
            onClick={() => setSel({ anchor: sel.start, start: sel.start, end: sel.start })}
          >
            只留 1 个
          </button>
        )}
      </div>
    );
    return (
      <div>
        {head}
        {opts.length ? (
          opts.map((o, kk) => (
            <button className="opt" key={kk} onClick={() => applyConversion(sel, o)}>
              {selText} <span className="arrowmini">→</span> {o.a.text}{" "}
              <span className="rule">
                （规则：{o.rel.left} = {o.rel.right}）
              </span>
            </button>
          ))
        ) : (
          <div className="hint">
            选中这部分暂时换不了——可以只选这组里更少的几个，或先换别的图形。
          </div>
        )}
      </div>
    );
  }

  // ---------- 完成判定 + 后端记录 ----------
  const lastStep = steps[steps.length - 1];
  const isDone =
    view === "solver" &&
    lastStep &&
    onlyTarget(lastStep.tokens, target) &&
    lastStep.tokens.some((t) => t.t === "grp");
  let ans = 0;
  let unk = null;
  if (isDone) {
    ans = evalTarget(lastStep.tokens, target);
    if (hasUnknown) unk = solveUnknown(otherTokens, ans, target);
  }

  useEffect(() => {
    if (isDone) {
      const result = hasUnknown
        ? `?=${unk === null ? "?" : unk} 个${target}`
        : `${ans} 个${target}`;
      const params = JSON.stringify({ shapes, relations, qLeft, qRight, target });
      record(params, result, steps.length - 1);
    }
  }, [isDone]);

  function undo() {
    if (steps.length > 1) {
      setSteps((prev) => prev.slice(0, -1));
      setSel(null);
    }
  }
  function resetProblem() {
    setSteps([{ tokens: steps[0]?.tokens || [] }]);
    setSel(null);
  }
  function back() {
    setView("builder");
  }

  // ---------- 渲染：构建区 ----------
  if (view === "builder") {
    return (
      <>
        <h1>{tool.title} · 符号意识练习</h1>
        <p className="sub">
          先构建题目（形状 / 等量关系 /
          求解问题），再像解方程一样，一步步把图形等价替换，直到化成目标单位。
        </p>

        <section className="card">
          <h2>
            <span className="stepnum">1</span> 题目构建
          </h2>

          <label>① 形状与运算符（点下面的按钮 = 直接填进当前选中的输入框）</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              id="shapesInput"
              ref={shapesInputRef}
              type="text"
              className="sym-input"
              data-field="shapes"
              value={shapesStr}
              placeholder="例如：☆ ○ △"
              style={{ flex: 1 }}
              onChange={(e) => setShapesStr(e.target.value.replace(/[+−\-×*?]/g, " "))}
              onFocus={(e) => (activeRef.current = e.target)}
            />
            <button
              className="mini"
              type="button"
              onClick={() => {
                setShapesStr("");
              }}
            >
              清空
            </button>
          </div>
          <div className="palette" id="palette">
            <div className="pgroup">
              <span className="tagname">图形</span>
              {PALETTE.map((s) => (
                <button key={s} data-s={s} onClick={(e) => paletteClick(e.currentTarget)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="pgroup">
              <span className="tagname">水果</span>
              {FRUITS.map((s) => (
                <button key={s} data-s={s} onClick={(e) => paletteClick(e.currentTarget)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="pgroup">
              <span className="tagname">运算符</span>
              {OPERATORS.map((o) => (
                <button
                  key={o.k}
                  className="opkey"
                  data-op={o.k}
                  title={`插入${o.tip}`}
                  onClick={(e) => paletteClick(e.currentTarget)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <label>② 等量关系（支持多个形状加减，可多行）</label>
          {renderRels()}
          <button
            className="btn light"
            onClick={() => setRelations((rs) => [...rs, { left: "", right: "" }])}
          >
            + 添加一条关系
          </button>

          <label>③ 求解问题（左右两边都能输入算式，支持 + −；用 ? 表示未知）</label>
          <div className="rel-row">
            <input
              type="text"
              className="sym-input"
              data-field="qLeft"
              value={qLeft}
              placeholder="左边，如 ☆☆+○○"
              onFocus={(e) => (activeRef.current = e.target)}
              onChange={(e) => setQLeft(e.target.value)}
            />
            <span className="eq" style={{ fontSize: 20 }}>
              =
            </span>
            <input
              type="text"
              className="sym-input"
              data-field="qRight"
              value={qRight}
              placeholder="右边，如 ? 或 ?+○"
              onFocus={(e) => (activeRef.current = e.target)}
              onChange={(e) => setQRight(e.target.value)}
            />
            <button
              className="mini"
              type="button"
              onClick={() => {
                setQLeft("");
                setQRight("");
              }}
            >
              清空
            </button>
          </div>
          <div className="rel-row" style={{ marginTop: 8 }}>
            <span className="hint" style={{ margin: 0 }}>
              目标单位：
            </span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {shapes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="hint" style={{ margin: 0 }}>
              （把不含 ? 的那一边化简成这个单位，求出 ?）
            </span>
          </div>

          <div className="row">
            <button className="btn primary" onClick={start}>
              开始解题 →
            </button>
            <span className="hint">
              提示：先点一下要填的输入框，再点上面的图形/运算符按钮即可插入；也支持键盘直接输入。
            </span>
          </div>
        </section>
      </>
    );
  }

  // ---------- 渲染：解题区 ----------
  const sideTxt = workSide === "left" ? "左边" : "右边";
  return (
    <>
      <h1>{tool.title} · 解题阶梯</h1>
      <section className="card">
        <h2>
          <span className="stepnum">2</span> 解题阶梯
        </h2>
        <div className="goal">
          {hasUnknown
            ? `目标：把${sideTxt}的算式一步步化成「${target}」，求出 ?。`
            : `目标：把${sideTxt}的算式一步步化成「${target}」。`}
        </div>
        <div className="relcard">
          <span className="lab">已知关系</span>
          {relations.map((r, i) => (
            <span key={i}>
              {i > 0 && " ， "}
              <b>{r.left}</b> = <b>{r.right}</b>
            </span>
          ))}
        </div>

        <div className="steps">
          {steps.map((st, i) => {
            const isCurrent = i === steps.length - 1;
            const green = new Set(st.replIdx || []);
            const mark = st.srcMark;
            const selCur = isCurrent ? sel : null;
            const toks = (
              <TokensView
                tokens={st.tokens}
                isCurrent={isCurrent}
                selCur={selCur}
                green={green}
                mark={mark}
                onClick={selectChar}
              />
            );
            const leftHtml = workSide === "left" ? toks : otherView;
            const rightHtml = workSide === "left" ? otherView : toks;
            const solved = onlyTarget(st.tokens, target) && st.tokens.some((t) => t.t === "grp");
            let resultHtml = null;
            if (solved) {
              const a = evalTarget(st.tokens, target);
              const u = hasUnknown ? solveUnknown(otherTokens, a, target) : null;
              resultHtml = hasUnknown ? (
                <span className="result ok">
                  ? = {u === null ? "?" : u} 个{target} ✓
                </span>
              ) : (
                <span className="result ok">
                  = {a} 个{target} ✓
                </span>
              );
            }
            return (
              <div key={i}>
                {i > 0 && (
                  <div className="arrow">
                    ↓ 用 <b>{st.relationText}</b>：把 <span className="src-tx">{st.srcText}</span>{" "}
                    <span className="brand-tx">→</span>{" "}
                    <span className="repl-tx">{st.replText}</span>
                  </div>
                )}
                <div className={`step ${isCurrent ? "current" : ""}`}>
                  <div className="eqline">
                    {leftHtml} <span className="op">=</span> {rightHtml} {resultHtml}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="options" style={{ marginTop: 10 }}>
          {renderOptions()}
        </div>

        <div className="legend">
          <span>
            <i
              className="dot"
              style={{ background: "var(--src-bg)", boxShadow: "0 0 0 2px var(--src) inset" }}
            />{" "}
            这一步被换掉的图形
          </span>
          <span>
            <i
              className="dot"
              style={{ background: "var(--repl-bg)", boxShadow: "0 0 0 2px var(--repl) inset" }}
            />{" "}
            换进来的新图形
          </span>
          <span>
            <i
              className="dot"
              style={{ background: "#e8effe", boxShadow: "0 0 0 2px var(--brand) inset" }}
            />{" "}
            当前选中（可只选一组中的一部分）
          </span>
        </div>

        {isDone && (
          <div className="done">
            🎉 搞定！
            {hasUnknown
              ? unk === null
                ? "化到了同一个单位，但 ? 这侧形式较复杂"
                : `? = ${unk}`
              : `答案 ${ans}`}{" "}
            个{target}。每一步就像解方程，把混合图形一步步换成同一种单位。
            {saved && <span className="saved"> · 已保存 ✓</span>}
          </div>
        )}

        <div className="row">
          <button className="btn ghost" onClick={undo}>
            ↩ 撤销一步
          </button>
          <button className="btn light" onClick={resetProblem}>
            ⟲ 重做本题
          </button>
          <button className="btn light" onClick={back}>
            ← 返回修改题目
          </button>
        </div>
      </section>
    </>
  );
}
