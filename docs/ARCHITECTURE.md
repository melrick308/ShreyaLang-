# ShreyaLang Compiler Architecture

## 1. Pipeline

```
 source bytes
     │
     ▼
 ┌─────────┐ tokens  ┌─────────┐  AST   ┌──────────┐ annotated ┌──────────┐  TAC  ┌───────────┐  TAC  ┌────┐
 │  Lexer  │────────▶│ Parser  │───────▶│ Semantic │──── AST ─▶│   TAC    │──────▶│ Optimizer │──────▶│ VM │──▶ output
 │ (Flex)  │         │ (Bison) │        │ analysis │           │generator │       │ (3 passes)│       │    │
 └─────────┘         └─────────┘        └──────────┘           └──────────┘       └───────────┘       └────┘
  --tokens            --ast            --symbols               --emit-tac        --emit-opt-tac      --run
  all lexical errors  first syntax     all semantic errors                                          runtime error
  exit 1              error, exit 1    exit 2                                                       exit 3
```

The driver (`src/driver.cpp`) runs the phases in this order and stops at the
first phase that reports an error, so an invalid program never reaches the
VM. It runs only as far as the last requested stage: `--ast` alone lexes and
parses but does not type-check, and `--symbols` does not generate TAC.
Without a stage flag the program is compiled and run.

## 2. Source files

| File | Role |
|---|---|
| `src/lexer.l` | Flex scanner. Produces `std::vector<Token>` and lexical errors. |
| `src/token.hpp/.cpp` | `TokenKind`, `Token`, token names for `--tokens`. |
| `src/parser.y` | Bison grammar, AST construction, syntax error messages. |
| `src/parser.hpp` | `parseTokens()` interface. |
| `src/ast.hpp` | AST node classes. |
| `src/ast_printer.hpp/.cpp` | `--ast` text tree and JSON. |
| `src/symbol_table.hpp/.cpp` | Scopes and symbols; `--symbols` output. |
| `src/semantic.hpp/.cpp` | Name resolution and type checking. |
| `src/tac.hpp/.cpp` | TAC operands, instructions, formatter, JSON. |
| `src/tac_gen.hpp/.cpp` | AST → TAC lowering. |
| `src/optimizer.hpp/.cpp` | Constant folding, constant propagation, dead-code elimination. |
| `src/vm.hpp/.cpp` | TAC virtual machine. |
| `src/value.hpp/.cpp` | Runtime values and the operator semantics shared by optimizer and VM. |
| `src/types.hpp/.cpp`, `src/ops.hpp` | Types and operators. |
| `src/diagnostics.hpp/.cpp` | Error categories, locations and caret formatting. |
| `src/json.hpp/.cpp` | Minimal JSON writer for `--json`. |
| `src/driver.hpp/.cpp` | Phase sequencing, stage output, exit codes. |
| `src/main.cpp` | Command-line parsing and file/stdin input. |

The compiler core has no dependency on any frontend or UI; `main.cpp` is a
thin layer over `compileSource()`.

## 3. Lexer

`lexer.l` is a **reentrant** Flex scanner (`%option reentrant`). All of its
state is in a `LexState` passed as `yyextra`: current line and column, the
start position of the current match, the token vector and the error list.
`YY_USER_ACTION` advances line and column before every action.

`lexSource()` scans the **whole** input into a token vector before parsing
begins. This keeps the lexer independent of the parser: `--tokens` calls
only `lexSource()`, and the lexer has its own `TokenKind` enum rather than
using Bison's token numbers. Lexical errors are recorded and scanning
continues, so all of them are reported. Any lexical error stops compilation
before parsing, which avoids follow-on syntax errors caused by missing
tokens.

The longest-match rule detects malformed numbers: `[0-9][A-Za-z0-9_.]*` is
listed after the integer and float rules, so it only wins when it matches
more text (`12abc`, `1.2.3`, `1.`).

## 4. Parser and AST

`parser.y` is an LALR(1) Bison grammar (`api.pure full`, `%locations`,
`parse.lac full`). Its `yylex()` feeds tokens from the vector and maps each
`TokenKind` to a Bison token.

