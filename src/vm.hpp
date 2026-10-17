// Virtual machine that executes TAC directly.
#pragma once

#include <cstdint>
#include <ostream>

#include "diagnostics.hpp"
#include "tac.hpp"

constexpr int64_t kDefaultMaxSteps = 1000000;

struct VmResult {
    bool ok = true;
    Diagnostic error;   // Runtime category when !ok
    int64_t steps = 0;  // instructions executed
};

// Executes `program`, writing `print` output to `out`. Never throws for
// ShreyaLang-level errors; they are returned as a Runtime diagnostic.
VmResult runTac(const TacProgram& program, int64_t maxSteps, std::ostream& out);
