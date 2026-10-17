#include "symbol_table.hpp"

#include <algorithm>
#include <cstdio>

SymbolTable::SymbolTable() {
    Scope global;
    scopes_.push_back(global);
    active_.push_back(0);
}

int SymbolTable::enterScope(SourceLoc loc) {
    Scope s;
    s.id = static_cast<int>(scopes_.size());
    s.parent = currentScope();
    s.depth = static_cast<int>(active_.size());
    s.loc = loc;
    scopes_.push_back(s);
    active_.push_back(s.id);
    return s.id;
}

void SymbolTable::exitScope() {
    if (active_.size() > 1) active_.pop_back();
}

const Symbol& SymbolTable::declare(const std::string& name, Type type, SourceLoc loc) {
    int n = ++declCount_[name];
    Symbol sym;
    sym.name = name;
    sym.type = type;
    sym.scopeId = currentScope();
    sym.declLoc = loc;
    // '#' cannot appear in an identifier, so x#2 never clashes with a user name.
    sym.tacName = n == 1 ? name : name + "#" + std::to_string(n);
    symbols_.push_back(sym);
    int index = static_cast<int>(symbols_.size()) - 1;
    scopes_[sym.scopeId].symbols.push_back(index);
    return symbols_[index];
}

int SymbolTable::findIn(int scopeId, const std::string& name) const {
    for (int index : scopes_[scopeId].symbols)
        if (symbols_[index].name == name) return index;
    return -1;
}

int SymbolTable::lookupLocal(const std::string& name) const { return findIn(currentScope(), name); }

int SymbolTable::lookup(const std::string& name) const {
    for (auto it = active_.rbegin(); it != active_.rend(); ++it) {
        int index = findIn(*it, name);
        if (index >= 0) return index;
    }
    return -1;
}

std::string SymbolTable::print() const {
    size_t nameWidth = 4;
    for (const Symbol& s : symbols_) nameWidth = std::max(nameWidth, s.name.size());

    std::string out;
    char buf[256];
    for (const Scope& scope : scopes_) {
        if (scope.id == 0) {
            out += "Scope 0 (global)\n";
        } else {
            std::snprintf(buf, sizeof buf, "Scope %d (parent %d, depth %d, block at line %d)\n",
                          scope.id, scope.parent, scope.depth, scope.loc.line);
            out += buf;
        }
        if (scope.symbols.empty()) {
            out += "  (no symbols)\n";
            continue;
        }
        for (int index : scope.symbols) {
            const Symbol& s = symbols_[index];
            std::string type = typeName(s.type);
            std::string line = std::to_string(s.declLoc.line);
            out += "  " + s.name + std::string(nameWidth - s.name.size(), ' ') + "  " + type +
                   std::string(type.size() < 6 ? 6 - type.size() : 0, ' ') + "  line " + line +
                   std::string(line.size() < 4 ? 4 - line.size() : 0, ' ') + "  tac " +
                   s.tacName + "\n";
        }
    }
    return out;
}

Json SymbolTable::toJson() const {
    Json scopes = Json::array();
    for (const Scope& scope : scopes_) {
        Json syms = Json::array();
        for (int index : scope.symbols) {
            const Symbol& s = symbols_[index];
            Json j = Json::object();
            j.set("name", s.name);
            j.set("type", typeName(s.type));
            j.set("scope", s.scopeId);
            j.set("line", s.declLoc.line);
            j.set("col", s.declLoc.col);
            j.set("tacName", s.tacName);
            syms.push(std::move(j));
        }
        Json j = Json::object();
        j.set("id", scope.id);
        j.set("parent", scope.parent < 0 ? Json() : Json(scope.parent));
        j.set("depth", scope.depth);
        j.set("line", scope.loc.line);
        j.set("symbols", std::move(syms));
        scopes.push(std::move(j));
    }
    return scopes;
}
