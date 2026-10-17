#include "semantic.hpp"

#include <string>

namespace {

std::string quoted(Type t) { return std::string("'") + typeName(t) + "'"; }

}  // namespace

bool isAssignable(Type target, Type source) {
    return target == source || (target == Type::Float && source == Type::Int);
}

void SemanticAnalyzer::error(SourceLoc loc, std::string message) {
    errors_.push_back({ErrorCategory::Semantic, loc, std::move(message)});
}

void SemanticAnalyzer::analyze(Program& program) {
    for (auto& s : program.stmts) statement(*s);
}

void SemanticAnalyzer::block(BlockStmt& b) {
    b.scopeId = table_.enterScope(b.loc);
    for (auto& s : b.stmts) statement(*s);
    table_.exitScope();
}

void SemanticAnalyzer::condition(Expr& cond, const char* construct) {
    Type t = expression(cond);
    if (t != Type::Bool && t != Type::Error)
        error(cond.loc, std::string("condition of '") + construct + "' must be of type 'bool', got " +
                            quoted(t));
}

void SemanticAnalyzer::statement(Stmt& s) {
    switch (s.kind) {
        case StmtKind::Block:
            block(static_cast<BlockStmt&>(s));
            break;

        case StmtKind::VarDecl: {
            auto& d = static_cast<VarDeclStmt&>(s);
            // The initializer is checked before the name is declared, so
            // `let x: int = x;` refers to an outer x (or is an error).
            Type init = expression(*d.init);
            if (init != Type::Error && !isAssignable(d.declType, init))
                error(d.loc, "cannot initialize variable '" + d.name + "' of type " +
                                 quoted(d.declType) + " with a value of type " + quoted(init));

            int previous = table_.lookupLocal(d.name);
            if (previous >= 0) {
                error(d.loc, "variable '" + d.name + "' is already declared in this scope (line " +
                                 std::to_string(table_.symbol(previous).declLoc.line) + ")");
                d.tacName = table_.symbol(previous).tacName;
            } else {
                d.tacName = table_.declare(d.name, d.declType, d.loc).tacName;
            }
            break;
        }

        case StmtKind::Assign: {
            auto& a = static_cast<AssignStmt&>(s);
            Type value = expression(*a.value);
            int index = table_.lookup(a.name);
            if (index < 0) {
                error(a.loc, "assignment to undeclared variable '" + a.name + "'");
                a.targetType = Type::Error;
                break;
            }
            const Symbol& sym = table_.symbol(index);
            a.tacName = sym.tacName;
            a.targetType = sym.type;
            if (value != Type::Error && !isAssignable(sym.type, value))
                error(a.loc, "cannot assign a value of type " + quoted(value) + " to variable '" +
                                 a.name + "' of type " + quoted(sym.type));
            break;
        }

        case StmtKind::Print:
            expression(*static_cast<PrintStmt&>(s).value);  // any type can be printed
            break;

        case StmtKind::If: {
            auto& i = static_cast<IfStmt&>(s);
            condition(*i.cond, "if");
            block(*i.thenBlock);
            if (i.elseBlock) block(*i.elseBlock);
            break;
        }

        case StmtKind::While: {
            auto& w = static_cast<WhileStmt&>(s);
            condition(*w.cond, "while");
            block(*w.body);
            break;
        }
    }
}

Type SemanticAnalyzer::expression(Expr& e) {
    switch (e.kind) {
        case ExprKind::Literal:
            e.type = static_cast<LiteralExpr&>(e).value.type();
            break;
        case ExprKind::VarRef: {
            auto& v = static_cast<VarRefExpr&>(e);
            int index = table_.lookup(v.name);
            if (index < 0) {
                error(v.loc, "undeclared variable '" + v.name + "'");
                e.type = Type::Error;
            } else {
                v.tacName = table_.symbol(index).tacName;
                e.type = table_.symbol(index).type;
            }
            break;
        }
        case ExprKind::Unary:
            e.type = unary(static_cast<UnaryExpr&>(e));
            break;
        case ExprKind::Binary:
            e.type = binary(static_cast<BinaryExpr&>(e));
            break;
    }
    return e.type;
}

Type SemanticAnalyzer::unary(UnaryExpr& u) {
    Type t = expression(*u.operand);
    if (t == Type::Error) return Type::Error;
    if (u.op == UnOp::Neg && isNumeric(t)) return t;
    if (u.op == UnOp::Not && t == Type::Bool) return Type::Bool;
    error(u.loc, std::string("operator '") + unOpSymbol(u.op) +
                     "' cannot be applied to an operand of type " + quoted(t));
    return Type::Error;
}

Type SemanticAnalyzer::binary(BinaryExpr& b) {
    Type l = expression(*b.lhs);
    Type r = expression(*b.rhs);
    if (l == Type::Error || r == Type::Error) return Type::Error;  // already reported

    bool numeric = isNumeric(l) && isNumeric(r);
    Type result = Type::Error;
    switch (b.op) {
        case BinOp::Add: case BinOp::Sub: case BinOp::Mul: case BinOp::Div:
            if (numeric) result = (l == Type::Float || r == Type::Float) ? Type::Float : Type::Int;
            break;
        case BinOp::Mod:
            if (l == Type::Int && r == Type::Int) result = Type::Int;
            break;
        case BinOp::Lt: case BinOp::Le: case BinOp::Gt: case BinOp::Ge:
            if (numeric) result = Type::Bool;
            break;
        case BinOp::Eq: case BinOp::Ne:
            if (numeric || (l == r && (l == Type::Bool || l == Type::String))) result = Type::Bool;
            break;
        case BinOp::And: case BinOp::Or:
            if (l == Type::Bool && r == Type::Bool) result = Type::Bool;
            break;
    }
    if (result == Type::Error)
        error(b.loc, std::string("operator '") + binOpSymbol(b.op) +
                         "' cannot be applied to operands of type " + quoted(l) + " and " + quoted(r));
    return result;
}
