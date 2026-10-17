// Source locations and user-facing error reports.
#pragma once

#include <string>

struct SourceLoc {
    int line = 0;  // 1-based; 0 = unknown
    int col = 0;   // 1-based; 0 = unknown
};

enum class ErrorCategory { Lexical, Syntax, Semantic, Runtime };

struct Diagnostic {
    ErrorCategory category = ErrorCategory::Syntax;
    SourceLoc loc;
    std::string message;
};

const char* categoryName(ErrorCategory c);  // "Lexical", "Syntax", ...

// "<Category> error at line L, col C: <message>"
std::string diagnosticHeader(const Diagnostic& d);

// Header plus the offending source line and a caret under the column.
std::string formatDiagnostic(const Diagnostic& d, const std::string& source);

// Returns line `line` (1-based) of `source` without its line terminator.
std::string sourceLine(const std::string& source, int line);
