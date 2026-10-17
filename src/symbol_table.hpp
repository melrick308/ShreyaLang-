// Scoped symbol table.
//
// Scopes form a tree (scope 0 is the global scope; every block opens a new
// one). The table keeps every scope and symbol after analysis so --symbols
// can print the full picture; `active_` is the chain used for lookup while
// the analyzer walks the program.
#pragma once

#include <map>
#include <string>
#include <vector>

#include "diagnostics.hpp"
#include "json.hpp"
#include "types.hpp"

struct Symbol {
    std::string name;
    Type type = Type::Unknown;
    int scopeId = 0;
    SourceLoc declLoc;
    std::string tacName;  // unique across the program: x, x#2, x#3 ...
};

struct Scope {
    int id = 0;
    int parent = -1;  // -1 for the global scope
    int depth = 0;
    SourceLoc loc;    // position of the opening '{' (unset for global)
    std::vector<int> symbols;  // indices into SymbolTable::symbols()
};

class SymbolTable {
public:
    SymbolTable();

    int enterScope(SourceLoc loc);  // returns the new scope id
    void exitScope();
    int currentScope() const { return active_.back(); }

    // Declares in the current scope. Caller checks lookupLocal() first.
    const Symbol& declare(const std::string& name, Type type, SourceLoc loc);

    // Returns the symbol index, or -1. lookupLocal searches only the current scope.
    int lookupLocal(const std::string& name) const;
    int lookup(const std::string& name) const;

    const Symbol& symbol(int index) const { return symbols_[index]; }
    const std::vector<Scope>& scopes() const { return scopes_; }
    const std::vector<Symbol>& symbols() const { return symbols_; }

    std::string print() const;
    Json toJson() const;

private:
    int findIn(int scopeId, const std::string& name) const;

    std::vector<Scope> scopes_;
    std::vector<Symbol> symbols_;
    std::vector<int> active_;                 // scope ids, innermost last
    std::map<std::string, int> declCount_;    // per name, for unique TAC names
};
