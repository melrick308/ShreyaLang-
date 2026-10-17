// "Learn ShreyaLang" course content.
//
// Every code example, quiz answer and exercise solution here is checked
// against the real compiler by web/test_lessons.mjs (`make test-web`), so the
// lessons cannot drift from what the compiler actually does.
//
// Block types:
//   h        section heading
//   p        paragraph (HTML)
//   code     runnable example; `expect` = expected exit code (default 0)
//   callout  kind: "rule" | "tip" | "mistake"
//   syntax   a syntax pattern with an explanation
//   table    simple table
//   quiz     multiple choice; `verify` is checked against the compiler
//   exercise write code; checked by compiling and running it

const h = (text) => ({ t: "h", text });
const p = (html) => ({ t: "p", html });
const code = (src, opts = {}) => ({ t: "code", code: src, ...opts });
const rule = (html) => ({ t: "callout", kind: "rule", html });
const tip = (html) => ({ t: "callout", kind: "tip", html });
const mistake = (html, src, opts = {}) => ({ t: "callout", kind: "mistake", html, code: src, ...opts });
const syntax = (pattern, html) => ({ t: "syntax", pattern, html });
const table = (head, rows) => ({ t: "table", head, rows });
const quiz = (q) => ({ t: "quiz", ...q });
const exercise = (e) => ({ t: "exercise", ...e });

