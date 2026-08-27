# MATRIX-AUDIT.md

Audit of the `Matrix CI` workflow (`.github/workflows/ci.yml`) against the
compatibility matrix `os: [ubuntu-latest, windows-latest] × node: [18, 20, 22]`.

Baseline run: workflow run `33045841419` (dispatched from
`fix/matrix-environment-failures` @ `85b4879`), `fail-fast: false` so every
combination ran to completion. All failing combinations fail in the
**`Run npm test`** step.

## Matrix grid results

| OS            | Node | Result  | Failure type(s)                          |
|---------------|------|---------|------------------------------------------|
| ubuntu-latest | 18   | ✅ pass | —                                        |
| ubuntu-latest | 20   | ✅ pass | —                                        |
| ubuntu-latest | 22   | ❌ fail | runtime version                          |
| windows-latest| 18   | ❌ fail | OS-specific (path + line endings)        |
| windows-latest| 20   | ❌ fail | OS-specific (path + line endings)        |
| windows-latest| 22   | ❌ fail | OS-specific (path + line endings) + runtime version |

## Failing combinations

### 1. ubuntu-latest + Node 22

- **OS / Node:** `ubuntu-latest` / Node 22 (job `98429517023`)
- **Failing step:** `Run npm test`
- **Exact error lines from log:**
  ```
  FAIL src/cryptoUtils.test.js
    ● encryptValue and decryptValue are inverse operations
      TypeError: crypto.createCipher is not a function
  Test Suites: 1 failed, 1 passed, 2 total
  Tests:       1 failed, 3 passed, 4 total
  ```
- **Classification:** Runtime version incompatibility
- **Root cause:** `src/cryptoUtils.js:8` and `:15` call `crypto.createCipher('aes-256-cbc', key)`
  and `crypto.createDecipher('aes-256-cbc', key)` — the password-based
  (`EVP_BytesToKey`) variants. These were deprecated in Node 10 and **removed in
  Node 22** (the same call runs fine on Node 18/20, which is why only the Node 22
  combination fails).
- **Planned fix:** Replace `createCipher`/`createDecipher` with the current
  `crypto.createCipheriv`/`createDecipheriv` API: derive a 32-byte key via
  `crypto.scrypt` and use an explicit 16-byte IV (both passed to the `iv` variant).
  Behavior of the round-trip tests is preserved.

### 2. windows-latest + Node 18

- **OS / Node:** `windows-latest` / Node 18 (job `98429516954`)
- **Failing step:** `Run npm test`
- **Exact error lines from log:**
  ```
  FAIL src/fileUtils.test.js
    ● getOutputPath returns correct path
      expect(received).toBe(expected) // Object.is equality
      Expected: "D:\\a\\matrix-debug-drill\\matrix-debug-drill\\src\\output\\report.txt"
      Received: "D:\\a\\matrix-debug-drill\\matrix-debug-drill\\src/output/report.txt"
    ● readTextFile returns file content with expected line endings
      expect(received).toBe(expected) // Object.is equality
      - Expected  - 3
      + Received  + 3
  Test Suites: 1 failed, 1 passed, 2 total
  Tests:       2 failed, 2 passed, 4 total
  ```
- **Classification:** OS-specific (path separator + line endings)
- **Root cause (two independent defects):**
  1. **Path concatenation** — `src/fileUtils.js:4` and `:9` build paths with
     `__dirname + '/configs/' + ...` and `__dirname + '/output/' + ...`. On Windows
     `__dirname` uses `\`, so the result mixes separators
     (`D:\a\...\src/output/report.txt`) and no longer equals `path.join(...)`,
     which the test asserts (`src/fileUtils.test.js:7`). On Ubuntu the `/` literal
     matches `path.join`, so only Windows fails.
  2. **Hardcoded line endings** — `src/fileUtils.test.js:13` asserts the file
     content equals `'line one\nline two\nline three\n'`. The Windows runner's
     `actions/checkout` checks out text files with CRLF (`core.autocrlf=true`), so
     `readTextFile` returns `\r\n` endings and the `\n` assertion fails. The
     checked-in `src/test-data/sample.txt` is LF.
- **Planned fix:**
  1. Replace string path concatenation with `path.join(__dirname, 'configs', ...)`
     and `path.join(__dirname, 'output', ...)` in `src/fileUtils.js`.
  2. Normalize line endings in the test before comparing:
     `content.replace(/\r\n/g, '\n')`.

### 3. windows-latest + Node 20

- **OS / Node:** `windows-latest` / Node 20 (job `98429517043`)
- **Failing step:** `Run npm test`
- **Exact error lines from log:** identical to the windows-latest + Node 18 entry
  above (`getOutputPath` mismatch `D:\a\...\src/output/report.txt` vs
  `D:\a\...\src\output\report.txt`, and the `readTextFile` line-ending mismatch).
  Same two failing tests, `2 failed, 2 passed`.
- **Classification:** OS-specific (path separator + line endings)
- **Root cause / planned fix:** Same as entry #2 — the two fixes in
  `src/fileUtils.js` and `src/fileUtils.test.js` repair this combination too.

### 4. windows-latest + Node 22

- **OS / Node:** `windows-latest` / Node 22 (job `98429516969`)
- **Failing step:** `Run npm test`
- **Exact error lines from log:** all three defects combined:
  ```
  FAIL src/cryptoUtils.test.js
    ● encryptValue and decryptValue are inverse operations
      TypeError: crypto.createCipher is not a function
  FAIL src/fileUtils.test.js
    ● getOutputPath returns correct path
      Expected: "D:\\a\\matrix-debug-drill\\matrix-debug-drill\\src\\output\\report.txt"
      Received: "D:\\a\\matrix-debug-drill\\matrix-debug-drill\\src/output/report.txt"
    ● readTextFile returns file content with expected line endings
      - Expected  - 3
      + Received  + 3
  Test Suites: 2 failed, 2 total
  Tests:       3 failed, 1 passed, 4 total
  ```
- **Classification:** OS-specific (path separator + line endings) **and** runtime
  version (Node 22 crypto API removal)
- **Root cause / planned fix:** The union of entry #1 (crypto API) and entry #2
  (path + line endings). No additional work beyond those fixes.

## Passing combinations

- `ubuntu-latest` + Node 18 — all 4 tests pass.
- `ubuntu-latest` + Node 20 — all 4 tests pass.

## Notes

- **Shell-command category:** The lesson lists "shell commands that do not work in
  the Windows runner environment" as a possible OS-level cause. The audit found no
  such failure: the workflow's `npm ci`, `npm test`, and environment-print steps are
  already cross-platform, and the `lint` script is not run by CI. No `shell: bash`
  change is therefore required, and none was applied (keeps the diff surgical).
- **`fail-fast: false`:** the default `fail-fast: true` cancelled the other five jobs
  when `ubuntu-22` failed, hiding the full failure surface. `fail-fast: false` was
  added so every matrix combination runs to completion — this is also the intended
  production matrix configuration (see Task 4).
