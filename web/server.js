// ShreyaLang Compiler - web frontend server.
//
// Serves the static page in web/public and exposes a small API that runs the
// real `shreyalang` CLI with --json. The server never interprets ShreyaLang
// itself: everything the page shows comes from the compiler's JSON output.
//
// Safety:
//   - the CLI is started with execFile and an argument array (no shell),
//   - the program is written to a fresh temp directory, removed afterwards,
//   - each run has a wall-clock timeout and a stdout/stderr size limit,
//   - request bodies, source size and --max-steps are bounded,
//   - only a fixed number of compiler processes run at once,
//   - the server listens on 127.0.0.1 by default.
//
// Usage:  node web/server.js            (http://127.0.0.1:8080)
//   env:  PORT, HOST, SHREYALANG_BIN

"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const SAMPLES_DIR = path.join(ROOT, "samples");
const CASES_DIR = path.join(ROOT, "tests", "cases");
const BIN =
  process.env.SHREYALANG_BIN ||
  path.join(ROOT, "build", process.platform === "win32" ? "shreyalang.exe" : "shreyalang");
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "127.0.0.1";

const LIMITS = {
  bodyBytes: 256 * 1024,      // request body
  sourceBytes: 100 * 1024,    // ShreyaLang program
  outputBytes: 8 * 1024 * 1024, // CLI stdout / stderr
  timeoutMs: 5000,            // per compiler process
  maxSteps: 10000000,         // upper bound for --max-steps
  concurrent: 4,              // compiler processes at once
};

