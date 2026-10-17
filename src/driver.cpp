#include "driver.hpp"

#include <sstream>
#include <vector>

#include "ast_printer.hpp"
#include "json.hpp"
#include "parser.hpp"
#include "semantic.hpp"
#include "symbol_table.hpp"
#include "tac_gen.hpp"
#include "token.hpp"

namespace {

std::string formatTokens(const std::vector<Token>& tokens) {
    std::string out;
    for (const Token& t : tokens) {
        std::string pos = std::to_string(t.loc.line) + ":" + std::to_string(t.loc.col);
        std::string kind = tokenKindName(t.kind);
        std::string line = pos + std::string(pos.size() < 8 ? 8 - pos.size() : 1, ' ') + kind;
        if (t.kind != TokenKind::EndOfFile)
            line += std::string(kind.size() < 12 ? 12 - kind.size() : 1, ' ') + t.lexeme;
        out += line + "\n";
    }
    return out;
}

Json tokensToJson(const std::vector<Token>& tokens) {
    Json list = Json::array();
    for (const Token& t : tokens) {
        Json j = Json::object();
        j.set("kind", tokenKindName(t.kind));
        j.set("lexeme", t.lexeme);
        j.set("line", t.loc.line);
        j.set("col", t.loc.col);
        if (t.kind == TokenKind::IntLit) j.set("value", t.intValue);
        if (t.kind == TokenKind::FloatLit) j.set("value", t.floatValue);
        if (t.kind == TokenKind::StringLit) j.set("value", t.stringValue);
        list.push(std::move(j));
    }
    return list;
}

std::string formatOptStats(const OptStats& s) {
    return "; optimizer: " + std::to_string(s.folded) + " folded, " + std::to_string(s.propagated) +
           " propagated, " + std::to_string(s.removed) + " removed, " + std::to_string(s.iterations) +
           " round(s)\n";
}

// Collects stage output in either text or JSON form and emits it at the end.
class Report {
public:
    Report(const Options& o, const std::string& source, std::ostream& out, std::ostream& err)
        : options_(o), source_(source), out_(out), err_(err), json_(Json::object()) {
        int sections = o.showTokens + o.showAst + o.showSymbols + o.showTac + o.showOptTac + o.run;
        headers_ = sections > 1;
    }

    void section(const char* title, const char* jsonKey, const std::string& text, Json json) {
        if (options_.json) {
            json_.set(jsonKey, std::move(json));
            return;
        }
        if (headers_) out_ << "== " << title << " ==\n";
        out_ << text;
        if (headers_) out_ << "\n";
    }

    // Program output: streamed in text mode, captured in JSON mode.
    std::ostream& programOutput() {
        if (options_.json) return captured_;
        if (headers_) out_ << "== Output ==\n";
        return out_;
    }

    void errors(const std::vector<Diagnostic>& list) {
        for (const Diagnostic& d : list) {
            if (options_.json) {
                Json j = Json::object();
                j.set("category", categoryName(d.category));
                j.set("line", d.loc.line);
                j.set("col", d.loc.col);
                j.set("message", d.message);
                j.set("text", diagnosticHeader(d));
                errors_.push(std::move(j));
            } else {
                out_.flush();  // keep program output ahead of the error
                err_ << formatDiagnostic(d, source_);
            }
        }
    }

    void steps(int64_t n) { steps_ = n; }

    // JSON-only field (text mode already prints the same data inline).
    void jsonField(const char* key, Json value) {
        if (options_.json) json_.set(key, std::move(value));
    }

    int finish(int code) {
        if (options_.json) {
            if (options_.run) json_.set("output", captured_.str());
            if (steps_ >= 0) json_.set("steps", steps_);
            json_.set("errors", std::move(errors_));
            json_.set("exitCode", code);
            out_ << json_.dump() << "\n";
        }
        out_.flush();
        return code;
    }

private:
    const Options& options_;
    const std::string& source_;
    std::ostream& out_;
    std::ostream& err_;
    bool headers_ = false;
    Json json_;
    Json errors_ = Json::array();
    std::ostringstream captured_;
    int64_t steps_ = -1;
};

enum Stage { kTokens = 1, kAst, kSymbols, kTac, kOptTac, kRun };

int lastStage(const Options& o) {
    if (o.run) return kRun;
    if (o.showOptTac) return kOptTac;
    if (o.showTac) return kTac;
    if (o.showSymbols) return kSymbols;
    if (o.showAst) return kAst;
    return kTokens;
}

}  // namespace

int compileSource(const std::string& source, const Options& options, std::ostream& out,
                  std::ostream& err) {
    Report report(options, source, out, err);
    const int last = lastStage(options);

    // 1. Lexical analysis (independent of the parser).
    LexResult lex = lexSource(source);
    if (options.showTokens)
        report.section("Tokens", "tokens", formatTokens(lex.tokens), tokensToJson(lex.tokens));
    if (!lex.errors.empty()) {
        report.errors(lex.errors);
        return report.finish(kExitSyntax);
    }
    if (last < kAst) return report.finish(kExitOk);

    // 2. Parsing; stops at the first syntax error.
    ParseResult parsed = parseTokens(lex.tokens);
    if (!parsed.program) {
        report.errors(parsed.errors);
        return report.finish(kExitSyntax);
    }
    Program& program = *parsed.program;
    if (options.showAst) report.section("AST", "ast", printAst(program), astToJson(program));
    if (last < kSymbols) return report.finish(kExitOk);

    // 3. Semantic analysis; collects all errors.
    SymbolTable symbols;
    std::vector<Diagnostic> semanticErrors;
    SemanticAnalyzer(symbols, semanticErrors).analyze(program);
    if (options.showSymbols) report.section("Symbols", "symbols", symbols.print(), symbols.toJson());
    if (!semanticErrors.empty()) {
        report.errors(semanticErrors);
        return report.finish(kExitSemantic);
    }
    if (last < kTac) return report.finish(kExitOk);

    // 4. TAC generation.
    TacProgram tac = TacGenerator().generate(program);
    if (options.showTac) report.section("TAC", "tac", formatTac(tac), tacToJson(tac));
    if (last < kOptTac) return report.finish(kExitOk);

    // 5. Optimization (skipped entirely with --no-opt).
    OptStats stats;
    TacProgram optimized = options.opt.any() ? optimize(tac, options.opt, &stats) : tac;
    if (options.showOptTac) {
        std::string text = formatTac(optimized);
        text += options.opt.any() ? formatOptStats(stats) : "; optimizer disabled (--no-opt)\n";
        report.section("Optimized TAC", "optimizedTac", text, tacToJson(optimized));
        Json opt = Json::object();
        opt.set("fold", options.opt.fold);
        opt.set("propagate", options.opt.propagate);
        opt.set("dce", options.opt.dce);
        opt.set("folded", stats.folded);
        opt.set("propagated", stats.propagated);
        opt.set("removed", stats.removed);
        opt.set("rounds", stats.iterations);
        report.jsonField("optimizer", std::move(opt));
    }
    if (last < kRun) return report.finish(kExitOk);

    // 6. Execution.
    VmResult result = runTac(optimized, options.maxSteps, report.programOutput());
    report.steps(result.steps);
    if (!result.ok) {
        report.errors({result.error});
        return report.finish(kExitRuntime);
    }
    return report.finish(kExitOk);
}
