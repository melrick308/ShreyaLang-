// ShreyaLang Compiler web page: page state, compiler requests and rendering.

import { Editor } from "./editor.js";
import { PHASES } from "./explain.js";
import { createLearn } from "./learn.js";
import { debounce, esc, plural, storageGet, storageSet } from "./util.js";
import {
  computePhases, renderAst, renderErrors, renderExecution, renderJson, renderOptimizer,
  renderOverview, renderReference, renderSymbols, renderTac, renderTokens,
} from "./views.js";

const WELCOME = `// Welcome to the ShreyaLang Compiler!
// Edit this program: every view on the right is produced by the real
// compiler. Hover tokens, tree nodes or instructions to see their source.

let limit: int = 5;
let i: int = 1;
let total: int = 0;
while (i <= limit) {
    if (i % 2 == 0) {
        print("even");
    } else {
        print(i);
    }
    total = total + i * 2;
    i = i + 1;
}
let average: float = total / 2.0;   // int / float gives float
print(average);
print(2 + 3 * 4);                   // folded to 14 by the optimizer
`;

const TABS = [
  { id: "overview", label: "Overview", render: renderOverview },
  { id: "tokens", label: "Tokens", render: renderTokens, count: (j) => j && j.tokens && j.tokens.length - 1 },
  { id: "ast", label: "AST", render: renderAst },
  { id: "symbols", label: "Symbols", render: renderSymbols, count: (j) => j && j.symbols && j.symbols.reduce((n, s) => n + s.symbols.length, 0) },
  { id: "tac", label: "TAC", render: renderTac, count: (j) => j && j.tac && j.tac.length },
  { id: "optimizer", label: "Optimizer", render: renderOptimizer },
  { id: "execution", label: "Execution", render: renderExecution },
  { id: "errors", label: "Errors", render: renderErrors, count: (j) => j && j.errors.length, errCount: true },
  { id: "reference", label: "Language", render: renderReference },
  { id: "json", label: "Raw JSON", render: renderJson },
];

const $ = (id) => document.getElementById(id);

const ui = loadUi();
const state = {
  response: null,     // last /api/compile response
  source: "",         // source text of that response
  phases: computePhases(null),
  pending: false,
  seq: 0,
  tab: initialTab(),
  examples: [],
};

const editor = new Editor({
  textarea: $("source"),
  highlight: $("highlight"),
  gutter: $("gutter"),
  container: $("editor"),
});

// ---------------------------------------------------------------- UI prefs

// A link such as index.html#tab=optimizer opens that view.
function initialTab() {
  const fromHash = /(?:^#|&)tab=([a-z]+)/.exec(location.hash);
  if (fromHash && TABS.some((t) => t.id === fromHash[1])) return fromHash[1];
  return TABS.some((t) => t.id === ui.tab) ? ui.tab : "overview";
}

function loadUi() {
  let saved = {};
  try {
    saved = JSON.parse(storageGet("shreyalang.ui", "{}")) || {};
  } catch {
    saved = {};
  }
  return {
    tab: saved.tab,
    astView: saved.astView || "diagram",
    tacMode: saved.tacMode || "unoptimized",
    closedExplain: new Set(saved.closedExplain || []),
    tokenFilter: "",
    tokenSearch: "",
    astScale: null,
  };
}

function saveUi() {
  storageSet("shreyalang.ui", JSON.stringify({
    tab: state.tab,
    astView: ui.astView,
    tacMode: ui.tacMode,
    closedExplain: [...ui.closedExplain],
  }));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storageSet("shreyalang.theme", theme);
}

// ---------------------------------------------------------------- compile

// POST /api/compile. `opts` may set mode ("tokens"), compare (false) and
// maxSteps; returns the server's JSON (or {main: {failure}} on errors).
async function api(source, opts = {}) {
  try {
    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, ...opts }),
    });
    const body = await res.json();
    if (!res.ok) return { main: { failure: body.error || `HTTP ${res.status}` } };
    return body;
  } catch (err) {
    return { main: { failure: `Cannot reach the server (${err.message}). Is node web/server.js running?` } };
  }
}