// Test programs offered as examples, with a short description each.
const EXAMPLE_TESTS = [
  ["01_precedence", "Test 1: a + b * 2"],
  ["03_if_else", "Test 3: if / else"],
  ["04_while_loop", "Test 4: while loop"],
  ["08_constant_folding", "Test 8: constant folding"],
  ["10_division_by_zero", "Test 10: runtime division by zero"],
  ["14_shadowing", "Test 14: shadowing"],
  ["16_short_circuit", "Test 16: short-circuit && and ||"],
  ["18_step_limit", "Test 18: infinite loop vs. step limit"],
  ["20_loop_propagation_tac", "Test 20: no propagation across a loop label"],
  ["28_operator_type_errors", "Many semantic errors at once"],
  ["19_multiple_lexical_errors", "Several lexical errors"],
  ["30_missing_semicolon", "Syntax error: missing ';'"],
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ------------------------------------------------------------ process limits

let running = 0;
const waiting = [];

function acquire() {
  if (running < LIMITS.concurrent) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

// Runs the CLI once (by default with every stage flag). Resolves with {args, exitCode, stdout, stderr, json,
// durationMs, failure}; `failure` explains timeouts and oversize output.
const ALL_STAGES = ["--tokens", "--ast", "--symbols", "--emit-tac", "--emit-opt-tac", "--run"];

async function runCompiler(file, extraArgs, stages = ALL_STAGES) {
  const args = [file, "--json", ...stages, ...extraArgs];
  await acquire();
  const started = process.hrtime.bigint();
  try {
    return await new Promise((resolve) => {
      execFile(
        BIN,
        args,
        {
          timeout: LIMITS.timeoutMs,
          maxBuffer: LIMITS.outputBytes,
          windowsHide: true,
          encoding: "utf8",
          shell: false,
        },
        (error, stdout, stderr) => {
          const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
          let failure = null;
          let exitCode = 0;
          if (error) {
            if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
              failure = `The compiler produced more than ${LIMITS.outputBytes / 1024 / 1024} MB of output, so the run was stopped. Reduce what the program prints or lower --max-steps.`;
            } else if (error.killed) {
              failure = `The compiler did not finish within ${LIMITS.timeoutMs / 1000} s and was stopped.`;
            } else if (typeof error.code === "number") {
              exitCode = error.code; // normal non-zero exit (1, 2, 3, 4)
            } else {
              failure = `Could not start the compiler (${error.code || error.message}). Build it first with make.`;
            }
          }
          let json = null;
          if (!failure) {
            try {
              json = JSON.parse(stdout);
            } catch {
              failure = "The compiler did not return valid JSON.";
            }
          }
          resolve({
            args: displayArgs(args),
            exitCode,
            stderr: stderr.slice(0, 4000),
            json,
            durationMs: Math.round(durationMs * 10) / 10,
            failure,
          });
        }
      );
    });
  } finally {
    release();
  }
}

function displayArgs(args) {
  return ["shreyalang", "program.sl", ...args.slice(1)];
}

// ---------------------------------------------------------------- API

function optionArgs(body) {
  const args = [];
  if (body.fold === false) args.push("--no-fold");
  if (body.propagate === false) args.push("--no-prop");
  if (body.dce === false) args.push("--no-dce");
  const steps = Number(body.maxSteps);
  if (Number.isInteger(steps) && steps >= 1 && steps <= LIMITS.maxSteps) {
    args.push("--max-steps", String(steps));
  } else if (body.maxSteps !== undefined) {
    throw new UserError(`maxSteps must be an integer between 1 and ${LIMITS.maxSteps}.`);
  }
  return args;
}

class UserError extends Error {}

async function handleCompile(body) {
  if (typeof body.source !== "string") throw new UserError("source must be a string.");
  if (Buffer.byteLength(body.source, "utf8") > LIMITS.sourceBytes)
    throw new UserError(`The program is larger than ${LIMITS.sourceBytes / 1024} KB.`);
  const args = optionArgs(body);
  const stepArgs = args.includes("--max-steps") ? args.slice(args.indexOf("--max-steps"), args.indexOf("--max-steps") + 2) : [];

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "shreyalang-"));
  const file = path.join(dir, "program.sl");
  try {
    await fsp.writeFile(file, body.source, "utf8");
    const limits = { maxSteps: LIMITS.maxSteps, timeoutMs: LIMITS.timeoutMs };
    // mode "tokens": lexer only (used for live syntax colouring).
    if (body.mode === "tokens") {
      return { main: await runCompiler(file, [], ["--tokens"]), unoptimized: null, limits };
    }
    // The main run with the requested optimizer settings, plus (unless
    // compare is false) an unoptimized run so the page can show that both
    // produce the same result.
    const [main, unoptimized] = await Promise.all([
      runCompiler(file, args),
      body.compare === false ? null : runCompiler(file, ["--no-opt", ...stepArgs]),
    ]);
    return { main, unoptimized, limits };
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleExamples() {
  const examples = [];
  const sampleFiles = (await fsp.readdir(SAMPLES_DIR)).filter((f) => f.endsWith(".sl")).sort();
  for (const f of sampleFiles) {
    examples.push({
      group: "Samples",
      name: f.replace(/\.sl$/, ""),
      title: f,
      source: await fsp.readFile(path.join(SAMPLES_DIR, f), "utf8"),
    });
  }
  for (const [name, title] of EXAMPLE_TESTS) {
    const file = path.join(CASES_DIR, name + ".sl");
    if (!fs.existsSync(file)) continue;
    const argsFile = path.join(CASES_DIR, name + ".args");
    const args = fs.existsSync(argsFile) ? fs.readFileSync(argsFile, "utf8").trim() : "";
    const steps = /--max-steps\s+(\d+)/.exec(args);
    examples.push({
      group: "Required tests",
      name,
      title,
      source: await fsp.readFile(file, "utf8"),
      maxSteps: steps ? Number(steps[1]) : undefined,
    });
  }
  return examples;
}

// ---------------------------------------------------------------- HTTP

function send(res, status, type, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > LIMITS.bodyBytes) {
        reject(new UserError("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new UserError("Request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, relative);
  // Only files inside web/public are served.
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "text/plain", "Forbidden");
  try {
    const data = await fsp.readFile(file);
    const type = MIME[path.extname(file)] || "application/octet-stream";
    send(res, 200, type, data);
  } catch {
    send(res, 404, "text/plain", "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname === "/api/compile" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await handleCompile(body));
    }
    if (pathname === "/api/examples" && req.method === "GET") {
      return sendJson(res, 200, await handleExamples());
    }
    if (pathname === "/api/info" && req.method === "GET") {
      return sendJson(res, 200, { binary: path.relative(ROOT, BIN), binaryFound: fs.existsSync(BIN), limits: LIMITS });
    }
    if (req.method === "GET") return serveStatic(req, res, pathname);
    send(res, 405, "text/plain", "Method not allowed");
  } catch (err) {
    if (err instanceof UserError) return sendJson(res, 400, { error: err.message });
    console.error(err);
    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ShreyaLang Compiler running at http://${HOST}:${PORT}`);
  console.log(`Compiler: ${BIN}${fs.existsSync(BIN) ? "" : "  (NOT FOUND - run make first)"}`);
});
