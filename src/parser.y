/* ShreyaLang parser (GNU Bison, LALR(1)).
 *
 * Memory: semantic values are raw pointers (Bison's %union cannot hold
 * std::unique_ptr). Each action immediately wraps its children in
 * std::unique_ptr when building the parent node, so after a reduction every
 * node is owned by exactly one unique_ptr except the value just produced.
 * If parsing aborts, %destructor frees the pointers still on the stack.
 *
 * Errors: there are no `error` recovery rules. The first syntax error is
 * reported by yyreport_syntax_error() and parsing stops (YYABORT).
 */

%require "3.8"
%define api.pure full
%define api.token.prefix {TOK_}
%define parse.error custom
%define parse.lac full
%locations
%param { ParseContext& pc }
%expect 0

/* Bison 3.8 pure parsers declare a local error counter (yynerrs) that is
   incremented but never read, which GCC reports as set-but-unused. We do
   not need the count (parsing stops at the first error), so mark it used. */
%initial-action { (void) yynerrs; }

%code top {
// Bounds the parser stack, and therefore the nesting depth of the AST that
// later recursive passes walk.
#define YYMAXDEPTH 3000
}

%code requires {
#include <cstdint>
#include <memory>
#include <string>
#include <vector>
#include "ast.hpp"
#include "token.hpp"

struct ParseContext {
    const std::vector<Token>* tokens = nullptr;
    size_t pos = 0;
    const Token* current = nullptr;  // most recent token handed to the parser
    std::unique_ptr<Program> program;
    std::vector<Diagnostic> errors;
};
}

%code {
#include "parser.hpp"

int yylex(YYSTYPE* lval, YYLTYPE* lloc, ParseContext& pc);
void yyerror(YYLTYPE* lloc, ParseContext& pc, const char* message);

namespace {

template <class T>
std::unique_ptr<T> own(T* p) { return std::unique_ptr<T>(p); }

SourceLoc at(const YYLTYPE& l) { return {l.first_line, l.first_column}; }

Expr* binary(BinOp op, Expr* lhs, Expr* rhs, const YYLTYPE& opLoc) {
    return new BinaryExpr(op, own(lhs), own(rhs), at(opLoc));
}

// Returns `e`, or reports an error, frees `e` and returns null when the
// expression exceeds kMaxExprDepth.
Expr* depthChecked(Expr* e, ParseContext& pc) {
    if (e->depth <= kMaxExprDepth) return e;
    pc.errors.push_back({ErrorCategory::Syntax, e->loc,
                         "expression is nested too deeply (limit " + std::to_string(kMaxExprDepth) +
                             " levels)"});
    delete e;
    return nullptr;
}

}  // namespace

// Stores an operator node in `target` ($$), aborting the parse if it is too deep.
#define CHECKED(target, node) do { if (!((target) = depthChecked((node), pc))) YYABORT; } while (0)
}

%union {
    int64_t ival;
    double fval;
    std::string* str;
    Expr* expr;
    Stmt* stmt;
    BlockStmt* block;
    StmtList* list;
    Type ty;
}

%token LET INT_KW FLOAT_KW BOOL_KW STRING_KW IF ELSE WHILE PRINT KW_TRUE KW_FALSE
%token <str>  IDENT STRING_LIT
%token <ival> INT_LIT
%token <fval> FLOAT_LIT
%token PLUS MINUS STAR SLASH PERCENT LT LE GT GE EQ NE AND OR NOT ASSIGN
%token LPAREN RPAREN LBRACE RBRACE SEMI COLON COMMA

%nterm <list>  stmt_list
%nterm <stmt>  stmt
%nterm <block> block
%nterm <expr>  expr
%nterm <ty>    type

%destructor { delete $$; } <str> <expr> <stmt> <block> <list>

/* Lowest to highest precedence; all binary operators are left-associative. */
%left OR
%left AND
%left EQ NE
%left LT LE GT GE
%left PLUS MINUS
%left STAR SLASH PERCENT
%precedence NOT UMINUS

%%

program
    : stmt_list                 { pc.program = std::make_unique<Program>();
                                  pc.program->stmts = std::move(*own($1)); }
    ;

stmt_list
    : %empty                    { $$ = new StmtList(); }
    | stmt_list stmt            { $$ = $1; $$->push_back(own($2)); }
    ;

