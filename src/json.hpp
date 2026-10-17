// Minimal JSON value used for --json output.
#pragma once

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

class Json {
public:
    enum class Kind { Null, Bool, Int, Float, String, Array, Object };

    Json() = default;
    Json(bool b) : kind_(Kind::Bool), bool_(b) {}
    Json(int i) : kind_(Kind::Int), int_(i) {}
    Json(int64_t i) : kind_(Kind::Int), int_(i) {}
    Json(double d) : kind_(Kind::Float), float_(d) {}
    Json(const char* s) : kind_(Kind::String), string_(s) {}
    Json(std::string s) : kind_(Kind::String), string_(std::move(s)) {}

    static Json array() { Json j; j.kind_ = Kind::Array; return j; }
    static Json object() { Json j; j.kind_ = Kind::Object; return j; }

    // Array append / object insert (keys keep insertion order).
    Json& push(Json v) { items_.push_back(std::move(v)); return *this; }
    Json& set(std::string key, Json v) { fields_.emplace_back(std::move(key), std::move(v)); return *this; }

    std::string dump() const;

private:
    void dumpTo(std::string& out) const;

    Kind kind_ = Kind::Null;
    bool bool_ = false;
    int64_t int_ = 0;
    double float_ = 0.0;
    std::string string_;
    std::vector<Json> items_;
    std::vector<std::pair<std::string, Json>> fields_;
};

std::string jsonEscape(const std::string& s);
