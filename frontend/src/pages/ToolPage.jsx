import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import EqualSubstitution from '../tools/EqualSubstitution.jsx'
import { getTools } from '../api.js'

// id → 组件映射（新增工具时在此登记；id 必须与 backend/tools.json 里的 id 一致）
const COMPONENTS = {
  'equal-substitution': EqualSubstitution,
}

export default function ToolPage() {
  const { id } = useParams()
  const [tool, setTool] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    getTools()
      .then((list) => {
        const t = list.find((x) => x.id === id)
        if (!t) setErr('未找到工具：' + id)
        else setTool(t)
      })
      .catch((e) => setErr(String(e)))
  }, [id])

  if (err) return <div className="wrap"><p>{err}</p></div>
  if (!tool) return <div className="wrap"><p>加载中…</p></div>

  const C = COMPONENTS[id]
  if (!C) return <div className="wrap"><p>该工具尚未实现组件：{id}</p></div>

  // 统一页面外壳：每个工具都自动获得 .wrap 版式 + 返回首页入口，
  // 工具组件本身只负责渲染内容（不要再自己套 .wrap）。
  return (
    <div className="wrap">
      <div className="toolbar">
        <Link className="back-link" to="/">← 全部工具</Link>
      </div>
      <C tool={tool} />
    </div>
  )
}
