// Semantic analysis: name resolution, scoping and type checking.
//
// Annotates the AST in place (expression types, unique TAC names, scope ids)
// and collects every semantic error rather than stopping at the first.
#pragma once

#include <vector>

#include "ast.hpp"
#include "diagnostics.hpp"
#include "symbol_table.hpp"

class SemanticAnalyzer {
public:
    SemanticAnalyzer(SymbolTable& table, std::vector<Diagnostic>& errors)
        : table_(table), errors_(errors) {}

    void analyze(Program& program);

private:
    void statement(Stmt& s);
    void block(BlockStmt& b);
    void condition(Expr& cond, const char* construct);
    Type expression(Expr& e);
    Type binary(BinaryExpr& b);
    Type unary(UnaryExpr& u);
    void error(SourceLoc loc, std::string message);

    SymbolTable& table_;
    std::vector<Diagnostic>& errors_;
};

// int -> float is the only implicit conversion.
bool isAssignable(Type target, Type source);
