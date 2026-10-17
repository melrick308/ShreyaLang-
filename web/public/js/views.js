// Tab views. Every view renders from the compiler's JSON (ctx.json) only.

import { countNodes, normalize, renderDiagram, renderOutline, treeDepth } from "./ast.js";
import { NODE_INFO, OPCODES, OP_NAMES, PASS_INFO, PHASES, REFERENCE_HTML, TAB_EXPLAIN } from "./explain.js";
import { CATEGORY_LABEL, charIndex, diffLines, esc, jsonHtml, plural, tokenCategory } from "./util.js";

// ---------------------------------------------------------------- shared

function explainBox(ctx, id, title) {
  const open = !ctx.ui.closedExplain.has(id);
  return `<details class="explain" data-explain="${id}" ${open ? "open" : ""}>
    <summary>${esc(title)}<span class="hint">${open ? "click to collapse" : "click to read"}</span></summary>
    <div class="explain-body">${TAB_EXPLAIN[id]}</div>
  </details>`;
}

function wireExplain(el, ctx) {
  el.querySelectorAll("details.explain").forEach((d) => {
    d.addEventListener("toggle", () => {
      const id = d.dataset.explain;
      if (d.open) ctx.ui.closedExplain.delete(id);
      else ctx.ui.closedExplain.add(id);
      const hint = d.querySelector(".hint");
      if (hint) hint.textContent = d.open ? "click to collapse" : "click to read";
      ctx.saveUi();
    });
  });
}

function empty(title, text) {
  return `<div class="empty"><strong>${esc(title)}</strong>${text}</div>`;
}

