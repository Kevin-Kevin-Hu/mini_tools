import { useRef, useState } from 'react'
import { saveExperiment } from '../api.js'

// 通用实验记录 hook：解题完成时调用 record()，自动 POST 到后端。
// 用 ref 防止重复记录（React StrictMode 下 effect 会跑两次）。
export function useExperiment(toolId) {
  const [saved, setSaved] = useState(false)
  const done = useRef(false)
  const student =
    typeof localStorage !== 'undefined'
      ? (() => {
          let s = localStorage.getItem('mini_student')
          if (!s) {
            s = '学生' + Math.floor(Math.random() * 9000 + 1000)
            localStorage.setItem('mini_student', s)
          }
          return s
        })()
      : '匿名'

  async function record(params, result, stepsCount) {
    if (done.current) return
    done.current = true
    try {
      await saveExperiment({
        tool_id: toolId,
        params,
        result,
        steps: stepsCount,
        student,
      })
      setSaved(true)
    } catch (e) {
      done.current = false // 失败允许重试
      console.error('记录实验失败', e)
    }
  }

  function reset() {
    done.current = false
    setSaved(false)
  }

  return { saved, record, reset, student }
}