function options() {
  return {
    fold: $("opt-fold").checked,
    propagate: $("opt-prop").checked,
    dce: $("opt-dce").checked,
    maxSteps: Number($("max-steps").value) || 1000000,
  };
}

async function compile() {
  const source = editor.value;
  const seq = ++state.seq;
  storageSet("shreyalang.source", source);

  // Results of an earlier run are discarded immediately; if the request is
  // slow, the views show a loading state rather than outdated data.
  state.response = null;
  state.pending = true;
  state.phases = Object.fromEntries(PHASES.map((p) => [p.id, { status: "pending", metric: "working…" }]));
  const loadingTimer = setTimeout(() => {
    if (seq === state.seq && state.pending) renderAll();
  }, 120);
  $("run").disabled = true;

  const response = await api(source, options());
  clearTimeout(loadingTimer);
  if (seq !== state.seq) return; // a newer request is in flight

  state.pending = false;
  $("run").disabled = false;
  if (response.main.failure && !response.main.args) {
    state.response = { main: { failure: response.main.failure, exitCode: -1, args: [] }, unoptimized: null };
  } else {
    state.response = response;
  }
  state.source = source;
  state.phases = computePhases(state.response.main);
  editor.setAnalysis(state.response.main.json
    ? { source, tokens: state.response.main.json.tokens, errors: state.response.main.json.errors }
    : null);
  renderAll();
}

const autoCompile = debounce(() => {
  if ($("auto-run").checked) compile();
}, 450);

// ---------------------------------------------------------------- rendering

function context() {
  const r = state.response;
  return {
    main: r && r.main,
    unopt: r && r.unoptimized,
    json: r && r.main && r.main.json,
    source: state.source,
    lines: state.source.split("\n"),
    phases: state.phases,
    ui,
    saveUi,
  };
}

function renderPipeline() {
  $("pipeline").innerHTML = PHASES.map((p, i) => {
    const s = state.phases[p.id];
    const icon = s.status === "ok" ? "✓" : s.status === "error" ? "✕" : s.status === "pending" ? '<span class="spinner"></span>' : "–";
    return `<button class="phase ${s.status} ${TABS.find((t) => t.id === state.tab) && p.tab === state.tab ? "active" : ""}" data-tab="${p.tab}" type="button" title="${esc(p.summary)}">
      <div class="ph-top"><span class="ph-num">${i + 1}</span><span class="ph-name">${esc(p.name)}</span><span class="ph-icon">${icon}</span></div>
      <div class="ph-metric">${esc(s.metric)}</div>
      <div class="ph-tool">${esc(p.tool)}</div>
    </button>`;
  }).join("");
}

function renderStatus() {
  const bar = $("statusbar");
  if (state.pending) {
    bar.innerHTML = `<span class="spinner"></span> Compiling…`;
    return;
  }
  const r = state.response;
  if (!r) {
    bar.innerHTML = `<span>Press <strong>Run</strong> or <kbd style="border-color:var(--border-strong)">Ctrl</kbd> + <kbd style="border-color:var(--border-strong)">Enter</kbd></span>`;
    return;
  }
  const m = r.main;
  if (m.failure) {
    bar.innerHTML = `<span class="badge err">Failed</span><span>${esc(m.failure)}</span>`;
    return;
  }
  const labels = { 0: ["ok", "Success"], 1: ["err", "Lexical / syntax error"], 2: ["err", "Semantic error"], 3: ["warn", "Runtime error"], 4: ["err", "Usage error"] };
  const [cls, text] = labels[m.exitCode] || ["err", "Error"];
  const changed = editor.value !== state.source;
  bar.innerHTML = `<span class="badge ${cls}">exit ${m.exitCode} · ${text}</span>
    ${m.json.errors.length ? `<span class="badge err" style="cursor:pointer" data-open-tab="errors">${plural(m.json.errors.length, "error")}</span>` : ""}
    <span>${m.durationMs} ms</span>
    ${m.json.steps !== undefined ? `<span>${plural(m.json.steps, "step")}</span>` : ""}
    ${changed ? `<span class="badge neutral">edited since last run</span>` : ""}`;
}

