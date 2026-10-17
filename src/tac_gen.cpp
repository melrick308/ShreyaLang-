#include "tac_gen.hpp"

TacProgram TacGenerator::generate(const Program& program) {
    out_ = TacProgram();
    for (const auto& s : program.stmts) statement(*s);
    Instr halt;
    halt.op = Opcode::Halt;
    emit(halt);
    return std::move(out_);
}

void TacGenerator::emitAssign(Operand dst, Operand src, SourceLoc loc) {
    Instr in;
    in.op = Opcode::Assign;
    in.dst = std::move(dst);
    in.a = std::move(src);
    in.loc = loc;
    emit(std::move(in));
}

void TacGenerator::emitLabel(int label, SourceLoc loc) {
    Instr in;
    in.op = Opcode::Label;
    in.label = label;
    in.loc = loc;
    emit(in);
}

void TacGenerator::emitGoto(int label, SourceLoc loc) {
    Instr in;
    in.op = Opcode::Goto;
    in.label = label;
    in.loc = loc;
    emit(in);
}

void TacGenerator::emitIfFalse(Operand cond, int label, SourceLoc loc) {
    Instr in;
    in.op = Opcode::IfFalse;
    in.a = std::move(cond);
    in.label = label;
    in.loc = loc;
    emit(std::move(in));
}

// I2F tN, value  (the only implicit conversion: int -> float)
Operand TacGenerator::convertToFloat(Operand value, SourceLoc loc) {
    Operand dst = newTemp();
    Instr in;
    in.op = Opcode::I2F;
    in.dst = dst;
    in.a = std::move(value);
    in.loc = loc;
    emit(std::move(in));
    return dst;
}

void TacGenerator::store(const std::string& tacName, Type targetType, const Expr& value,
                         SourceLoc loc) {
    Operand src = expression(value);
    Operand dst = Operand::var(tacName);
    if (targetType == Type::Float && value.type == Type::Int) {
        Instr in;
        in.op = Opcode::I2F;
        in.dst = dst;
        in.a = src;
        in.loc = loc;
        emit(std::move(in));
    } else {
        emitAssign(dst, src, loc);
    }
}

void TacGenerator::statement(const Stmt& s) {
    switch (s.kind) {
        case StmtKind::Block:
            for (const auto& inner : static_cast<const BlockStmt&>(s).stmts) statement(*inner);
            break;

        case StmtKind::VarDecl: {
            const auto& d = static_cast<const VarDeclStmt&>(s);
            store(d.tacName, d.declType, *d.init, d.loc);
            break;
        }

        case StmtKind::Assign: {
            const auto& a = static_cast<const AssignStmt&>(s);
            store(a.tacName, a.targetType, *a.value, a.loc);
            break;
        }

        case StmtKind::Print: {
            const auto& p = static_cast<const PrintStmt&>(s);
            Instr in;
            in.op = Opcode::Print;
            in.a = expression(*p.value);
            in.loc = p.loc;
            emit(std::move(in));
            break;
        }

        case StmtKind::If: {
            // IF_FALSE c, Lelse ; then ; GOTO Lend ; Lelse: ; else ; Lend:
            const auto& i = static_cast<const IfStmt&>(s);
            Operand cond = expression(*i.cond);
            int elseLabel = newLabel();
            emitIfFalse(cond, elseLabel, i.loc);
            statement(*i.thenBlock);
            if (i.elseBlock) {
                int endLabel = newLabel();
                emitGoto(endLabel, i.loc);
                emitLabel(elseLabel, i.loc);
                statement(*i.elseBlock);
                emitLabel(endLabel, i.loc);
            } else {
                emitLabel(elseLabel, i.loc);
            }
            break;
        }

        case StmtKind::While: {
            // Lstart: ; c = cond ; IF_FALSE c, Lend ; body ; GOTO Lstart ; Lend:
            const auto& w = static_cast<const WhileStmt&>(s);
            int startLabel = newLabel();
            int endLabel = newLabel();
            emitLabel(startLabel, w.loc);
            Operand cond = expression(*w.cond);
            emitIfFalse(cond, endLabel, w.loc);
            statement(*w.body);
            emitGoto(startLabel, w.loc);
            emitLabel(endLabel, w.loc);
            break;
        }
    }
}

Operand TacGenerator::expression(const Expr& e) {
    switch (e.kind) {
        case ExprKind::Literal:
            return Operand::constant(static_cast<const LiteralExpr&>(e).value);
        case ExprKind::VarRef:
            return Operand::var(static_cast<const VarRefExpr&>(e).tacName);
        case ExprKind::Unary: {
            const auto& u = static_cast<const UnaryExpr&>(e);
            Operand operand = expression(*u.operand);
            Instr in;
            in.op = Opcode::UnOp;
            in.unop = u.op;
            in.operandType = u.operand->type;
            in.dst = newTemp();
            in.a = std::move(operand);
            in.loc = u.loc;
            Operand dst = in.dst;
            emit(std::move(in));
            return dst;
        }
        case ExprKind::Binary:
            return binary(static_cast<const BinaryExpr&>(e));
    }
    return Operand::none();
}

Operand TacGenerator::binary(const BinaryExpr& b) {
    if (isLogical(b.op)) return shortCircuit(b);

    Operand lhs = expression(*b.lhs);
    Operand rhs = expression(*b.rhs);
    Type lt = b.lhs->type, rt = b.rhs->type;

    // Mixed int/float: convert the int side so both operands share a type.
    Type operandType = lt;
    if (isNumeric(lt) && isNumeric(rt) && lt != rt) {
        if (lt == Type::Int) lhs = convertToFloat(lhs, b.loc);
        else rhs = convertToFloat(rhs, b.loc);
        operandType = Type::Float;
    }

    Instr in;
    in.op = Opcode::BinOp;
    in.binop = b.op;
    in.operandType = operandType;
    in.dst = newTemp();
    in.a = std::move(lhs);
    in.b = std::move(rhs);
    in.loc = b.loc;
    Operand dst = in.dst;
    emit(std::move(in));
    return dst;
}

// a && b:   t = a ; IF_FALSE t, Lend ; t = b ; Lend:
// a || b:   t = a ; IF_FALSE t, Lrhs ; GOTO Lend ; Lrhs: ; t = b ; Lend:
// The right operand is evaluated only when needed.
Operand TacGenerator::shortCircuit(const BinaryExpr& b) {
    Operand result = newTemp();
    emitAssign(result, expression(*b.lhs), b.loc);
    int endLabel = newLabel();
    if (b.op == BinOp::And) {
        emitIfFalse(result, endLabel, b.loc);
    } else {
        int rhsLabel = newLabel();
        emitIfFalse(result, rhsLabel, b.loc);
        emitGoto(endLabel, b.loc);
        emitLabel(rhsLabel, b.loc);
    }
    emitAssign(result, expression(*b.rhs), b.loc);
    emitLabel(endLabel, b.loc);
    return result;
}
