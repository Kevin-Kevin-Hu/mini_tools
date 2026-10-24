import { useState, useRef, useEffect } from "react";
import { parseTimeToMin, minToTime, KIND_LABEL } from "./dailyPlanLogic.js";

export { KIND_LABEL };

// 时长 / 休息 步进器（移动端友好的 − 数字 +）
export function Stepper({ value, min = 0, step = 5, unit = "分钟", quick, onChange }) {
  const clamp = (v) => (Number.isFinite(v) ? Math.max(min, v) : min);
  // 输入期间用草稿字符串：允许暂时清空（否则删最后一位会立刻被钳位成最小值）
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  // 外部值变化（快捷时长 / 拖动重排 / 切换任务）时同步草稿，正在输入则不打断
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const apply = (v) => {
    const next = clamp(v);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="dp-stepper">
      <button className="dp-stepbtn" type="button" onClick={() => apply(value - step)}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="dp-stepval"
        value={draft}
        min={min}
        step={step}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw); // 空字符串 / 中间态照常显示
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n) && n >= min) onChange(n); // 只有合法值才实时重排时间
        }}
        onBlur={(e) => {
          focused.current = false;
          const n = parseInt(e.target.value, 10);
          apply(Number.isNaN(n) ? min : n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="dp-stepunit">{unit}</span>
      <button className="dp-stepbtn" type="button" onClick={() => apply(value + step)}>
        +
      </button>
      {quick && (
        <div className="dp-quick">
          {quick.map((q) => (
            <button key={q} type="button" className="mini" onClick={() => apply(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 时间选择器：自绘两列滚动列表。滚到两端即停、不绕回
// （原生 input[type=time] 的弹层是浏览器自带的循环列表，无法改行为）
const HOUR_LIST = Array.from({ length: 24 }, (_, i) => i);
const MIN_LIST = Array.from({ length: 60 }, (_, i) => i);
const pad2 = (n) => String(n).padStart(2, "0");

export function TimePicker({ value, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef(null);
  const hourRef = useRef(null);
  const minRef = useRef(null);
  const centered = useRef(false);

  const total = parseTimeToMin(value || "07:00") % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const emit = (h, m) => onChange(`${pad2(h)}:${pad2(m)}`);

  // 首次打开时把当前选中项滚到列中间（之后不再跟随，避免点选时列表跳动）
  useEffect(() => {
    if (!open) {
      centered.current = false;
      return;
    }
    if (centered.current) return;
    centered.current = true;
    [
      [hourRef.current, hh],
      [minRef.current, mm],
    ].forEach(([col, idx]) => {
      if (!col) return;
      const item = col.children[idx];
      if (item) col.scrollTop = item.offsetTop - col.clientHeight / 2 + item.offsetHeight / 2;
    });
  }, [open, hh, mm]);

  // 点外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 键盘 ↑↓：±5 分钟，到 00:00 / 23:59 停住，不绕回
  const bump = (delta) => {
    const next = Math.max(0, Math.min(23 * 60 + 59, total + delta));
    onChange(minToTime(next).text);
  };

  const renderCol = (list, sel, onPick, ref, label) => (
    <div className="dp-tp-col" ref={ref} role="listbox" aria-label={label}>
      {list.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={v === sel}
          className={`dp-tp-item${v === sel ? " is-on" : ""}`}
          onClick={() => onPick(v)}
        >
          {pad2(v)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="dp-tp" ref={wrapRef}>
      <button
        type="button"
        className="dp-tp-trigger"
        aria-label="选择开始时间"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            bump(5);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            bump(-5);
          }
        }}
      >
        <span className="dp-tp-val">{minToTime(total).text}</span>
        <span className="dp-tp-icon" aria-hidden="true">
          ◷
        </span>
      </button>

      {open && (
        <div className="dp-tp-pop">
          <div className="dp-tp-head">
            <span>时</span>
            <span>分</span>
          </div>
          <div className="dp-tp-cols">
            {renderCol(HOUR_LIST, hh, (h) => emit(h, mm), hourRef, "时")}
            {renderCol(MIN_LIST, mm, (m) => emit(hh, m), minRef, "分")}
          </div>
          <div className="dp-tp-foot">
            {[0, 15, 30, 45].map((m) => (
              <button
                key={m}
                type="button"
                className={`mini${m === mm ? " is-on" : ""}`}
                onClick={() => emit(hh, m)}
              >
                :{pad2(m)}
              </button>
            ))}
            <button type="button" className="dp-tp-done" onClick={() => setOpen(false)}>
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
