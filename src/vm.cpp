#include "vm.hpp"

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace {

// Operand with storage resolved to a slot index ahead of execution.
struct Slot {
    bool isConst = false;
    int index = -1;  // into the register file
    Value constant;
};

struct Resolved {
    Slot dst, a, b;
    int target = -1;  // instruction index for jumps
};

class Machine {
public:
    Machine(const TacProgram& p, int64_t maxSteps, std::ostream& out)
        : program_(p), maxSteps_(maxSteps), out_(out) {}

    VmResult run() {
        if (!resolve()) return result_;
        const auto& code = program_.code;
        size_t pc = 0;
        while (pc < code.size()) {
            const Instr& in = code[pc];
            const Resolved& r = resolved_[pc];
            if (++result_.steps > maxSteps_)
                return fail(in, "execution limit exceeded (" + std::to_string(maxSteps_) + " steps)");
            size_t next = pc + 1;

            switch (in.op) {
                case Opcode::Assign: {
                    const Value* v = read(in, r.a);
                    if (!v) return result_;
                    write(r.dst, *v);
                    break;
                }
                case Opcode::BinOp: {
                    const Value* a = read(in, r.a);
                    if (!a) return result_;
                    const Value* b = read(in, r.b);
                    if (!b) return result_;
                    OpResult res = evalBinary(in.binop, *a, *b);
                    if (!res.ok) return fail(in, res.error);
                    write(r.dst, res.value);
                    break;
                }
                case Opcode::UnOp: {
                    const Value* a = read(in, r.a);
                    if (!a) return result_;
                    OpResult res = evalUnary(in.unop, *a);
                    if (!res.ok) return fail(in, res.error);
                    write(r.dst, res.value);
                    break;
                }
                case Opcode::I2F: {
                    const Value* a = read(in, r.a);
                    if (!a) return result_;
                    OpResult res = evalIntToFloat(*a);
                    if (!res.ok) return fail(in, res.error);
                    write(r.dst, res.value);
                    break;
                }
                case Opcode::Label:
                    break;
                case Opcode::Goto:
                    next = static_cast<size_t>(r.target);
                    break;
                case Opcode::IfFalse: {
                    const Value* c = read(in, r.a);
                    if (!c) return result_;
                    if (c->type() != Type::Bool) return fail(in, "internal error: IF_FALSE on a non-bool value");
                    if (!c->asBool()) next = static_cast<size_t>(r.target);
                    break;
                }
                case Opcode::Print: {
                    const Value* v = read(in, r.a);
                    if (!v) return result_;
                    out_ << formatValue(*v) << '\n';
                    break;
                }
                case Opcode::Halt:
                    return result_;
            }
            pc = next;
        }
        return result_;
    }

private:
    VmResult fail(const Instr& in, const std::string& message) {
        result_.ok = false;
        result_.error = {ErrorCategory::Runtime, in.loc, message};
        return result_;
    }

    Slot slotFor(const Operand& o) {
        Slot s;
        switch (o.kind) {
            case Operand::Kind::Const:
                s.isConst = true;
                s.constant = o.value;
                break;
            case Operand::Kind::Var:
            case Operand::Kind::Temp: {
                auto [it, inserted] = slots_.emplace(operandKey(o), static_cast<int>(slots_.size()));
                s.index = it->second;
                break;
            }
            case Operand::Kind::None:
                break;
        }
        return s;
    }

    // Maps variables/temporaries to register slots and labels to instruction
    // indices, so execution does no name lookups.
    bool resolve() {
        std::map<int, int> labels;
        const auto& code = program_.code;
        for (size_t i = 0; i < code.size(); ++i)
            if (code[i].op == Opcode::Label) labels[code[i].label] = static_cast<int>(i);

        resolved_.resize(code.size());
        for (size_t i = 0; i < code.size(); ++i) {
            const Instr& in = code[i];
            Resolved& r = resolved_[i];
            r.dst = slotFor(in.dst);
            r.a = slotFor(in.a);
            r.b = slotFor(in.b);
            if (in.isJump()) {
                auto it = labels.find(in.label);
                if (it == labels.end()) {
                    fail(in, "internal error: undefined label L" + std::to_string(in.label));
                    return false;
                }
                r.target = it->second;
            }
        }
        registers_.assign(slots_.size(), std::nullopt);
        return true;
    }

    const Value* read(const Instr& in, const Slot& s) {
        if (s.isConst) return &s.constant;
        if (s.index < 0 || !registers_[s.index]) {
            fail(in, "internal error: read of an uninitialized location");
            return nullptr;
        }
        return &*registers_[s.index];
    }

    void write(const Slot& s, const Value& v) { registers_[s.index] = v; }

    const TacProgram& program_;
    int64_t maxSteps_;
    std::ostream& out_;
    std::map<std::string, int> slots_;
    std::vector<Resolved> resolved_;
    std::vector<std::optional<Value>> registers_;
    VmResult result_;
};

}  // namespace

VmResult runTac(const TacProgram& program, int64_t maxSteps, std::ostream& out) {
    Machine m(program, maxSteps, out);
    return m.run();
}
