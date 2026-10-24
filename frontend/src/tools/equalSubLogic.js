// 等量代换核心逻辑（纯函数，无 DOM 依赖）。
// 从单文件原型移植，已用 WebKit 点击流程验证三道例题（5/1/1）。

export const isOpChar = (c) => ['+', '-', '−', '×', '*'].includes(c)

// "☆☆+○○" → [{t:'grp',sym:'☆',n:2}, {t:'op',v:'+'}, {t:'grp',sym:'○',n:2}]
// 注意：按「码点」遍历而非 UTF-16 码元，否则 🍎 这类 emoji（代理对，length=2）会被劈成两半。
export function parseExpr(str) {
  const chars = Array.from(str || '')
  const tokens = []
  let i = 0
  while (i < chars.length) {
    const c = chars[i]
    if (isOpChar(c)) {
      tokens.push({ t: 'op', v: c === '-' || c === '−' ? '−' : '+' })
      i++
    } else if (/\s/.test(c)) {
      i++
    } else {
      const sym = c
      let n = 0
      while (i < chars.length && chars[i] === sym && !isOpChar(chars[i])) {
        n++
        i++
      }
      tokens.push({ t: 'grp', sym, n })
    }
  }
  return tokens
}

// 形状列表按「码点」解析：空格只是可选分隔。
// 这样 🍎🍌（连写，emoji 无空格）和 ☆ ○ △（空格分隔）都能识别；
// 旧写法 split(/\s+/).filter(s => s.length === 1) 会把连写符号整组丢弃，
// 也会误伤 emoji（'🍎'.length === 2）。
export function parseShapes(str) {
  return Array.from(
    new Set(Array.from(str || '').filter((c) => !/\s/.test(c) && !isOpChar(c) && c !== '?')),
  )
}

// 把一侧（忽略运算符视作相加）解析为计数 map
export function parseSide(str) {
  const m = {}
  parseExpr(str).forEach((t) => {
    if (t.t === 'grp') m[t.sym] = (m[t.sym] || 0) + t.n
  })
  return m
}

export function mapEq(a, b) {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => a[k] === b[k])
}

export function mapToTokens(map) {
  const out = []
  Object.keys(map).forEach((sym) => {
    if (map[sym] > 0) out.push({ t: 'grp', sym, n: map[sym] })
  })
  return out
}

export function scaleTokens(toks, f) {
  return toks.map((t) => (t.t === 'grp' ? { t: 'grp', sym: t.sym, n: t.n * f } : t))
}

export function tokensToStr(toks) {
  return toks
    .map((t) => (t.t === 'op' ? ' ' + t.v + ' ' : t.sym.repeat(t.n)))
    .join('')
    .trim()
}

export function evalTarget(tokens, target) {
  let total = 0
  let sign = 1
  tokens.forEach((t) => {
    if (t.t === 'op') sign = t.v === '+' ? 1 : -1
    else if (t.sym === target) total += sign * t.n
  })
  return total
}

export function onlyTarget(tokens, target) {
  return tokens.every((t) => t.t === 'op' || t.sym === target)
}

// 解题用"一个一个字符"的模型：☆☆☆ 展开成 3 个独立 ☆，
// 这样才支持"只选其中 2 个先换"，把一次替换拆成多步。
export function expand(tokens) {
  const out = []
  tokens.forEach((t) => {
    if (t.t === 'grp') {
      for (let i = 0; i < t.n; i++) out.push({ t: 'grp', sym: t.sym, n: 1 })
    } else out.push({ t: 'op', v: t.v })
  })
  return out
}

// 同一符号连续区间（可一起被选中）
export function runBounds(tokens, i) {
  const sym = tokens[i].sym
  let a = i
  let b = i
  while (a - 1 >= 0 && tokens[a - 1].t === 'grp' && tokens[a - 1].sym === sym) a--
  while (b + 1 < tokens.length && tokens[b + 1].t === 'grp' && tokens[b + 1].sym === sym) b++
  return { a, b }
}

// 对某个 group（已含选中数量 n）可应用的等价转换
export function applicable(group, rel) {
  const out = []
  const l = parseSide(rel.left)
  const r = parseSide(rel.right)
  const gmap = { [group.sym]: group.n }
  // 整组精确匹配
  if (mapEq(l, gmap)) out.push({ tokens: mapToTokens(r), text: rel.right.trim() })
  if (mapEq(r, gmap)) out.push({ tokens: mapToTokens(l), text: rel.left.trim() })
  // 单边为单一符号（数量=k），按比例换算（n 必须是 k 的整数倍，避免分数）
  const singleFactor = (map, opposite) => {
    const ks = Object.keys(map)
    if (ks.length === 1 && ks[0] === group.sym && map[ks[0]] > 0) {
      const k = map[ks[0]]
      if (group.n % k === 0) {
        const f = group.n / k
        return scaleTokens(parseExpr(opposite), f)
      }
    }
    return null
  }
  const fromLeft = singleFactor(l, rel.right)
  if (fromLeft) out.push({ tokens: fromLeft, text: tokensToStr(fromLeft) })
  const fromRight = singleFactor(r, rel.left)
  if (fromRight) out.push({ tokens: fromRight, text: tokensToStr(fromRight) })
  // 去重
  const seen = new Set()
  const uniq = []
  out.forEach((o) => {
    const k = tokensToStr(o.tokens)
    if (!seen.has(k)) {
      seen.add(k)
      uniq.push(o)
    }
  })
  return uniq
}

// 用"已知侧化简结果 N"与另一侧含 ? 的线性表达式求 ?
export function solveUnknown(otherTokens, N, target) {
  let coef = 0
  let sign = 1
  otherTokens.forEach((t) => {
    if (t.t === 'op') sign = t.v === '+' ? 1 : -1
    else if (t.sym === '?') coef += sign * t.n
  })
  const constVal = evalTarget(otherTokens, target) // ? 不计入，只数目标符号
  if (coef === 0 || coef !== 1) return null
  const val = N - constVal
  return Number.isInteger(val) ? val : null
}
