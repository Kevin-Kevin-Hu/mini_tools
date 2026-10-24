// ============================================================
// 新工具模板 —— 复制本文件改名后开始写，可少踩几个坑
//
// 完整步骤（详见 README「如何新增一个工具」）：
//   1. 复制本文件为 src/tools/YourTool.jsx，并把下面的函数名改掉
//   2. 如有纯逻辑，另建 src/tools/yourToolLogic.js（纯函数，方便单测）
//      并在 tests/ 下加 yourToolLogic.test.js
//   3. 在 src/pages/ToolPage.jsx 的 COMPONENTS 里登记 id → 组件（**别漏这步**）
//   4. 在 backend/tools.json 增加一条注册信息
//   5. 后端无需改动
//
// 约定：
//   - 组件接收 tool 属性（来自 tools.json 的一条记录）
//   - **不要**自己套 <div className="wrap">，页面外壳（含返回首页）由 ToolPage 统一提供
//   - 通用样式用 shared/base.css 里的类（.card / .btn / .row / .mini / .hint / .stepnum …）
//   - 本工具独有的样式，新建同名 YourTool.css 并在本文件 import
//   - 需要孩子点选输入时，参考 EqualSubstitution 的「操作区键盘」做法（不依赖键盘）
// ============================================================
import { useState } from "react";
import { useExperiment } from "../shared/useExperiment.js";
// import './YourTool.css'

export default function YourTool({ tool }) {
  // 通用实验记录：完成时调用 record(params, result, steps)，自动存后端
  const { saved, record } = useExperiment(tool.id);

  const [done, setDone] = useState(false);

  function handleFinish() {
    setDone(true);
    record({/* 题目参数 */}, "答案描述", 1);
  }

  return (
    <>
      <h1>{tool.title}</h1>
      <p className="sub">一句话说明这个工具帮孩子搞懂什么。</p>

      <section className="card">
        <h2>
          <span className="stepnum">1</span> 第一步小标题
        </h2>
        {/* 交互内容 */}
        <div className="row">
          <button className="btn primary" onClick={handleFinish}>
            完成
          </button>
        </div>
      </section>

      {done && (
        <div className="done">完成！{saved && <span className="saved"> · 已保存 ✓</span>}</div>
      )}
    </>
  );
}
