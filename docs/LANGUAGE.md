# ShreyaLang Language Reference

ShreyaLang is a small imperative language with four types, variables, `if`/`else`,
`while`, block scoping and `print`. This document describes exactly what the
compiler in this repository implements.

## 1. Lexical structure

The source is read as bytes.

| Element | Rule |
|---|---|
| Whitespace | space, tab, `\r`, `\n` (ignored) |
| Comment | `//` to end of line |
| Identifier | `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive, not a keyword |
| Keywords | `let int float bool string if else while print true false` |
| Integer literal | `[0-9]+`, value must fit in a signed 64-bit integer (max `9223372036854775807`) |
| Float literal | `[0-9]+ "." [0-9]+` (e.g. `3.14`, `0.5`); no exponent, no leading or trailing `.` |
| String literal | `"..."` on one line; escapes `\n` `\t` `\"` `\\` |
| Operators | `+ - * / % < <= > >= == != && \|\| ! =` |
| Punctuation | `( ) { } ; : ,` |

Notes:
- `,` is recognised so that `print(a, b)` gets the clear syntax error
  `expected ')' before ','`. No grammar rule uses it.
- Negative numbers are written with unary minus (`-5`). The smallest
  `int`, `-9223372036854775808`, cannot be written as a literal; use
  `-9223372036854775807 - 1`.
- Non-ASCII bytes are allowed inside string literals and comments only.
- Columns count characters from 1; a tab counts as one column.

### Lexical errors

The lexer reports every lexical error in the file, then compilation stops
(exit code 1):

| Error | Example |
|---|---|
| invalid character | `@`, `#`, `&` alone, `$`, non-ASCII outside strings |
| malformed number | `12abc`, `1.2.3`, `1.`, `1e5` |
| integer literal out of range | `9223372036854775808` |
| unterminated string literal | `"abc` (end of line or file before the closing quote) |
| invalid escape sequence | `"\q"` |

## 2. Grammar (EBNF)

```ebnf
program    = { statement } ;

statement  = "let" IDENT ":" type "=" expr ";"         (* declaration *)
           | IDENT "=" expr ";"                         (* assignment *)
           | "print" "(" expr ")" ";"
           | "if" "(" expr ")" block [ "else" block ]
           | "while" "(" expr ")" block
           | block ;

block      = "{" { statement } "}" ;

type       = "int" | "float" | "bool" | "string" ;

expr       = or_expr ;
or_expr    = and_expr { "||" and_expr } ;
and_expr   = eq_expr  { "&&" eq_expr } ;
eq_expr    = rel_expr { ( "==" | "!=" ) rel_expr } ;
rel_expr   = add_expr { ( "<" | "<=" | ">" | ">=" ) add_expr } ;
add_expr   = mul_expr { ( "+" | "-" ) mul_expr } ;
mul_expr   = unary    { ( "*" | "/" | "%" ) unary } ;
unary      = ( "-" | "!" ) unary | primary ;
primary    = INT_LIT | FLOAT_LIT | STRING_LIT | "true" | "false"
           | IDENT | "(" expr ")" ;
```

The Bison grammar (`src/parser.y`) writes `expr` as one ambiguous rule
(`expr: expr '+' expr | ...`) and resolves it with `%left`/`%precedence`
declarations, which is equivalent to the layered EBNF above. The grammar has
no conflicts: `%expect 0` is declared and the build runs Bison with
`-Wall -Werror`.

Consequences of the grammar:
- Initialization is mandatory: `let x: int;` is a syntax error.
- Braces are mandatory for every `if`, `else` and `while` body, so there is no
  dangling-else problem. `else if` must be written `else { if ... }`.
- Assignment is a statement, not an expression; `x + 1;` and `a = b = 1;` are
  syntax errors.
- `print` takes exactly one argument.
- An empty file is a valid program.

### Syntax errors

The parser reports the **first** syntax error and stops; there is no error
recovery. The message names what was expected and the token that was found:

```
Syntax error at line 1, col 14: expected expression before ';'
 1 | let x: int = ;
   |              ^
```

## 3. Types

| Type | Values |
|---|---|
| `int` | 64-bit signed integer |
| `float` | 64-bit IEEE double |
| `bool` | `true`, `false` |
| `string` | immutable byte string |

### Type rules

