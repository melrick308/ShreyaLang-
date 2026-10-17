// Runtime values and the single definition of ShreyaLang operator semantics.
//
// Both the optimizer (constant folding) and the VM call evalBinary/evalUnary,
// so a folded constant is guaranteed to equal what the VM would compute.
#pragma once

#include <cstdint>
#include <string>
#include <variant>

#include "ops.hpp"
#include "types.hpp"

class Value {
public:
    Value() : data_(std::in_place_index<0>, 0) {}
    static Value makeInt(int64_t v) { return Value(Data(std::in_place_index<0>, v)); }
    static Value makeFloat(double v) { return Value(Data(std::in_place_index<1>, v)); }
    static Value makeBool(bool v) { return Value(Data(std::in_place_index<2>, v)); }
    static Value makeString(std::string v) {
        return Value(Data(std::in_place_index<3>, std::move(v)));
    }

    Type type() const;
    int64_t asInt() const { return std::get<0>(data_); }
    double asFloat() const { return std::get<1>(data_); }
    bool asBool() const { return std::get<2>(data_); }
    const std::string& asString() const { return std::get<3>(data_); }

private:
    using Data = std::variant<int64_t, double, bool, std::string>;
    explicit Value(Data d) : data_(std::move(d)) {}
    Data data_;
};

// How `print` shows a value: ints in decimal, floats with a decimal point
// (formatFloat), bools as true/false, strings raw.
std::string formatValue(const Value& v);

// "%.15g", plus ".0" when the result has no decimal point (2 -> "2.0",
// 1e+20 -> "1.0e+20"); "inf", "-inf", "nan" for non-finite values.
std::string formatFloat(double d);

// Source-like spelling used in TAC listings: strings quoted and escaped.
std::string formatLiteral(const Value& v);

struct OpResult {
    bool ok = false;
    Value value;
    std::string error;  // runtime error message when !ok
};

// Both operands must already have the same type (the TAC generator inserts
// I2F for mixed int/float operations).
OpResult evalBinary(BinOp op, const Value& a, const Value& b);
OpResult evalUnary(UnOp op, const Value& a);
OpResult evalIntToFloat(const Value& a);
