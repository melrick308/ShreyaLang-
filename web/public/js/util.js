// Shared helpers.

export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || word + "s"}`;
}

// The compiler counts columns in bytes (UTF-8); the editor works in JS string
// indices. Returns the 0-based string index of 1-based byte column `col`.
export function charIndex(lineText, col) {
  let byte = 1;
  let i = 0;
  for (const ch of lineText) {
    if (byte >= col) return i;
    const cp = ch.codePointAt(0);
    byte += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += ch.length;
  }
  return i;
}

// Longest-common-subsequence diff of two string arrays.
// Returns [{type: "same"|"removed"|"added", a, b}] with indices into the inputs.
export function diffLines(left, right) {
  const n = left.length;
  const m = right.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) out.push({ type: "same", a: i++, b: j++ });
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: "removed", a: i++ });
    else out.push({ type: "added", b: j++ });
  }
  while (i < n) out.push({ type: "removed", a: i++ });
  while (j < m) out.push({ type: "added", b: j++ });
  return out;
}

// Token kind -> highlighting category.
const TOKEN_CATEGORY = {
  LET: "kw", IF: "kw", ELSE: "kw", WHILE: "kw", PRINT: "kw",
  INT: "type", FLOAT: "type", BOOL: "type", STRING: "type",
  TRUE: "bool", FALSE: "bool",
  IDENT: "ident",
  INT_LIT: "num", FLOAT_LIT: "num",
  STRING_LIT: "str",
  PLUS: "op", MINUS: "op", STAR: "op", SLASH: "op", PERCENT: "op",
  LT: "op", LE: "op", GT: "op", GE: "op", EQ: "op", NE: "op",
  AND: "op", OR: "op", NOT: "op", ASSIGN: "op",
  LPAREN: "punct", RPAREN: "punct", LBRACE: "punct", RBRACE: "punct",
  SEMICOLON: "punct", COLON: "punct", COMMA: "punct",
  EOF: "eof",
};

export const CATEGORY_LABEL = {
  kw: "Keyword",
  type: "Type keyword",
  bool: "Boolean literal",
  ident: "Identifier",
  num: "Number literal",
  str: "String literal",
  op: "Operator",
  punct: "Punctuation",
  eof: "End of input",
};

export function tokenCategory(kind) {
  return TOKEN_CATEGORY[kind] || "punct";
}

export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

// Pretty-printed, syntax-coloured JSON as HTML.
export function jsonHtml(value) {
  const text = JSON.stringify(value, null, 2);
  return esc(text).replace(
    /(&quot;(?:\\&quot;|\\.|[^&\\]|&(?!quot;))*&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, str, colon, bool) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (bool) return `<span class="j-bool">${match}</span>`;
      if (match === "null") return `<span class="j-null">null</span>`;
      return `<span class="j-num">${match}</span>`;
    }
  );
}
