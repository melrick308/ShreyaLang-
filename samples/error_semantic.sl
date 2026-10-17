// Semantic errors: all of them are collected (exit code 2), nothing runs.
let x: int = "hello";        // type mismatch
let x: int = 2;              // redeclaration in the same scope
print(missing);              // undeclared variable
let f: float = 1.5;
let i: int = f;              // float -> int is not allowed
if (i) {                     // condition must be bool
    print("a" < "b");        // strings only support == and !=
}
