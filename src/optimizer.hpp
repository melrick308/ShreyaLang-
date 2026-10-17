// TAC optimizer: constant folding, block-local constant propagation and
// dead-code elimination of unused temporaries. Every pass preserves
// observable behaviour, including runtime errors.
#pragma once

#include "tac.hpp"

struct OptOptions {
    bool fold = true;
    bool propagate = true;
    bool dce = true;
    bool any() const { return fold || propagate || dce; }
};

struct OptStats {
    int folded = 0;      // instructions replaced by a constant ASSIGN
    int propagated = 0;  // operand uses replaced by a constant
    int removed = 0;     // dead instructions deleted
    int iterations = 0;  // rounds until nothing changed
};

// The passes run in rounds (propagate, fold, DCE) until a fixed point.
TacProgram optimize(TacProgram program, const OptOptions& options, OptStats* stats = nullptr);

// Individual passes; each returns the number of changes it made.
int foldConstants(TacProgram& program);
int propagateConstants(TacProgram& program);
int eliminateDeadCode(TacProgram& program);
