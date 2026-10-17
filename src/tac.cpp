#include "tac.hpp"

std::string formatOperand(const Operand& o) {
    switch (o.kind) {
        case Operand::Kind::None: return "_";
        case Operand::Kind::Var: return o.name;
        case Operand::Kind::Temp: return "t" + std::to_string(o.tempId);
        case Operand::Kind::Const: return formatLiteral(o.value);
    }
    return "?";
}

std::string operandKey(const Operand& o) {
    return o.kind == Operand::Kind::Temp ? "t:" + std::to_string(o.tempId) : "v:" + o.name;
}

const char* opcodeName(Opcode op) {
    switch (op) {
        case Opcode::Assign: return "ASSIGN";
        case Opcode::BinOp: return "BINOP";
        case Opcode::UnOp: return "UNOP";
        case Opcode::I2F: return "I2F";
        case Opcode::Label: return "LABEL";
        case Opcode::Goto: return "GOTO";
        case Opcode::IfFalse: return "IF_FALSE";
        case Opcode::Print: return "PRINT";
        case Opcode::Halt: return "HALT";
    }
    return "?";
}

namespace {
std::string labelName(int id) { return "L" + std::to_string(id); }
}

std::string formatInstr(const Instr& in) {
    switch (in.op) {
        case Opcode::Assign: return formatOperand(in.dst) + " = " + formatOperand(in.a);
        case Opcode::BinOp:
            return formatOperand(in.dst) + " = " + formatOperand(in.a) + " " + binOpMnemonic(in.binop) +
                   " " + formatOperand(in.b);
        case Opcode::UnOp:
            return formatOperand(in.dst) + " = " + unOpMnemonic(in.unop) + " " + formatOperand(in.a);
        case Opcode::I2F: return formatOperand(in.dst) + " = I2F " + formatOperand(in.a);
        case Opcode::Label: return labelName(in.label) + ":";
        case Opcode::Goto: return "GOTO " + labelName(in.label);
        case Opcode::IfFalse: return "IF_FALSE " + formatOperand(in.a) + ", " + labelName(in.label);
        case Opcode::Print: return "PRINT " + formatOperand(in.a);
        case Opcode::Halt: return "HALT";
    }
    return "?";
}

std::string formatTac(const TacProgram& program) {
    std::string out;
    for (size_t i = 0; i < program.code.size(); ++i) {
        const Instr& in = program.code[i];
        std::string index = std::to_string(i);
        std::string text = std::string(index.size() < 4 ? 4 - index.size() : 0, ' ') + index + "  ";
        // Labels sit at the left margin, instructions are indented under them.
        text += (in.op == Opcode::Label ? "" : "    ") + formatInstr(in);
        if (in.loc.line > 0) {
            if (text.size() < 40) text += std::string(40 - text.size(), ' ');
            text += "  ; line " + std::to_string(in.loc.line);
        }
        out += text + "\n";
    }
    return out;
}

namespace {

Json operandJson(const Operand& o) {
    Json j = Json::object();
    switch (o.kind) {
        case Operand::Kind::None: return Json();
        case Operand::Kind::Var: j.set("kind", "var"); j.set("name", o.name); break;
        case Operand::Kind::Temp: j.set("kind", "temp"); j.set("name", formatOperand(o)); break;
        case Operand::Kind::Const:
            j.set("kind", "const");
            j.set("type", typeName(o.value.type()));
            j.set("value", formatLiteral(o.value));
            break;
    }
    return j;
}

}  // namespace

Json tacToJson(const TacProgram& program) {
    Json list = Json::array();
    for (size_t i = 0; i < program.code.size(); ++i) {
        const Instr& in = program.code[i];
        Json j = Json::object();
        j.set("index", static_cast<int>(i));
        j.set("op", opcodeName(in.op));
        if (in.op == Opcode::BinOp) j.set("binop", binOpMnemonic(in.binop));
        if (in.op == Opcode::UnOp) j.set("unop", unOpMnemonic(in.unop));
        if (in.definesDst()) j.set("dst", operandJson(in.dst));
        if (in.a.kind != Operand::Kind::None) j.set("a", operandJson(in.a));
        if (in.b.kind != Operand::Kind::None) j.set("b", operandJson(in.b));
        if (in.label >= 0) j.set("label", labelName(in.label));
        j.set("line", in.loc.line);
        j.set("text", formatInstr(in));
        list.push(std::move(j));
    }
    return list;
}
