"""mini_tools 后端：通用实验记录接口 + 工具注册表服务 + 静态前端托管。

为便于部署成"单端口 HTTP 服务"：构建后的前端产物放在 backend/static，
由本服务直接托管（线上前后端同源，不再需要 /api 代理）。

路由：
  GET  /api/tools                  返回 tools.json（中心导航用）
  POST /api/experiments            保存一条实验记录
  GET  /api/experiments/{tool_id}  按工具查询记录
  GET  /                           静态前端首页（index.html）
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import json
import os

from db import init_db, add_experiment, list_experiments

app = FastAPI(title="mini_tools backend")

# 本地开发允许跨域（前端 Vite 5173 调后端 8000）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

HERE = Path(__file__).resolve().parent
STATIC_DIR = HERE / "static"
# 工具注册表：优先本目录（部署时只上传 backend/），其次仓库根
TOOLS_PATH = HERE / "tools.json"
if not TOOLS_PATH.exists():
    TOOLS_PATH = HERE.parent / "tools.json"


class ExperimentIn(BaseModel):
    tool_id: str
    params: object = ""
    result: str = ""
    steps: int = 0
    student: str = "匿名"


@app.get("/api/tools")
def get_tools():
    if TOOLS_PATH.exists():
        return json.loads(TOOLS_PATH.read_text(encoding="utf-8"))
    return []


@app.post("/api/experiments")
def create_experiment(payload: ExperimentIn):
    if not payload.tool_id:
        raise HTTPException(status_code=400, detail="tool_id 不能为空")
    params_str = (
        json.dumps(payload.params, ensure_ascii=False)
        if isinstance(payload.params, (dict, list))
        else str(payload.params)
    )
    rid = add_experiment(
        payload.tool_id, params_str, payload.result, payload.steps, payload.student
    )
    return {"id": rid}


@app.get("/api/experiments/{tool_id}")
def read_experiments(tool_id: str):
    return list_experiments(tool_id)


# ---------- 静态前端托管 ----------
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/")
def index():
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return {"msg": "mini_tools 后端已启动；前端尚未构建（npm run build）"}


# 前端用 HashRouter，路由都在 # 后面；这里兜底回首页，避免刷新 404
@app.get("/{full_path:path}")
def spa(full_path: str):
    idx = STATIC_DIR / "index.html"
    if idx.exists():
        return FileResponse(idx)
    raise HTTPException(status_code=404, detail="未找到资源")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
