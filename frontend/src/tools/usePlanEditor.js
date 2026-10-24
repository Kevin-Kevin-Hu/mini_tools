import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { computeSchedule, minToTime, todayStr } from "./dailyPlanLogic.js";
import {
  dpGetPlan,
  dpUpdatePlan,
  dpSaveTasks,
  dpGetCommon,
  dpCreateCommon,
  dpUpdateCommon,
  dpDeleteCommon,
} from "../api.js";

// ============================================================
// 任务页的状态与逻辑（无 JSX，便于复用与压行数）
// 负责：加载某天的计划 + 任务 + 常用任务、自动保存、拖动排序、增删改。
// ============================================================
export function usePlanEditor(userId, planId) {
  const [plan, setPlan] = useState(null);
  const [tasks, setTasksState] = useState([]);
  const [common, setCommon] = useState([]);
  const [viewMode, setViewMode] = useState("view"); // 'view' | 'edit'
  const [showCommon, setShowCommon] = useState(false);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // refs（避免定时器闭包拿到旧值）
  const tasksRef = useRef([]);
  const planRef = useRef(null);
  const saveTimer = useRef(null);
  const metaTimer = useRef(null);

  // 拖拽排序（Pointer Events：鼠标 + 触摸统一）
  const cardRefs = useRef([]);
  const dragState = useRef(null);
  const [dragIndex, setDragIndex] = useState(-1);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const setTasks = useCallback((arr) => {
    tasksRef.current = arr;
    setTasksState(arr);
  }, []);

  // 先把计划元信息写 ref 再 setState，保证防抖保存一定拿到最新值
  const patchPlan = useCallback((patch) => {
    const next = { ...(planRef.current || {}), ...patch };
    planRef.current = next;
    setPlan(next);
    scheduleMetaSave();
  }, []);

  // ---------- 自动保存（任务整体替换） ----------
  const scheduleSave = useCallback(() => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 600);
  }, []);

  const doSave = useCallback(async () => {
    if (!planId) return;
    try {
      const payload = tasksRef.current.map((t) => ({
        kind: t.kind,
        title: t.title || "",
        detail: t.detail || "",
        duration_min: Number(t.duration_min) || 0,
        rest_after_min: Number(t.rest_after_min) || 0,
        is_preset: t.is_preset ? 1 : 0,
      }));
      await dpSaveTasks(planId, payload);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      console.error("保存任务失败", e);
    }
  }, [planId]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await doSave();
    }
  }, [doSave]);

  // ---------- 计划元信息保存（开始时间 / 日期备注） ----------
  const scheduleMetaSave = useCallback(() => {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(doMetaSave, 500);
  }, []);

  const doMetaSave = useCallback(async () => {
    const p = planRef.current; // 必须读 ref：state 在定时器闭包里是旧值
    if (!planId || !p) return;
    try {
      await dpUpdatePlan(planId, {
        first_start: p.first_start,
        day_label: p.day_label || "",
      });
    } catch (e) {
      console.error("保存计划信息失败", e);
    }
  }, [planId]);

  const flushMetaSave = useCallback(async () => {
    if (metaTimer.current) {
      clearTimeout(metaTimer.current);
      metaTimer.current = null;
      await doMetaSave();
    }
  }, [doMetaSave]);

  // 切换计划 / 卸载前先把还没落盘的元信息写掉，避免丢掉最后一次修改
  const flushAll = useCallback(async () => {
    await flushSave();
    await flushMetaSave();
  }, [flushSave, flushMetaSave]);

  // ---------- 加载 ----------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dpGetPlan(planId);
      setPlan(data.plan);
      setTasks(data.tasks.map((t) => ({ ...t })));
      const commonRes = await dpGetCommon(userId);
      setCommon(commonRes);
      setSaveState("saved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setNotFound(false);
    } catch (e) {
      if (String(e).includes("404") || String(e).toLowerCase().includes("not found")) {
        setNotFound(true);
      } else {
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [planId, userId, setTasks]);

  useEffect(() => {
    load();
    // 卸载前保存一下
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        doSave();
      }
      if (metaTimer.current) {
        clearTimeout(metaTimer.current);
        doMetaSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // 拖拽
  const onDragStart = useCallback((e, index) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* noop */
    }
    dragState.current = { index, pointerId: e.pointerId };
    setDragIndex(index);
  }, []);

  const onDragMove = useCallback(
    (e) => {
      const ds = dragState.current;
      if (!ds) return;
      const y = e.clientY;
      const n = tasksRef.current.length;
      let target = ds.index;
      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (y < mid) {
          target = i;
          break;
        }
        target = i + 1;
      }
      target = Math.max(0, Math.min(n - 1, target));
      if (target !== ds.index) {
        const arr = [...tasksRef.current];
        const [item] = arr.splice(ds.index, 1);
        arr.splice(target, 0, item);
        ds.index = target;
        setDragIndex(target);
        setTasks(arr);
        scheduleSave(); // 顺序变了 → 自动保存，时间轴随新顺序重排
      }
    },
    [setTasks, scheduleSave]
  );

  const onDragEnd = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;
    try {
      e.currentTarget.releasePointerCapture(ds.pointerId);
    } catch (_) {
      /* noop */
    }
    dragState.current = null;
    setDragIndex(-1);
  }, []);

  // ---------- 任务操作 ----------
  const mutateTasks = useCallback(
    (updater) => {
      setTasks(updater(tasksRef.current));
      scheduleSave();
    },
    [setTasks, scheduleSave]
  );

  const insertTask = useCallback(
    (task, atIndex) => {
      mutateTasks((arr) => {
        const next = [...arr];
        const idx = atIndex == null ? next.length : atIndex;
        next.splice(idx, 0, { ...task });
        return next;
      });
    },
    [mutateTasks]
  );
  const updateTask = useCallback(
    (index, patch) => {
      mutateTasks((arr) => arr.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    },
    [mutateTasks]
  );
  const moveTask = useCallback(
    (index, dir) => {
      mutateTasks((arr) => {
        const j = index + dir;
        if (j < 0 || j >= arr.length) return arr;
        const next = [...arr];
        [next[index], next[j]] = [next[j], next[index]];
        return next;
      });
    },
    [mutateTasks]
  );
  const duplicateTask = useCallback(
    (index) => {
      mutateTasks((arr) => {
        const next = [...arr];
        next.splice(index + 1, 0, { ...arr[index] });
        return next;
      });
    },
    [mutateTasks]
  );
  const deleteTask = useCallback(
    (index) => {
      mutateTasks((arr) => arr.filter((_, i) => i !== index));
    },
    [mutateTasks]
  );

  // ---------- 常用任务操作 ----------
  const handleCreateCommon = useCallback(async () => {
    try {
      const c = await dpCreateCommon(userId, {
        title: "新常用任务",
        detail: "",
        duration_min: 30,
        kind: "task",
      });
      setCommon((cs) => [...cs, c]);
    } catch (e) {
      setError(String(e));
    }
  }, [userId]);
  const handleUpdateCommon = useCallback(async (c, patch) => {
    try {
      await dpUpdateCommon(c.id, { ...c, ...patch });
      setCommon((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    } catch (e) {
      setError(String(e));
    }
  }, []);
  const handleDeleteCommon = useCallback(async (c) => {
    try {
      await dpDeleteCommon(c.id);
      setCommon((cs) => cs.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // ---------- 排程计算 ----------
  const scheduled = useMemo(
    () => computeSchedule(tasks, plan ? plan.first_start : "07:00"),
    [tasks, plan]
  );
  const endTime = scheduled.length ? minToTime(scheduled[scheduled.length - 1].endMin) : null;

  return {
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
    todayStr,
  };
}
