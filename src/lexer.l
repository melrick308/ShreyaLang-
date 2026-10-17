/* ShreyaLang lexer (Flex).
 *
 * A reentrant scanner: all state lives in a LexState passed as yyextra, so
 * no globals are shared with the parser. lexSource() scans the complete
 * input into a token vector before parsing starts; lexical errors are
 * recorded and scanning continues, so several can be reported at once.
 */

%option reentrant noyywrap nounput noinput never-interactive nodefault warn 8bit
%option extra-type="struct LexState*"

%top{
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include "token.hpp"

struct LexState {
    int line = 1;
    int col = 1;
    SourceLoc start;  // location of the current match
    std::vector<Token> tokens;
    std::vector<Diagnostic> errors;
};
}

%{
namespace {

// Advances line/column past the matched text; a tab counts as one column.
void advance(LexState* s, const char* text, int len) {
    s->start = {s->line, s->col};
    for (int i = 0; i < len; ++i) {
        if (text[i] == '\n') {
            ++s->line;
            s->col = 1;
        } else {
            ++s->col;
        }
    }
}

void lexError(LexState* s, SourceLoc loc, std::string message) {
    s->errors.push_back({ErrorCategory::Lexical, loc, std::move(message)});
}

Token& push(LexState* s, TokenKind kind, const char* text, int len) {
    Token t;
    t.kind = kind;
    t.lexeme.assign(text, len);
    t.loc = s->start;
    s->tokens.push_back(std::move(t));
    return s->tokens.back();
}

std::string printable(const char* text, int len) {
    std::string out;
    for (int i = 0; i < len; ++i) {
        unsigned char c = static_cast<unsigned char>(text[i]);
        if (c >= 0x20 && c < 0x7f) {
            out += static_cast<char>(c);
        } else {
            char buf[8];
            std::snprintf(buf, sizeof buf, "\\x%02X", c);
            out += buf;
        }
    }
    return out;
}

void lexIdentOrKeyword(LexState* s, const char* text, int len) {
    static const struct { const char* word; TokenKind kind; } keywords[] = {
        {"let", TokenKind::Let},     {"int", TokenKind::IntKw},
        {"float", TokenKind::FloatKw}, {"bool", TokenKind::BoolKw},
        {"string", TokenKind::StringKw}, {"if", TokenKind::If},
        {"else", TokenKind::Else},   {"while", TokenKind::While},
        {"print", TokenKind::Print}, {"true", TokenKind::True},
        {"false", TokenKind::False},
    };
    std::string word(text, len);
    for (const auto& k : keywords) {
        if (word == k.word) {
            push(s, k.kind, text, len);
            return;
        }
    }
    push(s, TokenKind::Ident, text, len);
}

void lexInt(LexState* s, const char* text, int len) {
    const int64_t max = INT64_MAX;
    int64_t value = 0;
    for (int i = 0; i < len; ++i) {
        int digit = text[i] - '0';
        if (value > (max - digit) / 10) {
            lexError(s, s->start,
                     "integer literal '" + std::string(text, len) + "' is out of range");
            return;
        }
        value = value * 10 + digit;
    }
    push(s, TokenKind::IntLit, text, len).intValue = value;
}

void lexFloat(LexState* s, const char* text, int len) {
    std::string str(text, len);
    double value = std::strtod(str.c_str(), nullptr);
    if (value == HUGE_VAL) {
        lexError(s, s->start, "float literal '" + str + "' is out of range");
        return;
    }
    push(s, TokenKind::FloatLit, text, len).floatValue = value;
}

// text includes both quotes.
void lexString(LexState* s, const char* text, int len) {
    std::string value;
    bool ok = true;
    for (int i = 1; i < len - 1; ++i) {
        if (text[i] != '\\') {
            value += text[i];
            continue;
        }
        char next = text[++i];
        switch (next) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case '"': value += '"'; break;
            case '\\': value += '\\'; break;
            default:
                lexError(s, {s->start.line, s->start.col + i - 1},
                         "invalid escape sequence '\\" + printable(&next, 1) + "' in string literal");
                ok = false;
        }
    }
    if (ok) push(s, TokenKind::StringLit, text, len).stringValue = value;
}

}  // namespace

#define YY_USER_ACTION advance(yyextra, yytext, static_cast<int>(yyleng));
#define TOK(kind) push(yyextra, TokenKind::kind, yytext, static_cast<int>(yyleng))
%}

DIGIT   [0-9]
IDSTART [A-Za-z_]
IDCHAR  [A-Za-z0-9_]

%%

"//"[^\n]*                  { /* comment */ }
[ \t\r\n]+                  { /* whitespace */ }

{IDSTART}{IDCHAR}*          { lexIdentOrKeyword(yyextra, yytext, static_cast<int>(yyleng)); }

{DIGIT}+                    { lexInt(yyextra, yytext, static_cast<int>(yyleng)); }
{DIGIT}+"."{DIGIT}+         { lexFloat(yyextra, yytext, static_cast<int>(yyleng)); }
    /* Anything else that starts with a digit and continues with letters,
       digits, '_' or '.' (e.g. 12abc, 1.2.3, 1.) is longer than the two
       rules above, so the longest-match rule picks this one. */
{DIGIT}[A-Za-z0-9_.]*       { lexError(yyextra, yyextra->start,
                                       "malformed number '" + printable(yytext, static_cast<int>(yyleng)) + "'"); }

\"([^"\\\n]|\\.)*\"         { lexString(yyextra, yytext, static_cast<int>(yyleng)); }
\"([^"\\\n]|\\.)*\\?        { lexError(yyextra, yyextra->start, "unterminated string literal"); }

"<="                        { TOK(Le); }
">="                        { TOK(Ge); }
"=="                        { TOK(EqEq); }
"!="                        { TOK(NotEq); }
"&&"                        { TOK(AndAnd); }
"||"                        { TOK(OrOr); }
"+"                         { TOK(Plus); }
"-"                         { TOK(Minus); }
"*"                         { TOK(Star); }
"/"                         { TOK(Slash); }
"%"                         { TOK(Percent); }
"<"                         { TOK(Lt); }
">"                         { TOK(Gt); }
"!"                         { TOK(Bang); }
"="                         { TOK(Assign); }
"("                         { TOK(LParen); }
")"                         { TOK(RParen); }
"{"                         { TOK(LBrace); }
"}"                         { TOK(RBrace); }
";"                         { TOK(Semicolon); }
":"                         { TOK(Colon); }
","                         { TOK(Comma); }

    /* A UTF-8 multi-byte character is reported once, not once per byte. */
[\xC0-\xFF][\x80-\xBF]*     { lexError(yyextra, yyextra->start,
                                       "invalid character '" + std::string(yytext, yyleng) + "'"); }
.                           { lexError(yyextra, yyextra->start,
                                       "invalid character '" + printable(yytext, static_cast<int>(yyleng)) + "'"); }

%%

LexResult lexSource(const std::string& source) {
    LexState state;
    yyscan_t scanner;
    yylex_init_extra(&state, &scanner);
    YY_BUFFER_STATE buffer = yy_scan_bytes(source.data(), static_cast<int>(source.size()), scanner);
    while (yylex(scanner) != 0) {
    }
    yy_delete_buffer(buffer, scanner);
    yylex_destroy(scanner);

    Token eof;
    eof.kind = TokenKind::EndOfFile;
    eof.loc = {state.line, state.col};
    state.tokens.push_back(eof);

    LexResult result;
    result.tokens = std::move(state.tokens);
    result.errors = std::move(state.errors);
    return result;
}
