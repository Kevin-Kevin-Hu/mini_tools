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
| 文件大小 | **单文件 ≤ 500 行**；超限必须拆分（见 §7 已知偏差） |
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

## 6. 微信小程序（`frontend/miniprogram/`）的硬约定

小程序是**独立于网页版**的一套代码（原生微信小程序，不是 Vite 构建），跑在 WorkBuddy 云服务上。

- **云 SDK 必须用「本地内置」，不得写 npm 裸模块名**。
  `utils/cloud.js` 里 `require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')` 这种写法，
  在**微信开发者工具未执行「工具 → 构建 npm」**时会被解析成相对当前文件的路径，报
  `module 'utils/@tencent-ai/...' is not defined`（真机却正常，因为上传的包里已构建过）。
  正确做法：把 SDK 的**官方微信产物**内置到 `frontend/miniprogram/vendor/`，用相对路径 `require`：
  ```bash
  cp frontend/miniprogram/node_modules/@tencent-ai/workbuddy-cloud-sdk/miniprogram_dist/miniprogram.js \
     frontend/miniprogram/vendor/workbuddy-cloud-sdk.js
  ```
  ⚠️ **必须用 `miniprogram_dist/miniprogram.js`（官方给微信的构建），不要用 esbuild 打包
  `lib/miniprogram.cjs`**：`--platform=neutral` 会裁掉 core-js polyfill 依赖的 Node 语义，
  导致 SDK 内置的 URL 实现损坏，运行时抛
  `endpoint must be an absolute URL, received: https://mp-api.app.workbuddy.host`
  —— URL 明明是绝对地址，是 SDK 内部 URL 构造器坏了，**不是配置写错**，极易误判。
  ⚠️ 升级 SDK 版本后必须重新执行上面这条 `cp` 命令，否则内置的是旧版本。
- **小程序后端只有一个入口**：云固定网关 `https://mp-api.app.workbuddy.host`（`utils/cloud.js` 里写死）。
  **不要**改回网页域名 `visual-teaching-tools.app.workbuddy.host`——托管平台会对带
  `MicroMessenger` 的 UA 返回「请在浏览器中打开」的 403 页，而小程序 `wx.request` 必带该 UA，必然 403。
  「不校验合法域名 / 开真机调试」都救不了这一层拦截。
- **不要在 `utils/` 或页面里持有 AppSecret**，登录走 `wx.login` → `cloud.auth.signInWithWechat(code, appid)`。
- **数据隔离靠 RLS**：`owner_id TEXT NOT NULL DEFAULT auth.uid()`，客户端永远不传 `owner_id`。
  ⚠️ `auth.uid()` 返回的是**微信 openid**（形如 `wx:oUG33xfK0b3QDL3CH0HLuddEekdY`），
  **不是** `auth.users.id`——两者不是一回事，写数据/改绑时别搞混。
- 改完小程序代码要用**微信开发者工具重新编译**才生效；真机验证需用户操作，代理无法代替。
- **微信 `<button>` 在 flex 容器里会被默认 `margin-left/right:auto` 撑成整宽并换行**（表现为「上下堆叠、每个占满一行」）。
  多个操作要并排时：优先用 `<view class="act">` 自绘操作块（`dp-select`/`dp-editor` 已采用），
  或给 `.btn` 显式加 `margin-left:0; margin-right:0; flex:0 0 auto; width:auto`（`app.wxss` 已加）。
  改完布局用 Chrome 无头渲染量一遍（`scrollWidth vs clientWidth` 判溢出、比较子元素 `top` 判是否同行）。
- **WXML 改完必须跑标签配对检查**（尤其是删/合并包裹层，肉眼极难发现多一个 `</view>`）：
  ```bash
  python scripts/check_wxml.py --root frontend/miniprogram
  ```
  多一个闭合标签会让编译报 `expect end-tag`，并连带 `[渲染层错误] __route__ is not defined`。
- **组件里不要用「具名插槽」传可选 UI**：`<slot name="x">` 带 `wx:if` / 动态内容时**不渲染**。
  改用「属性 + 子组件自绘」（参考 `components/stepper` 的 `extraText` / `extraBtn`），
  `index.json` 里记得拿掉 `multipleSlots`。
- **组件的自定义事件里读不到父层的 `data-*`**：`triggerEvent` 发出的事件 `e.currentTarget` 是**组件节点**，
  父层标签上的 `data-i` 取不到 → 需要回传下标时必须塞进 `detail`（`triggerEvent("evt", { index })`），父层读 `e.detail.index`。
- **`input` 的 `focus` 属性一旦置回 `false` 就等于主动 blur**：如果你靠某个变量（如 `focusIndex`）驱动它，
  「聚焦后为了防抢焦点再把它复位」会让键盘**弹一下就消失**（2026-10-25 用户反馈的闪烁）。
  要「跳过去就开键盘」就别复位；确需收起键盘时（如切回查看态）再显式置 `-1`。
- **`utils/scrollHelper.js` 的 scroller 会缓存任务的绝对位置**，每次对**新目标**定位前必须
  `this._scroller.reset()`，否则第二次会滚到上一次记住的位置（曾经用 `this._targetAbs = null` 是无效写法）。
- **改完小程序记得跑 `npm run lint`**：`frontend/eslint.config.js` 里有一份专给 `miniprogram/**` 的配置
  （宿主全局 `wx`/`Page`/`Component` + CommonJS + 忽略 `vendor/`）。
  没有它的话 `eslint .` 会对整个小程序目录报 100+ 条 `no-undef` 误报；
  反过来，**新增了浏览器/Node 之外的全局或第三方产物目录时，要同步更新那份 `ignores`**。
  `catch (_e)` 这种「故意吞异常」的写法已被 `caughtErrorsIgnorePattern: '^_'` 豁免。

## 7. 已知偏差（不要当作范本，也不要擅自扩大）
- `backend/daily_plan.py` + 前端 `DailyPlan.*`：**正在开发中（WIP），暂不动**。它目前违反了「后端零改动」原则（自建 4 张私有表 + 私有路由）。这是一个待收敛的反面案例——新增工具**不要**模仿此模式；后续应将其迁回通用接口或明确写入例外。
- `frontend/src/tools/EqualSubstitution.jsx`（≈628 行）：已超过 500 行软上限，是「该拆分」的典型。改动它时优先考虑把渲染/状态拆出去，而不是继续堆长。

## 8. 提交 / 推送

- 影响面大的改动（改名、重构、删功能、改数据库、发布上线）**先与用户确认**，不要自作主张。
- 提交前确保 §5 全部通过；CI 绿了再推。

## 9. 发布流程（覆盖线上站点）

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