function stat(value, label, cls = "") {
  return `<div class="stat ${cls}"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
}

function notReached(ctx, phaseId) {
  const stopped = PHASES.find((p) => ctx.phases[p.id].status === "error");
  if (ctx.main && ctx.main.failure) return empty("No result", esc(ctx.main.failure));
  if (stopped) {
    return empty(
      `Not reached: compilation stopped in the ${stopped.name.toLowerCase()} phase`,
      `The ${stopped.name.toLowerCase()} reported an error, so the later phases did not run. <button class="link-btn" data-open-tab="errors">Show errors →</button>`
    );
  }
  return empty("No data", "Run the program to see this phase.");
}

export function errorSnippet(err, lines) {
  if (!err.line || err.line > lines.length) return "";
  const text = lines[err.line - 1].replace(/\t/g, " ");
  const gutter = String(err.line);
  let out = `${esc(gutter)} | ${esc(text)}`;
  if (err.col > 0) {
    const pos = charIndex(lines[err.line - 1], err.col);
    out += `\n${" ".repeat(gutter.length)} | ${" ".repeat(pos)}<span class="caret">^</span>`;
  }
  return `<pre>${out}</pre>`;
}

const locAttrs = (line, col, len) =>
  line ? ` data-line="${line}"${col ? ` data-col="${col}"` : ""}${len ? ` data-len="${len}"` : ""}` : "";

// ---------------------------------------------------------------- phases

export function computePhases(main) {
  const status = Object.fromEntries(PHASES.map((p) => [p.id, { status: "skipped", metric: "not reached" }]));
  const j = main && main.json;
  if (!j) {
    for (const p of PHASES) status[p.id] = { status: "skipped", metric: main && main.failure ? "no result" : "—" };
    return status;
  }
  const count = (cat) => j.errors.filter((e) => e.category === cat).length;
  const tokens = (j.tokens || []).filter((t) => t.kind !== "EOF").length;

  status.lexer = count("Lexical")
    ? { status: "error", metric: plural(count("Lexical"), "error") }
    : { status: "ok", metric: plural(tokens, "token") };

  if (j.ast) status.parser = { status: "ok", metric: plural(countNodes(normalize(j.ast)), "node") };
  else if (count("Syntax")) status.parser = { status: "error", metric: "syntax error" };

  if (count("Semantic")) status.semantic = { status: "error", metric: plural(count("Semantic"), "error") };
  else if (j.symbols) {
    const n = j.symbols.reduce((s, sc) => s + sc.symbols.length, 0);
    status.semantic = { status: "ok", metric: `${plural(n, "symbol")}, ${plural(j.symbols.length, "scope")}` };
  }

  if (j.tac) status.tac = { status: "ok", metric: plural(j.tac.length, "instr") };
  if (j.optimizedTac) status.optimizer = { status: "ok", metric: `${j.tac.length} → ${j.optimizedTac.length}` };

  if (j.optimizedTac) {
    status.vm = count("Runtime")
      ? { status: "error", metric: "runtime error" }
      : { status: "ok", metric: plural(j.steps ?? 0, "step") };
  }
  return status;
}

// ---------------------------------------------------------------- overview

function tacSummary(tac) {
  const temps = new Set();
  let labels = 0;
  for (const ins of tac) {
    if (ins.op === "LABEL") labels++;
    for (const o of [ins.dst, ins.a, ins.b]) if (o && o.kind === "temp") temps.add(o.name);
  }
  return { temps: temps.size, labels };
}

function phaseResult(ctx, id) {
  const j = ctx.json;
  const st = ctx.phases[id].status;
  if (st === "pending") return `<span class="muted">Working…</span>`;
  if (!j) return `<span class="muted">${esc((ctx.main && ctx.main.failure) || "Not run yet.")}</span>`;
  const errs = (cat) => j.errors.filter((e) => e.category === cat);
  if (st === "skipped") return `<span class="muted">Not reached: an earlier phase failed.</span>`;
  switch (id) {
    case "lexer": {
      const n = j.tokens.filter((t) => t.kind !== "EOF").length;
      if (st === "error") return `Found <strong>${plural(errs("Lexical").length, "lexical error")}</strong> (and ${plural(n, "valid token")}).`;
      return `Produced <strong>${plural(n, "token")}</strong> from ${plural(ctx.lines.length, "line")}.`;
    }
    case "parser": {
      if (st === "error") return `<span style="color:var(--red)">${esc(errs("Syntax")[0].text)}</span>`;
      const root = normalize(j.ast);
      return `Built an AST with <strong>${plural(countNodes(root), "node")}</strong> (depth ${treeDepth(root)}) for ${plural(j.ast.body.length, "top-level statement")}.`;
    }
    case "semantic": {
      const syms = j.symbols.reduce((s, sc) => s + sc.symbols.length, 0);
      if (st === "error") return `Found <strong>${plural(errs("Semantic").length, "semantic error")}</strong>. Nothing will be executed.`;
      return `Declared <strong>${plural(syms, "variable")}</strong> in ${plural(j.symbols.length, "scope")}. All names resolve and all types check.`;
    }
    case "tac": {
      const s = tacSummary(j.tac);
      return `Generated <strong>${plural(j.tac.length, "instruction")}</strong> using ${plural(s.temps, "temporary", "temporaries")} and ${plural(s.labels, "label")}.`;
    }
    case "optimizer": {
      const o = j.optimizer;
      const before = j.tac.length, after = j.optimizedTac.length;
      const pct = before ? Math.round((100 * (before - after)) / before) : 0;
      if (!o.fold && !o.propagate && !o.dce) return `All passes are disabled, so the TAC is unchanged.`;
      return `<strong>${before} → ${after}</strong> instructions (${pct}% fewer): ${o.folded} folded, ${o.propagated} propagated, ${o.removed} removed in ${plural(o.rounds, "round")}.`;
    }
    case "vm": {
      const outLines = j.output ? j.output.split("\n").length - 1 : 0;
      if (st === "error") return `Ran ${plural(j.steps, "step")}, then: <span style="color:var(--red)">${esc(errs("Runtime")[0].text)}</span>`;
      return `Executed <strong>${plural(j.steps, "step")}</strong> and printed ${plural(outLines, "line")}.`;
    }
  }
  return "";
}

function summaryBanner(ctx) {
  const m = ctx.main;
  if (!m) return "";
  if (m.failure) return `<div class="banner err"><span class="b-icon">⚠</span><div><strong>The compiler could not finish.</strong><br>${esc(m.failure)}</div></div>`;
  const j = m.json;
  const n = (cat) => j.errors.filter((e) => e.category === cat).length;
  switch (m.exitCode) {
    case 0:
      return `<div class="banner ok"><span class="b-icon">✓</span><div><strong>Compiled and ran successfully</strong> (exit code 0). All six phases completed.</div></div>`;
    case 1:
      return n("Lexical")
        ? `<div class="banner err"><span class="b-icon">✕</span><div><strong>Stopped in the lexer</strong>: ${plural(n("Lexical"), "lexical error")} (exit code 1). The program was not parsed or executed.</div></div>`
        : `<div class="banner err"><span class="b-icon">✕</span><div><strong>Stopped in the parser</strong>: syntax error (exit code 1). The program was not checked or executed.</div></div>`;
    case 2:
      return `<div class="banner err"><span class="b-icon">✕</span><div><strong>Stopped in semantic analysis</strong>: ${plural(n("Semantic"), "error")} (exit code 2). No code was generated or executed.</div></div>`;
    case 3:
      return `<div class="banner warn"><span class="b-icon">!</span><div><strong>Compiled successfully, but execution failed</strong> with a runtime error (exit code 3). Output printed before the error is kept.</div></div>`;
    default:
      return `<div class="banner err"><span class="b-icon">✕</span><div>Exit code ${m.exitCode}.</div></div>`;
  }
}

export function renderOverview(el, ctx) {
  const items = PHASES.map((p, i) => {
    const st = ctx.phases[p.id].status;
    const icon = st === "ok" ? "✓" : st === "error" ? "✕" : i + 1;
    return `<div class="tl-item ${st}">
      <div class="tl-rail"><div class="tl-dot">${icon}</div><div class="tl-line"></div></div>
      <div class="tl-content">
        <div class="tl-head"><h3>${i + 1}. ${esc(p.name)}</h3><span class="chip">${esc(p.tool)}</span>
          <button class="link-btn" data-open-tab="${p.tab}">Open view →</button></div>
        <p>${esc(p.summary)}</p>
        <div class="tl-result">${phaseResult(ctx, p.id)}</div>
      </div>
    </div>`;
  }).join("");

  const cmd = ctx.main && ctx.main.args ? ctx.main.args.join(" ") : "";
  el.innerHTML = `
    ${summaryBanner(ctx)}
    ${explainBox(ctx, "overview", "How a compiler works")}
    <h3 class="section-title">The journey of your program</h3>
    <div class="timeline">${items}</div>
    ${cmd ? `<h3 class="section-title">Command that produced this page</h3>
      <div class="cmd">${esc(cmd)}</div>
      <p class="small muted" style="margin-top:6px">Exit code ${ctx.main.exitCode} · compiled and ran in ${ctx.main.durationMs} ms ·
      a second run with <code>--no-opt</code> took ${ctx.unopt ? ctx.unopt.durationMs : "?"} ms</p>` : ""}`;
}

// ---------------------------------------------------------------- tokens

export function renderTokens(el, ctx) {
  const j = ctx.json;
  if (!j || !j.tokens) return (el.innerHTML = explainBox(ctx, "tokens", "What the lexer does") + notReached(ctx, "lexer"));
  const tokens = j.tokens;
  const lexErrors = j.errors.filter((e) => e.category === "Lexical");
  const cats = [...new Set(tokens.map((t) => tokenCategory(t.kind)))];
  const kinds = new Set(tokens.filter((t) => t.kind !== "EOF").map((t) => t.kind));

  el.innerHTML = `
    ${explainBox(ctx, "tokens", "What the lexer does")}
    ${lexErrors.length ? `<div class="banner err"><span class="b-icon">✕</span><div><strong>${plural(lexErrors.length, "lexical error")}</strong>. The lexer kept scanning after each error, so the valid tokens are still listed. <button class="link-btn" data-open-tab="errors">Show errors →</button></div></div>` : ""}
    <div class="stats">
      ${stat(tokens.length - 1, "tokens (+ EOF)", "accent")}
      ${stat(kinds.size, "distinct kinds")}
      ${stat(ctx.lines.length, "source lines")}
      ${stat(lexErrors.length, "lexical errors", lexErrors.length ? "bad" : "good")}
    </div>
    <div class="filters">
      <button class="filter-btn ${ctx.ui.tokenFilter ? "" : "on"}" data-cat="">All</button>
      ${cats.map((c) => `<button class="filter-btn ${ctx.ui.tokenFilter === c ? "on" : ""}" data-cat="${c}"><span class="t-${c}">●</span> ${esc(CATEGORY_LABEL[c])}</button>`).join("")}
      <span class="spacer"></span>
      <input class="search" type="search" placeholder="Search lexeme or kind…" value="${esc(ctx.ui.tokenSearch || "")}">
    </div>
    <div class="table-wrap"><table class="data"><thead><tr>
      <th class="num-col">#</th><th>Line:Col</th><th>Kind</th><th>Lexeme</th><th>Value</th><th>Category</th>
    </tr></thead><tbody></tbody></table></div>
    <p class="small muted" style="margin-top:8px">Hover a row to highlight the token in the editor.</p>`;

  const tbody = el.querySelector("tbody");
  const fill = () => {
    const q = (ctx.ui.tokenSearch || "").toLowerCase();
    const rows = tokens
      .map((t, i) => ({ t, i, cat: tokenCategory(t.kind) }))
      .filter(({ t, cat }) => (!ctx.ui.tokenFilter || cat === ctx.ui.tokenFilter) && (!q || t.lexeme.toLowerCase().includes(q) || t.kind.toLowerCase().includes(q)));
    tbody.innerHTML = rows.length
      ? rows.map(({ t, i, cat }) => `<tr${t.kind === "EOF" ? "" : locAttrs(t.line, t.col, t.lexeme.length)}>
          <td class="num-col mono">${i}</td>
          <td class="mono muted">${t.line}:${t.col}</td>
          <td><span class="chip t-${cat}">${esc(t.kind)}</span></td>
          <td class="mono t-${cat}">${t.kind === "EOF" ? '<span class="muted">(end of input)</span>' : esc(t.lexeme)}</td>
          <td class="mono">${t.value !== undefined ? esc(typeof t.value === "string" ? JSON.stringify(t.value) : t.value) : ""}</td>
          <td class="muted small">${esc(CATEGORY_LABEL[cat])}</td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No tokens match.</td></tr>`;
  };
  fill();
  el.querySelectorAll(".filter-btn").forEach((b) =>
    b.addEventListener("click", () => {
      ctx.ui.tokenFilter = b.dataset.cat;
      el.querySelectorAll(".filter-btn").forEach((x) => x.classList.toggle("on", x === b));
      fill();
    })
  );
  el.querySelector(".search").addEventListener("input", (e) => {
    ctx.ui.tokenSearch = e.target.value;
    fill();
  });
}

// ---------------------------------------------------------------- AST

function nodeDetail(n) {
  const loc = n.line ? `line ${n.line}, column ${n.col}` : "no source position";
  let extra = "";
  if (n.kind === "Binary") {
    extra = `<p>Its two children are evaluated first, then <code>${esc(n.label)}</code> combines them. An operator lower in the tree binds tighter (higher precedence).</p>`;
  } else if (n.kind === "Literal") {
    extra = `<p>Type: <code>${esc(n.raw.type)}</code>.</p>`;
  } else if (n.kind === "VarRef") {
    extra = `<p>Resolved during semantic analysis to the nearest declaration of <code>${esc(n.label)}</code> (see the Symbols tab).</p>`;
  } else if (n.children.length) {
    extra = `<p>${plural(n.children.length, "child", "children")}${n.children.some((c) => c.role && c.role.length > 1) ? ": " + n.children.map((c) => `<code>${esc(c.role)}</code>`).join(", ") : ""}.</p>`;
  }
  return `<h4>${esc(n.kind)} <span class="muted mono" style="font-weight:400">${esc(n.kind === "Program" || n.kind === "Block" ? "" : n.label)}</span></h4>
    <p>${esc(NODE_INFO[n.kind] || "")}</p>${extra}<p class="small muted">Source position: ${loc}</p>`;
}

export function renderAst(el, ctx) {
  const j = ctx.json;
  if (!j || !j.ast) return (el.innerHTML = explainBox(ctx, "ast", "How the parser builds the tree") + notReached(ctx, "parser"));
  const root = normalize(j.ast);
  const view = ctx.ui.astView || "diagram";
  const scale = ctx.ui.astScale || 1; // null = fit to the panel

  el.innerHTML = `
    ${explainBox(ctx, "ast", "How the parser builds the tree")}
    <div class="stats">
      ${stat(countNodes(root), "AST nodes", "accent")}
      ${stat(treeDepth(root), "tree depth")}
      ${stat(j.ast.body.length, "top-level statements")}
    </div>
    <div class="ast-toolbar">
      <div class="view-switch">
        <button data-view="diagram" class="${view === "diagram" ? "on" : ""}">Tree diagram</button>
        <button data-view="outline" class="${view === "outline" ? "on" : ""}">Outline</button>
      </div>
      ${view === "diagram" ? `<div class="zoom"><button data-zoom="-" title="Zoom out">−</button><button data-zoom="0" title="Fit to panel" style="width:auto;padding:0 8px">Fit</button><button data-zoom="+" title="Zoom in">+</button></div>` : ""}
      <span class="spacer"></span>
      <span class="small muted">
        <span class="chip" style="border-color:var(--blue)">statement</span>
        <span class="chip" style="border-color:var(--purple)">control flow</span>
        <span class="chip" style="border-color:var(--pink)">operator</span>
        <span class="chip" style="border-color:var(--cyan)">variable</span>
        <span class="chip" style="border-color:var(--amber)">literal</span>
      </span>
    </div>
    <div class="ast-view"></div>
    <div class="detail-box"><p class="muted">Click a node to see what it means. Hover a node to highlight its source.</p></div>`;

  const holder = el.querySelector(".ast-view");
  const detail = el.querySelector(".detail-box");
  let nodes;
  if (view === "diagram") {
    const d = renderDiagram(root, scale);
    nodes = d.nodes;
    holder.innerHTML = `<div class="ast-canvas">${d.svg}</div>`;
    const canvas = holder.querySelector(".ast-canvas");
    let s = scale;
    if (!ctx.ui.astScale) {
      // Fit wide trees to the panel (but keep text readable), then show the root.
      s = Math.max(0.75, Math.min(1, (canvas.clientWidth - 4) / d.width));
      const svg = canvas.querySelector("svg");
      svg.setAttribute("width", d.width * s);
      svg.setAttribute("height", d.height * s);
    }
    canvas.scrollLeft = Math.max(0, d.root.x * s - canvas.clientWidth / 2);
  } else {
    const o = renderOutline(root);
    nodes = o.nodes;
    holder.innerHTML = o.html;
  }
  holder.querySelectorAll("[data-i]").forEach((g) => {
    const n = nodes[Number(g.dataset.i)];
    if (n.line) {
      g.dataset.line = n.line;
      g.dataset.col = n.col;
      g.dataset.len = n.length || 1;
    }
    g.addEventListener("click", (e) => {
      if (view === "outline") e.preventDefault();
      holder.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
      g.classList.add("sel");
      detail.innerHTML = nodeDetail(n);
    });
  });
  el.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      ctx.ui.astView = b.dataset.view;
      ctx.saveUi();
      renderAst(el, ctx);
    })
  );
  el.querySelectorAll("[data-zoom]").forEach((b) =>
    b.addEventListener("click", () => {
      const z = b.dataset.zoom;
      const svg = el.querySelector(".ast-canvas svg");
      const current = ctx.ui.astScale || Number(svg.getAttribute("width")) / svg.viewBox.baseVal.width;
      ctx.ui.astScale = z === "0" ? null : Math.min(2, Math.max(0.3, current * (z === "+" ? 1.2 : 1 / 1.2)));
      renderAst(el, ctx);
    })
  );
}

// ---------------------------------------------------------------- symbols

export function renderSymbols(el, ctx) {
  const j = ctx.json;
  if (!j || !j.symbols) return (el.innerHTML = explainBox(ctx, "symbols", "Scopes, symbols and type checking") + notReached(ctx, "semantic"));
  const scopes = j.symbols;
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const children = new Map(scopes.map((s) => [s.id, []]));
  for (const s of scopes) if (s.parent !== null && children.has(s.parent)) children.get(s.parent).push(s);
  const semErrors = j.errors.filter((e) => e.category === "Semantic");

  const shadowOf = (sym) => {
    let scope = byId.get(sym.scope);
    while (scope && scope.parent !== null) {
      scope = byId.get(scope.parent);
      const outer = scope.symbols.find((x) => x.name === sym.name);
      if (outer) return { outer, scope };
    }
    return null;
  };
  let shadowCount = 0;

  const renderScope = (s) => {
    const rows = s.symbols.map((sym) => {
      const sh = shadowOf(sym);
      if (sh) shadowCount++;
      return `<div class="scope-sym"${locAttrs(sym.line, sym.col, sym.name.length)}>
        <span class="name">${esc(sym.name)}</span>
        <span><span class="chip t-type">${esc(sym.type)}</span></span>
        <span class="small muted">declared at line ${sym.line}, col ${sym.col}
          ${sh ? ` · <span class="badge warn">shadows ${esc(sym.name)} from scope ${sh.scope.id} (line ${sh.outer.line})</span>` : ""}</span>
        <span class="small">TAC name <span class="chip o-var">${esc(sym.tacName)}</span></span>
      </div>`;
    }).join("");
    const title = s.id === 0 ? "Scope 0 · global" : `Scope ${s.id} · block at line ${s.line}`;
    const meta = s.id === 0 ? "top-level declarations" : `inside scope ${s.parent}, nesting depth ${s.depth}`;
    return `<div class="scope">
      <div class="scope-head"><h4>${esc(title)}</h4><span class="small muted">${esc(meta)}</span>
        <span class="badge neutral">${plural(s.symbols.length, "symbol")}</span></div>
      ${rows || `<div class="scope-none">No declarations in this scope.</div>`}
      ${children.get(s.id).map(renderScope).join("")}
    </div>`;
  };
  const tree = renderScope(byId.get(0));
  const total = scopes.reduce((n, s) => n + s.symbols.length, 0);

  el.innerHTML = `
    ${explainBox(ctx, "symbols", "Scopes, symbols and type checking")}
    ${semErrors.length
      ? `<div class="banner err"><span class="b-icon">✕</span><div><strong>${plural(semErrors.length, "semantic error")}</strong>. The table shows every declaration the analyzer recorded. <button class="link-btn" data-open-tab="errors">Show errors →</button></div></div>`
      : `<div class="banner ok"><span class="b-icon">✓</span><div>Every variable use resolves to a declaration and every expression has a valid type.</div></div>`}
    <div class="stats">
      ${stat(scopes.length, "scopes", "accent")}
      ${stat(total, "variables")}
      ${stat(shadowCount, "shadowing declarations")}
      ${stat(Math.max(...scopes.map((s) => s.depth)), "max nesting depth")}
    </div>
    <h3 class="section-title">Scope tree</h3>
    ${tree}
    <p class="small muted" style="margin-top:10px">Hover a variable to highlight its declaration. The TAC name is what the variable is called in the generated code.</p>`;
}

// ---------------------------------------------------------------- TAC

function operandHtml(o) {
  if (!o) return "";
  if (o.kind === "var") return `<span class="o-var">${esc(o.name)}</span>`;
  if (o.kind === "temp") return `<span class="o-temp">${esc(o.name)}</span>`;
  return `<span class="o-const">${esc(o.value)}</span>`;
}

function instrHtml(ins, labelIndex) {
  const L = (name) => `<span class="o-label">${esc(name)}</span>`;
  const target = (name) => (labelIndex.has(name) ? ` <span class="jump-note">→ #${labelIndex.get(name)}</span>` : "");
  switch (ins.op) {
    case "ASSIGN": return `${operandHtml(ins.dst)} = ${operandHtml(ins.a)}`;
    case "BINOP": return `${operandHtml(ins.dst)} = ${operandHtml(ins.a)} <span class="op-bin">${esc(ins.binop)}</span> ${operandHtml(ins.b)}`;
    case "UNOP": return `${operandHtml(ins.dst)} = <span class="op-bin">${esc(ins.unop)}</span> ${operandHtml(ins.a)}`;
    case "I2F": return `${operandHtml(ins.dst)} = <span class="op-kw">I2F</span> ${operandHtml(ins.a)}`;
    case "LABEL": return `${esc(ins.label)}:`;
    case "GOTO": return `<span class="op-kw">GOTO</span> ${L(ins.label)}${target(ins.label)}`;
    case "IF_FALSE": return `<span class="op-kw">IF_FALSE</span> ${operandHtml(ins.a)}, ${L(ins.label)}${target(ins.label)}`;
    case "PRINT": return `<span class="op-kw">PRINT</span> ${operandHtml(ins.a)}`;
    case "HALT": return `<span class="op-kw">HALT</span>`;
    default: return esc(ins.text);
  }
}

