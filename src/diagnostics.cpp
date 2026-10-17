#include "diagnostics.hpp"

#include <string>

const char* categoryName(ErrorCategory c) {
    switch (c) {
        case ErrorCategory::Lexical: return "Lexical";
        case ErrorCategory::Syntax: return "Syntax";
        case ErrorCategory::Semantic: return "Semantic";
        case ErrorCategory::Runtime: return "Runtime";
    }
    return "Unknown";
}

std::string diagnosticHeader(const Diagnostic& d) {
    std::string s = std::string(categoryName(d.category)) + " error";
    if (d.loc.line > 0) {
        s += " at line " + std::to_string(d.loc.line);
        if (d.loc.col > 0) s += ", col " + std::to_string(d.loc.col);
    }
    return s + ": " + d.message;
}

std::string sourceLine(const std::string& source, int line) {
    if (line <= 0) return "";
    size_t start = 0;
    for (int current = 1; current < line; ++current) {
        size_t nl = source.find('\n', start);
        if (nl == std::string::npos) return "";
        start = nl + 1;
    }
    size_t end = source.find('\n', start);
    std::string text = source.substr(start, end == std::string::npos ? std::string::npos : end - start);
    if (!text.empty() && text.back() == '\r') text.pop_back();
    return text;
}

std::string formatDiagnostic(const Diagnostic& d, const std::string& source) {
    std::string out = diagnosticHeader(d) + "\n";
    if (d.loc.line <= 0) return out;

    std::string text = sourceLine(source, d.loc.line);
    if (text.empty()) return out;  // e.g. end of input on a blank last line
    // Columns count a tab as one character, so show tabs as single spaces
    // to keep the caret aligned.
    for (char& c : text)
        if (c == '\t') c = ' ';
    std::string gutter = std::to_string(d.loc.line);
    std::string pad(gutter.size(), ' ');
    out += " " + gutter + " | " + text + "\n";
    if (d.loc.col > 0) out += " " + pad + " | " + std::string(d.loc.col - 1, ' ') + "^\n";
    return out;
}
