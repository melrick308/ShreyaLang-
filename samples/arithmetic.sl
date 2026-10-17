// Arithmetic: precedence, associativity, int/float mixing.
let a: int = 10;
let b: int = 5;
print(a + b * 2);          // 20: * binds tighter than +
print((a + b) * 2);        // 30
print(a - b - 2);          // 3: left-associative
print(a / 3);              // 3: integer division truncates toward zero
print(-a / 3);             // -3
print(a % 3);              // 1
print(-a % 3);             // -1: % takes the sign of the dividend

let r: float = 2;          // int -> float is implicit
print(r);                  // 2.0
print(a / 4.0);            // 2.5: mixed int/float gives float
print(r * r * 3.14159);    // area of a circle with radius 2
