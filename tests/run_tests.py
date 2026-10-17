#!/usr/bin/env python3
"""ShreyaLang test runner.

Every check runs the real `shreyalang` executable as a subprocess.

1. Case tests (tests/cases/NAME.sl):
     NAME.out   expected stdout (required, may be empty)
     NAME.code  expected exit code (optional, default 0)
     NAME.args  extra command-line arguments (optional)
     NAME.err   expected stderr, compared exactly (optional)
2. CLI tests: usage errors, stdin input, --json output.
3. Equivalence: every program in tests/cases and samples/ that compiles is
   run with all optimizations, with --no-opt and with each pass disabled;
   stdout, stderr and exit code must be identical.

Usage: python tests/run_tests.py [--bin PATH] [-v]
"""

import argparse
import json
import pathlib
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CASES = ROOT / "tests" / "cases"
SAMPLES = ROOT / "samples"
OPT_CONFIGS = [[], ["--no-opt"], ["--no-fold"], ["--no-prop"], ["--no-dce"]]


class Runner:
    def __init__(self, binary, verbose):
        self.binary = str(binary)
        self.verbose = verbose
        self.passed = 0
        self.failed = []

    def run(self, args, stdin=b""):
        proc = subprocess.run([self.binary] + args, input=stdin, capture_output=True, timeout=60)
        return proc.returncode, proc.stdout, proc.stderr

    def check(self, name, ok, detail=""):
        if ok:
            self.passed += 1
            if self.verbose:
                print(f"PASS  {name}")
        else:
            self.failed.append(name)
            print(f"FAIL  {name}")
            if detail:
                print("      " + detail.replace("\n", "\n      "))


def show(data):
    return repr(data.decode("utf-8", "replace"))


def case_tests(r):
    for source in sorted(CASES.glob("*.sl")):
        name = source.stem
        expected_out = source.with_suffix(".out")
        if not expected_out.exists():
            r.check(name, False, "missing .out file")
            continue
        args_file = source.with_suffix(".args")
        code_file = source.with_suffix(".code")
        err_file = source.with_suffix(".err")
        extra = shlex.split(args_file.read_text()) if args_file.exists() else []
        want_code = int(code_file.read_text().strip()) if code_file.exists() else 0
        want_out = expected_out.read_bytes()

        code, out, err = r.run([str(source)] + extra)
        problems = []
        if code != want_code:
            problems.append(f"exit code {code}, expected {want_code}; stderr: {show(err)}")
        if out != want_out:
            problems.append(f"stdout {show(out)}\nexpected {show(want_out)}")
        if err_file.exists() and err != err_file.read_bytes():
            problems.append(f"stderr {show(err)}\nexpected {show(err_file.read_bytes())}")
        if want_code == 0 and not err_file.exists() and err:
            problems.append(f"unexpected stderr {show(err)}")
        r.check(f"case {name}", not problems, "\n".join(problems))


