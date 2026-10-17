// Before the loop, x = 2 + 3 is folded and propagated. At the loop label
// all constant knowledge is discarded, so neither the loop body nor the
// final print may use the stale value 5.
let x: int = 2 + 3;
let i: int = 0;
print(x);
while (i < 3) {
    x = x + 1;
    i = i + 1;
}
print(x);