function operandWords(o) {
  if (!o) return "";
  if (o.kind === "var") {
    const m = /^(.*)#(\d+)$/.exec(o.name);
    return m
      ? `variable <code>${esc(o.name)}</code> (declaration no. ${m[2]} of <code>${esc(m[1])}</code>, renamed because of shadowing)`
      : `variable <code>${esc(o.name)}</code>`;
  }
  if (o.kind === "temp") return `temporary <code>${esc(o.name)}</code>`;
  return `the constant <code>${esc(o.value)}</code> (${esc(o.type)})`;
}

function explainInstr(ins, labelIndex) {
  const a = operandWords(ins.a), b = operandWords(ins.b), d = operandWords(ins.dst);
  const where = (l) => (labelIndex.has(l) ? `<code>${esc(l)}</code> (instruction #${labelIndex.get(l)})` : `<code>${esc(l)}</code>`);
  switch (ins.op) {
    case "ASSIGN": return `<p>Copies ${a} into ${d}.</p>`;
    case "BINOP": {
      const cmp = ["LT", "LE", "GT", "GE", "EQ", "NE"].includes(ins.binop);
      let text = cmp
        ? `<p>Compares ${a} ${OP_NAMES[ins.binop]} ${b} and stores <code>true</code> or <code>false</code> in ${d}.</p>`
        : `<p>Computes ${a} ${OP_NAMES[ins.binop]} ${b} and stores the result in ${d}.</p>`;
      if (ins.binop === "DIV" || ins.binop === "MOD") text += `<p class="small muted">If the divisor is 0 when this runs, the VM stops with a <em>division/modulo by zero</em> runtime error. That is why the optimizer never folds a division by a constant 0.</p>`;
      else if (!cmp) text += `<p class="small muted">For <code>int</code> operands, a result outside the 64-bit range is a runtime <em>integer overflow</em> error.</p>`;
      return text;
    }
    case "UNOP": return ins.unop === "NEG" ? `<p>Negates ${a} and stores the result in ${d}.</p>` : `<p>Stores the logical negation of ${a} in ${d}.</p>`;
    case "I2F": return `<p>Converts ${a} from <code>int</code> to <code>float</code> and stores it in ${d}. This is the only implicit conversion in ShreyaLang.</p>`;
    case "LABEL": return `<p>Label <code>${esc(ins.label)}</code> marks a jump target. It does nothing when executed, but a new <strong>basic block</strong> starts here, and the optimizer forgets all known constants at this point.</p>`;
    case "GOTO": return `<p>Jumps unconditionally to ${where(ins.label)}. The next instruction starts a new basic block.</p>`;
    case "IF_FALSE": return `<p>If ${a} is <code>false</code>, jumps to ${where(ins.label)}; otherwise continues with the next instruction. This is how <code>if</code>, <code>while</code>, <code>&amp;&amp;</code> and <code>||</code> branch.</p>`;
    case "PRINT": return `<p>Prints ${a} followed by a newline.</p>`;
    case "HALT": return `<p>Ends the program. The generator always appends it as the last instruction.</p>`;
  }
  return "";
}

