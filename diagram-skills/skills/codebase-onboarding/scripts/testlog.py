"""Read a test run's console log (or JUnit XML) and return the failing test IDs and the counts.

Every parser here was written against real output from that runner, saved in evals/fixtures/logs/:
pytest 9.1, jest 30, vitest 3.2, cargo test 1.97, dotnet test (xunit, .NET 10), and JUnit XML from
pytest and vitest. A runner not on that list gets no parser on purpose: pass --pattern with a regex
whose first group is the test ID, or have the runner write JUnit XML (most can).

The output of a parser is only trusted together with the run's exit status: see sanity().
"""
import hashlib
import re
import xml.etree.ElementTree as ET

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")      # tab and newline too: a JUnit name may hold them


def clean(text):
    """Strip colour codes (vitest colours even when piped) and normalise line ends."""
    return ANSI.sub("", text).replace("\r\n", "\n").replace("\r", "\n")


def safe_id(test_id):
    """One ID per line in a text file: escape control characters (a NUL in a parametrized ID made grep call
    the file binary) and shorten giant parametrized IDs (icalendar has 400,000-character ones) to a
    readable head plus a hash, so two different long IDs stay different."""
    test_id = CONTROL.sub(lambda m: "\\x%02x" % ord(m.group()), test_id.strip())
    if len(test_id) > 300:
        test_id = f"{test_id[:240]}...#{hashlib.sha1(test_id.encode('utf-8')).hexdigest()[:12]}"
    return test_id


# ---- console parsers: each returns (failing IDs, counts dict) -----------------------------------

PYTEST_LINE = re.compile(r"^(FAILED|ERROR) (.+?)(?: - .*)?$")
PYTEST_COUNT = re.compile(r"(\d+) (failed|passed|skipped|xfailed|xpassed|errors?|deselected|warnings?)\b")
PYTEST_FINAL = re.compile(r"^=*\s*(?:\d+ \w+(?:, )?)+.* in [\d.]+s")


def parse_pytest(text):
    ids, counts = [], {}
    in_summary = False
    for line in text.split("\n"):
        if "short test summary info" in line:
            in_summary = True
            continue
        if in_summary:
            m = PYTEST_LINE.match(line)
            if m:
                ids.append(m.group(2))
    for line in reversed(text.split("\n")):
        if PYTEST_FINAL.match(line.strip()):
            for n, word in PYTEST_COUNT.findall(line):
                key = {"error": "errors", "warning": "warnings"}.get(word, word)
                counts[key] = int(n)
            break
    if "Interrupted:" in text:
        counts["interrupted"] = 1
    if re.search(r"stopping after \d+ failures?", text):      # -x, --exitfirst, --maxfail
        counts["stopped_early"] = 1
    return ids, counts


JEST_FILE = re.compile(r"^\s*(PASS|FAIL)\s+(\S.*?)\s*(?:\(.*\))?$")
JEST_BULLET = re.compile(r"^\s*● (.+?)\s*$")
JEST_COUNT = re.compile(r"^Tests:\s+(.*)$")


def parse_jest(text):
    ids, counts, current = [], {}, None
    for line in text.split("\n"):
        m = JEST_FILE.match(line)
        if m:
            current = m.group(2) if m.group(1) == "FAIL" else None
            continue
        m = JEST_BULLET.match(line)
        if m and current:                       # bullets before any FAIL line are config warnings
            ids.append(f"{current} › {m.group(1)}")
            if m.group(1) == "Test suite failed to run":
                counts["files_not_run"] = counts.get("files_not_run", 0) + 1
        m = JEST_COUNT.match(line.strip())
        if m:
            for n, word in re.findall(r"(\d+) (failed|passed|skipped|todo|total)", m.group(1)):
                counts[word] = int(n)
    return ids, counts


VITEST_FAIL = re.compile(r"^\s*FAIL\s+(.+?)\s*$")
VITEST_SUITE = re.compile(r"^(.+?) \[ .+ \]$")


def parse_vitest(text):
    ids, counts = [], {}
    for line in text.split("\n"):
        m = VITEST_FAIL.match(line)
        if m:
            test_id = m.group(1)
            suite = VITEST_SUITE.match(test_id)
            ids.append(suite.group(1) if suite else test_id)
            if suite:
                counts["files_not_run"] = counts.get("files_not_run", 0) + 1
        stripped = line.strip()
        if stripped.startswith("Tests ") and "(" in stripped:
            for n, word in re.findall(r"(\d+) (failed|passed|skipped|todo)", stripped):
                counts[word] = int(n)
    return ids, counts


CARGO_TARGET = re.compile(r"^\s*Running (?:unittests )?(\S+)")
CARGO_TEST = re.compile(r"^test (\S+) \.\.\. (FAILED|ok|ignored)")
CARGO_RESULT = re.compile(r"^test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored")