**Memory ownership.** Bison's `%union` cannot hold `std::unique_ptr`, so
semantic values are raw pointers. Each action takes ownership of its children
right away (`own($3)` wraps a pointer in `std::unique_ptr`) and passes them
into the parent's constructor. After any reduction, every node is owned by
exactly one `unique_ptr`, except the single value just produced (`$$`). If
the parse aborts, `%destructor { delete $$; }` frees the values still on the
parser stack. All AST children are `std::unique_ptr`.

**Errors.** `parse.error custom` calls `yyreport_syntax_error()`, which asks
Bison for the expected tokens and groups them into readable categories:
`statement`, `expression`, `type`, `operator`, or specific tokens such as
`';'`. With LAC (lookahead correction) the expected set is exact, even after
default reductions. There are no `error` recovery rules, so the first error
aborts the parse.

**AST nodes.** `Program`; statements `Block`, `VarDecl`, `Assign`, `Print`,
`If`, `While`; expressions `Literal`, `VarRef`, `Unary`, `Binary`. Every
node has a `SourceLoc`. For operators the location is the operator token, so
errors and runtime faults point at `/` in `a / b`. Parentheses do not create
nodes; they only shape the tree. Each pass switches on a node's `kind` tag.

**Depth limit.** Each expression records its height. The parser rejects
expressions deeper than 1000 levels. A chain of thousands of `+` terms
builds a deep tree without growing the parser stack, so `YYMAXDEPTH` (3000)
alone would not bound it. The limit keeps the recursive passes within the
stack. The Windows build links with an 8 MB stack, the Linux/macOS default.

## 5. Symbol table and semantic analysis

The `SymbolTable` stores a tree of scopes. Scope 0 is global, and each block
opens a child scope. Lookup walks the chain of active scopes from innermost
to outermost. After analysis the table still holds every scope and symbol,
which is what `--symbols` prints:

```
Scope 0 (global)
  x     int     line 1     tac x
Scope 1 (parent 0, depth 1, block at line 2)
  x     int     line 3     tac x#2
```

A symbol has a name, type, scope id, declaration location and a **unique TAC
name**: the first declaration of `x` is `x`, later ones are `x#2`, `x#3`, and
so on. `#` cannot occur in identifiers, so TAC variable names never collide,
and shadowing needs no special handling after this phase.

`SemanticAnalyzer` walks the AST once and:
- sets `Expr::type` on every expression,
- resolves every `VarRef`, `VarDecl` and `Assign` to its unique TAC name,
- enforces the rules in `LANGUAGE.md` §3–4.

It collects all errors. Expressions that already failed get type `Error`, and
operators silently accept `Error` operands, so one mistake produces one
message.

## 6. Three-address code

TAC is a `std::vector<Instr>` of structured instructions, not strings.

```
ASSIGN dst, src          BINOP op dst, a, b       UNOP op dst, a
I2F dst, src             LABEL L                  GOTO L
IF_FALSE cond, L         PRINT src                HALT
BINOP ops: ADD SUB MUL DIV MOD LT LE GT GE EQ NE     UNOP ops: NEG NOT
```

An `Operand` is one of: a variable (unique TAC name), a temporary
(`t1`, `t2`, ...), or a typed constant (a `Value`). Each instruction records
its source location, and `BINOP`/`UNOP` also record their operand type, which
the optimizer uses to decide whether an instruction may fail.

`formatTac()` renders the listing:

```
   0      t1 = b MUL 2                    ; line 3
   1      t2 = a ADD t1                   ; line 3
   2      PRINT t2                        ; line 3
   3      HALT
```

### Lowering patterns

| Source | TAC |
|---|---|
| `let x: float = i;` (`i` is `int`) | `x = I2F i` |
| `a + 2.5` (`a` is `int`) | `t1 = I2F a` ; `t2 = t1 ADD 2.5` |
| `if (c) {A} else {B}` | `IF_FALSE c, Lelse` ; A ; `GOTO Lend` ; `Lelse:` ; B ; `Lend:` |
| `while (c) {B}` | `Lstart:` ; c ; `IF_FALSE c, Lend` ; B ; `GOTO Lstart` ; `Lend:` |
| `a && b` | `t = a` ; `IF_FALSE t, Lend` ; `t = b` ; `Lend:` |
| `a \|\| b` | `t = a` ; `IF_FALSE t, Lrhs` ; `GOTO Lend` ; `Lrhs:` ; `t = b` ; `Lend:` |

