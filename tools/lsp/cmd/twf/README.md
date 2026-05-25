# TWF CLI

Command-line interface for working with Temporal Workflow Format (.twf) files.

## Installation

### Binary download (no Go required)

Each [GitHub Release](https://github.com/jmbarzee/temporal-architect/releases) ships
prebuilt archives for five platforms:

```
twf-vX.Y.Z-darwin-arm64.tar.gz
twf-vX.Y.Z-darwin-amd64.tar.gz
twf-vX.Y.Z-linux-amd64.tar.gz
twf-vX.Y.Z-linux-arm64.tar.gz
twf-vX.Y.Z-windows-amd64.zip
```

Each archive contains a single `twf` (or `twf.exe`) binary. A `SHA256SUMS`
file is published alongside every release for checksum verification.

**One-liner (macOS / Linux):**

```bash
curl -sSL https://github.com/jmbarzee/temporal-architect/releases/latest/download/install.sh | bash
```

To pin a specific version or change the install directory:

```bash
VERSION=v0.3.0 INSTALL_DIR=/usr/local/bin \
  curl -sSL https://github.com/jmbarzee/temporal-architect/releases/download/v0.3.0/install.sh | bash
```

**Manual install:**

```bash
# Replace vX.Y.Z, GOOS, and GOARCH with the appropriate values
curl -sSfLO https://github.com/jmbarzee/temporal-architect/releases/download/vX.Y.Z/twf-vX.Y.Z-GOOS-GOARCH.tar.gz
curl -sSfLO https://github.com/jmbarzee/temporal-architect/releases/download/vX.Y.Z/SHA256SUMS
grep "twf-vX.Y.Z-GOOS-GOARCH.tar.gz" SHA256SUMS | sha256sum --check
tar -xzf twf-vX.Y.Z-GOOS-GOARCH.tar.gz
mv twf ~/.local/bin/twf
```

### From source (requires Go)

```bash
go install github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf@latest
```

Or from the repo root:
```bash
cd tools/lsp
go install ./cmd/twf
```

## Commands

### `twf check`

Validate TWF files. Prints diagnostics to stderr as human-readable text and
exits non-zero if any diagnostic has severity `error`. **Text only** — for
structured diagnostics, use `twf parse` (see below).

```bash
twf check workflow.twf
twf check *.twf
twf check --lenient workflow.twf   # exit 0 even on errors (warnings still print)
```

**Exit codes:**
- `0` - No errors (warnings allowed)
- `1` - At least one error

**Example:**
```bash
$ twf check workflow.twf
✓ OK: 4 workflow(s), 10 activity(s)

$ twf check broken.twf
error [resolve/UNDEFINED_ACTIVITY] at broken.twf:2:3: undefined activity: Foo
Partial parse: 1 workflow(s), 0 activity(s), 1 error(s), 0 warning(s)
```

---

### `twf parse`

Emit the canonical **JSON envelope** for one or more TWF files. Always JSON;
no flag is required. Diagnostics ride inside the envelope alongside the AST,
so a single call satisfies a "draft → validate → fix → revalidate" loop
without scraping stderr.

```bash
twf parse workflow.twf
twf parse workflow.twf | jq '.diagnostics'
```

**Output:** see the [Envelope](#json-envelope) section below for the shared
shape. The payload key for `parse` is `definitions` (matching the existing
AST shape).

**Exit:** `0` even when the AST is partial. Hard I/O errors (file not found,
permission denied) exit `1` with a human-readable error to stderr.

---

### `twf symbols`

List the workflows and activities in the file(s).

```bash
twf symbols workflow.twf            # text
twf symbols --json workflow.twf     # JSON envelope with payload key `symbols`
```

**Text output:**
```
workflow ProcessOrder(order: Order) -> (Result)
activity ValidateOrder(order: Order) -> (ValidateResult)
```

**JSON output:** same envelope as `parse`, with the symbol list under
`symbols` instead of `definitions`.

---

### `twf deps`

Show the dependency graph of the input files.

```bash
twf deps workflow.twf              # text
twf deps --json workflow.twf       # JSON envelope with payload key `graph`
```

---

## JSON envelope

Every JSON-emitting subcommand (`parse`, `symbols --json`, `deps --json`)
shares the same top-level shape:

```json
{
  "summary": {
    "namespaces": 0,
    "workers": 1,
    "workflows": 2,
    "activities": 3,
    "nexusServices": 0,
    "errors": 1,
    "warnings": 0
  },
  "diagnostics": [
    {
      "severity": "error",
      "kind":     "resolve",
      "code":     "UNDEFINED_ACTIVITY",
      "file":     "workflow.twf",
      "start":    { "line": 2, "column": 3 },
      "end":      { "line": 2, "column": 3 },
      "message":  "undefined activity: NotAnActivity",
      "name":     "NotAnActivity"
    }
  ],
  "definitions": [ /* parse */ ],
  "symbols":     [ /* symbols --json */ ],
  "graph":       { /* deps --json */ }
}
```

Per command, exactly one of `definitions` / `symbols` / `graph` is present.

### Diagnostic fields

| Field      | Type     | Notes                                                                                            |
|------------|----------|--------------------------------------------------------------------------------------------------|
| `severity` | string   | `"error"` or `"warning"`. Exit code is driven by errors only.                                    |
| `kind`     | string   | `"parse"`, `"resolve"`, or `"validate"`. Identifies the producing pipeline stage.                 |
| `code`     | string   | Symbolic, stable identifier within a kind. Adding new codes is non-breaking; renaming is breaking. |
| `file`     | string   | Source-file basename. May be empty in multi-file mode when the diagnostic isn't tied to a definition. |
| `start`    | Position | 1-based line/column. Always present.                                                              |
| `end`      | Position | 1-based line/column. Currently `end == start` for resolve/validate diagnostics; precision will improve over time without changing the schema. |
| `message`  | string   | Human-readable text. Subject to change; pin to `code` for programmatic dispatch.                  |
| `name`     | string   | Primary entity the diagnostic refers to (the undefined name, the duplicate name, …). Optional.    |

### Diagnostic codes

The complete list of `kind` + `code` combinations:

**kind: `parse`**
- `SYNTAX` — any parser failure (categorization is future work)

**kind: `resolve`**
- `DUPLICATE_WORKFLOW`, `DUPLICATE_ACTIVITY`, `DUPLICATE_WORKER`,
  `DUPLICATE_NAMESPACE`, `DUPLICATE_NEXUS_SERVICE`, `DUPLICATE_ENDPOINT`
- `UNDEFINED_ACTIVITY`, `UNDEFINED_WORKFLOW`, `UNDEFINED_SIGNAL`,
  `UNDEFINED_UPDATE`, `UNDEFINED_CONDITION`, `UNDEFINED_PROMISE_OR_CONDITION`
- `CONDITION_RESULT_BINDING`
- `NEXUS_ASYNC_UNDEFINED_WORKFLOW`, `NEXUS_UNDEFINED_ENDPOINT`,
  `NEXUS_UNRESOLVED_ENDPOINT`, `NEXUS_UNDEFINED_SERVICE`,
  `NEXUS_UNRESOLVED_SERVICE`, `NEXUS_NO_OPERATION`
- `WORKER_UNDEFINED_WORKFLOW`, `WORKER_UNDEFINED_ACTIVITY`,
  `WORKER_UNDEFINED_NEXUS_SERVICE`, `NAMESPACE_UNDEFINED_WORKER`

**kind: `validate`**
- `EMPTY_WORKFLOW`, `EMPTY_ACTIVITY`, `EMPTY_WORKER`, `EMPTY_NAMESPACE`
- `MISSING_TASK_QUEUE`, `MISSING_ENDPOINT_TASK_QUEUE`
- `UNCOVERED_WORKFLOW`, `UNCOVERED_ACTIVITY`, `UNCOVERED_SERVICE`,
  `UNINSTANTIATED_WORKER`
- `TASK_QUEUE_IDENTICAL`, `TASK_QUEUE_MISMATCH`,
  `EXPLICIT_ROUTING_MISMATCH`, `IMPLICIT_ROUTING_MISMATCH`,
  `ENDPOINT_SERVICE_LINKAGE`

The authoritative machine-readable schema is checked in at
[`twf.schema.json`](./twf.schema.json).

---

### `twf spec`

Print the embedded TWF language specification. The spec content is baked
into the binary at build time from `tools/spec/sections/`, so the version
the CLI prints is guaranteed to match the parser version that validates
your files.

```bash
twf spec               # full spec (all sections in canonical order)
twf spec --list        # list slugs and titles
twf spec workflows     # one section by slug
```

**Slugs** are the filenames in `tools/spec/sections/` minus the numeric
prefix and the `.md` extension (e.g. `01-workflows.md` → `workflows`).

**Examples:**
```bash
$ twf spec --list
SLUG                    TITLE
overview                Overview
workflows               Workflow Definitions
...

$ twf spec nexus | head -3
# Nexus Service Definitions

Nexus services define typed operation groups for cross-namespace communication:
```

---

## Use Cases

### CI/CD Validation

```bash
# Validate all TWF files in CI
twf check $(find . -name "*.twf")
```

### AI Integration

```bash
# AI assistants can analyze workflow structure
twf symbols --json workflow.twf | ai-tool analyze

# Parse complete AST for code generation
twf parse workflow.twf | ai-tool generate-go
```

### Development Workflow

```bash
# Quick validation during development
twf check workflow.twf

# List all definitions to understand structure
twf symbols workflow.twf

# Generate documentation from AST
twf parse workflow.twf | doc-generator
```

### Build Scripts

```bash
# Validate before building
if ! twf check workflows/*.twf; then
    echo "TWF validation failed"
    exit 1
fi

# Generate code from TWF
for file in workflows/*.twf; do
    twf parse "$file" | code-generator > "generated/$(basename "$file" .twf).go"
done
```

---

## Options

- `--json` — Emit the JSON envelope (supported by `symbols` and `deps`; `parse` is always JSON).
- `--lenient` — `check` only. Exit 0 even when errors are present (diagnostics still print).

---

## Architecture

The CLI uses the same parser and resolver as the LSP server, ensuring consistent behavior between:
- Editor integration (LSP)
- Command-line tools (CLI)
- Build scripts
- CI/CD pipelines

**Shared components:**
- `parser/lexer` - Tokenization
- `parser/parser` - AST construction
- `parser/resolver` - Symbol resolution and validation

---

## Exit Codes

- `0` - Success
- `1` - Error (parse error, resolve error, file not found, etc.)

---

## See Also

- [Language Specification](../../../spec/) - TWF syntax reference (also embedded in the binary; print with `twf spec`)
