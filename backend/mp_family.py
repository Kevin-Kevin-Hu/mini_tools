"""小程序用户域：微信登录 + 家庭制。

设计（用户明确的产品原则）：
  - **用户与家庭绑定**：家庭是使用资格与管理关系的单位（家庭码共享、成员可见）。
  - **数据只与用户自己的身份标识绑定**：孩子(dp_users)、计划、常用任务全部归属
    创建它们的微信用户（dp_users.mp_user_id）。加入/退出/更换家庭都不影响数据
    归属；家庭成员之间**不共享**数据。
  - 微信登录：wx.login() code → code2Session 换 openid（AppSecret 只存后端，
    见 mp_secrets.py，已 gitignore）。
  - 会话：无状态 token = "{uid}.{hmac_sha256(SEED,'u:{uid}')[:24]}"，请求带
    X-MP-Token 头校验，不引入额外依赖。
  - 开发旁路：仅当 WX_APP_SECRET 未配置（或显式 WX_DEV_BYPASS=1）时，
    code 形如 "dev-xxx" 可直接作为 openid 登录，方便本地无微信环境调试。
"""

import hashlib
import hmac
import json
import os
import random
import re
import sqlite3
import urllib.request
from pathlib import Path

from db import get_conn
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

try:  # 部署时随包上传；缺失则进入开发旁路
    from mp_secrets import WX_APP_SECRET, WX_APPID
except ImportError:  # pragma: no cover
    WX_APPID = os.environ.get("WX_APPID", "")
    WX_APP_SECRET = os.environ.get("WX_APP_SECRET", "")

_here = Path(__file__).resolve().parent
SEED_FILE = _here / "mp_token_seed"  # 换 seed 可使全部旧 token 失效
if not SEED_FILE.exists():
    SEED_FILE.write_text("".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=32)))
SEED = SEED_FILE.read_text().strip()

# 开发旁路：secret 缺失，或显式设置 WX_DEV_BYPASS=1
DEV_BYPASS = (not WX_APP_SECRET) or os.environ.get("WX_DEV_BYPASS") == "1"

router = APIRouter(prefix="/api/mp")