Real listings number labels `L1`, `L2`, ... in allocation order (for `||`,
`Lend` is allocated before `Lrhs`).

The `&&`/`||` result temporary is assigned on two paths, so temporaries are
not single-assignment; the optimizer does not assume they are.

## 7. Optimizer

The optimizer works on structured TAC. Its three passes run in rounds, in the
order propagate, fold, DCE, until a round makes no change. Each pass can be
disabled separately (`--no-prop`, `--no-fold`, `--no-dce`); `--no-opt`
disables all three. `--emit-opt-tac` prints a summary line, e.g.
`; optimizer: 2 folded, 2 propagated, 2 removed, 4 round(s)`.

1. **Constant folding.** A `BINOP`, `UNOP` or `I2F` whose operands are all
   constants becomes `dst = constant`. The result is computed with
   `evalBinary`/`evalUnary`, the functions the VM itself uses, so folding
   cannot change a result. If evaluation would fail (division by zero,
   overflow), the instruction is left alone so the VM reports the error at
   runtime.

2. **Constant propagation (basic-block local).** A forward scan keeps a map
   from variables and temporaries to known constant values. A read of a known
   location is replaced by the constant. Writing a location removes its
   entry, or records the new value if it is `= constant`. **The map is
   cleared at every `LABEL` and after every `GOTO`/`IF_FALSE`.** Every join
   point in TAC is a label, so knowledge never flows along a path it was not
   computed on. In particular, a value assigned before a loop is never
   propagated past the loop's label into the body or past the loop's exit
   (test `20_loop_propagation*`).

3. **Dead-code elimination.** Removes `ASSIGN`/`BINOP`/`UNOP`/`I2F`
   instructions that write a **temporary** that is never read anywhere in the
   program. It never removes `PRINT`, jumps, labels, writes to named
   variables, or an instruction that may raise a runtime error: integer
   `ADD`/`SUB`/`MUL`/`NEG` (overflow) and any `DIV`/`MOD` (division by zero),
   unless its constant operands are known to be safe.

Example (`print(2 + 3 * 4);`):

```
before                         after
t1 = 3 MUL 4                   PRINT 14
t2 = 2 ADD t1                  HALT
PRINT t2
HALT
```

**Correctness check.** The test runner runs every program that compiles
(test cases and samples) with all passes on, with `--no-opt`, and with each
pass disabled. It requires identical stdout, stderr and exit code.

## 8. Virtual machine

`runTac()` first resolves the program:
- every variable and temporary gets a register slot (by unique name), and
- every label becomes an instruction index.

It then runs a fetch–execute loop over a register file of
`std::optional<Value>`. `Value` is a `std::variant` of
`int64_t`/`double`/`bool`/`std::string`. `BINOP`/`UNOP`/`I2F` call the
shared evaluation functions. Failures are returned as a `Runtime` diagnostic
with the instruction's source location; ShreyaLang errors never throw or crash.

Every executed instruction counts as one step. When the count exceeds the
limit (default 1,000,000, set with `--max-steps`), execution stops with
`execution limit exceeded`.

By default the VM runs the optimized TAC; with `--no-opt` it runs the
unoptimized TAC.

## 9. Driver, CLI and output

`compileSource()` takes the source text and options, writes stage output to
stdout, and returns the exit code:

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | lexical or syntax error |
| 2 | semantic error |
| 3 | runtime error |
| 4 | usage or I/O error (from `main.cpp`) |

**Text mode.** If only one section is requested (for example only program
output, or only `--emit-tac`), it is printed as-is. With several sections,
each starts with a header such as `== TAC ==`. Diagnostics go to stderr as

```
<Category> error at line L, col C: <message>
 L | <source line>
   |     ^
```

