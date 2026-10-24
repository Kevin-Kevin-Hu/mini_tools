"""SQLite 持久化：保存每个工具的实验/练习记录（与具体工具解耦）。

表 experiments：
  id       自增主键
  tool_id  工具 id（如 equal-substitution）
  params   题目构建参数（JSON 字符串）
  result   解答结果（文本）
  steps    做的转换步数
  student  学生标识（localStorage 生成）
  ts       记录时间
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "mini_tools.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS experiments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool_id TEXT NOT NULL,
                params TEXT,
                result TEXT,
                steps INTEGER DEFAULT 0,
                student TEXT,
                ts TEXT DEFAULT (datetime('now'))
            )
            """
        )


def add_experiment(tool_id, params, result, steps, student):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO experiments (tool_id, params, result, steps, student) "
            "VALUES (?, ?, ?, ?, ?)",
            (tool_id, params, result, steps, student),
        )
        return cur.lastrowid


def list_experiments(tool_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, tool_id, params, result, steps, student, ts "
            "FROM experiments WHERE tool_id=? ORDER BY id DESC LIMIT 200",
            (tool_id,),
        ).fetchall()
        return [dict(r) for r in rows]