export const LESSONS = [
  // ------------------------------------------------------------------ 1
  {
    id: "hello",
    title: "Your first program",
    minutes: 5,
    goals: ["Write and run a program", "Use print to show values", "End statements with semicolons", "Write comments"],
    blocks: [
      p("A ShreyaLang program is a list of <strong>statements</strong> that run from top to bottom. The simplest statement is <code>print</code>, which shows a value and then moves to a new line."),
      code(`print("Hello, ShreyaLang!");`, { note: "Press Run to compile and execute it with the real compiler." }),
      syntax(`print( value );`, "<code>print</code> takes exactly one value in parentheses. Every statement ends with a semicolon <code>;</code>."),
      p("Statements run in order, so several prints produce several lines:"),
      code(`print("first");
print("second");
print(42);`),
      h("Comments"),
      p("Two slashes <code>//</code> start a <strong>comment</strong>. The rest of the line is ignored by the compiler, so you can use it to explain your code."),
      code(`// This line is ignored.
print("visible");   // a comment can follow code
// print("hidden");`),
      rule("An empty program, or one with only comments, is valid. It simply prints nothing."),
      mistake("Forgetting the semicolon is a <strong>syntax error</strong>. The compiler says what it expected and where.", `print("hi")`, { expect: 1 }),
      mistake("<code>print</code> accepts exactly one value. To print two things, use two statements.", `print(1, 2);`, { expect: 1 }),
      quiz({
        prompt: "What does this program print?",
        code: `print("a");
// print("b");
print("c");`,
        choices: ["a, b and c on three lines", "a and c on two lines", "only c"],
        answer: 1,
        verify: { exit: 0, output: "a\nc\n" },
        explain: "The middle line is a comment, so it is never executed.",
      }),
      exercise({
        title: "Three lines",
        task: "Print the words <code>ShreyaLang</code>, <code>is</code> and <code>fun</code>, each on its own line.",
        starter: `// Write your program here\n`,
        expect: { output: "ShreyaLang\nis\nfun\n" },
        hints: ["Use three print statements.", 'Text goes in double quotes: print("is");'],
        solution: `print("ShreyaLang");
print("is");
print("fun");`,
      }),
    ],
    summary: ["Programs are statements that run top to bottom.", "<code>print(value);</code> shows one value per line.", "Every statement ends with <code>;</code>.", "<code>//</code> starts a comment."],
  },

  // ------------------------------------------------------------------ 2
  {
    id: "values",
    title: "Values and types",
    minutes: 8,
    goals: ["Know the four types", "Write int, float, bool and string literals", "Use escape sequences in strings"],
    blocks: [
      p("Every value in ShreyaLang has a <strong>type</strong>. There are exactly four:"),
      table(["Type", "Meaning", "Examples"], [
        ["<code>int</code>", "whole number (64-bit)", "<code>0</code>, <code>42</code>, <code>-7</code>"],
        ["<code>float</code>", "number with a fractional part", "<code>3.14</code>, <code>0.5</code>, <code>2.0</code>"],
        ["<code>bool</code>", "truth value", "<code>true</code>, <code>false</code>"],
        ["<code>string</code>", "text", '<code>"hello"</code>'],
      ]),
      code(`print(42);
print(-7);
print(3.14);
print(2.0);
print(true);
print("text");`),
      h("Numbers"),
      rule("A float literal needs digits on <em>both</em> sides of the point: <code>2.0</code> and <code>0.5</code> are fine; <code>2.</code>, <code>.5</code> and <code>1e5</code> are not allowed."),
      p("Floats are always printed with a decimal point, so you can tell them apart from ints:"),
      code(`print(4.0);
print(0.5 + 0.25);
print(1.0 / 3.0);`),
      mistake("A number like <code>1.5.2</code> is a <strong>lexical error</strong> (a malformed number).", `print(1.5.2);`, { expect: 1 }),
      h("Strings"),
      p("Strings are written in double quotes and must fit on one line. To include special characters, use an <strong>escape sequence</strong>:"),
      table(["Escape", "Means"], [
        ["<code>\\n</code>", "new line"],
        ["<code>\\t</code>", "tab"],
        ['<code>\\"</code>', "a double quote"],
        ["<code>\\\\</code>", "a backslash"],
      ]),
      code(`print("She said \\"hi\\"");
print("one\\ntwo");
print("a\\tb");
print("back\\\\slash");`),
      mistake("A string without its closing quote is a <strong>lexical error</strong>: strings cannot continue onto the next line.", `print("unfinished);`, { expect: 1 }),
      quiz({
        prompt: "What does <code>print(7.0);</code> show?",
        code: `print(7.0);`,
        choices: ["7", "7.0", "7.000000"],
        answer: 1,
        verify: { exit: 0, output: "7.0\n" },
        explain: "A float always prints with a decimal point; the shortest form is used.",
      }),
      quiz({
        prompt: "How many lines does this print?",
        code: `print("x\\ny\\nz");`,
        choices: ["1", "2", "3"],
        answer: 2,
        verify: { exit: 0, output: "x\ny\nz\n" },
        explain: "Each <code>\\n</code> starts a new line, so one print produces three lines.",
      }),
      exercise({
        title: "One of each",
        task: "Print the int <code>2026</code>, the float <code>1.5</code>, the bool <code>false</code> and the string <code>done</code>, one per line, in that order.",
        starter: `// One print per value\n`,
        expect: { output: "2026\n1.5\nfalse\ndone\n" },
        hints: ["bool values are written without quotes: false", "The string needs quotes: \"done\""],
        solution: `print(2026);
print(1.5);
print(false);
print("done");`,
      }),
    ],
    summary: ["Four types: <code>int</code>, <code>float</code>, <code>bool</code>, <code>string</code>.", "Floats need digits on both sides of the point and print with a decimal point.", "Strings use double quotes and escapes <code>\\n \\t \\\" \\\\</code>."],
  },

  // ------------------------------------------------------------------ 3
  {
    id: "variables",
    title: "Variables",
    minutes: 10,
    goals: ["Declare variables with let", "Change a variable with assignment", "Know the naming rules"],
    blocks: [
      p("A <strong>variable</strong> is a named place that holds a value. You create one with <code>let</code>, giving its name, its type and its starting value:"),
      syntax(`let name: type = value;`, "All three parts are required. ShreyaLang has no default values, so every variable starts with a value you choose."),
      code(`let age: int = 20;
let price: float = 9.99;
let ready: bool = true;
let name: string = "Ada";
print(name);
print(age);
print(price);
print(ready);`),
      mistake("Leaving out the starting value is a syntax error.", `let x: int;`, { expect: 1 }),
      h("Changing a variable"),
      p("An <strong>assignment</strong> stores a new value in an existing variable. The right side is computed first, so a variable can appear on both sides:"),
      syntax(`name = value;`, "The variable must already be declared, and the new value must have a compatible type."),
      code(`let count: int = 1;
print(count);
count = count + 1;
print(count);
count = count * 10;
print(count);`),
      h("Names"),
      p("Names start with a letter or <code>_</code> and continue with letters, digits or <code>_</code>. They are case-sensitive: <code>total</code> and <code>Total</code> are different variables."),
      rule("These words are <strong>keywords</strong> and cannot be used as names: <code>let</code>, <code>int</code>, <code>float</code>, <code>bool</code>, <code>string</code>, <code>if</code>, <code>else</code>, <code>while</code>, <code>print</code>, <code>true</code>, <code>false</code>."),
      h("What the compiler checks"),
      mistake("Using a variable that was never declared is a <strong>semantic error</strong>.", `print(score);`, { expect: 2 }),
      mistake("The value must match the declared type.", `let n: int = "five";`, { expect: 2 }),
      mistake("A name can only be declared once in the same scope.", `let x: int = 1;
let x: int = 2;`, { expect: 2 }),
      tip("When there are semantic errors, the compiler reports <em>all</em> of them at once, and nothing is executed."),
      quiz({
        prompt: "What does this program print?",
        code: `let x: int = 5;
x = x + 3;
x = x * 2;
print(x);`,
        choices: ["10", "16", "13"],
        answer: 1,
        verify: { exit: 0, output: "16\n" },
        explain: "x becomes 5 + 3 = 8, then 8 * 2 = 16.",
      }),
      quiz({
        prompt: "What happens with this program?",
        code: `let total: int = 0;
Total = 5;
print(total);`,
        choices: ["It prints 5", "It prints 0", "Semantic error: Total is undeclared"],
        answer: 2,
        verify: { exit: 2, category: "Semantic" },
        explain: "Names are case-sensitive. <code>Total</code> was never declared, so the compiler rejects the program.",
      }),
      exercise({
        title: "Swap two values",
        task: "Swap the values of <code>a</code> and <code>b</code> so that the prints at the end show <code>7</code> and then <code>3</code>. Do not change the first two lines or the prints.",
        starter: `let a: int = 3;
let b: int = 7;
// swap a and b here

print(a);
print(b);
`,
        expect: { output: "7\n3\n" },
        forbid: [{ pattern: "print\\(\\s*[0-9]", message: "Print the variables, not numbers." }],
        hints: ["You need a third variable to remember one value.", "let temp: int = a; then a = b; then b = temp;"],
        solution: `let a: int = 3;
let b: int = 7;
let temp: int = a;
a = b;
b = temp;
print(a);
print(b);`,
      }),
    ],
    summary: ["<code>let name: type = value;</code> declares a variable; the value is required.", "<code>name = value;</code> changes it.", "Names are case-sensitive; keywords are reserved.", "Undeclared names, wrong types and duplicate declarations are semantic errors."],
  },

  // ------------------------------------------------------------------ 4
  {
    id: "arithmetic",
    title: "Arithmetic",
    minutes: 10,
    goals: ["Use + - * / %", "Predict the order of operations", "Understand integer division and remainders", "Know which arithmetic fails at runtime"],
    blocks: [
      table(["Operator", "Meaning", "Example", "Result"], [
        ["<code>+</code>", "addition", "<code>7 + 2</code>", "9"],
        ["<code>-</code>", "subtraction", "<code>7 - 2</code>", "5"],
        ["<code>*</code>", "multiplication", "<code>7 * 2</code>", "14"],
        ["<code>/</code>", "division", "<code>7 / 2</code>", "3"],
        ["<code>%</code>", "remainder (ints only)", "<code>7 % 2</code>", "1"],
        ["<code>-x</code>", "negation", "<code>-(3 - 5)</code>", "2"],
      ]),
      h("Order of operations"),
      p("<code>*</code>, <code>/</code> and <code>%</code> are done before <code>+</code> and <code>-</code>. Operators of the same level are applied left to right. Parentheses override both rules."),
      code(`print(2 + 3 * 4);
print((2 + 3) * 4);
print(20 - 5 - 3);
print(2 * 3 % 4);`),
      tip("Open the program in the Compiler view (Compiler ↗) and look at the AST tab: the operator that runs last sits at the top of the tree."),
      h("Integer division"),
      rule("Dividing two ints gives an int: the fractional part is cut off (rounded <em>toward zero</em>). The remainder <code>%</code> has the same sign as the left operand."),
      code(`print(7 / 2);
print(-7 / 2);
print(7 % 3);
print(-7 % 3);`),
      h("Errors at runtime"),
      p("Some mistakes can only be detected while the program runs. They stop the program with a <strong>runtime error</strong>:"),
      mistake("Dividing by zero is a runtime error, even when both numbers are constants.", `print("before");
print(10 / 0);
print("after");`, { expect: 3 }),
      mistake("An int holds values up to 9223372036854775807. Going beyond that is an <em>integer overflow</em> error, not a silent wrap-around.", `let big: int = 9223372036854775807;
print(big + 1);`, { expect: 3 }),
      quiz({
        prompt: "What does this print?",
        code: `print(10 - 4 / 2 * 3);`,
        choices: ["9", "4", "6"],
        answer: 1,
        verify: { exit: 0, output: "4\n" },
        explain: "4 / 2 = 2 first, then 2 * 3 = 6 (left to right), and finally 10 - 6 = 4.",
      }),
      quiz({
        prompt: "What does this print?",
        code: `print(17 % 5);
print(17 / 5);`,
        choices: ["2 then 3", "3 then 2", "2 then 3.4"],
        answer: 0,
        verify: { exit: 0, output: "2\n3\n" },
        explain: "17 = 3 × 5 + 2, so the remainder is 2 and integer division gives 3.",
      }),
      exercise({
        title: "Hours, minutes, seconds",
        task: "<code>total</code> is a number of seconds. Print how many whole hours, then the remaining whole minutes, then the remaining seconds (each on its own line). For 3725 seconds that is <code>1</code>, <code>2</code>, <code>5</code>.",
        starter: `let total: int = 3725;
// print hours, minutes and seconds
`,
        expect: { output: "1\n2\n5\n" },
        forbid: [{ pattern: "print\\(\\s*[0-9]", message: "Compute the values from total instead of printing numbers." }],
        hints: ["An hour has 3600 seconds: total / 3600.", "The seconds left after the hours are total % 3600; divide those by 60 for minutes.", "The last value is total % 60."],
        solution: `let total: int = 3725;
print(total / 3600);
print(total % 3600 / 60);
print(total % 60);`,
      }),
    ],
    summary: ["<code>* / %</code> before <code>+ -</code>; left to right; parentheses first.", "int / int cuts off the fraction; <code>%</code> takes the sign of the left side.", "Division by zero and integer overflow are runtime errors."],
  },

  // ------------------------------------------------------------------ 5
  {
    id: "mixing",
    title: "Mixing int and float",
    minutes: 6,
    goals: ["Know when ints become floats", "Know what is not allowed"],
    blocks: [
      rule("An <code>int</code> is converted to <code>float</code> automatically when needed. A <code>float</code> is <strong>never</strong> converted to <code>int</code>, and there is no cast operator."),
      p("If either side of <code>+ - * /</code> is a float, the result is a float:"),
      code(`print(7 / 2);
print(7 / 2.0);
print(1 + 0.5);
let f: float = 3;
print(f);`),
      p("A float variable can receive an int value (it is converted), and ints and floats can be compared directly:"),
      code(`let x: float = 10;
x = x / 4;
print(x);
print(1 == 1.0);
print(2 < 2.5);`),
      mistake("Storing a float in an int variable is a semantic error, even if the value looks whole.", `let n: int = 6 / 2.0;`, { expect: 2 }),
      mistake("The remainder operator <code>%</code> only works with ints.", `print(7.5 % 2);`, { expect: 2 }),
      quiz({
        prompt: "What does this print?",
        code: `let a: int = 5;
let b: float = a;
print(b / 2);`,
        choices: ["2", "2.5", "Semantic error"],
        answer: 1,
        verify: { exit: 0, output: "2.5\n" },
        explain: "b holds 5.0 (converted from int), and a float divided by 2 is 2.5.",
      }),
      quiz({
        prompt: "Which line makes this program invalid?",
        code: `let i: int = 4;
let f: float = i;
i = f;`,
        choices: ["line 2", "line 3", "neither: it is valid"],
        answer: 1,
        verify: { exit: 2, category: "Semantic" },
        explain: "int → float (line 2) is allowed; float → int (line 3) is not.",
      }),
      exercise({
        title: "The average",
        task: "Print the average of <code>a</code>, <code>b</code> and <code>c</code> as a float. For 4, 5 and 9 the program must print <code>6.0</code>.",
        starter: `let a: int = 4;
let b: int = 5;
let c: int = 9;
// print the average as a float
`,
        expect: { output: "6.0\n" },
        forbid: [{ pattern: "print\\(\\s*6", message: "Compute the average from a, b and c." }],
        hints: ["(a + b + c) / 3 is integer division and prints 6, not 6.0.", "Divide by a float: (a + b + c) / 3.0"],
        solution: `let a: int = 4;
let b: int = 5;
let c: int = 9;
print((a + b + c) / 3.0);`,
      }),
    ],
    summary: ["int → float happens automatically.", "float → int is never allowed.", "Any float operand makes the arithmetic result a float.", "<code>%</code> is for ints only."],
  },

  // ------------------------------------------------------------------ 6
  {
    id: "booleans",
    title: "Comparisons and logic",
    minutes: 10,
    goals: ["Compare values", "Combine conditions with && || !", "Understand short-circuit evaluation"],
    blocks: [
      h("Comparisons"),
      p("Comparison operators produce a <code>bool</code>:"),
      table(["Operator", "Meaning", "Works on"], [
        ["<code>&lt;  &lt;=  &gt;  &gt;=</code>", "less / greater (or equal)", "numbers"],
        ["<code>==</code>", "equal", "numbers, bools, strings"],
        ["<code>!=</code>", "not equal", "numbers, bools, strings"],
      ]),
      code(`print(3 < 5);
print(5 <= 5);
print(2 == 3);
print("cat" == "cat");
print(true != false);`),
      h("Logic"),
      table(["Expression", "Is true when"], [
        ["<code>a &amp;&amp; b</code>", "both a and b are true"],
        ["<code>a || b</code>", "at least one of a and b is true"],
        ["<code>!a</code>", "a is false"],
      ]),
      code(`let age: int = 20;
let member: bool = false;
print(age >= 18 && member);
print(age >= 18 || member);
print(!member);`),
      p("Comparisons are evaluated before <code>&amp;&amp;</code>, and <code>&amp;&amp;</code> before <code>||</code>. Use parentheses when in doubt."),
      code(`print(true || false && false);
print((true || false) && false);`),
      h("Short-circuit evaluation"),
      p("<code>&amp;&amp;</code> stops as soon as the left side is false, and <code>||</code> stops as soon as the left side is true. The right side is then never evaluated, so the division by zero below never happens:"),
      code(`print(false && 1 / 0 == 0);
print(true || 1 / 0 == 0);
let n: int = 0;
print(n != 0 && 10 / n > 1);`),
      h("Rules"),
      mistake("Strings can only be compared for equality; there is no ordering.", `print("apple" < "banana");`, { expect: 2 }),
      mistake("A bool and an int cannot be compared: <code>true</code> is not the number 1.", `print(true == 1);`, { expect: 2 }),
      mistake("Comparisons cannot be chained. <code>1 &lt; 2 &lt; 3</code> means <code>(1 &lt; 2) &lt; 3</code>, which compares a bool with an int.", `print(1 < 2 < 3);`, { expect: 2 }),
      quiz({
        prompt: "What does this print?",
        code: `print(!(3 > 2) || 4 % 2 == 0);`,
        choices: ["true", "false", "Semantic error"],
        answer: 0,
        verify: { exit: 0, output: "true\n" },
        explain: "!(3 > 2) is false, but 4 % 2 == 0 is true, and false || true is true.",
      }),
      quiz({
        prompt: "Does this program stop with a division-by-zero error?",
        code: `let d: int = 0;
print(d == 0 || 100 / d > 5);`,
        choices: ["Yes", "No, it prints true", "No, it prints false"],
        answer: 1,
        verify: { exit: 0, output: "true\n" },
        explain: "d == 0 is true, so || never evaluates the division.",
      }),
      exercise({
        title: "Leap years",
        task: "A year is a leap year if it is divisible by 4 and not by 100, <em>or</em> if it is divisible by 400. Print whether <code>y1</code>, <code>y2</code> and <code>y3</code> are leap years. The output must be <code>true</code>, <code>false</code>, <code>true</code>.",
        starter: `let y1: int = 2024;
let y2: int = 1900;
let y3: int = 2000;
// print one bool per year
`,
        expect: { output: "true\nfalse\ntrue\n" },
        forbid: [{ pattern: "print\\(\\s*(true|false)\\s*\\)", message: "Compute the answers with an expression." }],
        hints: ["Divisible by 4 means y1 % 4 == 0.", "(y1 % 4 == 0 && y1 % 100 != 0) || y1 % 400 == 0"],
        solution: `let y1: int = 2024;
let y2: int = 1900;
let y3: int = 2000;
print((y1 % 4 == 0 && y1 % 100 != 0) || y1 % 400 == 0);
print((y2 % 4 == 0 && y2 % 100 != 0) || y2 % 400 == 0);
print((y3 % 4 == 0 && y3 % 100 != 0) || y3 % 400 == 0);`,
      }),
    ],
    summary: ["Comparisons produce bools; strings support only <code>==</code> and <code>!=</code>.", "<code>&amp;&amp;</code>, <code>||</code> and <code>!</code> work on bools only.", "<code>&amp;&amp;</code> and <code>||</code> skip the right side when the answer is already known."],
  },

  // ------------------------------------------------------------------ 7
  {
    id: "if",
    title: "Making decisions: if / else",
    minutes: 8,
    goals: ["Run code only when a condition holds", "Choose between two branches", "Handle more than two cases"],
    blocks: [
      syntax(`if (condition) {
    statements
} else {
    statements
}`, "If the condition is true, the first block runs; otherwise the <code>else</code> block runs. The <code>else</code> part is optional."),
      code(`let temperature: int = 31;
if (temperature > 25) {
    print("Warm");
} else {
    print("Cool");
}`),
      p("Without <code>else</code>, nothing happens when the condition is false:"),
      code(`let balance: int = -20;
if (balance < 0) {
    print("Overdrawn!");
}
print("Done");`),
      rule("The braces <code>{ }</code> are always required, even for a single statement. The condition must be a <code>bool</code>: there is no \"truthiness\", so <code>if (count)</code> is not allowed."),
      h("More than two cases"),
      p("To test several conditions in turn, put the next <code>if</code> inside the <code>else</code> block:"),
      code(`let score: int = 72;
if (score >= 90) {
    print("A");
} else {
    if (score >= 70) {
        print("B");
    } else {
        print("C");
    }
}`),
      mistake("Leaving out the braces is a syntax error.", `if (true) print("yes");`, { expect: 1 }),
      mistake("<code>else if</code> without braces is not allowed. Write <code>else { if ... }</code> instead.", `let n: int = 5;
if (n > 10) {
    print("big");
} else if (n > 3) {
    print("medium");
}`, { expect: 1 }),
      mistake("An int is not a condition. Compare it explicitly, for example <code>count != 0</code>.", `let count: int = 3;
if (count) {
    print("not zero");
}`, { expect: 2 }),
      quiz({
        prompt: "What does this print?",
        code: `let n: int = 7;
if (n % 2 == 0) {
    print("even");
} else {
    print("odd");
}
print(n);`,
        choices: ["even then 7", "odd then 7", "only odd"],
        answer: 1,
        verify: { exit: 0, output: "odd\n7\n" },
        explain: "7 % 2 is 1, so the else branch runs; the last print is outside the if and always runs.",
      }),
      exercise({
        title: "Weather report",
        task: "Print <code>hot</code> if <code>temp</code> is above 30, <code>warm</code> if it is above 20, and <code>cold</code> otherwise. With <code>temp</code> = 31 the program must print <code>hot</code> (and nothing else). Use if/else.",
        starter: `let temp: int = 31;
// print hot, warm or cold
`,
        expect: { output: "hot\n" },
        mustContain: [{ pattern: "\\bif\\b", message: "Use an if statement." }, { pattern: "\\belse\\b", message: "Use else for the other cases." }, { pattern: "\"warm\"", message: "Handle the warm case too." }, { pattern: "\"cold\"", message: "Handle the cold case too." }],
        hints: ["Test the highest range first: if (temp > 30) { ... }", "Put the second test inside the else block."],
        solution: `let temp: int = 31;
if (temp > 30) {
    print("hot");
} else {
    if (temp > 20) {
        print("warm");
    } else {
        print("cold");
    }
}`,
      }),
    ],
    summary: ["<code>if (cond) { ... } else { ... }</code>; else is optional.", "Braces are always required.", "Conditions must be bool.", "Use <code>else { if ... }</code> for more cases."],
  },

  // ------------------------------------------------------------------ 8
  {
    id: "while",
    title: "Repeating: while loops",
    minutes: 10,
    goals: ["Repeat code with while", "Use counters and accumulators", "Avoid infinite loops"],
    blocks: [
      syntax(`while (condition) {
    statements
}`, "The condition is checked <em>before</em> every round. While it is true, the body runs again; once it is false, the program continues after the loop."),
      code(`let i: int = 1;
while (i <= 5) {
    print(i);
    i = i + 1;
}`),
      p("A loop that adds up values uses an <strong>accumulator</strong>: a variable that collects the result as the loop runs."),
      code(`let sum: int = 0;
let n: int = 1;
while (n <= 100) {
    sum = sum + n;
    n = n + 1;
}
print(sum);`),
      p("Counting down works the same way:"),
      code(`let t: int = 3;
while (t > 0) {
    print(t);
    t = t - 1;
}
print("Lift-off!");`),
      p("If the condition is false at the start, the body never runs:"),
      code(`let k: int = 10;
while (k < 5) {
    print("never");
}
print("skipped the loop");`),
      h("Infinite loops"),
      mistake("If nothing in the body makes the condition false, the loop never ends. The virtual machine stops any program after a maximum number of steps (here 1000) with a runtime error.", `let i: int = 0;
while (i < 10) {
    print(i);
}`, { expect: 3, maxSteps: 1000 }),
      tip("When a loop does not behave as expected, check three things: the starting value, the condition, and the update inside the body."),
      quiz({
        prompt: "What does this print?",
        code: `let i: int = 0;
let s: int = 0;
while (i < 4) {
    s = s + i;
    i = i + 1;
}
print(s);`,
        choices: ["10", "6", "4"],
        answer: 1,
        verify: { exit: 0, output: "6\n" },
        explain: "The body runs for i = 0, 1, 2 and 3, so s = 0 + 1 + 2 + 3 = 6.",
      }),
      exercise({
        title: "Times table",
        task: "Use a while loop to print the first five multiples of 7: <code>7</code>, <code>14</code>, <code>21</code>, <code>28</code>, <code>35</code>.",
        starter: `// use a while loop
`,
        expect: { output: "7\n14\n21\n28\n35\n" },
        mustContain: [{ pattern: "\\bwhile\\b", message: "Use a while loop." }],
        forbid: [{ pattern: "print\\(\\s*(7|14|21|28|35)\\s*\\)", message: "Compute the multiples inside the loop instead of printing fixed numbers." }],
        hints: ["Count i from 1 to 5.", "print(7 * i); inside the loop, then i = i + 1;"],
        solution: `let i: int = 1;
while (i <= 5) {
    print(7 * i);
    i = i + 1;
}`,
      }),
      exercise({
        title: "Factorial",
        task: "Compute 6! = 1 × 2 × 3 × 4 × 5 × 6 with a while loop and print the result (<code>720</code>).",
        starter: `let n: int = 6;
// compute n! with a while loop
`,
        expect: { output: "720\n" },
        mustContain: [{ pattern: "\\bwhile\\b", message: "Use a while loop." }],
        forbid: [{ pattern: "720", message: "Compute the value instead of writing 720." }],
        hints: ["Start an accumulator at 1: let result: int = 1;", "Multiply it by every number from 1 to n."],
        solution: `let n: int = 6;
let result: int = 1;
let i: int = 1;
while (i <= n) {
    result = result * i;
    i = i + 1;
}
print(result);`,
      }),
    ],
    summary: ["<code>while (cond) { ... }</code> repeats while cond is true.", "Update the loop variable in the body.", "Programs that run too long are stopped by the step limit."],
  },

  // ------------------------------------------------------------------ 9
  {
    id: "scope",
    title: "Blocks and scope",
    minutes: 8,
    goals: ["Understand where a variable is visible", "Use shadowing correctly"],
    blocks: [
      p("Every pair of braces <code>{ }</code> is a <strong>block</strong>, and every block has its own <strong>scope</strong>. A variable declared inside a block only exists until the closing brace. The bodies of <code>if</code>, <code>else</code> and <code>while</code> are blocks too."),
      code(`let x: int = 1;
{
    let y: int = 2;
    print(x + y);
}
print(x);`),
      mistake("After the block ends, its variables are gone.", `{
    let secret: int = 42;
}
print(secret);`, { expect: 2 }),
      tip("Code inside a block can see the variables of all enclosing blocks: x above is visible inside the inner block."),
      h("Shadowing"),
      p("A block may declare a variable with the same name as one outside it. Inside the block, the name refers to the new variable; the outer one is untouched. This is called <strong>shadowing</strong>."),
      code(`let x: int = 1;
{
    let x: string = "inner";
    print(x);
}
print(x);`),
      rule("Declaring the same name twice in the <em>same</em> block is an error; declaring it again in an <em>inner</em> block is allowed."),
      p("In a declaration, the right-hand side is evaluated before the new name exists. So it can refer to the outer variable of the same name:"),
      code(`let level: int = 1;
{
    let level: int = level + 1;
    print(level);
}
print(level);`),
      p("Assigning to a shadowed name changes the inner variable only:"),
      code(`let count: int = 10;
{
    let count: int = 0;
    count = count + 5;
    print(count);
}
print(count);`),
      quiz({
        prompt: "What does this print?",
        code: `let a: int = 10;
{
    let a: int = 20;
    a = a + 1;
}
print(a);`,
        choices: ["21", "10", "Semantic error"],
        answer: 1,
        verify: { exit: 0, output: "10\n" },
        explain: "The block changes its own a (20 → 21); the outer a is still 10.",
      }),
      quiz({
        prompt: "What does this print?",
        code: `let a: int = 10;
{
    a = a + 1;
}
print(a);`,
        choices: ["11", "10", "Semantic error"],
        answer: 0,
        verify: { exit: 0, output: "11\n" },
        explain: "No new a is declared in the block, so the assignment changes the outer a.",
      }),
      exercise({
        title: "Fix the scope error",
        task: "This program should print only the sum of the squares of 1, 2 and 3 (<code>14</code>), but it does not compile. Find and fix the problem.",
        starter: `let total: int = 0;
let i: int = 1;
while (i <= 3) {
    let square: int = i * i;
    total = total + square;
    i = i + 1;
}
print(square);
print(total);
`,
        expect: { output: "14\n" },
        hints: ["Read the error message: which variable is undeclared, and on which line?", "square only exists inside the loop body. The program only needs to print total."],
        solution: `let total: int = 0;
let i: int = 1;
while (i <= 3) {
    let square: int = i * i;
    total = total + square;
    i = i + 1;
}
print(total);`,
      }),
    ],
    summary: ["Each <code>{ }</code> block has its own scope.", "Inner blocks see outer variables, not the other way round.", "Shadowing in an inner block is allowed; redeclaring in the same block is not."],
  },

  // ------------------------------------------------------------------ 10
  {
    id: "errors",
    title: "Understanding errors",
    minutes: 8,
    goals: ["Recognise the four kinds of error", "Read an error message", "Fix programs step by step"],
    blocks: [
      p("The compiler checks a program in phases, and each phase finds a different kind of mistake:"),
      table(["Kind", "Found when", "Typical cause", "Exit code"], [
        ["Lexical", "reading characters", "a character that is not part of the language, a malformed number, an unterminated string", "1"],
        ["Syntax", "checking the grammar", "missing <code>;</code>, <code>)</code> or <code>{</code>, a missing value", "1"],
        ["Semantic", "checking names and types", "undeclared variable, wrong type, duplicate name", "2"],
        ["Runtime", "running the program", "division by zero, integer overflow, too many steps", "3"],
      ]),
      h("Reading a message"),
      p("Every message has the same shape: the kind of error, the line and column, a description, and the line of code with a caret <code>^</code> under the problem. Run this example and look at the result:"),
      code(`let speed: int = 50;
let time: int = 2;
print(speed * tme);`, { expect: 2 }),
      h("One example of each"),
      code(`let price: int = 10 # 2;`, { expect: 1, note: "Lexical: # is not a ShreyaLang character." }),
      code(`let price: int = (10 * 2;`, { expect: 1, note: "Syntax: the parenthesis is never closed." }),
      code(`let price: int = 19.99;`, { expect: 2, note: "Semantic: a float cannot be stored in an int." }),
      code(`let items: int = 0;
print(100 / items);`, { expect: 3, note: "Runtime: division by zero is only discovered while running." }),
      h("How many errors are reported?"),
      table(["Kind", "Reported"], [
        ["Lexical", "all of them"],
        ["Syntax", "only the first: later messages would be unreliable"],
        ["Semantic", "all of them"],
        ["Runtime", "the first one, which stops the program"],
      ]),
      tip("If a program has compile errors, nothing is executed. Fix the first error first: it sometimes explains the others."),
      quiz({
        prompt: "What kind of error is this?",
        code: `let x: int = 5;
x = "hi";`,
        choices: ["Lexical", "Syntax", "Semantic", "Runtime"],
        answer: 2,
        verify: { exit: 2, category: "Semantic" },
        explain: "The program is well-formed, but a string cannot be assigned to an int variable.",
      }),
      quiz({
        prompt: "What kind of error is this?",
        code: `let n: int = 4;
print(n % (n - 4));`,
        choices: ["Syntax", "Semantic", "Runtime"],
        answer: 2,
        verify: { exit: 3, category: "Runtime" },
        explain: "n - 4 is 0, so the remainder is a modulo by zero. That is only known when the program runs.",
      }),
      quiz({
        prompt: "What kind of error is this?",
        code: `print(3 $ 4);`,
        choices: ["Lexical", "Syntax", "Semantic"],
        answer: 0,
        verify: { exit: 1, category: "Lexical" },
        explain: "<code>$</code> is not a character ShreyaLang knows, so the very first phase rejects it.",
      }),
      exercise({
        title: "Debug the program",
        task: "This program has several mistakes. Fix them so that it prints <code>Total:</code> and then <code>60</code>.",
        starter: `let price: int = 20
let quantity: int = 3;
let label: string = Total:;
print(label);
print(price * quantiy);
`,
        expect: { output: "Total:\n60\n" },
        hints: ["Start with the first error message and fix one thing at a time.", "Line 1 needs a semicolon; the text on line 3 needs quotes; check the spelling on line 5."],
        solution: `let price: int = 20;
let quantity: int = 3;
let label: string = "Total:";
print(label);
print(price * quantity);`,
      }),
    ],
    summary: ["Lexical and syntax errors: exit code 1; semantic: 2; runtime: 3.", "Messages give the line, column and a caret.", "Compile errors prevent execution; runtime errors stop it."],
  },

  // ------------------------------------------------------------------ 11
  {
    id: "project",
    title: "Putting it together",
    minutes: 15,
    goals: ["Combine variables, loops and decisions", "Solve two classic problems"],
    blocks: [
      p("You now know the whole language: four types, variables, arithmetic, logic, <code>if</code>/<code>else</code>, <code>while</code> and blocks. These final exercises combine everything."),
      p("Here is a complete example: printing the prime numbers below 20 with two nested loops."),
      code(`let candidate: int = 2;
while (candidate < 20) {
    let d: int = 2;
    let prime: bool = true;
    while (d * d <= candidate && prime) {
        if (candidate % d == 0) {
            prime = false;
        }
        d = d + 1;
    }
    if (prime) {
        print(candidate);
    }
    candidate = candidate + 1;
}`),
      tip("Open it in the Compiler view to see how the loops become labels and jumps in the TAC tab."),
      exercise({
        title: "FizzBuzz",
        task: "For the numbers 1 to 15, print <code>FizzBuzz</code> if the number is divisible by both 3 and 5, <code>Fizz</code> if it is divisible by 3, <code>Buzz</code> if it is divisible by 5, and the number itself otherwise.",
        starter: `let i: int = 1;
// loop from 1 to 15
`,
        expect: { output: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n" },
        mustContain: [{ pattern: "\\bwhile\\b", message: "Use a while loop." }],
        hints: ["Check the FizzBuzz case first: i % 3 == 0 && i % 5 == 0.", "Use else { if ... } for the remaining cases, and print(i) in the last else."],
        solution: `let i: int = 1;
while (i <= 15) {
    if (i % 3 == 0 && i % 5 == 0) {
        print("FizzBuzz");
    } else {
        if (i % 3 == 0) {
            print("Fizz");
        } else {
            if (i % 5 == 0) {
                print("Buzz");
            } else {
                print(i);
            }
        }
    }
    i = i + 1;
}`,
      }),
      exercise({
        title: "Collatz steps",
        task: "Start with <code>n = 27</code>. While <code>n</code> is not 1: if it is even, halve it; otherwise replace it with <code>3 * n + 1</code>. Count the steps and print the count (<code>111</code>).",
        starter: `let n: int = 27;
let steps: int = 0;
`,
        expect: { output: "111\n" },
        mustContain: [{ pattern: "\\bwhile\\b", message: "Use a while loop." }],
        forbid: [{ pattern: "111", message: "Count the steps instead of writing the answer." }],
        hints: ["Loop with while (n != 1).", "Inside: if (n % 2 == 0) { n = n / 2; } else { n = 3 * n + 1; } and add 1 to steps."],
        solution: `let n: int = 27;
let steps: int = 0;
while (n != 1) {
    if (n % 2 == 0) {
        n = n / 2;
    } else {
        n = 3 * n + 1;
    }
    steps = steps + 1;
}
print(steps);`,
      }),
    ],
    summary: ["You have used every feature of ShreyaLang.", "Try your own programs in the Compiler view and look at every compiler phase."],
  },
];

// Quick-reference card shown on the course home page.
export const CHEAT_SHEET = [
  ["Comment", "// text"],
  ["Print", 'print("Hi");'],
  ["Declare", "let x: int = 5;"],
  ["Assign", "x = x + 1;"],
  ["Types", "int  float  bool  string"],
  ["Arithmetic", "+  -  *  /  %"],
  ["Compare", "<  <=  >  >=  ==  !="],
  ["Logic", "&&  ||  !"],
  ["If", "if (c) { ... } else { ... }"],
  ["Loop", "while (c) { ... }"],
  ["Block", "{ ... }"],
];
