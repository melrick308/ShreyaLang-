// Three-address code: structured instructions (not strings).
//
//   ASSIGN dst, src          BINOP op dst, a, b       UNOP op dst, a
//   I2F dst, src             LABEL L                  GOTO L
//   IF_FALSE cond, L         PRINT src                HALT
#pragma once

#include <string>
#include <vector>

#include "diagnostics.hpp"
#include "json.hpp"
#include "ops.hpp"
#include "types.hpp"
#include "value.hpp"

struct Operand {
    enum class Kind { None, Var, Temp, Const };

    static Operand none() { return Operand(); }
    static Operand var(std::string name) { Operand o; o.kind = Kind::Var; o.name = std::move(name); return o; }
    static Operand temp(int id) { Operand o; o.kind = Kind::Temp; o.tempId = id; return o; }
    static Operand constant(Value v) { Operand o; o.kind = Kind::Const; o.value = std::move(v); return o; }

    bool isConst() const { return kind == Kind::Const; }
    bool isStorage() const { return kind == Kind::Var || kind == Kind::Temp; }

    Kind kind = Kind::None;
    std::string name;  // Var: unique TAC name (x, x#2)
    int tempId = 0;    // Temp: t<tempId>
    Value value;       // Const: typed constant
};

std::string formatOperand(const Operand& o);
// Identifies a storage location ("v:x", "t:3"); only for Var/Temp.
std::string operandKey(const Operand& o);

enum class Opcode { Assign, BinOp, UnOp, I2F, Label, Goto, IfFalse, Print, Halt };

const char* opcodeName(Opcode op);

struct Instr {
    Opcode op = Opcode::Halt;
    BinOp binop = BinOp::Add;  // BINOP only
    UnOp unop = UnOp::Neg;     // UNOP only
    Type operandType = Type::Unknown;  // BINOP/UNOP: type of the operands
    Operand dst;   // ASSIGN, BINOP, UNOP, I2F
    Operand a;     // ASSIGN/UNOP/I2F/PRINT/IF_FALSE source; BINOP left
    Operand b;     // BINOP right
    int label = -1;  // LABEL, GOTO, IF_FALSE
    SourceLoc loc;   // source position the instruction came from

    bool definesDst() const {
        return op == Opcode::Assign || op == Opcode::BinOp || op == Opcode::UnOp || op == Opcode::I2F;
    }
    bool isJump() const { return op == Opcode::Goto || op == Opcode::IfFalse; }
};

struct TacProgram {
    std::vector<Instr> code;
    int tempCount = 0;
    int labelCount = 0;
};

std::string formatInstr(const Instr& in);           // "t1 = b MUL 2"
std::string formatTac(const TacProgram& program);   // numbered listing with source lines
Json tacToJson(const TacProgram& program);