function renderConsole() {
  const out = $("console");
  const meta = $("console-meta");
  const r = state.response;
  if (state.pending && !r) {
    out.innerHTML = `<span class="placeholder">Running…</span>`;
    meta.textContent = "";
    return;
  }
  if (!r) {
    out.innerHTML = `<span class="placeholder">Program output appears here.</span>`;
    meta.textContent = "";
    return;
  }
  const m = r.main;
  if (m.failure) {
    out.innerHTML = `<span class="runtime-err">${esc(m.failure)}</span>`;
    meta.textContent = "";
    return;
  }
  const j = m.json;
  const runtime = j.errors.find((e) => e.category === "Runtime");
  if (!j.optimizedTac) {
    const first = j.errors[0];
    out.innerHTML = `<span class="console-note">Not executed: compilation failed${first ? ` with a ${first.category.toLowerCase()} error` : ""}.</span>\n<span class="runtime-err">${esc(first ? first.text : "")}</span>`;
    meta.textContent = `exit ${m.exitCode}`;
    return;
  }
  out.innerHTML = (j.output ? esc(j.output) : `<span class="placeholder">(no output)</span>\n`) +
    (runtime ? `<span class="runtime-err">${esc(runtime.text)}</span>` : "");
  meta.textContent = `exit ${m.exitCode} · ${plural(j.steps, "step")}`;
}

function renderTabs() {
  const j = state.response && state.response.main && state.response.main.json;
  $("tabs").innerHTML = TABS.map((t) => {
    const n = t.count ? t.count(j) : null;
    const countHtml = typeof n === "number" && !(t.errCount && n === 0)
      ? `<span class="count ${t.errCount ? "err" : ""}">${n}</span>` : "";
    return `<button class="tab ${t.id === state.tab ? "active" : ""}" role="tab" aria-selected="${t.id === state.tab}" data-tab="${t.id}" type="button">${esc(t.label)}${countHtml}</button>`;
  }).join("");
}

