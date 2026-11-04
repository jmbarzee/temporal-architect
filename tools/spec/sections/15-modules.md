# Modules

How twf finds a file's module, which paths are valid, how inputs are walked, and which files a
run ignores. The author's view — `twf.mod`, the package rules, `twf mod init` — is in
[14 — Packages and Imports](./14-packages-and-imports.md#modules).

## `twf.mod`

- Line-oriented UTF-8 (a leading BOM is ignored, `\r\n` accepted). `#` starts a comment anywhere
  on a line. A line's **directive** is its first word.
- Exactly one `module <path>` directive: one unquoted word, a [valid path](#paths). A file with no
  `module` directive, two, a malformed one, or that cannot be read is `MODULE_FILE_INVALID` — its
  only diagnostic, at the second `module` line, else the malformed one, else the first unknown
  directive (named in the message when there is no `module` line), else 1:1.
- In a valid file, any other directive is a `MODULE_FILE_UNKNOWN_DIRECTIVE` warning and is
  ignored, so a future directive does not break an older twf.
- A **broken `twf.mod` is fatal to its module**: its files are ignored (their parse errors are
  still reported). Inside the module that is one error, no cascade.
- A file's module is the nearest `twf.mod` walking up from the file's physical directory: an
  entry named exactly `twf.mod` (not `TWF.MOD`) that is a regular file once symlinks are followed.
  A nested `twf.mod` starts a new module; the outer one does not contain that subtree.
- A `twf.mod` directly in the temp directory (`os.TempDir()`) is ignored and the walk stops
  there: a file below it is outside any module.
- Module errors are reported only for modules holding input files.

## Paths

Module, package and import paths share one rule — Go's `module.CheckImportPath`: `/`-separated,
non-empty elements of ASCII letters, digits and `-._~+`; not beginning with `-`; no element all
dots or ending in `.`; no Windows-reserved or short names; never `:`, `@`, whitespace or `\`.
Dot-less paths are valid.

| Accepted | Rejected |
|----------|----------|
| `demo`, `acme/orderer`, `example.com/demo/fabric/v1` | `-x` (leading dash) |
| `a+b`, `a..b`, `.x`, `x~beta` | `x~1`, `con` (Windows short and reserved names) |
| | `a//b`, `a/`, `x.`, `a:b`, `a@b`, `a b` |

A package directory whose derived path is invalid (`kube (old)`) is `INVALID_PACKAGE_PATH`, and
the package is ignored.

## Inputs

- A file's **identity** is its physical path: symlinks, `..`, letter case and Unicode
  normalization resolved. One file named twice — relative and absolute, through a symlink, or by a
  file argument and a directory holding it — is one input, at its first position. A directory
  symlinked into a module is not part of it.
- **Walking** a directory argument skips entries named `.*` or `_*`, directories named `testdata`,
  and symlinks (a symlinked `.twf` would take its target's directory and package). An argument
  itself is never skipped; an explicit symlinked file argument is its target. The walk descends
  into nested modules.
- **Input order** is argument order, then walk order — lexical within each directory.
- A diagnostic names a file the way its input did: a file argument as given, a walked file as its
  directory argument, `/`, and its path below it.
- **Virtual sources** (an MCP `source` string, an unsaved editor buffer with no file) have no
  directory: their package clause needs no module, and they form packages by declared name.

## Ignored Files

Each step works on what the previous ones left:

0. A file whose package clause fails with no name to recover, or that has a `package` line other
   than its first clause.
1. `MODULE_FILE_INVALID` — every file of that module.
   - `PACKAGE_OUTSIDE_MODULE` — an on-disk file with a package clause and no module.
2. `DUPLICATE_MODULE` — two module roots holding input files and declaring one module path
   (compared case-insensitively): the later module, by its first input file, is ignored.
3. `PACKAGE_CLAUSE_CONFLICT` — a directory whose files declare different packages, or mix a
   clause with clause-less files. The directory keeps the clause equal to its path's assumed name
   when some file declares it, else the clause of its byte-wise first file by name (a file with a
   clause beating a clause-less one); the other files are ignored, each reported at its clause (or
   1:1). A clause recovered from a parse error takes part.
   - `INVALID_PACKAGE_PATH` — a package whose derived path is invalid, reported at each of its
     files' clauses.
4. `DUPLICATE_PACKAGE` — two directories yielding one import path (overlapping modules), or two
   paths differing only in case: the byte-wise first directory by physical path is kept, whatever
   the input order, and the error is reported at every file of every colliding directory.

A **kept package** survives every step. `PACKAGE_NAME_MISMATCH` is then reported at each file of
a kept package whose clause is not its path's assumed name (a recovered clause is exempt). An
ignored file still reports its parse errors, counts toward no totals, and is left out of the AST.
