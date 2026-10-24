import { Stepper, TimePicker, KIND_LABEL } from "./dpControls.jsx";
import { PRESETS, blankTask, fromCommon, fmtRange, fmtDuration } from "./dailyPlanLogic.js";
import { usePlanEditor } from "./usePlanEditor.js";
import PlanPrint from "./PlanPrint.jsx";
import "./DailyPlan.css";
import "./dpPages.css";

// 任务页：编辑某一天的计划（二级跳转的第二屏）
export default function DailyPlanEditor({ userId, planId, userName, onBack }) {
  const ed = usePlanEditor(userId, planId);
  const {
    plan,
    scheduled,
    endTime,
    common,
    viewMode,
    setViewMode,
    showCommon,
    setShowCommon,
    saveState,
    loading,
    error,
    notFound,
    dragIndex,
    cardRefs,
    onDragStart,
    onDragMove,
    onDragEnd,
    insertTask,
    updateTask,
    moveTask,
    duplicateTask,
    deleteTask,

    patchPlan,
    handleCreateCommon,
    handleUpdateCommon,
    handleDeleteCommon,
    flushAll,
  } = ed;

  const back = async () => {
    await flushAll();
    onBack();
  };

  const print = async () => {
    await flushAll(); // 确保待打印的就是已保存的最新内容
    window.print();
  };

  if (loading) return <p className="hint">加载中…</p>;
  if (notFound)
    return (
      <div className="dp-editor">
        <button className="dp-back" type="button" onClick={back}>
          ← 返回选择
        </button>
        <div className="done">该计划不存在或已被删除。</div>
      </div>
    );
  if (error)
    return (
      <div className="dp-editor">
        <button className="dp-back" type="button" onClick={back}>
          ← 返回选择
        </button>
        <p className="hint">出错：{error}</p>
      </div>
    );

  return (
    <div className="dp-editor">
      <div className="dp-editor-head">
        <button className="dp-back" type="button" onClick={back}>
          ← 返回选择
        </button>
        <div className="dp-editor-title">
          {plan.plan_date}
          {plan.day_label ? <span className="dp-editor-label">（{plan.day_label}）</span> : null}
        </div>
        {saveState !== "saved" && (
          <span className={`dp-save dp-save-${saveState}`}>
            {saveState === "saving" ? "保存中…" : "保存失败"}
          </span>
        )}
        <span className="dp-head-tools">
          <span className="dp-mode" role="group" aria-label="显示模式">
            <button
              type="button"
              className={viewMode === "view" ? "on" : ""}
              onClick={() => setViewMode("view")}
            >
              查看
            </button>
            <button
              type="button"
              className={viewMode === "edit" ? "on" : ""}
              onClick={() => setViewMode("edit")}
            >
              编辑
            </button>
          </span>
          <button className="dp-print-btn" type="button" title="打印任务清单纸条" onClick={print}>
            🖨 打印
          </button>
        </span>
      </div>

      {viewMode === "edit" && (
        <div className="dp-firststart">
          <label>首个任务开始时间</label>
          <TimePicker
            value={plan.first_start || "07:00"}
            onChange={(v) => patchPlan({ first_start: v })}
          />
        </div>
      )}

      {/* 时间轴 */}
      <div className="dp-timeline">
        {scheduled.length === 0 && (
          <p className="hint">还没有任务，点右上角「编辑」添加，或用下面的按钮快速添加。</p>
        )}
        {scheduled.map((t, i) => (
          <div key={i}>
            <div
              className={`dp-task dp-task-${t.kind}${dragIndex === i ? " dp-dragging" : ""}${
                viewMode === "view" ? " dp-task-view" : ""
              }`}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
            >
              <div className="dp-task-head">
                <span
                  className="dp-grip"
                  title="拖动调整顺序"
                  onPointerDown={(e) => onDragStart(e, i)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                >
                  ⠿
                </span>
                <span className="dp-time">{fmtRange(t.startMin, t.endMin)}</span>
                <span className={`dp-badge dp-badge-${t.kind}`}>
                  {KIND_LABEL[t.kind] || "任务"}
                </span>
                {viewMode === "view" ? (
                  <span className="dp-nav">
                    <button
                      className="mini"
                      title="上移"
                      disabled={i === 0}
                      onClick={() => moveTask(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="mini"
                      title="下移"
                      disabled={i === scheduled.length - 1}
                      onClick={() => moveTask(i, 1)}
                    >
                      ↓
                    </button>
                  </span>
                ) : (
                  <span className="dp-task-actions">
                    <button
                      className="mini"
                      title="上移"
                      disabled={i === 0}
                      onClick={() => moveTask(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="mini"
                      title="下移"
                      disabled={i === scheduled.length - 1}
                      onClick={() => moveTask(i, 1)}
                    >
                      ↓
                    </button>
                    <button className="mini" title="复制此项" onClick={() => duplicateTask(i)}>
                      复制
                    </button>
                    <button className="mini" title="删除" onClick={() => deleteTask(i)}>
                      删除
                    </button>
                  </span>
                )}
              </div>

              {viewMode === "view" ? (
                <>
                  <div className="dp-view-title">{t.title || "（未命名任务）"}</div>
                  {t.detail ? <div className="dp-view-detail">{t.detail}</div> : null}
                  <div className="dp-view-meta">
                    <span>时长 {fmtDuration(t.duration_min)}</span>
                    {!t._isLast && Number(t.rest_after_min) > 0 && (
                      <span>· 休息 {Number(t.rest_after_min)} 分钟</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    className="dp-title"
                    placeholder="任务标题"
                    value={t.title || ""}
                    onChange={(e) => updateTask(i, { title: e.target.value })}
                  />
                  <textarea
                    className="dp-detail"
                    placeholder="详情（可选）"
                    rows={2}
                    value={t.detail || ""}
                    onChange={(e) => updateTask(i, { detail: e.target.value })}
                  />
                  <div className="dp-controls">
                    <div className="dp-ctl">
                      <label>时长</label>
                      <Stepper
                        value={Number(t.duration_min) || 0}
                        min={5}
                        step={5}
                        quick={[15, 30, 45, 60, 90]}
                        onChange={(v) => updateTask(i, { duration_min: v })}
                      />
                    </div>
                    <div className="dp-ctl">
                      <label>之后休息</label>
                      {t._isLast ? (
                        <span className="hint" style={{ margin: 0 }}>
                          当天最后一项
                        </span>
                      ) : (
                        <>
                          <Stepper
                            value={Number(t.rest_after_min) || 0}
                            min={0}
                            step={5}
                            quick={[10, 20, 30, 40, 50, 60]}
                            onChange={(v) => updateTask(i, { rest_after_min: v })}
                          />
                          {Number(t.rest_after_min) > 0 && (
                            <button
                              className="mini dp-norest"
                              type="button"
                              title="删除这段休息（前后任务直接接上）"
                              onClick={() => updateTask(i, { rest_after_min: 0 })}
                            >
                              不休息
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {endTime && (
          <div className="dp-end">
            当日结束：{endTime.text}
            {endTime.dayOffset ? " (+1天)" : ""}
          </div>
        )}
      </div>

      {/* 快速插入（编辑模式显示；空计划时无论如何都显示，便于起步） */}
      {(viewMode === "edit" || scheduled.length === 0) && (
        <div className="dp-insert">
          <div className="dp-insert-title">快速插入：</div>
          <div className="dp-insert-row">
            {PRESETS.map((p) => (
              <button
                key={p.title}
                className={`dp-preset dp-preset-${p.kind}`}
                onClick={() => insertTask({ ...p })}
              >
                {p.title}
                <b>{fmtDuration(p.duration_min)}</b>
              </button>
            ))}
            {common.map((c) => (
              <button
                key={c.id}
                className="dp-common-chip"
                title={c.detail || ""}
                onClick={() => insertTask(fromCommon(c))}
              >
                {c.title}
                <b>{fmtDuration(c.duration_min)}</b>
              </button>
            ))}
            <button className="btn light" onClick={() => insertTask(blankTask())}>
              + 自定义任务
            </button>
          </div>
        </div>
      )}

      {/* 常用任务管理（仅编辑模式） */}
      {viewMode === "edit" && (
        <div className="dp-common">
          <button className="btn ghost" onClick={() => setShowCommon((s) => !s)}>
            {showCommon ? "收起常用任务" : "管理常用任务"}
          </button>
          {showCommon && (
            <div className="dp-common-box">
              <button className="btn light" onClick={handleCreateCommon}>
                + 添加常用任务
              </button>
              {common.length === 0 && <p className="hint">还没有常用任务。</p>}
              {common.map((c) => (
                <div className="dp-common-item" key={c.id}>
                  <input
                    type="text"
                    placeholder="标题"
                    value={c.title}
                    onChange={(e) => handleUpdateCommon(c, { title: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="详情"
                    value={c.detail || ""}
                    onChange={(e) => handleUpdateCommon(c, { detail: e.target.value })}
                  />
                  <div className="dp-ctl">
                    <label>时长</label>
                    <Stepper
                      value={Number(c.duration_min) || 0}
                      min={5}
                      step={5}
                      quick={[15, 30, 45, 60, 90]}
                      onChange={(v) => handleUpdateCommon(c, { duration_min: v })}
                    />
                  </div>
                  <button className="mini" onClick={() => handleDeleteCommon(c)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 打印纸条：屏幕隐藏，window.print() 时输出 */}
      <PlanPrint userName={userName} plan={plan} scheduled={scheduled} endTime={endTime} />
    </div>
  );
}