**JSON mode** (`--json`) writes one JSON object on stdout containing the
requested stages (`tokens`, `ast`, `symbols`, `tac`, `optimizedTac`), the
optimizer settings and counts (`optimizer`, with `--emit-opt-tac`), the
program `output` and `steps` when running, an `errors` array (`category`,
`line`, `col`, `message`, `text`), and `exitCode`. Nothing is written to
stderr. The exit code is the same as in text mode.

On Windows, stdin, stdout and stderr are switched to binary mode, so output
is byte-identical across platforms (`\n`, never `\r\n`).

## 10. Web frontend

`web/` holds an optional frontend, *ShreyaLang Compiler*. It is not part of
the compiler; it only calls the CLI.

- `web/server.js` uses only Node's standard library. `POST /api/compile`
  writes the program to a new temporary directory and runs `shreyalang` twice
  with `execFile` (argument array, no shell): once with the requested
  options, and once with `--no-opt` for the equivalence check. Each run has a
  5 s timeout and an 8 MB output limit. At most 4 compiler processes run at
  once. Source size (100 KB), request size and `--max-steps` (≤ 10,000,000)
  are validated. Static files are served only from `web/public`.
  `GET /api/examples` returns the samples and a selection of test programs.
  The compile request also accepts `mode: "tokens"` (lexer only, for live
  colouring) and `compare: false` (skip the `--no-opt` run).
- `web/public/` is a static page written as plain ES modules (no build step).
  Every view renders from the CLI's JSON: editor colouring uses the real
  token list, the AST diagram is drawn from the `ast` object, and basic
  blocks and jump targets are derived from the structured `tac` arrays. Each
  new run discards the previous result before the new one is shown.
- The *Learn* section (`learn.js`, content in `lessons.js`) is a course of
  11 lessons. Examples and exercises are compiled and run through the same
  API. Exercise checking (`learn-check.js`) compares the real exit code and
  output and applies simple source rules (comments are ignored).
  `web/test_lessons.mjs` imports the same content and checker and verifies
  every example, quiz answer and exercise solution against the compiler
  (`make test-web`).

## 11. Testing

`tests/run_tests.py` runs the real executable as a subprocess:
- **case tests** (`tests/cases/*.sl`), each with expected stdout (`.out`), an
  optional exit code (`.code`), extra arguments (`.args`) and exact expected
  stderr (`.err`). They cover all 21 required scenarios plus additional
  error, semantics and stage-output tests,
- **CLI tests**: usage errors, missing file, stdin input, section headers,
  `--json` structure,
- **equivalence tests**: optimized vs. unoptimized vs. each single pass
  disabled, on every test program and sample that compiles.

The expected outputs were written by hand (stage listings were reviewed line
by line) rather than recorded from the compiler.

## 12. Known limitations

- Float literals have no exponent form (`1e5` is a malformed number), and
  `.5` / `5.` are not accepted. The smallest `int` cannot be written as a
  literal.
- Columns count a tab as one character.
- A user variable named like a temporary (e.g. `t1`) is displayed with the
  same text as temporary `t1` in TAC listings. The two are separate storage
  (different operand kinds); the JSON output distinguishes them with `kind`.
- Constant propagation is block-local and conservatively clears its
  knowledge after every jump, even on the fall-through path, so some
  constants are not propagated (e.g. a variable read right after an
  `IF_FALSE`).
- There is no branch folding, unreachable-code removal or copy propagation,
  and dead stores to **named** variables are kept (DCE only removes unused
  temporaries).
- The step limit counts executed TAC instructions, and optimized code
  executes fewer of them. A program close to the limit can therefore finish
  when optimized and exceed the limit with `--no-opt`. Optimized and
  unoptimized output are identical whenever neither run hits the limit.
- A runtime error stops execution, but output printed before it remains.
- Only the phases up to the last requested stage run (e.g. `--ast` alone
  does not report type errors).
- Expression depth is limited to 1000 levels and parser nesting to 3000 stack
  entries (see `LANGUAGE.md` §6).
- Verified platforms: Windows 11 with MSYS2 UCRT64 (GCC 16.2, Flex 2.6.4,
  Bison 3.8.2), and Alpine Linux 3.20 in Docker (GCC 13.2, Flex 2.6.4,
  Bison 3.8.2). macOS instructions are provided but were not tested.
