// Abstract syntax tree. Children are owned through std::unique_ptr.
//
// Each node has a kind tag; passes switch on the tag and static_cast to the
// concrete class. Fields marked "set by sema" are filled in by the semantic
// analyzer and are read by the TAC generator.
#pragma once

#include <memory>
#include <string>
#include <vector>

#include "diagnostics.hpp"
#include "ops.hpp"
#include "types.hpp"
#include "value.hpp"

// ---------------------------------------------------------------- expressions

enum class ExprKind { Literal, VarRef, Unary, Binary };

// Later passes walk expressions recursively, so the parser rejects trees
// deeper than this instead of risking a stack overflow (e.g. a chain of
// thousands of `+` terms, which does not grow the parser's own stack).
constexpr int kMaxExprDepth = 1000;

struct Expr {
    Expr(ExprKind k, SourceLoc l, int d = 1) : kind(k), loc(l), depth(d) {}
    virtual ~Expr() = default;
    ExprKind kind;
    SourceLoc loc;              // operator position for Unary/Binary
    int depth;                  // height of this subtree (a leaf is 1)
    Type type = Type::Unknown;  // set by sema
};

struct LiteralExpr : Expr {
    LiteralExpr(Value v, SourceLoc l) : Expr(ExprKind::Literal, l), value(std::move(v)) {}
    Value value;
};

struct VarRefExpr : Expr {
    VarRefExpr(std::string n, SourceLoc l) : Expr(ExprKind::VarRef, l), name(std::move(n)) {}
    std::string name;
    std::string tacName;  // set by sema: unique name of the resolved declaration
};

struct UnaryExpr : Expr {
    UnaryExpr(UnOp o, std::unique_ptr<Expr> e, SourceLoc l)
        : Expr(ExprKind::Unary, l, e->depth + 1), op(o), operand(std::move(e)) {}
    UnOp op;
    std::unique_ptr<Expr> operand;
};

struct BinaryExpr : Expr {
    BinaryExpr(BinOp o, std::unique_ptr<Expr> a, std::unique_ptr<Expr> b, SourceLoc l)
        : Expr(ExprKind::Binary, l, (a->depth > b->depth ? a->depth : b->depth) + 1),
          op(o), lhs(std::move(a)), rhs(std::move(b)) {}
    BinOp op;
    std::unique_ptr<Expr> lhs, rhs;
};

// ----------------------------------------------------------------- statements

enum class StmtKind { Block, VarDecl, Assign, Print, If, While };

struct Stmt {
    Stmt(StmtKind k, SourceLoc l) : kind(k), loc(l) {}
    virtual ~Stmt() = default;
    StmtKind kind;
    SourceLoc loc;
};

using StmtList = std::vector<std::unique_ptr<Stmt>>;

struct BlockStmt : Stmt {
    BlockStmt(StmtList s, SourceLoc l) : Stmt(StmtKind::Block, l), stmts(std::move(s)) {}
    StmtList stmts;
    int scopeId = -1;  // set by sema
};

struct VarDeclStmt : Stmt {
    VarDeclStmt(std::string n, Type t, std::unique_ptr<Expr> e, SourceLoc l)
        : Stmt(StmtKind::VarDecl, l), name(std::move(n)), declType(t), init(std::move(e)) {}
    std::string name;
    Type declType;
    std::unique_ptr<Expr> init;
    std::string tacName;  // set by sema
};

struct AssignStmt : Stmt {
    AssignStmt(std::string n, std::unique_ptr<Expr> e, SourceLoc l)
        : Stmt(StmtKind::Assign, l), name(std::move(n)), value(std::move(e)) {}
    std::string name;
    std::unique_ptr<Expr> value;
    std::string tacName;                // set by sema
    Type targetType = Type::Unknown;    // set by sema
};

struct PrintStmt : Stmt {
    PrintStmt(std::unique_ptr<Expr> e, SourceLoc l) : Stmt(StmtKind::Print, l), value(std::move(e)) {}
    std::unique_ptr<Expr> value;
};

struct IfStmt : Stmt {
    IfStmt(std::unique_ptr<Expr> c, std::unique_ptr<BlockStmt> t, std::unique_ptr<BlockStmt> e,
           SourceLoc l)
        : Stmt(StmtKind::If, l), cond(std::move(c)), thenBlock(std::move(t)), elseBlock(std::move(e)) {}
    std::unique_ptr<Expr> cond;
    std::unique_ptr<BlockStmt> thenBlock;
    std::unique_ptr<BlockStmt> elseBlock;  // may be null
};

struct WhileStmt : Stmt {
    WhileStmt(std::unique_ptr<Expr> c, std::unique_ptr<BlockStmt> b, SourceLoc l)
        : Stmt(StmtKind::While, l), cond(std::move(c)), body(std::move(b)) {}
    std::unique_ptr<Expr> cond;
    std::unique_ptr<BlockStmt> body;
};

// The program's top-level statements live in the global scope (scope 0).
struct Program {
    StmtList stmts;
};
