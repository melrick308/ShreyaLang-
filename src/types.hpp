// ShreyaLang static types.
#pragma once

enum class Type {
    Unknown,  // not yet analyzed
    Int,
    Float,
    Bool,
    String,
    Error  // result of an expression that already produced a semantic error
};

const char* typeName(Type t);
inline bool isNumeric(Type t) { return t == Type::Int || t == Type::Float; }
