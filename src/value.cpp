#include "value.hpp"

#include <cmath>
#include <cstdio>
#include <limits>

Type Value::type() const {
    switch (data_.index()) {
        case 0: return Type::Int;
        case 1: return Type::Float;
        case 2: return Type::Bool;
        default: return Type::String;
    }
}

std::string formatFloat(double d) {
    if (std::isnan(d)) return "nan";
    if (std::isinf(d)) return d < 0 ? "-inf" : "inf";
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.15g", d);
    std::string s = buf;
    size_t e = s.find('e');
    std::string mantissa = s.substr(0, e);
    std::string exponent = e == std::string::npos ? "" : s.substr(e);
    if (mantissa.find('.') == std::string::npos) mantissa += ".0";
    return mantissa + exponent;
}

std::string formatValue(const Value& v) {
    switch (v.type()) {
        case Type::Int: return std::to_string(v.asInt());
        case Type::Float: return formatFloat(v.asFloat());
        case Type::Bool: return v.asBool() ? "true" : "false";
        default: return v.asString();
    }
}

std::string formatLiteral(const Value& v) {
    if (v.type() != Type::String) return formatValue(v);
    std::string out = "\"";
    for (char c : v.asString()) {
        switch (c) {
            case '\n': out += "\\n"; break;
            case '\t': out += "\\t"; break;
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            default: out += c;
        }
    }
    return out + "\"";
}

namespace {

OpResult success(Value v) {
    OpResult r;
    r.ok = true;
    r.value = std::move(v);
    return r;
}

OpResult failure(std::string message) {
    OpResult r;
    r.error = std::move(message);
    return r;
}

OpResult internalTypeError(const char* what) {
    return failure(std::string("internal error: invalid operand types for ") + what);
}

OpResult evalInt(BinOp op, int64_t x, int64_t y) {
    int64_t r = 0;
    switch (op) {
        case BinOp::Add:
            if (__builtin_add_overflow(x, y, &r)) return failure("integer overflow");
            return success(Value::makeInt(r));
        case BinOp::Sub:
            if (__builtin_sub_overflow(x, y, &r)) return failure("integer overflow");
            return success(Value::makeInt(r));
        case BinOp::Mul:
            if (__builtin_mul_overflow(x, y, &r)) return failure("integer overflow");
            return success(Value::makeInt(r));
        case BinOp::Div:
            if (y == 0) return failure("division by zero");
            if (x == std::numeric_limits<int64_t>::min() && y == -1)
                return failure("integer overflow");
            return success(Value::makeInt(x / y));  // C++ truncates toward zero
        case BinOp::Mod:
            if (y == 0) return failure("modulo by zero");
            if (y == -1) return success(Value::makeInt(0));  // avoids INT64_MIN % -1 (UB)
            return success(Value::makeInt(x % y));  // sign of the dividend
        case BinOp::Lt: return success(Value::makeBool(x < y));
        case BinOp::Le: return success(Value::makeBool(x <= y));
        case BinOp::Gt: return success(Value::makeBool(x > y));
        case BinOp::Ge: return success(Value::makeBool(x >= y));
        case BinOp::Eq: return success(Value::makeBool(x == y));
        case BinOp::Ne: return success(Value::makeBool(x != y));
        default: return internalTypeError(binOpMnemonic(op));
    }
}

OpResult evalFloat(BinOp op, double x, double y) {
    switch (op) {
        case BinOp::Add: return success(Value::makeFloat(x + y));
        case BinOp::Sub: return success(Value::makeFloat(x - y));
        case BinOp::Mul: return success(Value::makeFloat(x * y));
        case BinOp::Div:
            if (y == 0.0) return failure("division by zero");
            return success(Value::makeFloat(x / y));
        case BinOp::Lt: return success(Value::makeBool(x < y));
        case BinOp::Le: return success(Value::makeBool(x <= y));
        case BinOp::Gt: return success(Value::makeBool(x > y));
        case BinOp::Ge: return success(Value::makeBool(x >= y));
        case BinOp::Eq: return success(Value::makeBool(x == y));
        case BinOp::Ne: return success(Value::makeBool(x != y));
        default: return internalTypeError(binOpMnemonic(op));
    }
}

}  // namespace

OpResult evalBinary(BinOp op, const Value& a, const Value& b) {
    if (a.type() != b.type()) return internalTypeError(binOpMnemonic(op));
    switch (a.type()) {
        case Type::Int: return evalInt(op, a.asInt(), b.asInt());
        case Type::Float: return evalFloat(op, a.asFloat(), b.asFloat());
        case Type::Bool:
            if (op == BinOp::Eq) return success(Value::makeBool(a.asBool() == b.asBool()));
            if (op == BinOp::Ne) return success(Value::makeBool(a.asBool() != b.asBool()));
            return internalTypeError(binOpMnemonic(op));
        case Type::String:
            if (op == BinOp::Eq) return success(Value::makeBool(a.asString() == b.asString()));
            if (op == BinOp::Ne) return success(Value::makeBool(a.asString() != b.asString()));
            return internalTypeError(binOpMnemonic(op));
        default: return internalTypeError(binOpMnemonic(op));
    }
}

OpResult evalUnary(UnOp op, const Value& a) {
    if (op == UnOp::Not) {
        if (a.type() != Type::Bool) return internalTypeError("NOT");
        return success(Value::makeBool(!a.asBool()));
    }
    if (a.type() == Type::Int) {
        if (a.asInt() == std::numeric_limits<int64_t>::min()) return failure("integer overflow");
        return success(Value::makeInt(-a.asInt()));
    }
    if (a.type() == Type::Float) return success(Value::makeFloat(-a.asFloat()));
    return internalTypeError("NEG");
}

OpResult evalIntToFloat(const Value& a) {
    if (a.type() != Type::Int) return internalTypeError("I2F");
    return success(Value::makeFloat(static_cast<double>(a.asInt())));
}