def parse_cargo(text):
    ids, counts, target = [], {"passed": 0, "failed": 0, "ignored": 0}, "?"
    for line in text.split("\n"):
        m = CARGO_TARGET.match(line)
        if m:
            target = m.group(1).replace("\\", "/")
            continue
        m = CARGO_TEST.match(line)
        if m and m.group(2) == "FAILED":
            ids.append(f"{target}::{m.group(1)}")
        m = CARGO_RESULT.match(line)
        if m:
            for key, n in zip(("passed", "failed", "ignored"), m.groups()):
                counts[key] += int(n)
    return ids, counts


DOTNET_FAILED = re.compile(r"^\s+Failed (.+?) \[[^\]]*\]\s*$")
DOTNET_SUMMARY = re.compile(r"(Failed|Passed|Skipped|Total):\s+(\d+)")


def parse_dotnet(text):
    ids, counts = [], {}
    for line in text.split("\n"):
        m = DOTNET_FAILED.match(line)
        if m:
            ids.append(m.group(1))
        if re.match(r"^\s*(Failed|Passed)!\s+-", line):
            for word, n in DOTNET_SUMMARY.findall(line):
                counts[word.lower()] = counts.get(word.lower(), 0) + int(n)
    return ids, counts


PARSERS = {"pytest": parse_pytest, "jest": parse_jest, "vitest": parse_vitest,
           "cargo": parse_cargo, "dotnet": parse_dotnet}

# How each runner announces itself in its own output, checked in this order.
SIGNATURES = [
    ("vitest", re.compile(r"^\s*RUN\s+v\d|^\s*Test Files\s+\d", re.M)),
    ("jest", re.compile(r"^Test Suites:\s+\d", re.M)),
    ("cargo", re.compile(r"^test result: (ok|FAILED)\.", re.M)),
    ("dotnet", re.compile(r"^\s*(Passed|Failed)!\s+- Failed:", re.M)),
    ("pytest", re.compile(r"short test summary info|^(?:=+ )?\d+ (?:passed|failed|errors?|skipped|xfailed|deselected)\b.* in [\d.]+s", re.M)),
]


def detect(text):
    for name, sig in SIGNATURES:
        if sig.search(text):
            return name
    return None


def parse_log(text, runner="auto", pattern=None):
    """Return (runner used, sorted unique failing IDs, counts)."""
    text = clean(text)
    if pattern:
        rx = re.compile(pattern, re.M)
        ids = [m.group(1) for m in rx.finditer(text)]
        return "pattern", sorted({safe_id(i) for i in ids}), {}
    name = detect(text) if runner == "auto" else runner
    if name is None:
        return None, [], {}
    ids, counts = PARSERS[name](text)
    return name, sorted({safe_id(i) for i in ids}), counts


def parse_junit(paths):
    """JUnit XML from any runner: a testcase with <failure> or <error> is failing, <skipped> is skipped."""
    ids, counts = set(), {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    for path in paths:
        root = ET.parse(path).getroot()
        for case in root.iter("testcase"):
            test_id = safe_id(f"{case.get('classname', '')}::{case.get('name', '')}")
            if case.find("failure") is not None:
                counts["failed"] += 1
                ids.add(test_id)
            elif case.find("error") is not None:
                counts["errors"] += 1
                ids.add(test_id)
            elif case.find("skipped") is not None:
                counts["skipped"] += 1
            else:
                counts["passed"] += 1
    return "junit", sorted(ids), counts


def sanity(exit_code, runner, ids, counts, timed_out=False):
    """Warnings that mean the failure list cannot be trusted. An empty list is the safe answer only when the run says so."""
    warns = []
    if timed_out:
        warns.append("the run timed out and was killed: the list is partial, not a baseline")
    if counts.get("stopped_early"):
        warns.append("the run stopped after the first failures (-x or --maxfail, maybe from the config's "
                     "addopts): the list is partial; override it, e.g. --maxfail=1000000")
    if counts.get("files_not_run"):
        warns.append(f"{counts['files_not_run']} test file(s) failed to load, so none of their tests ran: "
                     "fix the environment or the command (copy CI's flags) before trusting the list")
    if runner is None:
        warns.append("no known runner in this output: pass --runner, --pattern or --junit")
    if exit_code not in (None, 0) and not ids:
        warns.append(f"exit status {exit_code} but no failing test parsed: the run crashed, "
                     "collection failed, or the parser does not know this output")
    if exit_code == 0 and ids:
        warns.append("exit status 0 but failing tests were parsed: check the pattern")
    if counts.get("interrupted"):
        warns.append("the run was interrupted (pytest stops at a collection error): "
                     "most tests did not run, so this is not a baseline")
    # errors are left out: pytest counts a test that errors in setup and again in teardown twice
    if counts.get("failed", 0) > len(ids):
        warns.append(f"the summary says {counts['failed']} failed but only {len(ids)} failing IDs were parsed")
    return warns
