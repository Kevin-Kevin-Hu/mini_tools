# mini_tools

一个**中心化的可视化教学工具仓库**，帮助小学生把数学、科学等抽象难懂的知识点，用动态图形讲明白。

> 设计原则：每个工具自包含，但共享同一套导航 / 样式 / 注册机制。新增工具只需在 `tools.json` 注册一行 + 加一个组件，后端零改动。

## 目录结构

```
mini_tools/
├── frontend/              # Vite + React 前端
│   ├── src/
│   │   ├── pages/         # Hub（中心导航）、ToolPage（工具页路由）
│   │   ├── tools/         # 各工具组件 + 纯逻辑模块
│   │   │   ├── _Template.jsx           # 新工具模板（从这里复制起步）
│   │   │   ├── EqualSubstitution.jsx   # 等量代换工具
│   │   │   ├── EqualSubstitution.css   # 该工具私有样式
│   │   │   └── equalSubLogic.js        # 等量代换核心纯函数（已单测）
│   │   ├── shared/        # useExperiment（通用实验记录 hook）、base.css（通用样式）
│   ├── tests/             # 纯逻辑单测（npm test，node 内置 test runner）
│   │   ├── api.js         # 调后端
│   │   ├── App.jsx        # HashRouter
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js     # /api 代理到后端 8000
├── backend/               # FastAPI + SQLite（通用实验记录），部署时唯一上传目录
│   ├── main.py            # GET /api/tools、POST /api/experiments、GET /api/experiments/{id}
│   │                      # 同时托管构建后的静态前端（单端口 HTTP 服务）
│   ├── db.py              # SQLite 建表与读写
│   ├── tools.json         # 工具注册表（Hub 经 /api/tools 读取，按学科分组）
│   ├── static/            # 前端构建产物（npm run build 输出到这里，已 gitignore）
│   └── requirements.txt
└── web/                   # 单文件独立原型（无需构建，直接浏览器打开）
    └── equal-substitution.html
```

## 本地运行

### 1. 后端（FastAPI + SQLite）

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. 前端（Vite + React）

```bash
cd frontend
npm install
npm run dev          # 开发：http://localhost:5173（自动把 /api 代理到 8000）
```

`npm run build` 的产物直接输出到 `backend/static/`，由后端托管——**线上是"一个 Python 服务 = 一个端口"**，前后端同源，不需要额外代理。

## 线上站点

- 分享链接：https://visual-teaching-tools.app.workbuddy.host/

重新发布（覆盖线上内容）：对 `backend/` 目录执行发布即可；发布前记得先 `cd frontend && npm run build`，让 `backend/static/` 带上最新前端产物。

## 已实现的工具：等量代换

把混合图形像解方程一样一步步等价替换，理解符号之间的等量关系。

- **题目构建**：输入形状、多条等量关系（支持 `+ −`）、求解问题（左右都可含运算、`?` 表示未知）。
- **阶梯求解**：点选图形做等价转换；支持**部分选中**（同一组图形可只换其中几个，拆成多步）。
- **步骤可视化**：相邻两步用箭头连接，被换掉=橙、换进来=绿，文字说明用了哪条规则。
- **移动端适配**：≤560px 布局、加大点按区、禁用双击缩放。
- **后端记录**：每道题解完自动保存（形状/关系/题目/答案/步数），便于回看薄弱点。

## 如何新增一个工具

推荐从模板起步：`cp frontend/src/tools/_Template.jsx frontend/src/tools/YourTool.jsx`

1. **写组件**：`frontend/src/tools/YourTool.jsx`
   - 接收 `tool` 属性（即 `tools.json` 里的一条记录）
   - **不要**自己套 `<div className="wrap">`——页面外壳（版式 + 返回首页）由 `ToolPage` 统一提供
   - 通用样式直接用 `shared/base.css` 里的类（`.card` `.btn` `.row` `.mini` `.hint` `.stepnum` `.done` `.sym-input`）
   - 本工具独有的样式 → 新建同目录 `YourTool.css` 并在组件里 `import './YourTool.css'`，**不要**写进 `base.css`（避免类名冲突）
2. **登记组件**：在 `frontend/src/pages/ToolPage.jsx` 的 `COMPONENTS` 里加一行 `'your-tool-id': YourTool`。
   ⚠️ **这步最容易漏**：漏了会显示「该工具尚未实现组件」。
3. **注册信息**：在 `backend/tools.json` 增加一条
   ```json
   { "id": "your-tool-id", "title": "工具名", "subject": "数学", "grade": "小学低段", "summary": "一句话说明" }
   ```
   - 只有 `id` / `title` / `subject` / `grade` / `summary` 会被用到（Hub 按 `subject` 分组，链接固定为 `/tool/{id}`）
   - `id` 必须与第 2 步 `COMPONENTS` 的 key **完全一致**
4. **后端无需改动**（实验记录接口与具体工具解耦）。

### 可选但推荐
- **抽纯逻辑**：把可计算的部分放进 `frontend/src/tools/yourToolLogic.js`（纯函数、无 DOM），并在 `frontend/tests/yourToolLogic.test.js` 写单测。跑 `npm test` 验证。
- **记录实验**：组件里用 `useExperiment(tool.id)`，完成时 `record(params, result, steps)` 自动存后端。

## 前端约定速查

| 事项 | 约定 |
|---|---|
| 样式 | 通用 → `shared/base.css`；工具私有 → 同目录 `Xxx.css` |
| 页面外壳 | `ToolPage` 提供 `.wrap` + 返回首页；工具组件只渲染内容 |
| 纯逻辑 | 放 `src/tools/xxxLogic.js`，单测放 `tests/` |
| 测试 | `cd frontend && npm test`（node 内置 test runner，零依赖） |
| 符号输入 | 输入图形/符号的框加 `className="sym-input"`（更大字号与字距） |
| 非 ASCII 符号 | **一律按码点处理**：用 `Array.from()`，不要用 `str[i]` / `.length === 1`（emoji 的 length 是 2） |

## `web/` 目录的定位

`web/equal-substitution.html` 是**最早的单文件原型**，用于快速验证交互，已归档、**不再同步新功能**（React 版 `frontend/src/tools/EqualSubstitution.jsx` 才是正式实现）。新工具不需要在 `web/` 下再写一份。
