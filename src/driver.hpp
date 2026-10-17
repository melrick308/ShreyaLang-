// Compiler driver: runs the phases in order and renders the requested stages.
#pragma once

#include <cstdint>
#include <ostream>
#include <string>

#include "optimizer.hpp"
#include "vm.hpp"

enum ExitCode {
    kExitOk = 0,
    kExitSyntax = 1,    // lexical or syntax error
    kExitSemantic = 2,
    kExitRuntime = 3,
    kExitUsage = 4,     // usage or I/O error
};

struct Options {
    bool showTokens = false;
    bool showAst = false;
    bool showSymbols = false;
    bool showTac = false;
    bool showOptTac = false;
    bool run = false;   // set explicitly by --run, or implied when no stage is requested
    bool json = false;
    OptOptions opt;
    int64_t maxSteps = kDefaultMaxSteps;
};

// Compiles (and, if requested, runs) `source`. Stage output and program
// output go to `out`; diagnostics go to `err` (text mode) or into the JSON
// document on `out` (--json). Returns the process exit code.
int compileSource(const std::string& source, const Options& options, std::ostream& out,
                  std::ostream& err);
