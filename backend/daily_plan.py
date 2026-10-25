"""daily_plan 工具后端：用户 / 每日计划 / 任务 / 常用任务 的持久化与 CRUD。

数据模型（全部建在 mini_tools.db，复用 db.get_conn）：
  dp_users(id, name, created_at)
  dp_plans(id, user_id, plan_date, day_label, first_start, created_at, updated_at)
  dp_tasks(id, plan_id, position, kind, title, detail, duration_min, rest_after_min, is_preset, done, created_at)
  dp_common_tasks(id, user_id, title, detail, duration_min, kind, created_at)

完成状态（done）：
  - 0=未完成（默认）、1=已完成；查看列表里点一下即可勾选/取消
  - 「复制计划」不带完成状态：新的一天从零开始，避免照抄出一堆已勾选的任务
  - 小程序云端（Postgres）的 tasks 是 plans 表里的 jsonb 列，done 只是任务对象的新键，无需改表

排程规则（前端计算，后端只存储）：
  - 第一个任务由用户手动设定开始时间（plan.first_start）
  - 其余任务 = 上一任务结束 + 上一任务的「之后休息」时长
  - 相邻任务之间默认休息 20 分钟（task 类型）；break/meal 预置项 rest_after 为 0（它本身就是休息/用餐）
"""

from db import get_conn
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/daily_plan", tags=["daily_plan"])


# ---------- 建表 ----------
def init_dp_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dp_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dp_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                plan_date TEXT NOT NULL,
                day_label TEXT DEFAULT '',
                first_start TEXT DEFAULT '07:00',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dp_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                kind TEXT DEFAULT 'task',
                title TEXT DEFAULT '',
                detail TEXT DEFAULT '',
                duration_min INTEGER DEFAULT 30,
                rest_after_min INTEGER DEFAULT 20,
                is_preset INTEGER DEFAULT 0,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        # 存量库迁移：CREATE TABLE IF NOT EXISTS 不会给旧表补列，手动 ALTER
        # （SQLite 允许 ADD COLUMN 带 NOT NULL，前提是有字面 DEFAULT）
        dp_task_cols = [r["name"] for r in conn.execute("PRAGMA table_info(dp_tasks)").fetchall()]
        if "done" not in dp_task_cols:
            conn.execute("ALTER TABLE dp_tasks ADD COLUMN done INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dp_common_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT DEFAULT '',
                detail TEXT DEFAULT '',
                duration_min INTEGER DEFAULT 30,
                kind TEXT DEFAULT 'task',
                created_at TEXT DEFAULT (datetime('now'))
            )
            """
        )


# ---------- 请求模型 ----------
class UserCreate(BaseModel):
    name: str


class PlanCreate(BaseModel):
    user_id: int
    plan_date: str
    day_label: str = ""
    first_start: str = "07:00"


class PlanMeta(BaseModel):
    first_start: str | None = "07:00"
    day_label: str | None = ""


class PlanCopy(BaseModel):
    plan_date: str


class TaskItem(BaseModel):
    kind: str = "task"
    title: str = ""
    detail: str = ""
    duration_min: int = 30
    rest_after_min: int = 20
    is_preset: int = 0
    done: int = 0  # 0=未完成 / 1=已完成


class TasksBulk(BaseModel):
    tasks: list[TaskItem] = []


class CommonTaskCreate(BaseModel):
    user_id: int
    title: str = ""
    detail: str = ""
    duration_min: int = 30
    kind: str = "task"


# ---------- 用户 ----------
@router.get("/users")
def list_users():
    with get_conn() as conn:
        rows = conn.execute("SELECT id, name, created_at FROM dp_users ORDER BY id").fetchall()
        return [dict(r) for r in rows]


@router.post("/users")
def create_user(p: UserCreate):
    name = (p.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO dp_users (name) VALUES (?)", (name,))
        return {"id": cur.lastrowid, "name": name}


@router.put("/users/{uid}")
def rename_user(uid: int, p: UserCreate):
    name = (p.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    with get_conn() as conn:
        cur = conn.execute("UPDATE dp_users SET name=? WHERE id=?", (name, uid))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"id": uid, "name": name}


@router.delete("/users/{uid}")
def delete_user(uid: int):
    with get_conn() as conn:
        # 级联删除：计划 + 任务 + 常用任务
        plans = conn.execute("SELECT id FROM dp_plans WHERE user_id=?", (uid,)).fetchall()
        for pl in plans:
            conn.execute("DELETE FROM dp_tasks WHERE plan_id=?", (pl["id"],))
        conn.execute("DELETE FROM dp_plans WHERE user_id=?", (uid,))
        conn.execute("DELETE FROM dp_common_tasks WHERE user_id=?", (uid,))
        cur = conn.execute("DELETE FROM dp_users WHERE id=?", (uid,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {"ok": True}


# ---------- 计划 ----------
@router.get("/plans")
def list_plans(user_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT p.id, p.user_id, p.plan_date, p.day_label, p.first_start,
                   (SELECT COUNT(*) FROM dp_tasks t WHERE t.plan_id=p.id) AS task_count,
                   (SELECT COUNT(*) FROM dp_tasks t WHERE t.plan_id=p.id AND t.done=1) AS done_count
            FROM dp_plans p
            WHERE p.user_id=?
            ORDER BY p.plan_date DESC, p.id DESC
            """,
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/plans")
def create_plan(p: PlanCreate):
    if not p.plan_date:
        raise HTTPException(status_code=400, detail="计划日期不能为空")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO dp_plans (user_id, plan_date, day_label, first_start) VALUES (?, ?, ?, ?)",
            (p.user_id, p.plan_date, p.day_label, p.first_start),
        )
        pid = cur.lastrowid
        row = conn.execute(
            "SELECT id, user_id, plan_date, day_label, first_start FROM dp_plans WHERE id=?",
            (pid,),
        ).fetchone()
        return dict(row)


