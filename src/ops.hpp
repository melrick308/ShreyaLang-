// Operators shared by the AST and the TAC.
#pragma once

// And/Or exist only in the AST: the TAC generator lowers them to jumps
// (short-circuit evaluation), so no BINOP instruction ever uses them.
enum class BinOp { Add, Sub, Mul, Div, Mod, Lt, Le, Gt, Ge, Eq, Ne, And, Or };
enum class UnOp { Neg, Not };

const char* binOpSymbol(BinOp op);    // "+", "<=", "&&" ...
const char* binOpMnemonic(BinOp op);  // "ADD", "LE" ...
const char* unOpSymbol(UnOp op);      // "-", "!"
const char* unOpMnemonic(UnOp op);    // "NEG", "NOT"

inline bool isArithmetic(BinOp op) {
    return op == BinOp::Add || op == BinOp::Sub || op == BinOp::Mul || op == BinOp::Div ||
           op == BinOp::Mod;
}
inline bool isOrdering(BinOp op) {
    return op == BinOp::Lt || op == BinOp::Le || op == BinOp::Gt || op == BinOp::Ge;
}
inline bool isEquality(BinOp op) { return op == BinOp::Eq || op == BinOp::Ne; }
inline bool isLogical(BinOp op) { return op == BinOp::And || op == BinOp::Or; }
