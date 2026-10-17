// Blocks and shadowing. Use --symbols to see the scope tree and the unique
// TAC names (x, x#2, x#3).
let x: int = 1;
{
    let x: float = 2.5;          // shadows the outer x
    print(x);
    {
        let x: string = "inner";
        print(x);
    }
    x = x * 2;
    print(x);
}
print(x);                        // the outer x is unchanged
