export async function getTools() {
  const r = await fetch("/api/tools");
  if (!r.ok) throw new Error("加载工具列表失败");
  return r.json();
}

export async function saveExperiment(payload) {
  const r = await fetch("/api/experiments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("保存实验记录失败");
  return r.json();
}

export async function getExperiments(toolId) {
  const r = await fetch(`/api/experiments/${encodeURIComponent(toolId)}`);
  if (!r.ok) throw new Error("读取记录失败");
  return r.json();
}

// ---------- daily_plan 每日计划 ----------
const BASE = "/api/daily_plan";

async function jfetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = "请求失败";
    try {
      msg = (await r.json()).detail || msg;
    } catch (e) {
      /* noop */
    }
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

// 用户
export const dpGetUsers = () => jfetch(`${BASE}/users`);
export const dpCreateUser = (name) =>
  jfetch(`${BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
export const dpRenameUser = (id, name) =>
  jfetch(`${BASE}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
export const dpDeleteUser = (id) => jfetch(`${BASE}/users/${id}`, { method: "DELETE" });

// 计划
export const dpGetPlans = (userId) => jfetch(`${BASE}/plans?user_id=${encodeURIComponent(userId)}`);
export const dpCreatePlan = (userId, planDate, firstStart = "07:00") =>
  jfetch(`${BASE}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, plan_date: planDate, first_start: firstStart }),
  });
export const dpGetPlan = (planId) => jfetch(`${BASE}/plans/${planId}`);
export const dpUpdatePlan = (planId, meta) =>
  jfetch(`${BASE}/plans/${planId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
export const dpDeletePlan = (planId) => jfetch(`${BASE}/plans/${planId}`, { method: "DELETE" });
export const dpCopyPlan = (planId, planDate) =>
  jfetch(`${BASE}/plans/${planId}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_date: planDate }),
  });
export const dpSaveTasks = (planId, tasks) =>
  jfetch(`${BASE}/plans/${planId}/tasks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
  });

// 常用任务
export const dpGetCommon = (userId) =>
  jfetch(`${BASE}/common_tasks?user_id=${encodeURIComponent(userId)}`);
export const dpCreateCommon = (userId, payload) =>
  jfetch(`${BASE}/common_tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...payload }),
  });
export const dpUpdateCommon = (id, payload) =>
  jfetch(`${BASE}/common_tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const dpDeleteCommon = (id) => jfetch(`${BASE}/common_tasks/${id}`, { method: "DELETE" });
