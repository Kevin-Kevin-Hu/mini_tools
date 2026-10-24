import { useState, useRef, useEffect } from "react";
import { todayStr } from "./dailyPlanLogic.js";
import {
  dpGetUsers,
  dpCreateUser,
  dpRenameUser,
  dpDeleteUser,
  dpGetPlans,
  dpCreatePlan,
  dpCopyPlan,
  dpDeletePlan,
} from "../api.js";
import DailyPlanEditor from "./DailyPlanEditor.jsx";
import "./DailyPlan.css";
import "./dpPages.css";

// 选择页（二级跳转的第一屏）：管理用户 + 选 / 建 / 复制计划（按日期）
export default function DailyPlan({ tool }) {
  const [users, setUsers] = useState([]);
  const [curUserId, setCurUserId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [userForm, setUserForm] = useState(null); // {mode:'create'|'rename', name, uid}
  const [planForm, setPlanForm] = useState(null); // {mode:'create'|'copy', date, srcId}
  const [activePlanId, setActivePlanId] = useState(null); // 非空 → 进入任务页
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const curUserIdRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    dpGetUsers()
      .then(async (list) => {
        setUsers(list);
        if (list.length) await selectUser(list[0].id);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  async function selectUser(uid) {
    if (uid == null || uid === curUserIdRef.current) return;
    curUserIdRef.current = uid;
    setCurUserId(uid);
    setActivePlanId(null); // 切用户回到选择页
    const res = await dpGetPlans(uid);
    setPlans(res);
  }

  async function refreshPlans() {
    if (curUserIdRef.current == null) return;
    setPlans(await dpGetPlans(curUserIdRef.current));
  }

  // ---------- 用户操作 ----------
  async function handleCreateUser() {
    const name = (userForm.name || "").trim();
    if (!name) return;
    try {
      const u = await dpCreateUser(name);
      setUsers((us) => [...us, u]);
      setUserForm(null);
      await selectUser(u.id);
    } catch (e) {
      setError(String(e));
    }
  }
  async function handleRenameUser() {
    const name = (userForm.name || "").trim();
    if (!name) return;
    try {
      await dpRenameUser(userForm.uid, name);
      setUsers((us) => us.map((u) => (u.id === userForm.uid ? { ...u, name } : u)));
      setUserForm(null);
    } catch (e) {
      setError(String(e));
    }
  }
  async function handleDeleteUser() {
    if (!curUserIdRef.current) return;
    if (!window.confirm("删除该用户会一并删除其全部计划与常用任务，确定吗？")) return;
    try {
      await dpDeleteUser(curUserIdRef.current);
      const us = users.filter((u) => u.id !== curUserIdRef.current);
      setUsers(us);
      curUserIdRef.current = null;
      setCurUserId(null);
      setPlans([]);
      if (us.length) await selectUser(us[0].id);
    } catch (e) {
      setError(String(e));
    }
  }

  // ---------- 计划操作 ----------
  async function handleCreatePlan() {
    const date = planForm.date || todayStr();
    setPlanForm(null);
    try {
      const p = await dpCreatePlan(curUserIdRef.current, date);
      await refreshPlans();
      setActivePlanId(p.id); // 建好直接进入任务页
    } catch (e) {
      setError(String(e));
    }
  }
  async function handleCopyPlan() {
    const date = planForm.date || todayStr();
    const srcId = planForm.srcId;
    setPlanForm(null);
    try {
      const r = await dpCopyPlan(srcId, date);
      await refreshPlans();
      setActivePlanId(r.id);
    } catch (e) {
      setError(String(e));
    }
  }
  async function handleDeletePlan(p) {
    if (!window.confirm(`确定删除 ${p.plan_date} 的计划吗？该日任务会一并删除。`)) return;
    try {
      await dpDeletePlan(p.id);
      await refreshPlans();
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <p className="hint">加载中…</p>;
  if (error) return <p className="hint">出错：{error}</p>;

  const curUser = users.find((u) => u.id === curUserId);

  // 进入任务页（二级跳转的第二屏）
  if (activePlanId != null) {
    return (
      <DailyPlanEditor
        userId={curUserId}
        planId={activePlanId}
        userName={curUser ? curUser.name : ""}
        onBack={() => setActivePlanId(null)}
      />
    );
  }

  return (
    <>
      <h1>{tool.title}</h1>
      <p className="sub">
        先选用户、再选（或新建）某天的计划；点计划卡片即可进入任务页编辑。设好第一个任务的开始时间，其余任务自动按「时长
        + 休息」顺延。
      </p>

      {/* ---------- 用户域 ---------- */}
      <section className="card">
        <h2>
          <span className="stepnum">1</span> 选择用户
        </h2>
        {users.length === 0 && <p className="hint">还没有用户，先添加一个吧。</p>}
        <div className="dp-userbar">
          <select value={curUserId || ""} onChange={(e) => selectUser(Number(e.target.value))}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button className="btn light" onClick={() => setUserForm({ mode: "create", name: "" })}>
            + 新建用户
          </button>
          {curUser && (
            <>
              <button
                className="btn light"
                onClick={() => setUserForm({ mode: "rename", name: curUser.name, uid: curUser.id })}
              >
                改名
              </button>
              <button className="btn light" onClick={handleDeleteUser}>
                删除
              </button>
            </>
          )}
        </div>
        {userForm && (
          <div className="dp-inlineform">
            <input
              type="text"
              autoFocus
              placeholder={userForm.mode === "create" ? "输入用户名" : "新用户名"}
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  userForm.mode === "create" ? handleCreateUser() : handleRenameUser();
              }}
            />
            <button
              className="btn primary"
              onClick={userForm.mode === "create" ? handleCreateUser : handleRenameUser}
            >
              确定
            </button>
            <button className="btn light" onClick={() => setUserForm(null)}>
              取消
            </button>
          </div>
        )}
      </section>

      {!curUser && <div className="done">请先选择或新建一个用户，再制定计划。</div>}

      {curUser && (
        <section className="card">
          <h2>
            <span className="stepnum">2</span> 选择 / 新建计划
            <button
              className="btn light dp-addplan"
              onClick={() => setPlanForm({ mode: "create", date: todayStr() })}
            >
              + 新建计划
            </button>
          </h2>
          {plans.length === 0 && (
            <p className="hint">该用户还没有计划，点右上角「+ 新建计划」开始吧。</p>
          )}
          <div className="dp-planlist">
            {plans.map((p) => (
              <div
                key={p.id}
                className="dp-plan-card"
                role="button"
                tabIndex={0}
                onClick={() => setActivePlanId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActivePlanId(p.id);
                  }
                }}
              >
                <div className="dp-plan-card-main">
                  <div className="dp-plan-date">{p.plan_date}</div>
                  {p.day_label ? <div className="dp-plan-label">{p.day_label}</div> : null}
                  <div className="dp-plan-sub">{p.task_count} 项任务</div>
                </div>
                <div className="dp-plan-card-actions">
                  <button
                    type="button"
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlanForm({ mode: "copy", date: todayStr(), srcId: p.id });
                    }}
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlan(p);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          {planForm && (
            <div className="dp-inlineform">
              <span className="hint" style={{ margin: 0 }}>
                {planForm.mode === "create" ? "新建计划日期：" : "复制到日期："}
              </span>
              <input
                type="date"
                value={planForm.date}
                onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })}
              />
              <button
                className="btn primary"
                onClick={planForm.mode === "create" ? handleCreatePlan : handleCopyPlan}
              >
                确定
              </button>
              <button className="btn light" onClick={() => setPlanForm(null)}>
                取消
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
