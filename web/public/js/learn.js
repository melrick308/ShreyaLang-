// "Learn ShreyaLang": a course with runnable examples, quizzes and exercises.
// Every result shown here comes from the real compiler (via /api/compile).

import { Editor } from "./editor.js";
import { checkExercise, matchesVerify } from "./learn-check.js";
import { CHEAT_SHEET, LESSONS } from "./lessons.js";
import { charIndex, debounce, esc, plural, storageGet, storageSet, tokenCategory } from "./util.js";
import { errorSnippet } from "./views.js";

const PROGRESS_KEY = "shreyalang.learn";
const DRAFT_PREFIX = "shreyalang.learn.code.";

// ---------------------------------------------------------------- helpers

// Items that count towards progress: quizzes and exercises.
function lessonItems(lesson) {
  const items = [];
  let q = 0;
  let e = 0;
  for (const b of lesson.blocks) {
    if (b.t === "quiz") items.push(`${lesson.id}:q${++q}`);
    if (b.t === "exercise") items.push(`${lesson.id}:e${++e}`);
  }
  return items;
}

function loadProgress() {
  try {
    const p = JSON.parse(storageGet(PROGRESS_KEY, "{}")) || {};
    return { done: new Set(p.done || []), last: p.last || null };
  } catch {
    return { done: new Set(), last: null };
  }
}

// Colours source text with the compiler's own tokens (from --tokens).
function highlight(source, tokens) {
  const lines = source.split("\n");
  const cls = lines.map((l) => new Array(l.length).fill(""));
  if (tokens) {
    for (const t of tokens) {
      if (t.kind === "EOF" || t.line < 1 || t.line > lines.length) continue;
      const start = charIndex(lines[t.line - 1], t.col);
      for (let i = start; i < Math.min(lines[t.line - 1].length, start + t.lexeme.length); i++)
        cls[t.line - 1][i] = "t-" + tokenCategory(t.kind);
    }
    lines.forEach((line, li) => {
      for (let i = 0; i < line.length - 1; i++) {
        if (!cls[li][i] && line[i] === "/" && line[i + 1] === "/") {
          for (let k = i; k < line.length; k++) cls[li][k] = "t-comment";
          break;
        }
      }
    });
  }
  return lines
    .map((line, li) => {
      let out = "";
      let run = "";
      let current = null;
      for (let i = 0; i < line.length; i++) {
        if (cls[li][i] !== current) {
          if (run) out += current ? `<span class="${current}">${esc(run)}</span>` : esc(run);
          run = "";
          current = cls[li][i];
        }
        run += line[i];
      }
      if (run) out += current ? `<span class="${current}">${esc(run)}</span>` : esc(run);
      return out;
    })
    .join("\n");
}

function exitLabel(code) {
  return { 0: "success", 1: "lexical / syntax error", 2: "semantic error", 3: "runtime error" }[code] || "error";
}

// Renders a compiler run (output and errors) for an example or exercise.
function runResultHtml(run, source) {
  if (!run || run.failure || !run.json) {
    return `<div class="banner err"><span class="b-icon">⚠</span><div>${esc((run && run.failure) || "No result from the compiler.")}</div></div>`;
  }
  const j = run.json;
  const lines = source.split("\n");
  const executed = j.output !== undefined && !j.errors.some((e) => e.category !== "Runtime");
  let html = `<div class="lc-result-head"><span class="badge ${run.exitCode === 0 ? "ok" : run.exitCode === 3 ? "warn" : "err"}">exit ${run.exitCode} · ${exitLabel(run.exitCode)}</span>`;
  if (j.steps !== undefined) html += `<span class="small muted">${plural(j.steps, "step")}</span>`;
  html += `</div>`;
  if (executed) {
    html += j.output ? `<pre class="lc-console">${esc(j.output)}</pre>` : `<pre class="lc-console"><span class="placeholder">(no output)</span></pre>`;
  } else {
    html += `<p class="small muted lc-not-run">The program was not executed because it did not compile.</p>`;
  }
  for (const e of j.errors) {
    html += `<div class="lc-error cat-${esc(e.category)}"><div><span class="badge cat-badge">${esc(e.category)} error</span>
      <span class="msg">${esc(e.message)}</span>${e.line ? ` <span class="small muted">line ${e.line}${e.col ? ", col " + e.col : ""}</span>` : ""}</div>
      ${errorSnippet(e, lines)}</div>`;
  }
  return html;
}