| Context | Rule |
|---|---|
| `int` → `float` | Implicit in declarations, assignments, mixed arithmetic and comparisons. The TAC contains an explicit `I2F`. |
| `float` → `int` | Not allowed (there are no casts). |
| `+ - * /` | Operands `int` or `float`. Result `float` if either operand is `float`, otherwise `int`. |
| `%` | `int` operands only; result `int`. |
| unary `-` | `int` or `float`; same result type. |
| `< <= > >=` | Numeric operands (mixed allowed); result `bool`. |
| `== !=` | Both numeric (mixed allowed), or both `bool`, or both `string`; result `bool`. |
| `&& \|\| !` | `bool` operands only; result `bool`. |
| `if`/`while` condition | Must be `bool` (no truthiness for `int`). |
| `print(e)` | `e` may have any type. |
| strings | Only `==`, `!=` and `print`. No concatenation, no ordering. |

### Operator precedence (high to low)

| Level | Operators | Associativity |
|---|---|---|
| 1 | unary `-`, `!` | right (prefix) |
| 2 | `* / %` | left |
| 3 | `+ -` | left |
| 4 | `< <= > >=` | left |
| 5 | `== !=` | left |
| 6 | `&&` | left |
| 7 | `\|\|` | left |

Because comparisons are left-associative, `1 < 2 < 3` parses as
`(1 < 2) < 3` and is then a type error (`bool < int`).

## 4. Scope

- The top level of the program is the global scope.
- Every block `{ ... }`, including `if`, `else` and `while` bodies, opens a
  new scope. Names declared inside are not visible after the closing `}`.
- **Shadowing is allowed**: an inner scope may declare a name that exists in
  an outer scope. Inside the inner scope the name refers to the inner
  variable; the outer variable is unaffected.
- Declaring the same name twice in the **same** scope is an error.
- A variable must be declared before use. The initializer is checked
  **before** the new name is declared, so in `let x: int = x + 1;` the `x` on
  the right refers to an outer `x` (or is an "undeclared variable" error).

### Semantic errors

Semantic analysis reports **all** semantic errors (exit code 2), and nothing
is executed. An expression that already produced an error is not reported
again by the operators around it. Errors include:

- `undeclared variable 'x'` / `assignment to undeclared variable 'x'`
- `variable 'x' is already declared in this scope (line N)`
- `cannot initialize variable 'x' of type 'int' with a value of type 'string'`
- `cannot assign a value of type 'float' to variable 'i' of type 'int'`
- `operator '<' cannot be applied to operands of type 'string' and 'string'`
- `operator '-' cannot be applied to an operand of type 'bool'`
- `condition of 'if' must be of type 'bool', got 'int'`

## 5. Runtime semantics

These rules are defined by ShreyaLang and implemented in one place
(`src/value.cpp`), which both the optimizer and the VM use.

| Operation | Behaviour |
|---|---|
| `int` `/` | Truncates toward zero: `-7 / 2 == -3`. |
| `int` `%` | Result has the sign of the dividend: `-7 % 3 == -1`, `7 % -3 == 1`. |
| `/` or `%` by zero | Runtime error `division by zero` / `modulo by zero`, for `int` **and** `float`, even if both operands are constants. |
| `int` overflow | `+ - *`, unary `-` and `INT64_MIN / -1` raise the runtime error `integer overflow`. |
| `float` arithmetic | IEEE double. Overflow gives `inf`; `inf - inf` gives `nan`. |
| `&&`, `\|\|` | Short-circuit: the right operand is evaluated only when needed. |
| `print` | Writes the value and a newline. |

### Print format

| Type | Format |
|---|---|
| `int` | decimal, e.g. `-42` |
| `float` | C `%.15g`, plus `.0` if there is no decimal point: `2.0`, `0.75`, `0.333333333333333`, `1.0e+20`, `inf`, `-inf`, `nan` |
| `bool` | `true` / `false` |
| `string` | the characters, escapes already decoded |

### Runtime errors

A runtime error stops the program (exit code 3). Output printed before the
error remains. The report names the source position of the failing
operation:

```
Runtime error at line 1, col 10: division by zero
 1 | print(10 / 0);
   |          ^
```

The VM executes at most 1,000,000 TAC instructions by default
(`--max-steps N` changes this). Exceeding the limit is the runtime error
`execution limit exceeded (N steps)`.

## 6. Limits

| Limit | Value | Error |
|---|---|---|
| Expression nesting depth | 1000 levels | `expression is nested too deeply (limit 1000 levels)` |
| Parser stack (nesting of blocks, statements and parentheses) | 3000 entries | `program is nested too deeply` |

Both are syntax errors (exit code 1). They keep the compiler's recursive
passes within the stack.

## 7. Not in the language

Functions, recursion, arrays, classes, pointers, imports, casts, input,
string concatenation, `for`, `break` and `continue` are not part of ShreyaLang
and are not partially implemented.