function renderTab() {
  const body = $("tab-body");
  const tab = TABS.find((t) => t.id === state.tab);
  if (state.pending && tab.id !== "reference") {
    body.innerHTML = `<div class="empty"><strong><span class="spinner"></span> Compiling…</strong>Running the compiler on the current program.</div>`;
    return;
  }
  editor.setHover(null);
  try {
    tab.render(body, context());
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="banner err"><span class="b-icon">⚠</span><div>This view could not be displayed: ${esc(err.message)}</div></div>`;
  }
}

function renderAll() {
  renderPipeline();
  renderStatus();
  renderConsole();
  renderTabs();
  renderTab();
}

function openTab(id) {
  if (!TABS.some((t) => t.id === id)) return;
  state.tab = id;
  saveUi();
  history.replaceState(null, "", "#tab=" + id);
  renderPipeline();
  renderTabs();
  renderTab();
  $("tab-body").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ---------------------------------------------------------------- events

function locationOf(el) {
  const line = Number(el.dataset.line);
  if (!line) return null;
  return { line, col: Number(el.dataset.col) || 0, length: Number(el.dataset.len) || 0 };
}

function wireEvents() {
  $("run").addEventListener("click", compile);
  document.addEventListener("keydown", (e) => {
    if (currentMode !== "explorer") return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      compile();
    }
  });
  editor.onChange(() => {
    renderStatus();
    autoCompile();
  });
  for (const id of ["opt-fold", "opt-prop", "opt-dce"]) $(id).addEventListener("change", compile);
  $("max-steps").addEventListener("change", compile);
  $("auto-run").addEventListener("change", () => storageSet("shreyalang.autorun", $("auto-run").checked ? "1" : "0"));

  $("examples").addEventListener("change", (e) => {
    const ex = state.examples[Number(e.target.value)];
    if (!ex) return;
    editor.value = ex.source;
    if (ex.maxSteps) $("max-steps").value = ex.maxSteps;
    compile();
  });

  $("theme-toggle").addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));

  // Tab and pipeline navigation (also any [data-open-tab] link in a view).
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab], [data-open-tab]");
    if (t && (t.closest("#tabs") || t.closest("#pipeline") || t.dataset.openTab)) {
      openTab(t.dataset.openTab || t.dataset.tab);
      return;
    }
    const reveal = e.target.closest("[data-reveal]");
    if (reveal) {
      const loc = locationOf(reveal);
      if (loc) editor.reveal(loc.line, loc.col);
    }
  });

  // Source highlighting for anything in a view that carries a location.
  const body = $("tab-body");
  let hovered = null;
  body.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-line]");
    if (el === hovered) return;
    hovered = el;
    // Only highlight when the editor still shows the compiled source.
    editor.setHover(el && editor.value === state.source ? locationOf(el) : null);
  });
  body.addEventListener("mouseleave", () => {
    hovered = null;
    editor.setHover(null);
  });
}

// ---------------------------------------------------------------- startup

async function loadExamples() {
  const select = $("examples");
  try {
    const res = await fetch("/api/examples");
    state.examples = await res.json();
  } catch {
    state.examples = [];
  }
  const groups = {};
  state.examples.forEach((ex, i) => (groups[ex.group] = groups[ex.group] || []).push([ex, i]));
  select.innerHTML = `<option value="">Load an example…</option>` +
    Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list
      .map(([ex, i]) => `<option value="${i}">${esc(ex.title)}</option>`).join("")}</optgroup>`).join("");
}

async function checkServer() {
  const pill = $("server-status");
  try {
    const info = await (await fetch("/api/info")).json();
    pill.textContent = info.binaryFound ? `compiler: ${info.binary}` : "compiler not built (run make)";
    pill.className = "pill " + (info.binaryFound ? "ok" : "bad");
  } catch {
    pill.textContent = "server offline";
    pill.className = "pill bad";
  }
}

// ---------------------------------------------------------------- routing

let currentMode = "explorer";
let learn = null;

function openInExplorer(source, maxSteps) {
  editor.value = source;
  if (maxSteps) $("max-steps").value = maxSteps;
  location.hash = "#tab=overview";
  compile();
}

// #learn and #learn/<lesson> show the course; anything else the compiler view.
function route() {
  const m = /^#learn(?:\/([\w-]+))?$/.exec(location.hash);
  const mode = m ? "learn" : "explorer";
  const changed = mode !== currentMode;
  currentMode = mode;
  $("explorer-view").hidden = mode !== "explorer";
  $("learn-view").hidden = mode !== "learn";
  document.querySelectorAll(".modes a").forEach((a) => a.classList.toggle("on", a.dataset.mode === mode));
  if (mode === "learn") {
    if (!learn) learn = createLearn({ root: $("learn-view"), api, openInExplorer });
    learn.show(m[1]);
  } else {
    const t = /(?:^#|&)tab=([a-z]+)/.exec(location.hash);
    if (t && t[1] !== state.tab && TABS.some((x) => x.id === t[1])) {
      state.tab = t[1];
      renderPipeline();
      renderTabs();
      renderTab();
    }
    if (changed) window.scrollTo({ top: 0 });
  }
}

function init() {
  const theme = storageGet("shreyalang.theme", null) ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(theme);
  $("auto-run").checked = storageGet("shreyalang.autorun", "1") === "1";
  editor.value = storageGet("shreyalang.source", WELCOME);
  wireEvents();
  renderAll();
  checkServer();
  loadExamples();
  compile();
  window.addEventListener("hashchange", route);
  route();
}

init();
