// Loops: factorial, Fibonacci, and the primes below 30.
let n: int = 1;
let fact: int = 1;
while (n <= 10) {
    fact = fact * n;
    n = n + 1;
}
print(fact);                // 3628800

let a: int = 0;
let b: int = 1;
let count: int = 0;
while (count < 10) {
    print(a);
    let next: int = a + b;  // block-local variable
    a = b;
    b = next;
    count = count + 1;
}

let candidate: int = 2;
while (candidate < 30) {
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
}
