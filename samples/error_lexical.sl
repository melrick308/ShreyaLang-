// Lexical errors: all of them are reported in one run (exit code 1).
let a: int = 12abc;
let b: float = 1.2.3;
let c: int = a @ 2;
print("unterminated);