export function basicBlocks(tac) {
  const ids = [];
  let b = -1;
  tac.forEach((ins, i) => {
    if (i === 0 || ins.op === "LABEL" || ["GOTO", "IF_FALSE"].includes(tac[i - 1].op)) b++;
    ids.push(b);
  });
  return ids;
}

export function renderTac(el, ctx) {
  const j = ctx.json;
  if (!j || !j.tac) return (el.innerHTML = explainBox(ctx, "tac", "Three-address code") + notReached(ctx, "tac"));
  const mode = ctx.ui.tacMode || "unoptimized";
  const tac = mode === "optimized" ? j.optimizedTac : j.tac;
  const blocks = basicBlocks(tac);
  const labelIndex = new Map(tac.filter((x) => x.op === "LABEL").map((x) => [x.label, x.index]));
  const s = tacSummary(tac);

  el.innerHTML = `
    ${explainBox(ctx, "tac", "Three-address code")}
    <details class="explain" style="background:none"><summary>Instruction set<span class="hint">9 opcodes</span></summary>
      <div class="explain-body"><div class="legend">${OPCODES.map(([op, form, text]) => `<div><code>${esc(form)}</code> ${esc(text)}</div>`).join("")}</div>
      <p class="small">Colours: <span class="o-var">variables</span> · <span class="o-temp">temporaries</span> · <span class="o-const">constants</span> · <span class="o-label">labels</span></p></div>
    </details>
    <div class="ast-toolbar">
      <div class="view-switch">
        <button data-mode="unoptimized" class="${mode === "unoptimized" ? "on" : ""}">Generated (--emit-tac)</button>
        <button data-mode="optimized" class="${mode === "optimized" ? "on" : ""}">Optimized (--emit-opt-tac)</button>
      </div>
    </div>
    <div class="stats">
      ${stat(tac.length, "instructions", "accent")}
      ${stat(s.temps, "temporaries")}
      ${stat(s.labels, "labels")}
      ${stat(blocks.length ? blocks[blocks.length - 1] + 1 : 0, "basic blocks")}
    </div>
    <div class="tac">${tac.map((ins, i) => `
      <div class="tac-row ${ins.op === "LABEL" ? "is-label" : ""} ${blocks[i] % 2 ? "b-odd" : "b-even"} ${i > 0 && blocks[i] !== blocks[i - 1] ? "b-start" : ""}"
           data-idx="${i}"${locAttrs(ins.line)}>
        <span class="idx">${ins.index}</span>
        <span class="blk" title="basic block B${blocks[i]}">${i === 0 || blocks[i] !== blocks[i - 1] ? "B" + blocks[i] : ""}</span>
        <span class="ins">${instrHtml(ins, labelIndex)}</span>
        <span class="meta">${ins.line ? "line " + ins.line : ""}</span>
      </div>`).join("")}
    </div>
    <div class="detail-box"><p class="muted">Click an instruction for a plain-language explanation. Hover to see its source line; jumps also mark their target.</p></div>`;

  const detail = el.querySelector(".detail-box");
  const rows = [...el.querySelectorAll(".tac-row")];
  rows.forEach((row) => {
    const ins = tac[Number(row.dataset.idx)];
    row.addEventListener("mouseenter", () => {
      rows.forEach((r) => r.classList.remove("target"));
      if (ins.label && ins.op !== "LABEL" && labelIndex.has(ins.label)) rows[labelIndex.get(ins.label)].classList.add("target");
    });
    row.addEventListener("click", () => {
      rows.forEach((r) => r.classList.remove("sel"));
      row.classList.add("sel");
      const src = ins.line ? ctx.lines[ins.line - 1] : null;
      detail.innerHTML = `<h4>#${ins.index} · ${esc(ins.op)}${ins.binop ? " " + esc(ins.binop) : ""}${ins.unop ? " " + esc(ins.unop) : ""}
          <span class="badge neutral" style="margin-left:6px">basic block B${blocks[Number(row.dataset.idx)]}</span></h4>
        ${explainInstr(ins, labelIndex)}
        ${src !== null && src !== undefined ? `<p class="small muted">Generated from line ${ins.line}: <code>${esc(src.trim())}</code></p>` : ""}`;
    });
  });
  el.querySelector(".tac").addEventListener("mouseleave", () => rows.forEach((r) => r.classList.remove("target")));
  el.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      ctx.ui.tacMode = b.dataset.mode;
      ctx.saveUi();
      renderTac(el, ctx);
    })
  );
}