@router.get("/plans/{pid}")
def get_plan(pid: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, user_id, plan_date, day_label, first_start FROM dp_plans WHERE id=?",
            (pid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="计划不存在")
        tasks = conn.execute(
            "SELECT id, plan_id, position, kind, title, detail, duration_min, "
            "rest_after_min, is_preset, done FROM dp_tasks WHERE plan_id=? ORDER BY position",
            (pid,),
        ).fetchall()
        return {"plan": dict(row), "tasks": [dict(t) for t in tasks]}


@router.put("/plans/{pid}")
def update_plan(pid: int, p: PlanMeta):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM dp_plans WHERE id=?", (pid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="计划不存在")
        fs = p.first_start if p.first_start is not None else "07:00"
        dl = p.day_label if p.day_label is not None else ""
        conn.execute(
            "UPDATE dp_plans SET first_start=?, day_label=?, updated_at=datetime('now') WHERE id=?",
            (fs, dl, pid),
        )
        return {"ok": True}


@router.delete("/plans/{pid}")
def delete_plan(pid: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM dp_plans WHERE id=?", (pid,))
        conn.execute("DELETE FROM dp_tasks WHERE plan_id=?", (pid,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="计划不存在")
        return {"ok": True}


@router.post("/plans/{pid}/copy")
def copy_plan(pid: int, p: PlanCopy):
    if not p.plan_date:
        raise HTTPException(status_code=400, detail="目标日期不能为空")
    with get_conn() as conn:
        src = conn.execute(
            "SELECT user_id, first_start, day_label FROM dp_plans WHERE id=?", (pid,)
        ).fetchone()
        if not src:
            raise HTTPException(status_code=404, detail="源计划不存在")
        cur = conn.execute(
            "INSERT INTO dp_plans (user_id, plan_date, day_label, first_start) VALUES (?, ?, ?, ?)",
            (src["user_id"], p.plan_date, src["day_label"], src["first_start"]),
        )
        new_id = cur.lastrowid
        tasks = conn.execute(
            "SELECT kind, title, detail, duration_min, rest_after_min, is_preset "
            "FROM dp_tasks WHERE plan_id=? ORDER BY position",
            (pid,),
        ).fetchall()
        for i, t in enumerate(tasks):
            # 注意：不复制 done——新的一天从「全部未完成」开始
            conn.execute(
                "INSERT INTO dp_tasks (plan_id, position, kind, title, detail, "
                "duration_min, rest_after_min, is_preset) VALUES (?,?,?,?,?,?,?,?)",
                (
                    new_id,
                    i,
                    t["kind"],
                    t["title"],
                    t["detail"],
                    t["duration_min"],
                    t["rest_after_min"],
                    t["is_preset"],
                ),
            )
        return {"id": new_id}


# ---------- 任务（整体替换，前端持有顺序） ----------
@router.put("/plans/{pid}/tasks")
def save_tasks(pid: int, p: TasksBulk):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM dp_plans WHERE id=?", (pid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="计划不存在")
        conn.execute("DELETE FROM dp_tasks WHERE plan_id=?", (pid,))
        for i, t in enumerate(p.tasks):
            conn.execute(
                "INSERT INTO dp_tasks (plan_id, position, kind, title, detail, "
                "duration_min, rest_after_min, is_preset, done) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    pid,
                    i,
                    t.kind,
                    t.title,
                    t.detail,
                    t.duration_min,
                    t.rest_after_min,
                    t.is_preset,
                    1 if t.done else 0,
                ),
            )
        return {"ok": True, "count": len(p.tasks)}


# ---------- 常用任务 ----------
@router.get("/common_tasks")
def list_common(user_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, user_id, title, detail, duration_min, kind "
            "FROM dp_common_tasks WHERE user_id=? ORDER BY id",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/common_tasks")
def create_common(p: CommonTaskCreate):
    title = (p.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="常用任务标题不能为空")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO dp_common_tasks (user_id, title, detail, duration_min, kind) "
            "VALUES (?,?,?,?,?)",
            (p.user_id, title, p.detail, p.duration_min, p.kind),
        )
        return {
            "id": cur.lastrowid,
            "user_id": p.user_id,
            "title": title,
            "detail": p.detail,
            "duration_min": p.duration_min,
            "kind": p.kind,
        }


@router.put("/common_tasks/{cid}")
def update_common(cid: int, p: CommonTaskCreate):
    title = (p.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="常用任务标题不能为空")
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE dp_common_tasks SET title=?, detail=?, duration_min=?, kind=? WHERE id=?",
            (title, p.detail, p.duration_min, p.kind, cid),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="常用任务不存在")
        return {"ok": True}


@router.delete("/common_tasks/{cid}")
def delete_common(cid: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM dp_common_tasks WHERE id=?", (cid,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="常用任务不存在")
        return {"ok": True}
