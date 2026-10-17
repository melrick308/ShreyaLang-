#include "types.hpp"

#include "ops.hpp"

const char* typeName(Type t) {
    switch (t) {
        case Type::Unknown: return "<unknown>";
        case Type::Int: return "int";
        case Type::Float: return "float";
        case Type::Bool: return "bool";
        case Type::String: return "string";
        case Type::Error: return "<error>";
    }
    return "<invalid>";
}

const char* binOpSymbol(BinOp op) {
    switch (op) {
        case BinOp::Add: return "+";
        case BinOp::Sub: return "-";
        case BinOp::Mul: return "*";
        case BinOp::Div: return "/";
        case BinOp::Mod: return "%";
        case BinOp::Lt: return "<";
        case BinOp::Le: return "<=";
        case BinOp::Gt: return ">";
        case BinOp::Ge: return ">=";
        case BinOp::Eq: return "==";
        case BinOp::Ne: return "!=";
        case BinOp::And: return "&&";
        case BinOp::Or: return "||";
    }
    return "?";
}

const char* binOpMnemonic(BinOp op) {
    switch (op) {
        case BinOp::Add: return "ADD";
        case BinOp::Sub: return "SUB";
        case BinOp::Mul: return "MUL";
        case BinOp::Div: return "DIV";
        case BinOp::Mod: return "MOD";
        case BinOp::Lt: return "LT";
        case BinOp::Le: return "LE";
        case BinOp::Gt: return "GT";
        case BinOp::Ge: return "GE";
        case BinOp::Eq: return "EQ";
        case BinOp::Ne: return "NE";
        case BinOp::And: return "AND";
        case BinOp::Or: return "OR";
    }
    return "?";
}

const char* unOpSymbol(UnOp op) { return op == UnOp::Neg ? "-" : "!"; }
const char* unOpMnemonic(UnOp op) { return op == UnOp::Neg ? "NEG" : "NOT"; }
