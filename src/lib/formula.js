// מעריך נוסחאות אריתמטי בטוח (ללא eval/Function).
// תומך: הפניות לעמודות בצורת {שם עמודה}, מספרים עשרוניים, + - * / וסוגריים.
// computeFormula(formulaStr, getNumber) -> Number, או '' אם ריק/לא תקין.
export function computeFormula(formulaStr, getNumber) {
  if (!formulaStr || typeof formulaStr !== 'string' || !formulaStr.trim()) return ''
  try {
    const tokens = tokenize(formulaStr, getNumber)
    if (!tokens.length) return ''
    const result = parseExpr(tokens, { i: 0 })
    if (!Number.isFinite(result)) return ''
    return result
  } catch {
    return ''
  }
}

function tokenize(str, getNumber) {
  const tokens = []
  let i = 0
  while (i < str.length) {
    const c = str[i]
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '{') {
      const end = str.indexOf('}', i)
      if (end === -1) throw new Error('unterminated ref')
      const name = str.slice(i + 1, end).trim()
      const n = Number(getNumber(name))
      tokens.push({ t: 'num', v: Number.isFinite(n) ? n : 0 })
      i = end + 1
      continue
    }
    if ('+-*/()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i
      while (j < str.length && ((str[j] >= '0' && str[j] <= '9') || str[j] === '.')) j++
      tokens.push({ t: 'num', v: Number(str.slice(i, j)) })
      i = j
      continue
    }
    throw new Error('bad char: ' + c)
  }
  return tokens
}

// פירוק רקורסיבי: expr -> term (('+'|'-') term)* ; term -> factor (('*'|'/') factor)*
function parseExpr(tokens, st) {
  let val = parseTerm(tokens, st)
  while (st.i < tokens.length && (tokens[st.i].v === '+' || tokens[st.i].v === '-')) {
    const op = tokens[st.i++].v
    const rhs = parseTerm(tokens, st)
    val = op === '+' ? val + rhs : val - rhs
  }
  return val
}

function parseTerm(tokens, st) {
  let val = parseFactor(tokens, st)
  while (st.i < tokens.length && (tokens[st.i].v === '*' || tokens[st.i].v === '/')) {
    const op = tokens[st.i++].v
    const rhs = parseFactor(tokens, st)
    val = op === '*' ? val * rhs : val / rhs
  }
  return val
}

function parseFactor(tokens, st) {
  const tok = tokens[st.i]
  if (!tok) throw new Error('unexpected end')
  if (tok.v === '-') { st.i++; return -parseFactor(tokens, st) }
  if (tok.v === '+') { st.i++; return parseFactor(tokens, st) }
  if (tok.v === '(') {
    st.i++
    const val = parseExpr(tokens, st)
    if (!tokens[st.i] || tokens[st.i].v !== ')') throw new Error('missing )')
    st.i++
    return val
  }
  if (tok.t === 'num') { st.i++; return tok.v }
  throw new Error('unexpected token')
}