// ---------------------------------------------------------------- optimizer

// Classifies a changed instruction pair. Only folding turns an operation into
// a constant ASSIGN, and only propagation replaces operands, so the pass can
// be read off the structured instructions.
function changeKind(before, after) {
  if (["BINOP", "UNOP", "I2F"].includes(before.op) && after.op === "ASSIGN" && after.a && after.a.kind === "const") return "folded";
  if (before.op === after.op) return "propagated";
  return "changed";
}

export function renderOptimizer(el, ctx) {
  const j = ctx.json;
  if (!j || !j.optimizedTac) return (el.innerHTML = explainBox(ctx, "optimizer", "How the optimizer works") + notReached(ctx, "optimizer"));
  const o = j.optimizer;
  const before = j.tac, after = j.optimizedTac;
  const pct = before.length ? Math.round((100 * (before.length - after.length)) / before.length) : 0;
  const allOff = !o.fold && !o.propagate && !o.dce;

  // Diff on the text without instruction indices; pair removed/added runs.
  const ops = diffLines(before.map((x) => x.text), after.map((x) => x.text));
  const rows = [];
  for (let k = 0; k < ops.length; ) {
    if (ops[k].type === "same") {
      rows.push({ type: "same", a: ops[k].a, b: ops[k].b });
      k++;
      continue;
    }
    const removed = [], added = [];
    while (k < ops.length && ops[k].type === "removed") removed.push(ops[k++].a);
    while (k < ops.length && ops[k].type === "added") added.push(ops[k++].b);
    // Pair removed/added lines that write the same destination (a changed instruction).
    const used = new Set();
    for (const a of removed) {
      const dst = before[a].dst ? JSON.stringify(before[a].dst) : before[a].op + (before[a].label || "");
      const match = added.find((b) => !used.has(b) && (after[b].dst ? JSON.stringify(after[b].dst) : after[b].op + (after[b].label || "")) === dst);
      if (match !== undefined) {
        used.add(match);
        rows.push({ type: "changed", a, b: match, kind: changeKind(before[a], after[match]) });
      } else {
        rows.push({ type: "removed", a });
      }
    }
    for (const b of added) if (!used.has(b)) rows.push({ type: "added", b });
  }

  const cell = (list, i, extra = "") =>
    i === undefined ? "<div></div>" : `<div${locAttrs(list[i].line)}><span class="ln">${list[i].index}</span>${esc(list[i].text)}${extra}</div>`;
  const diffHtml = rows.map((r) => {
    if (r.type === "same") return `<div class="diff-row">${cell(before, r.a)}${cell(after, r.b)}</div>`;
    if (r.type === "removed") return `<div class="diff-row removed">${cell(before, r.a, '<span class="tag rm">removed · dead code</span>')}<div></div></div>`;
    if (r.type === "added") return `<div class="diff-row added"><div></div>${cell(after, r.b, '<span class="tag add">added</span>')}</div>`;
    return `<div class="diff-row changed">${cell(before, r.a)}${cell(after, r.b, `<span class="tag chg">${r.kind}</span>`)}</div>`;
  }).join("");

  // Notes that explain what was deliberately left alone.
  const notes = [];
  const keptDiv = after.filter((x) => x.op === "BINOP" && (x.binop === "DIV" || x.binop === "MOD") && x.b && x.b.kind === "const" && /^-?0(\.0)?$/.test(x.b.value));
  if (keptDiv.length) notes.push(`<strong>${plural(keptDiv.length, "division", "divisions")} by constant zero kept</strong> (instruction ${keptDiv.map((x) => "#" + x.index).join(", ")}): folding would hide the runtime error, so the VM must still execute ${keptDiv.length === 1 ? "it" : "them"}.`);
  const backJumps = after.filter((x) => x.op === "GOTO" && after.findIndex((y) => y.op === "LABEL" && y.label === x.label) < after.indexOf(x));
  if (backJumps.length) notes.push(`<strong>Loop detected</strong>: values known before a loop are not propagated past its label, because the loop body may change them. This is why some variables inside loops still appear as variables.`);
  if (o.removed === 0 && !allOff && o.dce) notes.push(`Dead-code elimination found no unused temporaries.`);

  const passCard = (key, count, verb) => {
    const p = PASS_INFO[key];
    const on = o[key];
    return `<div class="pass ${on ? "" : "off"}">
      <h4>${esc(p.name)} <span class="pass-count badge ${on ? (count ? "ok" : "neutral") : "neutral"}">${on ? `${count} ${verb}` : "disabled"}</span></h4>
      <p>${esc(p.text)}</p>
      <p class="small"><strong>Safety rule:</strong> ${esc(p.rule)}</p>
      <p class="small muted">Disable with <code>${p.flag}</code></p>
    </div>`;
  };

  el.innerHTML = `
    ${explainBox(ctx, "optimizer", "How the optimizer works")}
    ${allOff ? `<div class="banner info"><span class="b-icon">i</span><div>All passes are disabled (equivalent to <code>--no-opt</code>), so the optimized TAC is identical to the generated TAC.</div></div>` : ""}
    <div class="pass-grid">
      ${passCard("fold", o.folded, "folded")}
      ${passCard("propagate", o.propagated, "propagated")}
      ${passCard("dce", o.removed, "removed")}
    </div>
    <div class="stats">
      ${stat(before.length, "instructions before")}
      ${stat(after.length, "instructions after", "accent")}
      ${stat(pct + "%", "smaller", pct > 0 ? "good" : "")}
      ${stat(o.rounds, "rounds to fixed point")}
    </div>
    ${notes.length ? `<div class="banner info"><span class="b-icon">i</span><div>${notes.map((n) => `<div>${n}</div>`).join("")}</div></div>` : ""}
    <h3 class="section-title">Before and after</h3>
    <div class="diff">
      <div class="diff-head"><div>Generated TAC (${before.length})</div><div>Optimized TAC (${after.length})</div></div>
      ${diffHtml}
    </div>
    <div class="diff-legend">
      <span><span class="sw" style="background:var(--amber-soft);border:1px solid var(--amber)"></span>changed by folding or propagation</span>
      <span><span class="sw" style="background:var(--red-soft);border:1px solid var(--red)"></span>removed by dead-code elimination</span>
      <span>Unmarked rows are unchanged. The diff shows the net result of all rounds: an instruction that was folded and then deleted appears as removed.</span>
    </div>`;
}

