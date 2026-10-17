// AST views: an SVG tree diagram and a collapsible outline, both built from
// the compiler's --json "ast" output.

import { esc } from "./util.js";

// Converts a JSON AST node into {kind, label, sub, cls, line, col, length, raw, children:[{role, node}]}.
export function normalize(n) {
  const kids = (list, role = "") => (list || []).map((c) => ({ role, node: normalize(c) }));
  const one = (c, role) => (c ? [{ role, node: normalize(c) }] : []);
  const base = { kind: n.node, line: n.line || 0, col: n.col || 0, raw: n, children: [] };
  switch (n.node) {
    case "Program":
      return { ...base, label: "Program", sub: `${n.body.length} statement${n.body.length === 1 ? "" : "s"}`, cls: "n-root", children: kids(n.body) };
    case "Block":
      return { ...base, label: "{ }", sub: "Block", cls: "n-block", length: 1, children: kids(n.body) };
    case "VarDecl":
      return { ...base, label: `let ${n.name}: ${n.type}`, sub: "VarDecl", cls: "n-stmt", length: n.name.length, children: one(n.init, "init") };
    case "Assign":
      return { ...base, label: `${n.name} =`, sub: "Assign", cls: "n-stmt", length: n.name.length, children: one(n.value, "value") };
    case "Print":
      return { ...base, label: "print", sub: "Print", cls: "n-stmt", length: 5, children: one(n.value) };
    case "If":
      return { ...base, label: "if", sub: "If", cls: "n-ctrl", length: 2, children: [...one(n.cond, "cond"), ...one(n.then, "then"), ...one(n.else, "else")] };
    case "While":
      return { ...base, label: "while", sub: "While", cls: "n-ctrl", length: 5, children: [...one(n.cond, "cond"), ...one(n.body, "body")] };
    case "Binary":
      return { ...base, label: n.op, sub: "Binary", cls: "n-op", length: n.op.length, children: [...one(n.left, "L"), ...one(n.right, "R")] };
    case "Unary":
      return { ...base, label: n.op, sub: "Unary", cls: "n-op", length: 1, children: one(n.operand) };
    case "Literal":
      return { ...base, label: n.value, sub: `Literal · ${n.type}`, cls: "n-lit", length: n.value.length };
    case "VarRef":
      return { ...base, label: n.name, sub: "VarRef", cls: "n-var", length: n.name.length };
    default:
      return { ...base, label: n.node, sub: "", cls: "n-stmt" };
  }
}

export function countNodes(n) {
  return 1 + n.children.reduce((s, c) => s + countNodes(c.node), 0);
}

export function treeDepth(n) {
  return 1 + Math.max(0, ...n.children.map((c) => treeDepth(c.node)));
}

const CHAR_W = 7.3;
const NODE_H = 40;
const LEVEL_H = 72;
const H_GAP = 14;
const PAD = 20;

const SUB_W = CHAR_W * 0.875; // subtitle font is 10.5px vs 12px

function measure(n) {
  n.w = Math.max(56, Math.min(260, Math.max(n.label.length * CHAR_W, n.sub.length * SUB_W) + 22));
  if (!n.children.length) {
    n.sw = n.w;
    return;
  }
  n.children.forEach((c) => measure(c.node));
  const span = n.children.reduce((s, c) => s + c.node.sw, 0) + H_GAP * (n.children.length - 1);
  n.sw = Math.max(n.w, span);
}

// Each subtree gets a horizontal band of width sw; children are packed in
// their parent's band, so no two subtrees overlap.
function place(n, left, depth, out) {
  n.x = left + n.sw / 2;
  n.y = PAD + depth * LEVEL_H;
  out.push(n);
  if (!n.children.length) return;
  const span = n.children.reduce((s, c) => s + c.node.sw, 0) + H_GAP * (n.children.length - 1);
  let x = left + (n.sw - span) / 2;
  for (const c of n.children) {
    place(c.node, x, depth + 1, out);
    x += c.node.sw + H_GAP;
  }
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Returns {svg, nodes} where nodes[i] corresponds to data-i in the SVG.
export function renderDiagram(root, scale) {
  measure(root);
  const nodes = [];
  place(root, PAD, 0, nodes);
  const width = root.sw + PAD * 2;
  const height = PAD * 2 + treeDepth(root) * LEVEL_H - (LEVEL_H - NODE_H);
  const index = new Map(nodes.map((n, i) => [n, i]));

  let edges = "";
  let labels = "";
  for (const n of nodes) {
    for (const c of n.children) {
      const x1 = n.x, y1 = n.y + NODE_H, x2 = c.node.x, y2 = c.node.y;
      const my = (y1 + y2) / 2;
      edges += `<path class="ast-edge" d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"/>`;
      if (c.role && c.role !== "L" && c.role !== "R") {
        labels += `<text class="ast-edge-label" x="${(x1 + x2) / 2 + 4}" y="${my + 3}">${esc(c.role)}</text>`;
      }
    }
  }
  let boxes = "";
  for (const n of nodes) {
    const maxChars = Math.floor((n.w - 16) / CHAR_W);
    const maxSub = Math.floor((n.w - 16) / SUB_W);
    boxes += `<g class="ast-node ${n.cls}" data-i="${index.get(n)}" tabindex="0">
      <rect x="${n.x - n.w / 2}" y="${n.y}" width="${n.w}" height="${NODE_H}" rx="8"/>
      <text x="${n.x}" y="${n.y + 17}" text-anchor="middle" font-weight="700">${esc(truncate(n.label, maxChars))}</text>
      <text class="sub" x="${n.x}" y="${n.y + 31}" text-anchor="middle">${esc(truncate(n.sub, maxSub))}</text>
    </g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Abstract syntax tree">${edges}${labels}${boxes}</svg>`;
  return { svg, nodes, width, height, root };
}

// Outline: nested <details>; returns {html, nodes}.
export function renderOutline(root) {
  const nodes = [];
  const walk = (n, role) => {
    const i = nodes.push(n) - 1;
    const roleHtml = role && role !== "L" && role !== "R" ? `<span class="role">${esc(role)}:</span>` : "";
    const loc = n.line ? `<span class="loc">@${n.line}:${n.col}</span>` : "";
    const text = `${roleHtml}<strong>${esc(n.sub.split(" ·")[0] || n.kind)}</strong> ${esc(n.kind === "Block" || n.kind === "Program" ? "" : n.label)}${n.kind === "Literal" ? ` <span class="muted">(${esc(n.raw.type)})</span>` : ""}${loc}`;
    if (!n.children.length) return `<div class="leaf" data-i="${i}">${text}</div>`;
    return `<details open><summary data-i="${i}">${text}</summary>${n.children.map((c) => walk(c.node, c.role)).join("")}</details>`;
  };
  return { html: `<div class="outline">${walk(root, "")}</div>`, nodes };
}