def cli_tests(r):
    sample = str(CASES / "01_precedence.sl")

    code, out, err = r.run([])
    r.check("cli no input file -> exit 4", code == 4 and b"no input file" in err)

    code, out, err = r.run([str(CASES / "does_not_exist.sl")])
    r.check("cli missing file -> exit 4", code == 4 and b"IO error" in err and not out)

    code, out, err = r.run([sample, "--bogus"])
    r.check("cli unknown option -> exit 4", code == 4 and b"unknown option" in err)

    code, out, err = r.run([sample, "--max-steps", "abc"])
    r.check("cli bad --max-steps -> exit 4", code == 4 and b"--max-steps" in err)

    code, out, err = r.run([sample, "--max-steps"])
    r.check("cli --max-steps without value -> exit 4", code == 4)

    code, out, err = r.run([sample, sample])
    r.check("cli two input files -> exit 4", code == 4)

    code, out, err = r.run(["--help"])
    r.check("cli --help -> exit 0", code == 0 and b"usage:" in out)

    code, out, err = r.run(["-"], stdin=(CASES / "01_precedence.sl").read_bytes())
    r.check("cli reads stdin with '-'", code == 0 and out == b"20\n", show(out))

    code, out, err = r.run([sample, "--run", "--emit-tac"])
    r.check("cli several stages print headers",
            code == 0 and b"== TAC ==" in out and b"== Output ==\n20\n" in out, show(out))

    # --json: one valid document containing every requested stage.
    code, out, err = r.run([sample, "--json", "--tokens", "--ast", "--symbols",
                            "--emit-tac", "--emit-opt-tac", "--run"])
    try:
        doc = json.loads(out)
        ok = (code == 0 and doc["exitCode"] == 0 and doc["output"] == "20\n"
              and doc["errors"] == [] and doc["tokens"][0]["kind"] == "LET"
              and doc["ast"]["node"] == "Program"
              and doc["symbols"][0]["symbols"][0]["name"] == "a"
              and doc["tac"][-1]["op"] == "HALT" and len(doc["optimizedTac"]) < len(doc["tac"])
              and doc["optimizer"]["folded"] >= 1 and doc["optimizer"]["fold"] is True)
        r.check("cli --json all stages", ok, out.decode())
    except (ValueError, KeyError, IndexError) as e:
        r.check("cli --json all stages", False, f"{e}: {show(out)}")

    code, out, err = r.run([str(CASES / "05_undeclared.sl"), "--json"])
    try:
        doc = json.loads(out)
        e0 = doc["errors"][0]
        ok = (code == 2 and doc["exitCode"] == 2 and e0["category"] == "Semantic"
              and e0["line"] == 1 and e0["col"] == 7 and doc["output"] == "" and not err)
        r.check("cli --json semantic error", ok, out.decode())
    except (ValueError, KeyError, IndexError) as e:
        r.check("cli --json semantic error", False, f"{e}: {show(out)}")

    code, out, err = r.run([str(CASES / "10_division_by_zero.sl"), "--json"])
    try:
        doc = json.loads(out)
        ok = code == 3 and doc["errors"][0]["category"] == "Runtime"
        r.check("cli --json runtime error", ok, out.decode())
    except (ValueError, KeyError, IndexError) as e:
        r.check("cli --json runtime error", False, f"{e}: {show(out)}")


def equivalence_tests(r):
    programs = sorted(CASES.glob("*.sl")) + sorted(SAMPLES.glob("*.sl"))
    compared = 0
    for source in programs:
        args_file = source.with_suffix(".args")
        extra = shlex.split(args_file.read_text()) if args_file.exists() else []
        # Keep only options that affect execution, not stage output.
        keep = []
        for i, a in enumerate(extra):
            if a == "--max-steps" and i + 1 < len(extra):
                keep += [a, extra[i + 1]]
        baseline = r.run([str(source)] + keep)
        if baseline[0] not in (0, 3):  # did not compile: nothing to execute
            continue
        compared += 1
        for config in OPT_CONFIGS[1:]:
            result = r.run([str(source)] + keep + config)
            detail = ""
            if result != baseline:
                detail = (f"default: code {baseline[0]} out {show(baseline[1])} err {show(baseline[2])}\n"
                          f"{' '.join(config)}: code {result[0]} out {show(result[1])} err {show(result[2])}")
            r.check(f"equivalence {source.parent.name}/{source.stem} {' '.join(config)}",
                    result == baseline, detail)
    r.check("equivalence covered at least one program", compared > 0)
    return compared


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    exe = "shreyalang.exe" if sys.platform == "win32" else "shreyalang"
    parser.add_argument("--bin", default=str(ROOT / "build" / exe), help="path to the shreyalang executable")
    parser.add_argument("-v", "--verbose", action="store_true", help="list passing tests too")
    options = parser.parse_args()

    binary = pathlib.Path(options.bin)
    if not binary.is_absolute():
        binary = (pathlib.Path.cwd() / binary).resolve()
    if not binary.exists():
        print(f"shreyalang executable not found: {binary} (run make first)")
        return 2

    r = Runner(binary, options.verbose)
    case_tests(r)
    cli_tests(r)
    compared = equivalence_tests(r)

    print(f"\n{r.passed} passed, {len(r.failed)} failed "
          f"({compared} programs checked for optimized/unoptimized equivalence)")
    return 1 if r.failed else 0


if __name__ == "__main__":
    sys.exit(main())