stmt
    : LET IDENT COLON type ASSIGN expr SEMI
                                { $$ = new VarDeclStmt(std::move(*own($2)), $4, own($6), at(@2)); }
    | IDENT ASSIGN expr SEMI    { $$ = new AssignStmt(std::move(*own($1)), own($3), at(@1)); }
    | PRINT LPAREN expr RPAREN SEMI
                                { $$ = new PrintStmt(own($3), at(@1)); }
    | IF LPAREN expr RPAREN block
                                { $$ = new IfStmt(own($3), own($5), nullptr, at(@1)); }
    | IF LPAREN expr RPAREN block ELSE block
                                { $$ = new IfStmt(own($3), own($5), own($7), at(@1)); }
    | WHILE LPAREN expr RPAREN block
                                { $$ = new WhileStmt(own($3), own($5), at(@1)); }
    | block                     { $$ = $1; }
    ;

block
    : LBRACE stmt_list RBRACE   { $$ = new BlockStmt(std::move(*own($2)), at(@1)); }
    ;

type
    : INT_KW                    { $$ = Type::Int; }
    | FLOAT_KW                  { $$ = Type::Float; }
    | BOOL_KW                   { $$ = Type::Bool; }
    | STRING_KW                 { $$ = Type::String; }
    ;

expr
    : expr OR expr              { CHECKED($$, binary(BinOp::Or, $1, $3, @2)); }
    | expr AND expr             { CHECKED($$, binary(BinOp::And, $1, $3, @2)); }
    | expr EQ expr              { CHECKED($$, binary(BinOp::Eq, $1, $3, @2)); }
    | expr NE expr              { CHECKED($$, binary(BinOp::Ne, $1, $3, @2)); }
    | expr LT expr              { CHECKED($$, binary(BinOp::Lt, $1, $3, @2)); }
    | expr LE expr              { CHECKED($$, binary(BinOp::Le, $1, $3, @2)); }
    | expr GT expr              { CHECKED($$, binary(BinOp::Gt, $1, $3, @2)); }
    | expr GE expr              { CHECKED($$, binary(BinOp::Ge, $1, $3, @2)); }
    | expr PLUS expr            { CHECKED($$, binary(BinOp::Add, $1, $3, @2)); }
    | expr MINUS expr           { CHECKED($$, binary(BinOp::Sub, $1, $3, @2)); }
    | expr STAR expr            { CHECKED($$, binary(BinOp::Mul, $1, $3, @2)); }
    | expr SLASH expr           { CHECKED($$, binary(BinOp::Div, $1, $3, @2)); }
    | expr PERCENT expr         { CHECKED($$, binary(BinOp::Mod, $1, $3, @2)); }
    | MINUS expr %prec UMINUS   { CHECKED($$, new UnaryExpr(UnOp::Neg, own($2), at(@1))); }
    | NOT expr                  { CHECKED($$, new UnaryExpr(UnOp::Not, own($2), at(@1))); }
    | LPAREN expr RPAREN        { $$ = $2; }
    | INT_LIT                   { $$ = new LiteralExpr(Value::makeInt($1), at(@1)); }
    | FLOAT_LIT                 { $$ = new LiteralExpr(Value::makeFloat($1), at(@1)); }
    | STRING_LIT                { $$ = new LiteralExpr(Value::makeString(std::move(*own($1))), at(@1)); }
    | KW_TRUE                   { $$ = new LiteralExpr(Value::makeBool(true), at(@1)); }
    | KW_FALSE                  { $$ = new LiteralExpr(Value::makeBool(false), at(@1)); }
    | IDENT                     { $$ = new VarRefExpr(std::move(*own($1)), at(@1)); }
    ;

%%

