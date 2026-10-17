#include "ast_printer.hpp"

namespace {

std::string locText(SourceLoc l) { return " @" + std::to_string(l.line) + ":" + std::to_string(l.col); }

class TextPrinter {
public:
    std::string out;

    void program(const Program& p) {
        out += "Program\n";
        for (const auto& s : p.stmts) stmt(*s, 1);
    }

private:
    void line(int depth, const std::string& text) { out += std::string(depth * 2, ' ') + text + "\n"; }

    void block(const BlockStmt& b, int depth) {
        line(depth, "Block" + locText(b.loc));
        for (const auto& s : b.stmts) stmt(*s, depth + 1);
    }

    void stmt(const Stmt& s, int depth) {
        switch (s.kind) {
            case StmtKind::Block:
                block(static_cast<const BlockStmt&>(s), depth);
                break;
            case StmtKind::VarDecl: {
                const auto& d = static_cast<const VarDeclStmt&>(s);
                line(depth, "VarDecl " + d.name + ": " + typeName(d.declType) + locText(d.loc));
                expr(*d.init, depth + 1);
                break;
            }
            case StmtKind::Assign: {
                const auto& a = static_cast<const AssignStmt&>(s);
                line(depth, "Assign " + a.name + locText(a.loc));
                expr(*a.value, depth + 1);
                break;
            }
            case StmtKind::Print: {
                const auto& p = static_cast<const PrintStmt&>(s);
                line(depth, "Print" + locText(p.loc));
                expr(*p.value, depth + 1);
                break;
            }
            case StmtKind::If: {
                const auto& i = static_cast<const IfStmt&>(s);
                line(depth, "If" + locText(i.loc));
                line(depth + 1, "Condition");
                expr(*i.cond, depth + 2);
                line(depth + 1, "Then");
                block(*i.thenBlock, depth + 2);
                if (i.elseBlock) {
                    line(depth + 1, "Else");
                    block(*i.elseBlock, depth + 2);
                }
                break;
            }
            case StmtKind::While: {
                const auto& w = static_cast<const WhileStmt&>(s);
                line(depth, "While" + locText(w.loc));
                line(depth + 1, "Condition");
                expr(*w.cond, depth + 2);
                line(depth + 1, "Body");
                block(*w.body, depth + 2);
                break;
            }
        }
    }

    void expr(const Expr& e, int depth) {
        switch (e.kind) {
            case ExprKind::Literal: {
                const auto& l = static_cast<const LiteralExpr&>(e);
                line(depth, std::string("Literal ") + typeName(l.value.type()) + " " +
                                formatLiteral(l.value) + locText(l.loc));
                break;
            }
            case ExprKind::VarRef: {
                const auto& v = static_cast<const VarRefExpr&>(e);
                line(depth, "VarRef " + v.name + locText(v.loc));
                break;
            }
            case ExprKind::Unary: {
                const auto& u = static_cast<const UnaryExpr&>(e);
                line(depth, std::string("Unary ") + unOpSymbol(u.op) + locText(u.loc));
                expr(*u.operand, depth + 1);
                break;
            }
            case ExprKind::Binary: {
                const auto& b = static_cast<const BinaryExpr&>(e);
                line(depth, std::string("Binary ") + binOpSymbol(b.op) + locText(b.loc));
                expr(*b.lhs, depth + 1);
                expr(*b.rhs, depth + 1);
                break;
            }
        }
    }
};

Json node(const char* name, SourceLoc l) {
    Json j = Json::object();
    j.set("node", name);
    j.set("line", l.line);
    j.set("col", l.col);
    return j;
}

Json exprJson(const Expr& e);
Json stmtJson(const Stmt& s);

Json blockJson(const BlockStmt& b) {
    Json j = node("Block", b.loc);
    Json body = Json::array();
    for (const auto& s : b.stmts) body.push(stmtJson(*s));
    j.set("body", std::move(body));
    return j;
}

Json stmtJson(const Stmt& s) {
    switch (s.kind) {
        case StmtKind::Block:
            return blockJson(static_cast<const BlockStmt&>(s));
        case StmtKind::VarDecl: {
            const auto& d = static_cast<const VarDeclStmt&>(s);
            Json j = node("VarDecl", d.loc);
            j.set("name", d.name);
            j.set("type", typeName(d.declType));
            j.set("init", exprJson(*d.init));
            return j;
        }
        case StmtKind::Assign: {
            const auto& a = static_cast<const AssignStmt&>(s);
            Json j = node("Assign", a.loc);
            j.set("name", a.name);
            j.set("value", exprJson(*a.value));
            return j;
        }
        case StmtKind::Print: {
            const auto& p = static_cast<const PrintStmt&>(s);
            Json j = node("Print", p.loc);
            j.set("value", exprJson(*p.value));
            return j;
        }
        case StmtKind::If: {
            const auto& i = static_cast<const IfStmt&>(s);
            Json j = node("If", i.loc);
            j.set("cond", exprJson(*i.cond));
            j.set("then", blockJson(*i.thenBlock));
            j.set("else", i.elseBlock ? blockJson(*i.elseBlock) : Json());
            return j;
        }
        case StmtKind::While: {
            const auto& w = static_cast<const WhileStmt&>(s);
            Json j = node("While", w.loc);
            j.set("cond", exprJson(*w.cond));
            j.set("body", blockJson(*w.body));
            return j;
        }
    }
    return Json();
}

Json exprJson(const Expr& e) {
    switch (e.kind) {
        case ExprKind::Literal: {
            const auto& l = static_cast<const LiteralExpr&>(e);
            Json j = node("Literal", l.loc);
            j.set("type", typeName(l.value.type()));
            j.set("value", formatLiteral(l.value));
            return j;
        }
        case ExprKind::VarRef: {
            const auto& v = static_cast<const VarRefExpr&>(e);
            Json j = node("VarRef", v.loc);
            j.set("name", v.name);
            return j;
        }
        case ExprKind::Unary: {
            const auto& u = static_cast<const UnaryExpr&>(e);
            Json j = node("Unary", u.loc);
            j.set("op", unOpSymbol(u.op));
            j.set("operand", exprJson(*u.operand));
            return j;
        }
        case ExprKind::Binary: {
            const auto& b = static_cast<const BinaryExpr&>(e);
            Json j = node("Binary", b.loc);
            j.set("op", binOpSymbol(b.op));
            j.set("left", exprJson(*b.lhs));
            j.set("right", exprJson(*b.rhs));
            return j;
        }
    }
    return Json();
}

}  // namespace

std::string printAst(const Program& program) {
    TextPrinter p;
    p.program(program);
    return p.out;
}

Json astToJson(const Program& program) {
    Json j = Json::object();
    j.set("node", "Program");
    Json body = Json::array();
    for (const auto& s : program.stmts) body.push(stmtJson(*s));
    j.set("body", std::move(body));
    return j;
}
