// Interface to the Bison parser (implementation generated from parser.y).
#pragma once

#include <memory>
#include <vector>

#include "ast.hpp"
#include "diagnostics.hpp"
#include "token.hpp"

struct ParseResult {
    std::unique_ptr<Program> program;  // null on a syntax error
    std::vector<Diagnostic> errors;    // at most one: parsing stops at the first error
};

// `tokens` must come from lexSource() without lexical errors.
ParseResult parseTokens(const std::vector<Token>& tokens);
