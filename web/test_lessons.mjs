// Verifies the "Learn ShreyaLang" course against the real compiler:
//   - every example and every "common mistake" snippet ends with the exit
//     code the lesson claims (0 unless `expect` says otherwise),
//   - every quiz answer matches what the compiler really does,
//   - every exercise solution passes its own checks, and every starter
//     program does not (so no exercise is already solved).
//
// Usage: node web/test_lessons.mjs [path/to/shreyalang]

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./public/js/lessons.js";
import { checkExercise, matchesVerify } from "./public/js/learn-check.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.argv[2] || path.join(root, "build", process.platform === "win32" ? "shreyalang.exe" : "shreyalang");
const dir = mkdtempSync(path.join(tmpdir(), "shreyalang-lessons-"));
const file = path.join(dir, "program.sl");

function run(source, maxSteps) {
  writeFileSync(file, source);
  const args = [file, "--json", "--run"];
  if (maxSteps) args.push("--max-steps", String(maxSteps));
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 10000 });
  if (r.error) return { failure: r.error.message };
  try {
    return { exitCode: r.status, json: JSON.parse(r.stdout) };
  } catch {
    return { failure: "invalid JSON: " + r.stdout.slice(0, 200) };
  }
}

let passed = 0;
const failures = [];
const check = (ok, what, detail) => {
  if (ok) passed++;
  else failures.push(`${what}\n      ${detail}`);
};
const describe = (r) =>
  r.failure ? r.failure : `exit ${r.exitCode}, output ${JSON.stringify(r.json.output)}, first error ${JSON.stringify(r.json.errors[0]?.text || "")}`;

const ids = new Set();
for (const [n, lesson] of LESSONS.entries()) {
  check(!ids.has(lesson.id), `lesson ${n + 1} id`, `duplicate id ${lesson.id}`);
  ids.add(lesson.id);
  let q = 0;
  let e = 0;
  for (const block of lesson.blocks) {
    const where = `lesson ${n + 1} (${lesson.id})`;
    if ((block.t === "code" || block.t === "callout") && block.code !== undefined) {
      const r = run(block.code, block.maxSteps);
      const want = block.expect ?? 0;
      check(!r.failure && r.exitCode === want, `${where} example: ${JSON.stringify(block.code.slice(0, 40))}`, `expected exit ${want}, got ${describe(r)}`);
    } else if (block.t === "quiz") {
      q++;
      const r = run(block.code, block.maxSteps);
      check(block.answer >= 0 && block.answer < block.choices.length, `${where} quiz ${q} answer index`, `answer ${block.answer}`);
      check(matchesVerify(block.verify, r), `${where} quiz ${q}: ${block.prompt}`, `verify ${JSON.stringify(block.verify)} but compiler gave ${describe(r)}`);
    } else if (block.t === "exercise") {
      e++;
      const sol = run(block.solution);
      const solCheck = checkExercise(block, block.solution, sol);
      check(solCheck.passed, `${where} exercise ${e} solution (${block.title})`, `${solCheck.problems.map((p) => p.text).join("; ")} | ${describe(sol)}`);
      const start = run(block.starter);
      check(!checkExercise(block, block.starter, start).passed, `${where} exercise ${e} starter (${block.title})`, "the starter program already passes the exercise");
    }
  }
}

rmSync(dir, { recursive: true, force: true });
for (const f of failures) console.log("FAIL  " + f);
console.log(`\n${passed} passed, ${failures.length} failed (${LESSONS.length} lessons)`);
process.exit(failures.length ? 1 : 0);
