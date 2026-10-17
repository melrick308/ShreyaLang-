// Checks for quizzes and exercises. Shared by the Learn page and by
// web/test_lessons.mjs, so the page and the content test agree exactly.
//
// `run` is one compiler run: {exitCode, json, failure} where json is the
// output of `shreyalang --json ... --run`.

// Removes // comments (outside string literals) so rules such as "use a
// while loop" are not satisfied by a comment.
export function stripComments(source) {
  return source
    .split("\n")
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inString) {
          if (c === "\\") i++;
          else if (c === '"') inString = false;
        } else if (c === '"') {
          inString = true;
        } else if (c === "/" && line[i + 1] === "/") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

// Returns {passed, problems: [{kind, text}]}.
export function checkExercise(exercise, source, run) {
  if (!run || run.failure || !run.json) {
    return { passed: false, problems: [{ kind: "failure", text: (run && run.failure) || "The compiler returned no result." }] };
  }
  const problems = [];
  const wantExit = exercise.expect.exit ?? 0;
  if (run.exitCode !== wantExit) {
    const first = run.json.errors[0];
    problems.push({ kind: "exit", text: first ? first.text : `The program ended with exit code ${run.exitCode}.` });
  }
  if (exercise.expect.output !== undefined && run.json.output !== exercise.expect.output) {
    problems.push({ kind: "output", text: "The output is not what the task asks for." });
  }
  const code = stripComments(source);
  for (const rule of exercise.mustContain || []) {
    if (!new RegExp(rule.pattern).test(code)) problems.push({ kind: "rule", text: rule.message });
  }
  for (const rule of exercise.forbid || []) {
    if (new RegExp(rule.pattern).test(code)) problems.push({ kind: "rule", text: rule.message });
  }
  return { passed: problems.length === 0, problems };
}

// Does a compiler run match a quiz answer's `verify` description?
export function matchesVerify(verify, run) {
  if (!run || run.failure || !run.json) return false;
  if (verify.exit !== undefined && run.exitCode !== verify.exit) return false;
  if (verify.output !== undefined && run.json.output !== verify.output) return false;
  if (verify.category !== undefined) {
    const first = run.json.errors[0];
    if (!first || first.category !== verify.category) return false;
  }
  return true;
}
