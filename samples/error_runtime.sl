// Runtime error: output produced before the error is kept (exit code 3).
let d: int = 3;
while (d >= 0) {
    print(12 / d);           // fails when d reaches 0
    d = d - 1;
}
