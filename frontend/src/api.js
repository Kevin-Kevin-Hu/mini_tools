export async function getTools() {
  const r = await fetch('/api/tools')
  if (!r.ok) throw new Error('加载工具列表失败')
  return r.json()
}

export async function saveExperiment(payload) {
  const r = await fetch('/api/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('保存实验记录失败')
  return r.json()
}

export async function getExperiments(toolId) {
  const r = await fetch(`/api/experiments/${encodeURIComponent(toolId)}`)
  if (!r.ok) throw new Error('读取记录失败')
  return r.json()
}