// ---------------------------------------------------------------- execution

export function renderExecution(el, ctx) {
  const j = ctx.json;
  if (!j || !j.optimizedTac) return (el.innerHTML = explainBox(ctx, "execution", "How the virtual machine runs your program") + notReached(ctx, "vm"));
  const u = ctx.unopt && ctx.unopt.json;
  const runtime = j.errors.find((e) => e.category === "Runtime");
  const outLines = j.output ? j.output.split("\n").length - 1 : 0;

  let equivalence = "";
  if (u) {
    const ur = u.errors.find((e) => e.category === "Runtime");
    const same = u.output === j.output && ctx.unopt.exitCode === ctx.main.exitCode && (ur ? ur.text : "") === (runtime ? runtime.text : "");
    const limitHit = [runtime, ur].some((e) => e && e.message.startsWith("execution limit exceeded"));
    const saved = u.steps ? Math.round((100 * (u.steps - j.steps)) / u.steps) : 0;
    equivalence = `
      <h3 class="section-title">Optimized vs. unoptimized</h3>
      ${same
        ? `<div class="banner ok"><span class="b-icon">✓</span><div><strong>Identical behaviour.</strong> The program printed exactly the same output with the same exit code with and without optimization. ${j.steps === u.steps ? `Both runs executed ${plural(j.steps, "step")}.` : `The optimized code needed ${plural(j.steps, "step")} instead of ${u.steps}${saved > 0 ? ` (${saved}% fewer)` : ""}.`}</div></div>`
        : `<div class="banner ${limitHit ? "warn" : "err"}"><span class="b-icon">!</span><div><strong>The two runs differ.</strong> ${limitHit ? "One run hit the step limit. Optimized code executes fewer instructions, so a program near the limit can finish in one configuration and not the other. Raise Max steps to compare." : "This would be an optimizer bug."}</div></div>`}
      <div class="compare">
        <div class="side"><div class="side-head">Optimized <span class="badge info">${plural(j.steps, "step")}</span> <span class="badge neutral">exit ${ctx.main.exitCode}</span></div>
          <pre>${esc(j.output) || '<span class="muted">(no output)</span>'}${runtime ? `\n<span style="color:var(--red)">${esc(runtime.text)}</span>` : ""}</pre></div>
        <div class="side"><div class="side-head">Unoptimized (--no-opt) <span class="badge info">${plural(u.steps ?? 0, "step")}</span> <span class="badge neutral">exit ${ctx.unopt.exitCode}</span></div>
          <pre>${esc(u.output || "") || '<span class="muted">(no output)</span>'}${ur ? `\n<span style="color:var(--red)">${esc(ur.text)}</span>` : ""}</pre></div>
      </div>`;
  }

  el.innerHTML = `
    ${explainBox(ctx, "execution", "How the virtual machine runs your program")}
    <div class="stats">
      ${stat(ctx.main.exitCode, "exit code", ctx.main.exitCode === 0 ? "good" : "bad")}
      ${stat(j.steps.toLocaleString(), "steps executed", "accent")}
      ${stat(outLines, "lines printed")}
      ${stat(ctx.main.durationMs + " ms", "compile + run time")}
    </div>
    ${runtime ? `<div class="err-card cat-Runtime" data-reveal="1"${locAttrs(runtime.line, runtime.col, 1)}>
        <div class="err-head"><span class="badge cat-badge">Runtime error</span><span class="msg">${esc(runtime.message)}</span>
        <span class="small muted">line ${runtime.line}, col ${runtime.col}</span></div>
        ${errorSnippet(runtime, ctx.lines)}
        <p class="small muted" style="margin:6px 0 0">${runtimeHint(runtime.message)}</p>
      </div>` : ""}
    <h3 class="section-title">Output</h3>
    <pre class="console" style="border:1px solid var(--border);border-radius:10px;max-height:340px">${j.output ? esc(j.output) : '<span class="placeholder">The program printed nothing.</span>'}</pre>
    ${equivalence}`;
}

