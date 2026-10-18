"""mini_tools 后端：通用实验记录接口 + 工具注册表服务。

路由：
  GET  /api/tools                  返回 tools.json（中心导航用）
  POST /api/experiments            保存一条实验记录
  GET  /api/experiments/{tool_id}  按工具查询记录
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json

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

TOOLS_PATH = Path(__file__).resolve().parent.parent / "tools.json"


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
