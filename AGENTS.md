# AGENTS.md — 给 AI 编码代理的项目规则

> 本文件是**权威规范**，AI 编码代理（包括本会话的助手）在开始任何改动前必须遵循。
> 面向人类的总体说明在 `README.md`；本文件是给代理的"硬约束"，与 `.github/workflows/ci.yml` 互为补充：
> **AGENTS.md 让代理一开始就不写出违规代码，CI 把它们拦在合并前。**

---

## 1. 项目定位

中心化的**可视化教学工具**仓库，帮小学生用动态图形理解数学/科学难点。
每个工具自包含，但共享同一套导航 / 样式 / 注册机制。新工具 = 加一个组件 + 注册表一行，**后端零改动**。

## 2. 技术栈

- 前端：Vite + React 18 + react-router-dom（HashRouter，`/#/tool/:id`）
- 后端：FastAPI + SQLite（**通用**实验记录接口，与具体工具解耦）
- 单端口部署：前端 `vite build` → `backend/static`，后端托管静态页 + `/api`（支持 `$PORT` + `0.0.0.0` + SPA 兜底）

## 3. 新增工具的标准流程（严格按此执行）

1. `cp frontend/src/tools/_Template.jsx frontend/src/tools/YourTool.jsx`，纯逻辑另建 `yourToolLogic.js`
2. 在 `frontend/src/pages/ToolPage.jsx` 的 `COMPONENTS` 登记 `id → 组件`（**最易漏的一步**）
3. 在 `backend/tools.json` 增加一条 `{id,title,subject,grade,summary}`（`id` 必须与第 2 步 key 完全一致）
4. **后端无需改动**；如需记录实验，用 `shared/useExperiment.js` 的 `useExperiment(tool.id)`

## 4. 硬编码规范（违反即视为 bug）

| 主题 | 规则 |
|---|---|
| 样式分层 | 通用类放 `shared/base.css`；工具私有类放同目录 `YourTool.css` 并 `import`，**禁止写进 base.css**（避免类名冲突） |
| 页面外壳 | `ToolPage` 统一提供 `.wrap` + 返回首页；工具组件**只渲染内容，不自套 `<div className="wrap">`** |
| 纯逻辑 | 可计算部分必须抽成 `src/tools/xxxLogic.js`（纯函数、无 DOM），并在 `tests/` 写 `node --test` 单测 |
| 非 ASCII 符号 | **一律按码点处理**：用 `Array.from()`，禁止 `str[i]` / `.length === 1`（emoji 的 length=2） |
| 组件登记 | 新组件必须进 `ToolPage.jsx` 的 `COMPONENTS`，否则显示「该工具尚未实现组件」 |
| 文件大小 | **单文件 ≤ 500 行**；超限必须拆分（见 §6 已知偏差） |
| 后端范式 | **通用接口优先，禁止为单一工具新建私有表 / 私有路由**。数据走通用 `experiments` 接口；`daily_plan.py` 是反面案例，不要模仿 |
| 重复代码 | 禁止大量复制粘贴；可复用逻辑放 `shared/` 或 `xxxLogic.js`，组件间共享的 UI 抽成小组件 |
| 移动端 | 交互工具考虑手机打开（≤560px 适配、加大点按区、禁用双击缩放） |
| 符号输入 | 输入图形/符号的框加 `className="sym-input"`（更大字号与字距），用「操作区键盘」点击插入而非依赖键盘 |

## 5. 工具链与本地验证（改动后必须跑）

```bash
# 前端（在 frontend/ 下）
npm ci                 # 或 npm install
npm run lint           # ESLint（质量门禁）
npm run format:check   # Prettier 格式一致
npm test               # node --test 单测
npm run build          # 编译，产物进 backend/static（同时验证能编译）

# 后端（在仓库根）
python -m ruff check backend      # lint
python -m ruff format --check backend  # 格式

# 文件大小守卫（所有源码 ≤ 500 行）
python scripts/check_file_size.py
```

CI（`.github/workflows/ci.yml`）在 push / PR 时对前端（lint+format+test+build）、后端（ruff）、文件守卫全部执行。
**任何一步失败都会阻断合并**，所以本地先跑一遍再提交。

## 6. 已知偏差（不要当作范本，也不要擅自扩大）

- `backend/daily_plan.py` + 前端 `DailyPlan.*`：**正在开发中（WIP），暂不动**。它目前违反了「后端零改动」原则（自建 4 张私有表 + 私有路由）。这是一个待收敛的反面案例——新增工具**不要**模仿此模式；后续应将其迁回通用接口或明确写入例外。
- `frontend/src/tools/EqualSubstitution.jsx`（≈628 行）：已超过 500 行软上限，是「该拆分」的典型。改动它时优先考虑把渲染/状态拆出去，而不是继续堆长。

## 7. 提交 / 推送

- 影响面大的改动（改名、重构、删功能、改数据库、发布上线）**先与用户确认**，不要自作主张。
- 提交前确保 §5 全部通过；CI 绿了再推。

## 8. 发布流程（覆盖线上站点）

线上是**单端口服务**：前端 `vite build` 产物进 `backend/static/`，由后端托管静态页 + `/api`，前后端同源。发布 = 把 `backend/` 目录作为服务发上去。

1. **先过质量门禁**：确认 §5 全部通过（或对应 CI 已绿）。
2. **构建前端**：`cd frontend && npm run build`，确认 `backend/static/` 已更新为最新产物。
   ⚠️ 不重新 build 就发布 = 线上跑旧前端，这是最常见的发布事故。
3. **发布**：对 `backend/` 目录执行发布（单端口，服务读 `$PORT`、监听 `0.0.0.0`，SPA 路由有兜底）。
4. **发布后验证**（缺一不可）：
   - 打开站点确认首页能列出工具（`GET /api/tools` 正常）；
   - 逐个点开新工具页面，确认组件有登记、无白屏；
   - 手机宽度（≤560px）下抽查一遍交互。
5. 发布上线属于影响面大的动作——**先与用户确认再执行**；发布结果（线上链接、验证情况）要如实回报。
