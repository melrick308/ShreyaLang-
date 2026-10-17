// Tokens produced by the Flex lexer.
//
// The lexer has its own token enum so that it does not depend on the
// Bison-generated parser; the parser maps TokenKind to Bison symbols.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "diagnostics.hpp"

enum class TokenKind {
    // keywords
    Let, IntKw, FloatKw, BoolKw, StringKw, If, Else, While, Print, True, False,
    // identifiers and literals
    Ident, IntLit, FloatLit, StringLit,
    // operators
    Plus, Minus, Star, Slash, Percent,
    Lt, Le, Gt, Ge, EqEq, NotEq, AndAnd, OrOr, Bang, Assign,
    // punctuation
    LParen, RParen, LBrace, RBrace, Semicolon, Colon, Comma,
    EndOfFile
};

struct Token {
    TokenKind kind = TokenKind::EndOfFile;
    std::string lexeme;   // exact source text
    SourceLoc loc;        // position of the first character
    int64_t intValue = 0;        // IntLit
    double floatValue = 0.0;     // FloatLit
    std::string stringValue;     // StringLit, escapes already decoded
};

// Upper-case kind name used by --tokens, e.g. "INT_LIT".
const char* tokenKindName(TokenKind k);

struct LexResult {
    std::vector<Token> tokens;           // always ends with EndOfFile
    std::vector<Diagnostic> errors;      // all lexical errors, in source order
};

// Runs the Flex scanner over the whole source. Defined in lexer.l.
LexResult lexSource(const std::string& source);
