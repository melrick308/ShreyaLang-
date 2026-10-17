// Source editor: a transparent <textarea> on top of a highlight layer.
//
// Colouring comes from the compiler's real token stream (the last compile).
// While the text differs from what was compiled, the layer shows plain text
// so it never displays tokens that do not match the source.

import { charIndex, esc, tokenCategory } from "./util.js";

const INDENT = "    ";

export class Editor {
  constructor({ textarea, highlight, gutter, container }) {
    this.textarea = textarea;
    this.highlight = highlight;
    this.gutter = gutter;
    this.container = container;
    this.analysis = null; // {source, tokens, errors}
    this.hover = null; // {line, col?, length?}
    this.changeHandlers = [];

    this.hlInner = document.createElement("div");
    this.hlInner.className = "hl-inner";
    this.highlight.appendChild(this.hlInner);
    this.gutterInner = document.createElement("div");
    this.gutterInner.className = "gutter-inner";
    this.gutter.appendChild(this.gutterInner);

    textarea.addEventListener("input", () => {
      this.render();
      this.changeHandlers.forEach((fn) => fn(this.value));
    });
    textarea.addEventListener("scroll", () => this.syncScroll());
    textarea.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  get value() {
    return this.textarea.value;
  }

  set value(text) {
    this.textarea.value = text;
    this.textarea.scrollTop = 0;
    this.textarea.scrollLeft = 0;
    this.render();
  }

  onChange(fn) {
    this.changeHandlers.push(fn);
  }

  setAnalysis(analysis) {
    this.analysis = analysis;
    this.render();
  }

  setHover(hover) {
    this.hover = hover;
    this.render();
    if (hover) this.scrollLineIntoView(hover.line, false);
  }

  // Moves the caret to (line, col) and scrolls it into view.
  reveal(line, col) {
    const lines = this.value.split("\n");
    if (line < 1 || line > lines.length) return;
    let offset = 0;
    for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
    offset += col > 0 ? charIndex(lines[line - 1], col) : 0;
    this.textarea.focus({ preventScroll: true });
    this.textarea.setSelectionRange(offset, offset);
    this.scrollLineIntoView(line, true);
  }

  scrollLineIntoView(line, center) {
    const lh = this.lineHeight();
    const top = (line - 1) * lh;
    const ta = this.textarea;
    const visibleTop = ta.scrollTop;
    const visibleBottom = ta.scrollTop + ta.clientHeight - 2 * lh;
    if (center || top < visibleTop || top > visibleBottom) {
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    }
  }

  lineHeight() {
    return parseFloat(getComputedStyle(this.textarea).lineHeight) || 21;
  }

  syncScroll() {
    const { scrollTop, scrollLeft } = this.textarea;
    this.hlInner.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.gutterInner.style.transform = `translateY(${-scrollTop}px)`;
  }

  onKeyDown(e) {
    const ta = this.textarea;
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.shiftKey) this.insert(INDENT);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      // Keep the current indentation; indent one more level after '{'.
      const before = ta.value.slice(0, ta.selectionStart);
      const lineStart = before.lastIndexOf("\n") + 1;
      const line = before.slice(lineStart);
      let indent = /^[ \t]*/.exec(line)[0];
      if (/\{\s*$/.test(line)) indent += INDENT;
      e.preventDefault();
      this.insert("\n" + indent);
      return;
    }
    if (e.key === "}" && !e.ctrlKey && !e.metaKey) {
      // Typing '}' on a whitespace-only line removes one indentation level.
      const before = ta.value.slice(0, ta.selectionStart);
      const lineStart = before.lastIndexOf("\n") + 1;
      const line = before.slice(lineStart);
      if (ta.selectionStart === ta.selectionEnd && /^ +$/.test(line) && line.length >= INDENT.length) {
        e.preventDefault();
        ta.setSelectionRange(ta.selectionStart - INDENT.length, ta.selectionStart);
        this.insert("}");
      }
    }
  }

  // Inserts text at the selection, keeping the browser's undo history.
  insert(text) {
    const ta = this.textarea;
    ta.focus();
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  }

  render() {
    const text = this.value;
    const lines = text.split("\n");
    const valid = this.analysis && this.analysis.source === text;
    this.container.classList.toggle("stale", !valid && !!text);

    // Per-line arrays of character classes.
    const tok = lines.map((l) => new Array(l.length).fill(""));
    const mark = lines.map((l) => new Array(l.length).fill(""));
    const lineClass = lines.map(() => "");
    const gutterClass = lines.map(() => "");
    const endMarks = lines.map(() => false);

    if (valid) {
      for (const t of this.analysis.tokens || []) {
        if (t.kind === "EOF" || t.line < 1 || t.line > lines.length) continue;
        const lineText = lines[t.line - 1];
        const start = charIndex(lineText, t.col);
        const end = Math.min(lineText.length, start + t.lexeme.length);
        const cls = "t-" + tokenCategory(t.kind);
        for (let i = start; i < end; i++) tok[t.line - 1][i] = cls;
      }
      // Comments are the only source text that produces no token.
      lines.forEach((lineText, li) => {
        for (let i = 0; i < lineText.length - 1; i++) {
          if (!tok[li][i] && lineText[i] === "/" && lineText[i + 1] === "/") {
            for (let k = i; k < lineText.length; k++) tok[li][k] = "t-comment";
            break;
          }
        }
      });
      for (const err of this.analysis.errors || []) {
        if (err.line < 1 || err.line > lines.length) continue;
        const li = err.line - 1;
        lineClass[li] = "line-err";
        gutterClass[li] = "err";
        if (err.col < 1) continue;
        const start = charIndex(lines[li], err.col);
        if (start >= lines[li].length) {
          endMarks[li] = true;
          continue;
        }
        // Underline the whole token at the error position when there is one.
        let end = start + 1;
        const t = (this.analysis.tokens || []).find((x) => x.line === err.line && charIndex(lines[li], x.col) === start);
        if (t) end = Math.min(lines[li].length, start + t.lexeme.length);
        else if (lines[li][start] === '"') end = lines[li].length;
        for (let i = start; i < end; i++) mark[li][i] += " mark-err";
      }
    }

    if (this.hover && this.hover.line >= 1 && this.hover.line <= lines.length) {
      const li = this.hover.line - 1;
      lineClass[li] = (lineClass[li] + " line-hl").trim();
      gutterClass[li] = gutterClass[li] || "hl";
      if (this.hover.col > 0) {
        const start = charIndex(lines[li], this.hover.col);
        const len = Math.max(1, this.hover.length || 1);
        for (let i = start; i < Math.min(lines[li].length, start + len); i++) mark[li][i] += " mark-hl";
      }
    }

    let html = "";
    lines.forEach((lineText, li) => {
      let inner = "";
      let runCls = null;
      let run = "";
      for (let i = 0; i < lineText.length; i++) {
        const cls = (tok[li][i] + mark[li][i]).trim();
        if (cls !== runCls) {
          if (run) inner += runCls ? `<span class="${runCls}">${esc(run)}</span>` : esc(run);
          run = "";
          runCls = cls;
        }
        run += lineText[i];
      }
      if (run) inner += runCls ? `<span class="${runCls}">${esc(run)}</span>` : esc(run);
      if (endMarks[li]) inner += `<span class="mark-err-empty"></span>`;
      html += `<div class="hl-line ${lineClass[li]}">${inner}</div>`;
    });
    this.hlInner.innerHTML = html;

    this.gutterInner.innerHTML = lines
      .map((_, i) => `<div class="gl ${gutterClass[i]}">${i + 1}</div>`)
      .join("");
    this.syncScroll();
  }
}
