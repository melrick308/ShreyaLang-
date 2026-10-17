// Conditions: if/else, comparisons, logical operators, short-circuit.
let age: int = 20;
if (age >= 18) {
    print("Adult");
} else {
    print("Minor");
}

let score: int = 72;
if (score >= 90) {
    print("A");
} else {
    if (score >= 70) {
        print("B");
    } else {
        print("C");
    }
}

let raining: bool = false;
let cold: bool = true;
print(raining || cold);
print(!raining && cold);
print("abc" == "abc");

// Short-circuit: the division is never evaluated when n is 0.
let n: int = 0;
if (n != 0 && 100 / n > 1) {
    print("big");
} else {
    print("skipped the division");
}
