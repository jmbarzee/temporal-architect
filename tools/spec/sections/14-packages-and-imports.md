# Packages and Imports

Packages group symbols so that references can cross file and directory boundaries. This section
freezes the **syntax and surface**. Cross-package *resolution* — following an import to the package
it names and binding a qualified reference to a symbol there — is implemented: a qualified reference
resolves against the package with exactly the imported path, and an import whose package is not in
the run is **treated as external**, so qualified references through it resolve as external.
See [Referencing Symbols](#referencing-symbols) below and the resolver diagnostics in
[the twf CLI reference](../../lsp/cmd/twf/README.md#diagnostic-codes).

## Package Clause

A file may begin with a single, optional package clause:

```
package_clause ::= 'package' IDENT NEWLINE
```

- **At most one** `package` clause per file, and it must be the **first clause** (before any
  `import` declarations and any definitions). A `package` line anywhere else, or a second one, is
  a parse error and the file is ignored.
- The name is **one identifier**. A clause that fails to parse (`package a.b`, `package nexus`)
  keeps the name of the token after `package` and reports the parse error; with no name to take
  (`package "x"`), the file is ignored.
- A `package` is a **compile-time, directory-scoped symbol-grouping construct**. It groups the
  symbols (workflows, activities, nexus services) declared across the files of a directory into
  one namespace of names, so that the same short name can appear in genuinely different packages
  without colliding, and so that a reference can name the owning package.
- A `package` has **no runtime meaning**. It is not a deployment construct. In particular it is
  **distinct from the Temporal `namespace` keyword** — see
  [Package vs. Namespace](#package-vs-namespace) below. Temporal sees bare names, so one worker
  cannot register two same-named types of one kind from different packages
  ([`WORKER_DUPLICATE_TYPE_NAME`](./03-workers-and-namespaces.md#worker-definitions)).

## Modules

Every file with a package clause belongs to a **module**: the nearest `twf.mod` above it.

```
module example.com/demo   # twf.mod, at the design's root; '#' starts a comment
```

- A package is the input files of **one directory** of a module. Its **import path** is the
  module path joined with the directory's path below the module root: in `module example.com/demo`,
  the directory `fabric/v1` is the package `example.com/demo/fabric/v1`. The module root itself is
  the package whose path is the module path.
- The clause must be the path's **assumed name** — its last element, with a trailing version
  element (`v` and digits) dropped: `…/fabric/v1` is `package fabric`. When that element cannot be
  a package name (`library-temporal-kube`, `yaml.v3`, a keyword), any name is allowed and every
  importer must alias the import.
- One directory holds one package: its files declare the same package, or none.
- Clause-less files are the [implicit default package](#implicit-default-package) and need no
  module.
- Start a module with `twf mod init <module path>` at the design's root. The path is required;
  with none, `twf mod init` exits non-zero and suggests one (from the enclosing module, the
  design's imports, or the Git remote). Any path [15 — Modules](./15-modules.md) accepts works,
  dot-less included (`module acme`); a domain-style path is the convention for packages other
  checkouts import.

| Error | Means | Fix |
|-------|-------|-----|
| `PACKAGE_OUTSIDE_MODULE` | A packaged file has no `twf.mod` above it; the file is ignored | `twf mod init <module path>` at the design's root |
| `PACKAGE_NAME_MISMATCH` | The clause is not the path's assumed name | Rename the clause, or the directory |
| `PACKAGE_CLAUSE_CONFLICT` | A directory holds two packages, or a clause and clause-less files; the others are ignored | One package per directory |
| `INVALID_PACKAGE_PATH` | A package directory's path is not a valid path; the package is ignored | Rename the directory |
| `MODULE_FILE_INVALID` | The `twf.mod` cannot be used; its module's files are ignored | Exactly one `module <path>` line |
| `MODULE_FILE_UNKNOWN_DIRECTIVE` | A `twf.mod` directive other than `module` (warning; ignored) | Remove it |
| `DUPLICATE_MODULE` | A second root declares a module path already in the run; that copy is ignored | Check one copy |
| `DUPLICATE_PACKAGE` | Two directories yield one import path; all but one are ignored | Rename or move one |

An ignored file still reports its parse errors. Which file a conflict keeps, and how inputs are
walked, are in [15 — Modules](./15-modules.md).

## Import Declarations

After the optional package clause, a file may declare zero or more imports. They precede every
definition; an import after a definition is a parse error (the import still binds):

```
import_decl ::= 'import' [IDENT] STRING NEWLINE
```

Two forms (Go-style, alias-first):

- `import "<import path>"` — import the package with exactly that import path and reference it by
  the path's **assumed name**: its last element, with a trailing version element (`v` and digits)
  dropped — `import "github.com/acme/orders/billing/v2"` is referenced as `billing`. The rule is
  modeled on Go's `importPathToAssumedName`. When the assumed name cannot be a package name
  (`library-temporal-kube`, `yaml.v3`), the import needs an alias.
- `import alias "<import path>"` — bind an explicit **alias** as the local reference name. The alias
  names the package only in the importing package; the package imported is always the one with
  exactly that path. Use an alias when two imports would share a qualifier — two packages named
  `fabric` at different paths, or v1 and v2 of one package:
  `import billing "github.com/acme/orders/billing"` beside
  `import billingv2 "github.com/acme/orders/billing/v2"`.

Imports are **package-scoped**: an import line in any file of a package is visible in every file of
that package. A package's own name is bound to itself (`billing.Charge` inside `billing`). Each
import line is checked in order; the first failure reports, and the line binds nothing: references
through its qualifier stay quiet, and the qualifier stays taken, so a later line using it for another
path is `DUPLICATE_IMPORT_NAME`:

| Error | When |
|-------|------|
| `INVALID_IMPORT_PATH` | The path is not a valid path, or is a local one (`./x`) |
| `SELF_IMPORT` | The path is the package's own |
| `IMPORT_NEEDS_ALIAS` | No alias, and the assumed name cannot be a package name |
| `DUPLICATE_IMPORT_NAME` | The qualifier is the package's own name, or is already bound to a different path (the same qualifier for the same path again is one binding) |
| `IMPORT_NOT_FOUND` | The path lies under a module in the run, which has no such package (a typo, a wrong case) |

Otherwise the path names a kept package of the run — **bound** — or names none: if its package is on
disk but not among the inputs, `IMPORT_NOT_LOADED` (warning; pass the directory it names); if it
lies under no module in the run, `UNRESOLVED_IMPORT` (warning). Both treat the package as
**external**: references through it resolve as external, with no `UNDEFINED_*`. If the import's
package is in the inputs but was ignored (see [Modules](#modules)), the import is silent — that
error is already reported (a package whose own `twf.mod` is broken has no path, so an import of it
is `UNRESOLVED_IMPORT` beside its `MODULE_FILE_INVALID`). An import never binds by name: an editor buffer with no file has
no import path, so nothing imports it and its own imports are external unless a package of the run
has exactly their path. An inline source (MCP `source`) is in no module, so a package clause in it
is `PACKAGE_OUTSIDE_MODULE`, as on disk. Import cycles between packages are allowed. How the path is looked up on
disk is in [15 — Modules](./15-modules.md#finding-an-imported-package).

Notes on the string path:

- `as` is a reserved hard keyword registered alongside `package`/`import`; it has no grammar role
  (the aliased-import surface is the leading-identifier form above).

## Referencing Symbols

- **Same-package references are bare**: a symbol declared in the same package is referenced by its
  plain name, exactly as today.
- **Cross-package references are qualified** by the import's qualifier — the path's assumed name,
  per [Import Declarations](#import-declarations), or the import alias: `billing.ChargeCard`.
  A qualified name is written `pkg.Name` and is only legal in the **keyword-led call positions**
  enumerated below.

```
qualified_ref ::= [IDENT '.'] IDENT
```

Qualified names are unambiguous because they appear only after a leading keyword. A qualifier is
recognized in these positions:

- activity calls — `activity billing.ChargeCard(order)`
- workflow calls — `workflow orders.ProcessOrder(order)` (and the `detach` / `promise` / `await` /
  `await one` variants)
- a signal send's workflow-type head — `signal orders.ShipItem.Shipped(t)` (a handle head is never
  qualified)
- worker registration entries — `workflow orders.ProcessOrder`, `activity billing.ChargeCard`,
  `nexus service orders.OrderService` (a third segment, `orders.OrderService.PlaceOrder`, names an
  operation and is always `WORKER_REGISTERS_OPERATION`)
- the nexus **service** reference — `nexus OrderEndpoint orders.OrderService.PlaceOrder(order)`
- the backing-workflow reference of an async nexus operation — `async PlaceOrder workflow orders.ProcessOrder`

A qualifier is **not** recognized on the nexus endpoint or the nexus operation (see the
[nexus qualification table](./04-nexus.md#nexus-qualification-table)), nor on in-workflow
constructs that happen to use a dot — a `signal handle.Name(args)` handle head, `await`/`promise`
ident targets, and `set`/`unset` condition names are never package-qualified.

## Implicit Default Package

A file **without** a `package` clause belongs to an **implicit default package**. The default
package is **elided from all formatting** — it never appears in a node-ID, a key, a `--json`
field, or a diagnostic message. Because every current file is single-package and nothing relies on
cross-file flat-merge, this rule makes the feature **purely additive**: all existing node-IDs,
error messages, and `--json` output for clause-less files stay **byte-identical** to before this
change.

A reference that is bare, or that names the file's own package, resolves exactly as it does today.
A qualifier that names an *imported* package resolves against that package; if the import is
unresolved (its package is absent from the tree), it is treated as external and the qualified
reference resolves as external.

## Package vs. Namespace

`package` and `namespace` are unrelated keywords and must not be confused:

| Keyword | Meaning | Scope | Runtime effect |
|---------|---------|-------|----------------|
| `package` | Compile-time symbol grouping | A directory of `.twf` files | None — it only groups and qualifies names |
| `namespace` | Temporal deployment topology (unchanged) | A Temporal namespace instantiating workers/endpoints | Real — it is the existing Temporal deployment construct |

`namespace` remains exactly what it was (see
[Worker and Namespace Definitions](./03-workers-and-namespaces.md)). Introducing `package` does not
change it. A `namespace` block is deployment topology; a `package` clause is a compile-time grouping
of symbol names with no bearing on where or how anything is deployed.
