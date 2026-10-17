let x: int = 1;
{
    let x: int = 2;
    print(x);
    {
        let x: string = "three";
        print(x);
    }
    x = x + 10;
    print(x);
}
print(x);
