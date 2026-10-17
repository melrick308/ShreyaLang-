#include "optimizer.hpp"

#include <map>
#include <string>

namespace {

Operand constant(const Value& v) { return Operand::constant(v); }

// True when executing the instruction might raise a runtime error. Such an
// instruction is never folded away or deleted: the VM must still raise it.
bool mayRaise(const Instr& in) {
    if (in.op == Opcode::BinOp) {
        if (in.a.isConst() && in.b.isConst()) return !evalBinary(in.binop, in.a.value, in.b.value).ok;
        if (in.binop == BinOp::Div || in.binop == BinOp::Mod) return true;  // division by zero
        bool intArith = in.operandType == Type::Int &&
                        (in.binop == BinOp::Add || in.binop == BinOp::Sub || in.binop == BinOp::Mul);
        return intArith;  // integer overflow
    }
    if (in.op == Opcode::UnOp) {
        if (in.a.isConst()) return !evalUnary(in.unop, in.a.value).ok;
        return in.unop == UnOp::Neg && in.operandType == Type::Int;  // -INT64_MIN
    }
    return false;  // ASSIGN, I2F, control flow and PRINT cannot fail
}

}  // namespace

// BINOP/UNOP/I2F whose operands are all constants become `dst = constant`,
// computed with the same evalBinary/evalUnary the VM uses. Operations that
// would fail (division by zero, overflow) are left for the VM to report.
int foldConstants(TacProgram& program) {
    int changes = 0;
    for (Instr& in : program.code) {
        OpResult r;
        if (in.op == Opcode::BinOp && in.a.isConst() && in.b.isConst())
            r = evalBinary(in.binop, in.a.value, in.b.value);
        else if (in.op == Opcode::UnOp && in.a.isConst())
            r = evalUnary(in.unop, in.a.value);
        else if (in.op == Opcode::I2F && in.a.isConst())
            r = evalIntToFloat(in.a.value);
        else
            continue;
        if (!r.ok) continue;

        in.op = Opcode::Assign;
        in.a = constant(r.value);
        in.b = Operand::none();
        ++changes;
    }
    return changes;
}

// Within a basic block, replaces reads of a variable/temporary whose value
// is a known constant. A basic block starts at a LABEL or after a jump, and
// all knowledge is discarded there. That is what keeps loops correct: a value
// assigned before a loop is never propagated past the loop's label.
int propagateConstants(TacProgram& program) {
    int changes = 0;
    std::map<std::string, Value> known;

    auto substitute = [&](Operand& o) {
        if (!o.isStorage()) return;
        auto it = known.find(operandKey(o));
        if (it == known.end()) return;
        o = constant(it->second);
        ++changes;
    };

    for (Instr& in : program.code) {
        if (in.op == Opcode::Label) {
            known.clear();
            continue;
        }
        substitute(in.a);
        substitute(in.b);
        if (in.definesDst()) {
            std::string key = operandKey(in.dst);
            known.erase(key);  // reassignment kills the old constant
            if (in.op == Opcode::Assign && in.a.isConst()) known[key] = in.a.value;
        }
        if (in.isJump()) known.clear();
    }
    return changes;
}

// Removes instructions that write a temporary nobody reads. PRINT, jumps,
// labels, writes to named variables and anything that may raise a runtime
// error are always kept. Dead stores to named variables are left in place.
int eliminateDeadCode(TacProgram& program) {
    std::map<int, int> reads;
    for (const Instr& in : program.code) {
        if (in.a.kind == Operand::Kind::Temp) ++reads[in.a.tempId];
        if (in.b.kind == Operand::Kind::Temp) ++reads[in.b.tempId];
    }

    std::vector<Instr> kept;
    kept.reserve(program.code.size());
    int removed = 0;
    for (Instr& in : program.code) {
        bool dead = in.definesDst() && in.dst.kind == Operand::Kind::Temp && reads[in.dst.tempId] == 0 &&
                    !mayRaise(in);
        if (dead) {
            ++removed;
        } else {
            kept.push_back(std::move(in));
        }
    }
    program.code = std::move(kept);
    return removed;
}

TacProgram optimize(TacProgram program, const OptOptions& options, OptStats* stats) {
    OptStats local;
    OptStats& s = stats ? *stats : local;
    s = OptStats();
    // Every change shrinks the program or turns an operand/instruction into
    // a constant, so this terminates; the cap is only a safety net.
    for (int round = 0; round < 1000; ++round) {
        int changes = 0;
        if (options.propagate) {
            int n = propagateConstants(program);
            s.propagated += n;
            changes += n;
        }
        if (options.fold) {
            int n = foldConstants(program);
            s.folded += n;
            changes += n;
        }
        if (options.dce) {
            int n = eliminateDeadCode(program);
            s.removed += n;
            changes += n;
        }
        ++s.iterations;
        if (changes == 0) break;
    }
    return program;
}
