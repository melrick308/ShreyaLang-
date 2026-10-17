// Sum of even numbers and a count of odd numbers from 1 to 10,
// with nested arithmetic, if/else inside while, and several assignments.
let i: int = 1;
let evens: int = 0;
let odds: int = 0;
let weighted: float = 0.0;
while (i <= 10) {
    if (i % 2 == 0) {
        evens = evens + i;
    } else {
        odds = odds + 1;
    }
    weighted = weighted + (i * 2 - 1) / 2.0;
    i = i + 1;
}
print(evens);
print(odds);
print(weighted);
print((evens - odds) * (2 + 3) % 7);