namespace {

const char* symbolDescription(yysymbol_kind_t s) {
    switch (s) {
        case YYSYMBOL_YYEOF: return "end of input";
        case YYSYMBOL_LET: return "'let'";
        case YYSYMBOL_INT_KW: return "'int'";
        case YYSYMBOL_FLOAT_KW: return "'float'";
        case YYSYMBOL_BOOL_KW: return "'bool'";
        case YYSYMBOL_STRING_KW: return "'string'";
        case YYSYMBOL_IF: return "'if'";
        case YYSYMBOL_ELSE: return "'else'";
        case YYSYMBOL_WHILE: return "'while'";
        case YYSYMBOL_PRINT: return "'print'";
        case YYSYMBOL_KW_TRUE: return "'true'";
        case YYSYMBOL_KW_FALSE: return "'false'";
        case YYSYMBOL_IDENT: return "identifier";
        case YYSYMBOL_STRING_LIT: return "string literal";
        case YYSYMBOL_INT_LIT: return "integer literal";
        case YYSYMBOL_FLOAT_LIT: return "float literal";
        case YYSYMBOL_PLUS: return "'+'";
        case YYSYMBOL_MINUS: return "'-'";
        case YYSYMBOL_STAR: return "'*'";
        case YYSYMBOL_SLASH: return "'/'";
        case YYSYMBOL_PERCENT: return "'%'";
        case YYSYMBOL_LT: return "'<'";
        case YYSYMBOL_LE: return "'<='";
        case YYSYMBOL_GT: return "'>'";
        case YYSYMBOL_GE: return "'>='";
        case YYSYMBOL_EQ: return "'=='";
        case YYSYMBOL_NE: return "'!='";
        case YYSYMBOL_AND: return "'&&'";
        case YYSYMBOL_OR: return "'||'";
        case YYSYMBOL_NOT: return "'!'";
        case YYSYMBOL_ASSIGN: return "'='";
        case YYSYMBOL_LPAREN: return "'('";
        case YYSYMBOL_RPAREN: return "')'";
        case YYSYMBOL_LBRACE: return "'{'";
        case YYSYMBOL_RBRACE: return "'}'";
        case YYSYMBOL_SEMI: return "';'";
        case YYSYMBOL_COLON: return "':'";
        case YYSYMBOL_COMMA: return "','";
        default: return yysymbol_name(s);
    }
}

bool isBinaryOperator(yysymbol_kind_t s) {
    switch (s) {
        case YYSYMBOL_PLUS: case YYSYMBOL_MINUS: case YYSYMBOL_STAR: case YYSYMBOL_SLASH:
        case YYSYMBOL_PERCENT: case YYSYMBOL_LT: case YYSYMBOL_LE: case YYSYMBOL_GT:
        case YYSYMBOL_GE: case YYSYMBOL_EQ: case YYSYMBOL_NE: case YYSYMBOL_AND:
        case YYSYMBOL_OR:
            return true;
        default:
            return false;
    }
}

bool startsStatementOnly(yysymbol_kind_t s) {
    return s == YYSYMBOL_LET || s == YYSYMBOL_PRINT || s == YYSYMBOL_IF || s == YYSYMBOL_WHILE;
}

bool startsExpressionOnly(yysymbol_kind_t s) {
    return s == YYSYMBOL_INT_LIT || s == YYSYMBOL_FLOAT_LIT || s == YYSYMBOL_STRING_LIT ||
           s == YYSYMBOL_KW_TRUE || s == YYSYMBOL_KW_FALSE || s == YYSYMBOL_LPAREN ||
           s == YYSYMBOL_NOT;
}

bool isTypeKeyword(yysymbol_kind_t s) {
    return s == YYSYMBOL_INT_KW || s == YYSYMBOL_FLOAT_KW || s == YYSYMBOL_BOOL_KW ||
           s == YYSYMBOL_STRING_KW;
}

// Groups the expected-token set into readable categories, e.g.
// {INT_LIT, IDENT, '(', '-', ...} -> "expression".
std::vector<std::string> describeExpected(const yysymbol_kind_t* expected, int n) {
    bool statement = false, expression = false, types = false, operators = false;
    for (int i = 0; i < n; ++i) {
        statement |= startsStatementOnly(expected[i]);
        expression |= startsExpressionOnly(expected[i]);
        types |= isTypeKeyword(expected[i]);
        operators |= isBinaryOperator(expected[i]) && expected[i] != YYSYMBOL_MINUS;
    }

    std::vector<std::string> items;
    if (statement) items.push_back("statement");
    else if (expression) items.push_back("expression");
    if (types) items.push_back("type");

    std::vector<std::string> others;
    for (int i = 0; i < n; ++i) {
        yysymbol_kind_t s = expected[i];
        if (statement && (startsStatementOnly(s) || s == YYSYMBOL_IDENT ||
                          s == YYSYMBOL_LBRACE || s == YYSYMBOL_YYEOF))
            continue;
        if (expression && (startsExpressionOnly(s) || s == YYSYMBOL_IDENT || s == YYSYMBOL_MINUS))
            continue;
        if (types && isTypeKeyword(s)) continue;
        if (isBinaryOperator(s)) continue;
        others.push_back(symbolDescription(s));
    }
    items.insert(items.end(), others.begin(), others.end());
    // "expected ';'" reads better than "expected ';' or operator".
    if (operators && others.empty()) items.push_back("operator");
    return items;
}

std::string describeToken(const Token& t) {
    switch (t.kind) {
        case TokenKind::EndOfFile: return "end of input";
        case TokenKind::StringLit: return "string literal " + t.lexeme;
        default: return "'" + t.lexeme + "'";
    }
}

}  // namespace