function runtimeHint(message) {
  if (message.startsWith("division by zero") || message.startsWith("modulo by zero"))
    return "ShreyaLang defines division and modulo by zero as runtime errors for both int and float. The optimizer deliberately leaves such operations for the VM.";
  if (message.startsWith("integer overflow")) return "int is a 64-bit signed integer; results outside −9223372036854775808 … 9223372036854775807 are an error rather than wrapping around.";
  if (message.startsWith("execution limit exceeded")) return "The VM stops after Max steps executed instructions. This protects against infinite loops; raise the limit under the editor if the program is just long-running.";
  return "";
}

// ---------------------------------------------------------------- errors

export function renderErrors(el, ctx) {
  const j = ctx.json;
  const errors = j ? j.errors : [];
  let body;
  if (ctx.main && ctx.main.failure) {
    body = `<div class="banner err"><span class="b-icon">⚠</span><div>${esc(ctx.main.failure)}</div></div>`;
  } else if (!errors.length) {
    body = empty("No errors", "Every phase completed without reporting an error.");
  } else {
    body = errors.map((e) => `<div class="err-card cat-${esc(e.category)}" data-reveal="1"${locAttrs(e.line, e.col, 1)}>
        <div class="err-head"><span class="badge cat-badge">${esc(e.category)}</span><span class="msg">${esc(e.message)}</span>
          <span class="small muted">${e.line ? `line ${e.line}${e.col ? ", col " + e.col : ""}` : ""}</span></div>
        ${errorSnippet(e, ctx.lines)}
      </div>`).join("") + `<p class="small muted">Click an error to jump to it in the editor. Exactly as printed by the CLI: <code>${esc(errors[0].text)}</code></p>`;
  }
  el.innerHTML = `${explainBox(ctx, "errors", "Error categories and exit codes")}${body}`;
}

// ---------------------------------------------------------------- reference / JSON

export function renderReference(el) {
  el.innerHTML = REFERENCE_HTML;
}

export function renderJson(el, ctx) {
  const part = (title, run, open) => {
    if (!run) return "";
    return `<details class="explain" style="background:none" ${open ? "open" : ""}>
      <summary>${esc(title)}<span class="hint">exit code ${run.exitCode} · ${run.durationMs} ms</span></summary>
      <div class="explain-body" style="padding-left:14px">
        <div class="cmd">${esc(run.args.join(" "))}</div>
        ${run.failure ? `<div class="banner err" style="margin-top:8px"><span class="b-icon">⚠</span><div>${esc(run.failure)}</div></div>` : ""}
        ${run.json ? `<pre class="json-view" style="margin-top:8px">${jsonHtml(run.json)}</pre>` : ""}
      </div>
    </details>`;
  };
  el.innerHTML = `${explainBox(ctx, "json", "Raw compiler output")}
    ${part("Main run", ctx.main, true)}
    ${part("Comparison run without optimization", ctx.unopt, false)}`;
}