# ---------- 建表（加性） ----------
def init_mp_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mp_families (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS mp_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                openid TEXT NOT NULL UNIQUE,
                nickname TEXT NOT NULL DEFAULT '',
                family_id INTEGER,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )"""
        )
        # dp_users 的数据归属：mp_user_id = 创建它的微信用户（与家庭无关）
        cols = [d[1] for d in conn.execute("PRAGMA table_info(dp_users)")]
        if "mp_user_id" not in cols:
            conn.execute("ALTER TABLE dp_users ADD COLUMN mp_user_id INTEGER")


# ---------- token ----------
def _sign(uid: int) -> str:
    return hmac.new(SEED.encode(), f"u:{uid}".encode(), hashlib.sha256).hexdigest()[:24]


def _make_token(uid: int) -> str:
    return f"{uid}.{_sign(uid)}"


def _uid_from_token(token: str) -> int:
    m = re.fullmatch(r"(\d+)\.([0-9a-f]{24})", token or "")
    if not m or not hmac.compare_digest(_sign(int(m.group(1))), m.group(2)):
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return int(m.group(1))


async def _current_user(request: Request) -> sqlite3.Row:
    uid = _uid_from_token(request.headers.get("X-MP-Token", ""))
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (uid,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="用户不存在，请重新登录")
    return row


def _family_of(family_id):
    if not family_id:
        return None
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        f = conn.execute("SELECT * FROM mp_families WHERE id=?", (family_id,)).fetchone()
    return dict(f) if f else None


def _me_payload(row: sqlite3.Row) -> dict:
    fam = _family_of(row["family_id"])
    members = []
    if fam:
        with get_conn() as conn:
            conn.row_factory = sqlite3.Row
            members = [
                dict(r)
                for r in conn.execute(
                    "SELECT id, nickname, created_at FROM mp_users WHERE family_id=? ORDER BY id",
                    (fam["id"],),
                )
            ]
    return {
        "user": {"id": row["id"], "nickname": row["nickname"], "family_id": row["family_id"]},
        "family": fam,
        "members": members,
    }


def _new_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉易混淆的 I/O/0/1
    while True:
        code = "".join(random.choices(alphabet, k=6))
        with get_conn() as conn:
            if not conn.execute("SELECT 1 FROM mp_families WHERE code=?", (code,)).fetchone():
                return code


# ---------- 登录 ----------
class LoginIn(BaseModel):
    code: str


@router.post("/login")
async def login(p: LoginIn):
    if DEV_BYPASS and p.code.startswith("dev-"):
        openid = p.code  # 本地调试：直接把 code 当 openid
    else:
        if not (WX_APPID and WX_APP_SECRET):
            raise HTTPException(status_code=500, detail="服务端未配置微信凭证")
        url = (
            "https://api.weixin.qq.com/sns/jscode2session"
            f"?appid={WX_APPID}&secret={WX_APP_SECRET}"
            f"&js_code={p.code}&grant_type=authorization_code"
        )
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                data = json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"微信服务不可达：{e}") from e
        if data.get("errcode"):
            raise HTTPException(
                status_code=401, detail=f"微信登录失败：{data.get('errcode')} {data.get('errmsg')}"
            )
        openid = data["openid"]

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM mp_users WHERE openid=?", (openid,)).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO mp_users (openid, nickname) VALUES (?, ?)", (openid, "微信用户")
            )
            uid = cur.lastrowid
        else:
            uid = row["id"]
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (uid,)).fetchone()
    return {**_me_payload(row), "token": _make_token(uid)}


# ---------- 我的 ----------
@router.get("/me")
async def me(request: Request):
    row = await _current_user(request)
    return _me_payload(row)


class NicknameIn(BaseModel):
    nickname: str


@router.put("/me")
async def update_me(request: Request, p: NicknameIn):
    row = await _current_user(request)
    nick = (p.nickname or "").strip()[:20]
    if not nick:
        raise HTTPException(status_code=400, detail="昵称不能为空")
    with get_conn() as conn:
        conn.execute("UPDATE mp_users SET nickname=? WHERE id=?", (nick, row["id"]))
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (row["id"],)).fetchone()
    return _me_payload(row)


# ---------- 家庭（只管「资格与关系」，不碰数据归属） ----------
class FamilyNameIn(BaseModel):
    name: str


@router.post("/family")
async def create_family(request: Request, p: FamilyNameIn):
    row = await _current_user(request)
    if row["family_id"]:
        raise HTTPException(status_code=400, detail="已在家庭中，请先退出再加入其他家庭")
    name = (p.name or "").strip()[:20]
    if not name:
        raise HTTPException(status_code=400, detail="家庭名称不能为空")
    code = _new_code()
    with get_conn() as conn:
        fid = conn.execute(
            "INSERT INTO mp_families (name, code) VALUES (?, ?)", (name, code)
        ).lastrowid
        conn.execute("UPDATE mp_users SET family_id=? WHERE id=?", (fid, row["id"]))
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (row["id"],)).fetchone()
    return _me_payload(row)


class JoinIn(BaseModel):
    code: str


@router.post("/family/join")
async def join_family(request: Request, p: JoinIn):
    row = await _current_user(request)
    if row["family_id"]:
        raise HTTPException(status_code=400, detail="已在家庭中，请先退出再加入其他家庭")
    code = (p.code or "").strip().upper()
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        fam = conn.execute("SELECT * FROM mp_families WHERE code=?", (code,)).fetchone()
    if fam is None:
        raise HTTPException(status_code=404, detail="家庭码不存在，请核对后重试")
    with get_conn() as conn:
        conn.execute("UPDATE mp_users SET family_id=? WHERE id=?", (fam["id"], row["id"]))
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (row["id"],)).fetchone()
    return _me_payload(row)


@router.put("/family")
async def rename_family(request: Request, p: FamilyNameIn):
    row = await _current_user(request)
    if not row["family_id"]:
        raise HTTPException(status_code=400, detail="尚未加入家庭")
    name = (p.name or "").strip()[:20]
    if not name:
        raise HTTPException(status_code=400, detail="家庭名称不能为空")
    with get_conn() as conn:
        conn.execute("UPDATE mp_families SET name=? WHERE id=?", (name, row["family_id"]))
    return _me_payload(row)


@router.post("/family/leave")
async def leave_family(request: Request):
    row = await _current_user(request)
    if not row["family_id"]:
        raise HTTPException(status_code=400, detail="尚未加入家庭")
    with get_conn() as conn:
        conn.execute("UPDATE mp_users SET family_id=NULL WHERE id=?", (row["id"],))
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM mp_users WHERE id=?", (row["id"],)).fetchone()
    return _me_payload(row)


# ---------- 孩子用户：只归属当前微信用户（mp_user_id），与家庭无关 ----------
@router.get("/users")
async def list_my_users(request: Request):
    row = await _current_user(request)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM dp_users WHERE mp_user_id=? ORDER BY id",
            (row["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


class KidCreate(BaseModel):
    name: str


@router.post("/users")
async def create_my_user(request: Request, p: KidCreate):
    row = await _current_user(request)
    name = (p.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="名字不能为空")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO dp_users (name, mp_user_id) VALUES (?, ?)", (name, row["id"])
        )
        uid = cur.lastrowid
    with get_conn() as conn:
        r = conn.execute("SELECT id, name, created_at FROM dp_users WHERE id=?", (uid,)).fetchone()
    return dict(r)


def _own_kid(kid_id: int, mp_uid: int) -> bool:
    with get_conn() as conn:
        r = conn.execute("SELECT mp_user_id FROM dp_users WHERE id=?", (kid_id,)).fetchone()
    return bool(r and r[0] == mp_uid)


@router.put("/users/{kid_id}")
async def rename_my_user(request: Request, kid_id: int, p: KidCreate):
    row = await _current_user(request)
    if not _own_kid(kid_id, row["id"]):
        raise HTTPException(status_code=404, detail="用户不存在")
    name = (p.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="名字不能为空")
    with get_conn() as conn:
        conn.execute("UPDATE dp_users SET name=? WHERE id=?", (name, kid_id))
    return {"ok": True}


@router.delete("/users/{kid_id}")
async def delete_my_user(request: Request, kid_id: int):
    row = await _current_user(request)
    if not _own_kid(kid_id, row["id"]):
        raise HTTPException(status_code=404, detail="用户不存在")
    with get_conn() as conn:
        # 与网页版删除用户一致：级联清理计划与常用任务
        conn.execute("DELETE FROM dp_common_tasks WHERE user_id=?", (kid_id,))
        plan_ids = [
            r[0]
            for r in conn.execute("SELECT id FROM dp_plans WHERE user_id=?", (kid_id,)).fetchall()
        ]
        for pid in plan_ids:
            conn.execute("DELETE FROM dp_tasks WHERE plan_id=?", (pid,))
        conn.execute("DELETE FROM dp_plans WHERE user_id=?", (kid_id,))
        conn.execute("DELETE FROM dp_users WHERE id=?", (kid_id,))
    return {"ok": True}
