import { createPortal } from "react-dom";
import { fmtRange, todayStr } from "./dailyPlanLogic.js";
import "./dpPrint.css";

// 打印纸条：屏幕上完全隐藏，仅 window.print() 时以小纸条形态输出
// 版式与小程序 printStrip 对齐：A4 横向纸上一条横纸条，沿虚线裁切

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const KIND_TAG = { meal: "用餐", break: "休息" };

export default function PlanPrint({ userName, plan, scheduled, endTime }) {
  if (!plan || !scheduled || scheduled.length === 0) return null;

  let week = "";
  try {
    week = WEEK[new Date(`${plan.plan_date}T00:00:00`).getDay()];
  } catch {
    week = "";
  }
  const doneN = scheduled.filter((t) => t.done).length;

  return createPortal(
    <div className="dp-print-strip" aria-hidden="true">
      <div className="s-head">
        <div className="s-title">
          {userName ? `${userName}的` : ""}
          {plan.plan_date}计划
        </div>
        <div className="s-sub">
          {week ? `星期${week} · ` : ""}
          {plan.first_start || "07:00"} 开始 · {scheduled.length} 项
          {doneN > 0 ? ` · 完成 ${doneN}` : ""}
          {endTime ? ` · ${endTime.text} 结束${endTime.dayOffset ? "（次日）" : ""}` : ""}
        </div>
      </div>

      <table className="s-list">
        <thead>
          <tr>
            <th style={{ width: "92px" }}>时间</th>
            <th>任务</th>
          </tr>
        </thead>
        <tbody>
          {scheduled.map((t, i) => (
            <tr key={i}>
              <td className="s-time">{fmtRange(t.startMin, t.endMin)}</td>
              <td className="s-name">
                {t.done ? <span className="s-done-mark">√ </span> : null}
                <span className={t.done ? "s-done" : undefined}>{t.title || "（未命名任务）"}</span>
                {KIND_TAG[t.kind] ? <span className="s-tag">{KIND_TAG[t.kind]}</span> : null}
                {t.detail ? <span className="s-detail">{t.detail}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="s-foot">
        打印：{todayStr()}
        {"　　"}家长签字：<span className="s-sign"></span>
      </div>
    </div>,
    document.body
  );
}
