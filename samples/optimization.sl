// Optimization demo. Compare:
//   shreyalang samples/optimization.sl --emit-tac --emit-opt-tac
let seconds: int = 60 * 60 * 24;     // folded to 86400
let minutes: int = seconds / 60;     // propagated, then folded to 1440
print(seconds);
print(minutes);
print(2 + 3 * 4);                    // folded to PRINT 14
let half: float = 1 / 2.0;           // I2F of a constant is folded too
print(half);

// Not folded: the VM must report the error at runtime, so the guard below
// keeps it from ever executing.
let zero: int = 0;
if (zero != 0) {
    print(10 / zero);
}

// A constant before a loop is not propagated past the loop label.
let i: int = 0;
while (i < 3) {
    i = i + 1;
}
print(i);
