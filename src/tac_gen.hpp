// Lowers a type-checked AST to TAC.
#pragma once

#include "ast.hpp"
#include "tac.hpp"

class TacGenerator {
public:
    // `program` must have passed semantic analysis without errors.
    TacProgram generate(const Program& program);

private:
    void statement(const Stmt& s);
    void store(const std::string& tacName, Type targetType, const Expr& value, SourceLoc loc);
    Operand expression(const Expr& e);
    Operand binary(const BinaryExpr& b);
    Operand shortCircuit(const BinaryExpr& b);
    Operand convertToFloat(Operand value, SourceLoc loc);

    Operand newTemp() { return Operand::temp(++out_.tempCount); }
    int newLabel() { return ++out_.labelCount; }
    void emit(Instr in) { out_.code.push_back(std::move(in)); }
    void emitAssign(Operand dst, Operand src, SourceLoc loc);
    void emitLabel(int label, SourceLoc loc);
    void emitGoto(int label, SourceLoc loc);
    void emitIfFalse(Operand cond, int label, SourceLoc loc);

    TacProgram out_;
};
