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
│   │   │   ├── EqualSubstitution.jsx   # 等量代换工具
│   │   │   └── equalSubLogic.js        # 等价代换核心纯函数（已单测）
│   │   ├── shared/        # useExperiment（通用实验记录 hook）、layout.css
│   │   ├── api.js         # 调后端
│   │   ├── App.jsx        # HashRouter
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js     # /api 代理到后端 8000
├── backend/               # FastAPI + SQLite（通用实验记录）
│   ├── main.py            # GET /api/tools、POST /api/experiments、GET /api/experiments/{id}
│   ├── db.py              # SQLite 建表与读写
│   └── requirements.txt
├── tools.json             # 工具注册表（Hub 读取，按学科分组）
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

前端 `npm run build` 产物在 `frontend/dist/`，可静态托管。

## 已实现的工具：等量代换

把混合图形像解方程一样一步步等价替换，理解符号之间的等量关系。

- **题目构建**：输入形状、多条等量关系（支持 `+ −`）、求解问题（左右都可含运算、`?` 表示未知）。
- **阶梯求解**：点选图形做等价转换；支持**部分选中**（同一组图形可只换其中几个，拆成多步）。
- **步骤可视化**：相邻两步用箭头连接，被换掉=橙、换进来=绿，文字说明用了哪条规则。
- **移动端适配**：≤560px 布局、加大点按区、禁用双击缩放。
- **后端记录**：每道题解完自动保存（形状/关系/题目/答案/步数），便于回看薄弱点。

## 如何新增一个工具

1. 在 `frontend/src/tools/` 下新建组件（参考 `EqualSubstitution.jsx`）。
2. 在 `frontend/src/pages/ToolPage.jsx` 的 `COMPONENTS` 映射里登记 `id → 组件`。
3. 在仓库根 `tools.json` 增加一条：`{ "id", "title", "subject", "grade", "summary", "component", "path" }`。
4. 后端**无需改动**（实验记录接口与具体工具解耦）。