// ---------------------------------------------------------------- module

export function createLearn({ root, api, openInExplorer }) {
  const progress = loadProgress();
  const tokenCache = new Map();
  let editors = [];

  function save() {
    storageSet(PROGRESS_KEY, JSON.stringify({ done: [...progress.done], last: progress.last }));
  }

  function markDone(id) {
    if (progress.done.has(id)) return;
    progress.done.add(id);
    save();
    updateProgressUi();
  }

  function counts(lesson) {
    const items = lessonItems(lesson);
    return { done: items.filter((i) => progress.done.has(i)).length, total: items.length };
  }

  function totals() {
    let done = 0;
    let total = 0;
    for (const l of LESSONS) {
      const c = counts(l);
      done += c.done;
      total += c.total;
    }
    return { done, total, pct: total ? Math.round((100 * done) / total) : 0 };
  }

  async function tokensFor(source) {
    if (tokenCache.has(source)) return tokenCache.get(source);
    const promise = api(source, { mode: "tokens" })
      .then((r) => (r.main && r.main.json ? r.main.json.tokens : null))
      .catch(() => null);
    tokenCache.set(source, promise);
    return promise;
  }

  function progressBar(t) {
    return `<div class="progress" role="progressbar" aria-valuenow="${t.pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill" style="width:${t.pct}%"></div></div>`;
  }

  function updateProgressUi() {
    const t = totals();
    root.querySelectorAll("[data-progress-text]").forEach((el) => (el.textContent = `${t.done} of ${t.total} activities · ${t.pct}%`));
    root.querySelectorAll(".progress-fill").forEach((el) => (el.style.width = t.pct + "%"));
    root.querySelectorAll("[data-lesson-status]").forEach((el) => {
      const lesson = LESSONS.find((l) => l.id === el.dataset.lessonStatus);
      const c = counts(lesson);
      el.className = "lesson-status " + (c.done === c.total && c.total ? "complete" : c.done ? "started" : "");
      el.textContent = c.done === c.total && c.total ? "✓" : c.total ? `${c.done}/${c.total}` : "";
    });
  }

  // -------------------------------------------------------------- home

  function renderHome() {
    const t = totals();
    const next = LESSONS.find((l) => counts(l).done < counts(l).total) || LESSONS[0];
    const resume = progress.last && LESSONS.find((l) => l.id === progress.last);
    const startLesson = resume && counts(resume).done < counts(resume).total ? resume : next;
    root.innerHTML = `
      <div class="learn-home">
        <section class="learn-hero card">
          <div class="hero-text">
            <span class="eyebrow">Interactive course</span>
            <h1>Learn ShreyaLang</h1>
            <p>ShreyaLang is a small programming language with four types, variables, decisions and loops: everything you need to understand how programs work, and nothing that gets in the way. Each lesson explains one idea, lets you run examples on the real compiler, and ends with quizzes and exercises that are checked by compiling your code.</p>
            <div class="hero-actions">
              <a class="button primary" href="#learn/${startLesson.id}">${t.done ? "Continue" : "Start"}: ${esc(startLesson.title)} →</a>
              <a class="button ghost" href="#tab=overview">Open the Compiler</a>
            </div>
          </div>
          <div class="hero-progress">
            <div class="small muted">Your progress</div>
            <div class="hero-pct">${t.pct}%</div>
            ${progressBar(t)}
            <div class="small muted" data-progress-text>${t.done} of ${t.total} activities · ${t.pct}%</div>
            <button class="link-btn small" data-act="reset-progress" type="button">Reset progress</button>
          </div>
        </section>

        <h2 class="learn-h2">Lessons</h2>
        <div class="lesson-grid">
          ${LESSONS.map((l, i) => {
            const c = counts(l);
            return `<a class="lesson-card card" href="#learn/${l.id}">
              <div class="lesson-card-top"><span class="lesson-num">${i + 1}</span>
                <span class="lesson-status ${c.done === c.total && c.total ? "complete" : c.done ? "started" : ""}" data-lesson-status="${l.id}">${c.done === c.total && c.total ? "✓" : c.total ? `${c.done}/${c.total}` : ""}</span></div>
              <h3>${esc(l.title)}</h3>
              <ul>${l.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
              <div class="small muted">${l.minutes} min · ${plural(lessonItems(l).length, "activity", "activities")}</div>
            </a>`;
          }).join("")}
        </div>

        <h2 class="learn-h2">Cheat sheet</h2>
        <div class="cheat card">
          ${CHEAT_SHEET.map(([k, v]) => `<div class="cheat-row"><span class="cheat-k">${esc(k)}</span><code>${esc(v)}</code></div>`).join("")}
        </div>
      </div>`;
    root.querySelector('[data-act="reset-progress"]').addEventListener("click", () => {
      if (!confirm("Reset all lesson progress? Saved exercise code is kept.")) return;
      progress.done.clear();
      progress.last = null;
      save();
      renderHome();
    });
  }

  // -------------------------------------------------------------- lesson

  function codeFigure(source, { label, note, expect, maxSteps, runnable = true }) {
    const failing = expect && expect !== 0;
    return `<figure class="lc" data-src="${esc(source)}"${maxSteps ? ` data-max-steps="${maxSteps}"` : ""}${expect ? ` data-expect="${expect}"` : ""}>
      <div class="lc-bar">
        <span class="lc-label">${esc(label || (failing ? "Example · this program is meant to fail" : "Example"))}</span>
        <span class="spacer"></span>
        ${runnable ? `<button class="lc-btn run" data-act="run" type="button">▶ Run</button>` : ""}
        <button class="lc-btn" data-act="open" type="button" title="Open in the Compiler view to see every compiler phase">Compiler ↗</button>
        <button class="lc-btn" data-act="copy" type="button">Copy</button>
      </div>
      <pre class="lc-src">${esc(source)}</pre>
      <div class="lc-out" hidden></div>
      ${note ? `<figcaption>${esc(note)}</figcaption>` : ""}
    </figure>`;
  }

  function blockHtml(block, lesson, counters) {
    switch (block.t) {
      case "h":
        return `<h2 class="lesson-h2">${esc(block.text)}</h2>`;
      case "p":
        return `<p>${block.html}</p>`;
      case "code":
        return codeFigure(block.code, block);
      case "syntax":
        return `<div class="syntax-card"><div class="syntax-label">Syntax</div><pre>${esc(block.pattern)}</pre><p>${block.html}</p></div>`;
      case "table":
        return `<div class="table-wrap lesson-table"><table class="data"><thead><tr>${block.head.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${block.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "callout": {
        const title = { rule: "Rule", tip: "Tip", mistake: "Common mistake" }[block.kind];
        const icon = { rule: "§", tip: "★", mistake: "!" }[block.kind];
        return `<div class="callout ${block.kind}"><div class="callout-title"><span class="callout-icon">${icon}</span>${title}</div>
          <p>${block.html}</p>${block.code !== undefined ? codeFigure(block.code, { ...block, label: block.expect ? "Try it: the compiler rejects this" : "Example" }) : ""}</div>`;
      }
      case "quiz": {
        const id = `${lesson.id}:q${++counters.q}`;
        return `<div class="quiz card" data-id="${id}" data-index="${lesson.blocks.indexOf(block)}">
          <div class="activity-head"><span class="activity-kind">Quiz</span><span class="activity-title">${block.prompt}</span>
            <span class="activity-done" ${progress.done.has(id) ? "" : "hidden"}>✓ solved</span></div>
          ${codeFigure(block.code, { label: "Program", runnable: false })}
          <div class="choices">${block.choices.map((c, i) => `<button class="choice" data-choice="${i}" type="button"><span class="choice-key">${String.fromCharCode(65 + i)}</span>${esc(c)}</button>`).join("")}</div>
          <div class="quiz-feedback" hidden></div>
        </div>`;
      }
      case "exercise": {
        const id = `${lesson.id}:e${++counters.e}`;
        return `<div class="exercise card" data-id="${id}" data-index="${lesson.blocks.indexOf(block)}">
          <div class="activity-head"><span class="activity-kind ex">Exercise</span><span class="activity-title">${esc(block.title)}</span>
            <span class="activity-done" ${progress.done.has(id) ? "" : "hidden"}>✓ solved</span></div>
          <p class="task">${block.task}</p>
          <div class="editor small">
            <div class="gutter"></div>
            <div class="code"><div class="highlight"></div><textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Exercise code"></textarea></div>
          </div>
          <div class="ex-actions">
            <button class="primary" data-act="check" type="button">✓ Check <kbd>Ctrl ↵</kbd></button>
            <button class="lc-btn" data-act="hint" type="button">Hint</button>
            <button class="lc-btn" data-act="solution" type="button">Show solution</button>
            <button class="lc-btn" data-act="reset" type="button">Reset</button>
            <span class="spacer"></span>
            <button class="lc-btn" data-act="explore" type="button">Compiler ↗</button>
          </div>
          <div class="hints"></div>
          <div class="ex-result" hidden></div>
        </div>`;
      }
      default:
        return "";
    }
  }

  function renderLesson(lesson) {
    progress.last = lesson.id;
    save();
    editors = [];
    const index = LESSONS.indexOf(lesson);
    const prev = LESSONS[index - 1];
    const next = LESSONS[index + 1];
    const counters = { q: 0, e: 0 };
    const t = totals();

    root.innerHTML = `
      <div class="learn-layout">
        <aside class="learn-nav card">
          <a class="learn-nav-home" href="#learn">← Learn ShreyaLang</a>
          ${progressBar(t)}
          <div class="small muted" data-progress-text>${t.done} of ${t.total} activities · ${t.pct}%</div>
          <ol class="learn-nav-list">
            ${LESSONS.map((l, i) => {
              const c = counts(l);
              return `<li><a href="#learn/${l.id}" class="${l === lesson ? "current" : ""}"><span class="nav-num">${i + 1}</span><span class="nav-title">${esc(l.title)}</span>
                <span class="lesson-status ${c.done === c.total && c.total ? "complete" : c.done ? "started" : ""}" data-lesson-status="${l.id}">${c.done === c.total && c.total ? "✓" : c.total ? `${c.done}/${c.total}` : ""}</span></a></li>`;
            }).join("")}
          </ol>
        </aside>
        <article class="lesson card">
          <header class="lesson-header">
            <div class="eyebrow">Lesson ${index + 1} of ${LESSONS.length} · ${lesson.minutes} min</div>
            <h1>${esc(lesson.title)}</h1>
            <div class="goals"><div class="goals-title">In this lesson you will</div>
              <ul>${lesson.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>
          </header>
          <div class="lesson-body">${lesson.blocks.map((b) => blockHtml(b, lesson, counters)).join("")}</div>
          <section class="summary-box"><h2>Summary</h2><ul>${lesson.summary.map((s) => `<li>${s}</li>`).join("")}</ul></section>
          <nav class="lesson-pager">
            ${prev ? `<a class="button ghost" href="#learn/${prev.id}">← ${esc(prev.title)}</a>` : `<a class="button ghost" href="#learn">← Course overview</a>`}
            <span class="spacer"></span>
            ${next ? `<a class="button primary" href="#learn/${next.id}">Next: ${esc(next.title)} →</a>` : `<a class="button primary" href="#tab=overview">Finish: open the Compiler →</a>`}
          </nav>
        </article>
      </div>`;

    // Colour every code figure with the compiler's tokens.
    root.querySelectorAll("figure.lc").forEach(async (fig) => {
      const source = fig.dataset.src;
      const tokens = await tokensFor(source);
      if (tokens && fig.isConnected) fig.querySelector(".lc-src").innerHTML = highlight(source, tokens);
    });
    wireFigures(root);
    root.querySelectorAll(".quiz").forEach((el) => wireQuiz(el, lesson.blocks[Number(el.dataset.index)]));
    root.querySelectorAll(".exercise").forEach((el) => wireExercise(el, lesson.blocks[Number(el.dataset.index)]));
    window.scrollTo({ top: 0 });
  }

  function wireFigures(scope) {
    scope.querySelectorAll("figure.lc").forEach((fig) => {
      const source = fig.dataset.src;
      fig.querySelector('[data-act="open"]').addEventListener("click", () => openInExplorer(source, Number(fig.dataset.maxSteps) || undefined));
      fig.querySelector('[data-act="copy"]').addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(source);
          e.target.textContent = "Copied";
        } catch {
          e.target.textContent = "Copy failed";
        }
        setTimeout(() => (e.target.textContent = "Copy"), 1200);
      });
      const runBtn = fig.querySelector('[data-act="run"]');
      if (!runBtn) return;
      runBtn.addEventListener("click", async () => {
        const out = fig.querySelector(".lc-out");
        out.hidden = false;
        out.innerHTML = `<span class="spinner"></span> <span class="small muted">Compiling and running…</span>`;
        runBtn.disabled = true;
        const r = await api(source, { compare: false, maxSteps: Number(fig.dataset.maxSteps) || undefined });
        runBtn.disabled = false;
        out.innerHTML = runResultHtml(r.main, source);
      });
    });
  }

  function wireQuiz(el, quiz) {
    const feedback = el.querySelector(".quiz-feedback");
    el.querySelectorAll(".choice").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const chosen = Number(btn.dataset.choice);
        const correct = chosen === quiz.answer;
        el.querySelectorAll(".choice").forEach((b) => {
          b.classList.remove("is-right", "is-wrong", "picked");
          if (Number(b.dataset.choice) === quiz.answer && correct) b.classList.add("is-right");
        });
        btn.classList.add(correct ? "is-right" : "is-wrong", "picked");
        feedback.hidden = false;
        feedback.innerHTML = `<div class="banner ${correct ? "ok" : "err"}"><span class="b-icon">${correct ? "✓" : "✕"}</span><div>
          <strong>${correct ? "Correct!" : "Not quite. Try another answer."}</strong>${correct ? " " + quiz.explain : ""}</div></div>
          ${correct ? `<div class="quiz-proof"><span class="spinner"></span> <span class="small muted">Checking with the real compiler…</span></div>` : ""}`;
        if (!correct) return;
        el.querySelector(".activity-done").hidden = false;
        markDone(el.dataset.id);
        const r = await api(quiz.code, { compare: false, maxSteps: quiz.maxSteps });
        const proof = feedback.querySelector(".quiz-proof");
        if (!proof) return;
        const confirmed = matchesVerify(quiz.verify, r.main);
        proof.innerHTML = `<div class="small muted proof-title">${confirmed ? "✓ Confirmed by the compiler:" : "The compiler produced:"}</div>${runResultHtml(r.main, quiz.code)}`;
      })
    );
  }

  function wireExercise(el, ex) {
    const draftKey = DRAFT_PREFIX + el.dataset.id;
    const editorEl = el.querySelector(".editor");
    const editor = new Editor({
      textarea: editorEl.querySelector("textarea"),
      highlight: editorEl.querySelector(".highlight"),
      gutter: editorEl.querySelector(".gutter"),
      container: editorEl,
    });
    editors.push(editor);
    editor.value = storageGet(draftKey, ex.starter);
    const result = el.querySelector(".ex-result");
    const hintsEl = el.querySelector(".hints");
    let hintsShown = 0;

    const colour = debounce(async () => {
      const source = editor.value;
      const r = await api(source, { mode: "tokens" }).catch(() => null);
      if (r && r.main && r.main.json && editor.value === source) {
        editor.setAnalysis({ source, tokens: r.main.json.tokens, errors: r.main.json.errors });
      }
    }, 350);
    colour();
    editor.onChange(() => {
      storageSet(draftKey, editor.value);
      colour();
    });

    async function check() {
      const source = editor.value;
      const btn = el.querySelector('[data-act="check"]');
      btn.disabled = true;
      result.hidden = false;
      result.innerHTML = `<span class="spinner"></span> <span class="small muted">Compiling and running your program…</span>`;
      const r = await api(source, { compare: false });
      btn.disabled = false;
      const run = r.main;
      if (run && run.json) editor.setAnalysis({ source, tokens: run.json.tokens, errors: run.json.errors });
      const verdict = checkExercise(ex, source, run);
      if (verdict.passed) {
        el.querySelector(".activity-done").hidden = false;
        markDone(el.dataset.id);
        result.innerHTML = `<div class="banner ok"><span class="b-icon">✓</span><div><strong>Well done, that's correct!</strong> Your program compiled, ran and printed exactly the expected output.</div></div>${runResultHtml(run, source)}`;
        return;
      }
      // A program that fails to compile or run has no meaningful output to
      // compare, so only the error is reported in that case.
      const failed = verdict.problems.some((p) => p.kind === "exit" || p.kind === "failure");
      const listed = verdict.problems.filter((p) => p.kind === "rule" || (p.kind === "output" && !failed));
      const lead = failed
        ? `<li>${run && run.json && run.json.errors.length ? `The compiler reported ${run.json.errors[0].category === "Runtime" ? "a runtime error" : "an error"}. Read the message below, fix the code and check again.` : esc(verdict.problems[0].text)}</li>`
        : "";
      let html = `<div class="banner err"><span class="b-icon">✕</span><div><strong>Not yet.</strong><ul class="problem-list">${lead}${listed.map((p) => `<li>${esc(p.text)}</li>`).join("")}</ul></div></div>`;
      if (!failed && run && run.json && verdict.problems.some((p) => p.kind === "output")) {
        html += `<div class="compare ex-compare">
          <div class="side"><div class="side-head">Expected output</div><pre>${esc(ex.expect.output)}</pre></div>
          <div class="side"><div class="side-head">Your output</div><pre>${run.json.output ? esc(run.json.output) : '<span class="muted">(nothing)</span>'}</pre></div>
        </div>`;
      }
      html += runResultHtml(run, source);
      result.innerHTML = html;
    }

    editorEl.querySelector("textarea").addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        check();
      }
    });
    el.querySelector('[data-act="check"]').addEventListener("click", check);
    el.querySelector('[data-act="hint"]').addEventListener("click", (e) => {
      if (hintsShown < ex.hints.length) {
        hintsEl.insertAdjacentHTML("beforeend", `<div class="hint-item"><strong>Hint ${hintsShown + 1}:</strong> ${esc(ex.hints[hintsShown])}</div>`);
        hintsShown++;
      }
      if (hintsShown >= ex.hints.length) e.target.disabled = true;
    });
    el.querySelector('[data-act="solution"]').addEventListener("click", () => {
      if (!confirm("Replace your code with the model solution?")) return;
      editor.value = ex.solution;
      storageSet(draftKey, editor.value);
      colour();
      result.hidden = true;
    });
    el.querySelector('[data-act="reset"]').addEventListener("click", () => {
      editor.value = ex.starter;
      storageSet(draftKey, editor.value);
      colour();
      result.hidden = true;
    });
    el.querySelector('[data-act="explore"]').addEventListener("click", () => openInExplorer(editor.value));
  }

  // -------------------------------------------------------------- routing

  function show(lessonId) {
    const lesson = LESSONS.find((l) => l.id === lessonId);
    if (lesson) renderLesson(lesson);
    else renderHome();
  }

  return { show };
}
