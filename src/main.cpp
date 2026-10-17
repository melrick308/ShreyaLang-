// shreyalang command-line interface.

#include <cerrno>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "driver.hpp"

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

namespace {

const char* kUsage =
    "usage: shreyalang <file.sl | -> [options]\n"
    "\n"
    "stages (any combination; default is --run):\n"
    "  --tokens          show the token stream\n"
    "  --ast             show the abstract syntax tree\n"
    "  --symbols         show the symbol table\n"
    "  --emit-tac        show three-address code\n"
    "  --emit-opt-tac    show optimized three-address code\n"
    "  --run             compile and execute\n"
    "\n"
    "options:\n"
    "  --no-opt          disable all optimization passes\n"
    "  --no-fold         disable constant folding\n"
    "  --no-prop         disable constant propagation\n"
    "  --no-dce          disable dead-code elimination\n"
    "  --max-steps N     VM instruction limit (default 1000000)\n"
    "  --json            machine-readable output for all requested stages\n"
    "  -h, --help        show this help\n"
    "\n"
    "Reads standard input when the file is \"-\".\n"
    "Exit codes: 0 ok, 1 lexical/syntax error, 2 semantic error, 3 runtime error, 4 usage/IO error.\n";

int usageError(const std::string& message) {
    std::cerr << "Usage error: " << message << "\n" << kUsage;
    return kExitUsage;
}

bool parseSteps(const std::string& text, int64_t& value) {
    if (text.empty() || text.find_first_not_of("0123456789") != std::string::npos) return false;
    errno = 0;
    char* end = nullptr;
    long long v = std::strtoll(text.c_str(), &end, 10);
    if (errno != 0 || *end != '\0' || v <= 0) return false;
    value = v;
    return true;
}

bool readAll(std::istream& in, std::string& out) {
    std::ostringstream buffer;
    buffer << in.rdbuf();
    out = buffer.str();
    return !in.bad();
}

}  // namespace

int main(int argc, char** argv) {
#ifdef _WIN32
    // Binary mode: identical byte output on every platform (no \r\n translation).
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);
    _setmode(_fileno(stdin), _O_BINARY);
#endif
    Options options;
    std::string path;
    bool haveFile = false;
    bool stageRequested = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "-h" || arg == "--help") {
            std::cout << kUsage;
            return kExitOk;
        } else if (arg == "--tokens") {
            options.showTokens = stageRequested = true;
        } else if (arg == "--ast") {
            options.showAst = stageRequested = true;
        } else if (arg == "--symbols") {
            options.showSymbols = stageRequested = true;
        } else if (arg == "--emit-tac") {
            options.showTac = stageRequested = true;
        } else if (arg == "--emit-opt-tac") {
            options.showOptTac = stageRequested = true;
        } else if (arg == "--run") {
            options.run = stageRequested = true;
        } else if (arg == "--json") {
            options.json = true;
        } else if (arg == "--no-opt") {
            options.opt.fold = options.opt.propagate = options.opt.dce = false;
        } else if (arg == "--no-fold") {
            options.opt.fold = false;
        } else if (arg == "--no-prop") {
            options.opt.propagate = false;
        } else if (arg == "--no-dce") {
            options.opt.dce = false;
        } else if (arg == "--max-steps") {
            if (i + 1 >= argc) return usageError("--max-steps requires a value");
            if (!parseSteps(argv[++i], options.maxSteps))
                return usageError(std::string("invalid --max-steps value '") + argv[i] +
                                  "' (expected a positive integer)");
        } else if (arg.size() > 1 && arg[0] == '-') {
            return usageError("unknown option '" + arg + "'");
        } else {
            if (haveFile) return usageError("more than one input file given");
            path = arg;
            haveFile = true;
        }
    }
    if (!haveFile) return usageError("no input file");
    if (!stageRequested) options.run = true;

    std::string source;
    if (path == "-") {
        if (!readAll(std::cin, source)) {
            std::cerr << "IO error: cannot read standard input\n";
            return kExitUsage;
        }
    } else {
        std::ifstream file(path, std::ios::binary);
        if (!file || !readAll(file, source)) {
            std::cerr << "IO error: cannot read file '" << path << "'\n";
            return kExitUsage;
        }
    }

    return compileSource(source, options, std::cout, std::cerr);
}
