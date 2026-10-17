#include "json.hpp"

#include <cmath>
#include <cstdio>

std::string jsonEscape(const std::string& s) {
    std::string out = "\"";
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof buf, "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out + "\"";
}

std::string Json::dump() const {
    std::string out;
    dumpTo(out);
    return out;
}

void Json::dumpTo(std::string& out) const {
    switch (kind_) {
        case Kind::Null: out += "null"; break;
        case Kind::Bool: out += bool_ ? "true" : "false"; break;
        case Kind::Int: out += std::to_string(int_); break;
        case Kind::Float: {
            if (!std::isfinite(float_)) {  // JSON has no inf/nan
                out += "null";
                break;
            }
            char buf[64];
            std::snprintf(buf, sizeof buf, "%.17g", float_);
            out += buf;
            break;
        }
        case Kind::String: out += jsonEscape(string_); break;
        case Kind::Array:
            out += '[';
            for (size_t i = 0; i < items_.size(); ++i) {
                if (i > 0) out += ',';
                items_[i].dumpTo(out);
            }
            out += ']';
            break;
        case Kind::Object:
            out += '{';
            for (size_t i = 0; i < fields_.size(); ++i) {
                if (i > 0) out += ',';
                out += jsonEscape(fields_[i].first);
                out += ':';
                fields_[i].second.dumpTo(out);
            }
            out += '}';
            break;
    }
}