static int yyreport_syntax_error(const yypcontext_t* ctx, ParseContext& pc) {
    yysymbol_kind_t expected[YYNTOKENS];
    int n = yypcontext_expected_tokens(ctx, expected, YYNTOKENS);
    if (n < 0) n = 0;

    std::vector<std::string> items = describeExpected(expected, n);
    std::string message;
    if (items.empty()) {
        message = "unexpected " + describeToken(*pc.current);
    } else {
        message = "expected ";
        for (size_t i = 0; i < items.size(); ++i) {
            if (i > 0) message += (i + 1 == items.size()) ? " or " : ", ";
            message += items[i];
        }
        message += " before " + describeToken(*pc.current);
    }
    pc.errors.push_back({ErrorCategory::Syntax, pc.current->loc, message});
    return 0;
}

void yyerror(YYLTYPE* lloc, ParseContext& pc, const char* message) {
    std::string text = message;
    if (text == "memory exhausted") text = "program is nested too deeply";
    pc.errors.push_back({ErrorCategory::Syntax, at(*lloc), text});
}

int yylex(YYSTYPE* lval, YYLTYPE* lloc, ParseContext& pc) {
    const std::vector<Token>& tokens = *pc.tokens;
    const Token& t = tokens[pc.pos < tokens.size() - 1 ? pc.pos++ : tokens.size() - 1];
    pc.current = &t;
    lloc->first_line = lloc->last_line = t.loc.line;
    lloc->first_column = t.loc.col;
    lloc->last_column = t.loc.col + static_cast<int>(t.lexeme.size());

    switch (t.kind) {
        case TokenKind::Let: return TOK_LET;
        case TokenKind::IntKw: return TOK_INT_KW;
        case TokenKind::FloatKw: return TOK_FLOAT_KW;
        case TokenKind::BoolKw: return TOK_BOOL_KW;
        case TokenKind::StringKw: return TOK_STRING_KW;
        case TokenKind::If: return TOK_IF;
        case TokenKind::Else: return TOK_ELSE;
        case TokenKind::While: return TOK_WHILE;
        case TokenKind::Print: return TOK_PRINT;
        case TokenKind::True: return TOK_KW_TRUE;
        case TokenKind::False: return TOK_KW_FALSE;
        case TokenKind::Ident: lval->str = new std::string(t.lexeme); return TOK_IDENT;
        case TokenKind::IntLit: lval->ival = t.intValue; return TOK_INT_LIT;
        case TokenKind::FloatLit: lval->fval = t.floatValue; return TOK_FLOAT_LIT;
        case TokenKind::StringLit: lval->str = new std::string(t.stringValue); return TOK_STRING_LIT;
        case TokenKind::Plus: return TOK_PLUS;
        case TokenKind::Minus: return TOK_MINUS;
        case TokenKind::Star: return TOK_STAR;
        case TokenKind::Slash: return TOK_SLASH;
        case TokenKind::Percent: return TOK_PERCENT;
        case TokenKind::Lt: return TOK_LT;
        case TokenKind::Le: return TOK_LE;
        case TokenKind::Gt: return TOK_GT;
        case TokenKind::Ge: return TOK_GE;
        case TokenKind::EqEq: return TOK_EQ;
        case TokenKind::NotEq: return TOK_NE;
        case TokenKind::AndAnd: return TOK_AND;
        case TokenKind::OrOr: return TOK_OR;
        case TokenKind::Bang: return TOK_NOT;
        case TokenKind::Assign: return TOK_ASSIGN;
        case TokenKind::LParen: return TOK_LPAREN;
        case TokenKind::RParen: return TOK_RPAREN;
        case TokenKind::LBrace: return TOK_LBRACE;
        case TokenKind::RBrace: return TOK_RBRACE;
        case TokenKind::Semicolon: return TOK_SEMI;
        case TokenKind::Colon: return TOK_COLON;
        case TokenKind::Comma: return TOK_COMMA;
        case TokenKind::EndOfFile: return TOK_YYEOF;
    }
    return TOK_YYUNDEF;
}

ParseResult parseTokens(const std::vector<Token>& tokens) {
    ParseContext pc;
    pc.tokens = &tokens;
    int rc = yyparse(pc);

    ParseResult result;
    result.errors = std::move(pc.errors);
    if (rc == 0) {
        result.program = std::move(pc.program);
    } else if (result.errors.empty()) {
        result.errors.push_back({ErrorCategory::Syntax, {}, "parsing failed"});
    }
    return result;
}
