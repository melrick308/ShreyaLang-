# ShreyaLang Mini Compiler

A compiler for **ShreyaLang**, a small imperative language, written in C++17
with Flex and GNU Bison. It runs the classic phases (lexing, parsing,
semantic analysis, three-address-code generation and optimization) and
executes the result on a custom TAC virtual machine. Every intermediate stage
can be printed from the command line.

```text
let a: int = 10;
let b: int = 5;
print(a + b * 2);                 // 20

let i: int = 1;
while (i <= 3) {
    if (i % 2 == 0) { print("even"); } else { print(i); }
    i = i + 1;
}
```

- Web frontend: [ShreyaLang Compiler](#web-frontend-shreyalang-compiler)
- Language reference: [docs/LANGUAGE.md](docs/LANGUAGE.md)
- Compiler design and known limitations: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Prerequisites

| Tool | Tested version |
|---|---|
| C++17 compiler (g++ or clang++) | GCC 16.2 (MSYS2 UCRT64), GCC 13.2 (Alpine Linux) |
| Flex | 2.6.4 |
| GNU Bison | 3.8 or newer (3.8.2 tested) |
| GNU make | 3.82 or newer |
| Python 3 | for the test runner |

## Build

The build creates `build/shreyalang` (`build/shreyalang.exe` on Windows).
Generated sources go to `build/gen/`.

**Linux** (Debian/Ubuntu)

```sh
sudo apt install g++ make flex bison python3
make
make test
```

**macOS** (not tested). The system Bison is 2.3, so use Homebrew's:

```sh
brew install bison flex
make BISON="$(brew --prefix bison)/bin/bison"
make test
```

**Windows (MSYS2 UCRT64)**: in the *MSYS2 UCRT64* shell:

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-gcc make flex bison python
make
make test
```

On Windows the executable is linked statically, so it also runs from
PowerShell or cmd.

If MSYS2 is installed but you build from another shell (e.g. Git Bash) with
MinGW's `mingw32-make`, put the UCRT64 compiler and the MSYS2 tools first on
`PATH`:

```sh
export PATH=/c/msys64/ucrt64/bin:/c/msys64/usr/bin:$PATH
mingw32-make
mingw32-make test
```

`make clean` removes `build/`.

## Usage

```text
shreyalang <file.sl | -> [options]

stages (any combination; default is --run):
  --tokens          show the token stream
  --ast             show the abstract syntax tree
  --symbols         show the symbol table
  --emit-tac        show three-address code
  --emit-opt-tac    show optimized three-address code
  --run             compile and execute

options:
  --no-opt          disable all optimization passes
  --no-fold         disable constant folding
  --no-prop         disable constant propagation
  --no-dce          disable dead-code elimination
  --max-steps N     VM instruction limit (default 1000000)
  --json            machine-readable output for all requested stages
  -h, --help        show this help
```

The file `-` reads the program from standard input. Phases run only up to
the last requested stage; with several stages, each section starts with a
header such as `== TAC ==`.

| Exit code | Meaning |
|---|---|
| 0 | success |
| 1 | lexical or syntax error |
| 2 | semantic error |
| 3 | runtime error |
| 4 | usage or I/O error |

Errors are printed to stderr as

```text
Semantic error at line 1, col 7: undeclared variable 'missing'
 1 | print(missing);
   |       ^
```

## Tests

```sh
make test                      # or: python3 tests/run_tests.py --bin build/shreyalang
python3 tests/run_tests.py -v  # also list passing checks
```

The runner executes the real CLI for every program in `tests/cases/`. It
compares stdout, the exit code and (where a `.err` file exists) the exact
stderr. It also checks the CLI options and the JSON output, and runs every
program that compiles (tests and `samples/`) with optimization on, with
`--no-opt` and with each pass disabled, requiring identical results.

Current result: `223 passed, 0 failed (39 programs checked for
optimized/unoptimized equivalence)`.

Required scenarios and their test files:

| # | Scenario | Test |
|---|---|---|
| 1 | `a + b * 2` → 20 | `01_precedence` |
| 2 | `(10 + 5) * 2` → 30 | `02_parentheses` |
| 3 | if/else → Adult | `03_if_else` |
| 4 | while loop 1..3 | `04_while_loop` |
| 5 | undeclared variable, exit 2 | `05_undeclared` |
| 6 | `let x: int = "hello";` | `06_type_mismatch` |
| 7 | `let x: int = ;` | `07_missing_expression` |
| 8 | `2 + 3 * 4` folding, same result with `--no-opt` | `08_constant_folding*`, `08_unoptimized_tac` |
| 9 | variable used outside its block | `09_out_of_scope` |
| 10 | `10 / 0` is a runtime error, not folded | `10_division_by_zero*`, `10_unused_division_by_zero` |
| 11 | empty file | `11_empty`, `11_comments_only` |
| 12 | nested arithmetic, if/else inside while | `12_nested_program` |
| 13 | duplicate declaration | `13_duplicate_declaration` |
| 14 | shadowing | `14_shadowing`, `40_symbols_shadowing` |
| 15 | `int = float` error, `float = int` OK | `15_float_to_int_error`, `15_int_to_float_ok` |
| 16 | `true \|\| (1/0 == 0)` short-circuit | `16_short_circuit` |
| 17 | `"a" == "a"`; `"a" < "b"` error | `17_string_equality`, `17_string_ordering_error` |
| 18 | `while (true) {}` with `--max-steps 1000` | `18_step_limit` |
| 19 | unterminated string; invalid `@` | `19_unterminated_string`, `19_invalid_character`, `19_multiple_lexical_errors` |
| 20 | no stale constant across a loop label | `20_loop_propagation*` |
| 21 | optimized/unoptimized equivalence | equivalence checks in `run_tests.py` |

Tests 22–43 cover integer overflow, modulo and float division by zero,
integer division semantics, print formats, condition and operator type
errors, syntax-error messages, literal range, initializer scoping, partial
output before a runtime error, the `--tokens`/`--ast` stage output, and the
nesting limits.

## Samples

| File | Shows |
|---|---|
| `samples/arithmetic.sl` | precedence, associativity, int/float mixing |
| `samples/conditions.sl` | if/else, logical operators, short-circuit |
| `samples/loops.sl` | factorial, Fibonacci, primes |
| `samples/optimization.sl` | folding, propagation, DCE, loop safety |
| `samples/scopes.sl` | blocks and shadowing |
| `samples/error_lexical.sl` | several lexical errors in one run |
| `samples/error_syntax.sl` | first syntax error |
| `samples/error_semantic.sl` | all semantic errors collected |
| `samples/error_runtime.sl` | division by zero after partial output |

## Demo script

On Windows, use `build/shreyalang.exe`.

```sh
# 1. Run a program
build/shreyalang samples/loops.sl

# 2. Lexer: token stream with line:column
build/shreyalang samples/arithmetic.sl --tokens

# 3. Parser: '+' is at the root of a + b * 2
build/shreyalang tests/cases/01_precedence.sl --ast

# 4. Scopes and unique TAC names for shadowed variables (x, x#2, x#3)
build/shreyalang samples/scopes.sl --symbols

# 5. TAC before and after optimization
build/shreyalang tests/cases/08_constant_folding.sl --emit-tac --emit-opt-tac
build/shreyalang samples/optimization.sl --emit-tac --emit-opt-tac

# 6. Short-circuit evaluation is lowered to jumps
build/shreyalang tests/cases/16_short_circuit.sl --emit-tac --run

# 7. The optimizer does not carry constants across a loop label
build/shreyalang tests/cases/20_loop_propagation_tac.sl --emit-opt-tac --run

# 8. Same output with and without optimization
build/shreyalang samples/loops.sl --no-opt

# 9. Each error category and its exit code
build/shreyalang samples/error_lexical.sl;  echo "exit $?"   # 1
build/shreyalang samples/error_syntax.sl;   echo "exit $?"   # 1
build/shreyalang samples/error_semantic.sl; echo "exit $?"   # 2
build/shreyalang samples/error_runtime.sl;  echo "exit $?"   # 3
build/shreyalang tests/cases/10_division_by_zero.sl --emit-opt-tac   # 10 / 0 is kept

# 10. Execution limit
build/shreyalang tests/cases/18_step_limit.sl --max-steps 1000; echo "exit $?"   # 3

# 11. Standard input and JSON output
echo 'print(6 * 7);' | build/shreyalang - --json --emit-opt-tac --run

# 12. Full test suite
make test
```

## Web frontend: ShreyaLang Compiler

An interactive page with two sections: **Compiler**, which shows and explains
every compiler phase for any program you type, and **Learn**, a course that
teaches the language. It needs Node.js 18 or newer and no npm packages.

```sh
make web                 # or: node web/server.js
# open http://127.0.0.1:8080
```

- **Editor** with syntax colouring taken from the compiler's own token
  stream, errors underlined at the reported line and column, auto-run while
  typing (or Ctrl+Enter), example programs, optimizer pass toggles and a
  step limit.
- **Pipeline strip**: the status and key number of each of the six phases.
- **Views**, each with an explanation of what the phase does:
  *Overview* (the program's journey through the compiler), *Tokens*
  (filterable table), *AST* (tree diagram or outline), *Symbols* (scope
  tree, shadowing, TAC names), *TAC* (basic blocks, jump targets and a
  plain-language explanation of each instruction), *Optimizer* (per-pass
  counts, safety rules and a before/after diff), *Execution* (output, steps,
  and a check that optimized and unoptimized runs behave identically),
  *Errors*, *Language* reference and *Raw JSON*.
- Hovering a token, node, symbol or instruction highlights its source;
  clicking an error jumps to it.

### Learn ShreyaLang (`#learn`)

A course of 11 lessons that teaches the language from the first `print` to
nested loops:

| # | Lesson | # | Lesson |
|---|---|---|---|
| 1 | Your first program | 7 | Making decisions: if / else |
| 2 | Values and types | 8 | Repeating: while loops |
| 3 | Variables | 9 | Blocks and scope |
| 4 | Arithmetic | 10 | Understanding errors |
| 5 | Mixing int and float | 11 | Putting it together (FizzBuzz, Collatz) |
| 6 | Comparisons and logic | | |

Each lesson has goals, explanations, syntax cards, rule / tip / common-mistake
notes, runnable examples, quizzes and exercises, and ends with a summary.
There are 31 activities in total.

- **Examples** run on the real compiler. "Compiler ↗" opens one in the
  Compiler view to see every phase.
- **Quizzes** ask you to predict a result. After a correct answer, the page
  runs the program and shows the compiler's confirmation.
- **Exercises** have an editor that colours code and underlines errors.
  *Check* compiles and runs your code, then compares the output (and simple
  rules such as "use a while loop"). Hints and a model solution are
  available.
- Progress and exercise drafts are saved in the browser.

The course content (`web/public/js/lessons.js`) is tested against the
compiler. Every example must end with the exit code the lesson claims, every
quiz answer must match the real result, and every exercise solution must
pass while its starter code must not:

```sh
make test-web            # or: node web/test_lessons.mjs

```

The page shows only real compiler output. For each run, the server writes
the program to a temporary file and runs `shreyalang --json` with every stage
flag. It runs a second time with `--no-opt` for the equivalence check. Both
runs are started without a shell (argument array), with a 5 s timeout and an
8 MB output limit. The server listens on `127.0.0.1` only. `PORT`, `HOST`
and `SHREYALANG_BIN` override the defaults.

## Project layout

```text
src/            compiler sources (lexer.l, parser.y, *.hpp, *.cpp)
tests/cases/    test programs with expected output
tests/run_tests.py
samples/        example programs
docs/           LANGUAGE.md, ARCHITECTURE.md
web/            server.js, test_lessons.mjs and public/ (Compiler + Learn frontend)
Makefile
```
