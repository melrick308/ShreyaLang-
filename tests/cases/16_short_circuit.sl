print(true || (1 / 0 == 0));
print(false && (1 / 0 == 0));
let n: int = 0;
if (n != 0 && 10 / n > 1) {
    print("never");
} else {
    print("guarded");
}
