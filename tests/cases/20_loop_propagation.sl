// x is a known constant before the loop, but the loop changes it.
// The optimizer must not propagate x = 5 past the loop label.
let x: int = 5;
let i: int = 0;
while (i < 3) {
    print(x);
    x = x + 1;
    i = i + 1;
}
print(x);
