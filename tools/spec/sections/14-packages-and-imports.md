# Packages and Imports

Packages group symbols so that references can cross file and directory boundaries. This section
freezes the **syntax and surface**. Cross-package *resolution* — following an import to the package
it names and binding a qualified reference to a symbol there — is implemented: a qualified reference
resolves against the imported package that owns the symbol, and an import whose package is absent
from the tree is **treated as external**, so qualified references through it resolve as external.
See [Referencing Symbols](#referencing-symbols) below and the resolver diagnostics in
[the twf CLI reference](../../lsp/cmd/twf/README.md#diagnostic-codes).

## Package Clause

A file may begin with a single, optional package clause:

```
package_clause ::= 'package' IDENT NEWLINE
```

- **At most one** `package` clause per file, and it must be the **first clause** (before any
  `import` declarations and any definitions).
- A `package` is a **compile-time, directory-scoped symbol-grouping construct**. It groups the
  symbols (workflows, activities, nexus services) declared across the files of a directory into
  one namespace of names, so that the same short name can appear in genuinely different packages
  without colliding, and so that a reference can name the owning package.
- A `package` has **no runtime meaning**. It is not a deployment construct. In particular it is
  **distinct from the Temporal `namespace` keyword** — see
  [Package vs. Namespace](#package-vs-namespace) below.

## Import Declarations

After the optional package clause, a file may declare zero or more imports:

```
import_decl ::= 'import' [IDENT] STRING NEWLINE
```

Two forms (Go-style, alias-first):

- `import "<full/module/path>"` — import a package and reference it by its **leaf name** (the last
  path segment). For example, `import "github.com/acme/orders/billing"` is referenced as
  `billing`.
- `import alias "<full/module/path>"` — bind an explicit **alias** (the leading identifier) for the
  package, used to disambiguate when two imported packages would otherwise share the same leaf
  name. For example, `import billingv2 "github.com/acme/orders/billing/v2"`.

Notes on the string path:

- The path is the **full module-prefixed path** and is carried **verbatim** as a future
  global-lookup key. It is **not enforced** in this slice — a single directory tree is assumed and
  there is no global package management (no `go.mod`-style marker). Path validation and
  module-resolution are future work.
- `as` is a reserved hard keyword registered alongside `package`/`import` in this slice; it has no
  grammar role here (the aliased-import surface is the leading-identifier form above).

## Referencing Symbols

- **Same-package references are bare**: a symbol declared in the same package is referenced by its
  plain name, exactly as today.
- **Cross-package references are qualified** by the package **leaf name** (or the import alias):
  `billing.ChargeCard`. A qualified name is written `pkg.Name` and is only legal in the
  **keyword-led call positions** enumerated below.

```
qualified_ref ::= [IDENT '.'] IDENT
```

Qualified names are unambiguous because they appear only after a leading keyword. A qualifier is
recognized in these positions:

- activity calls — `activity billing.ChargeCard(order)`
- workflow calls — `workflow orders.ProcessOrder(order)` (and the `detach` / `promise` / `await` /
  `await one` variants)
- worker registration entries — `workflow orders.ProcessOrder`, `activity billing.ChargeCard`,
  `nexus service orders.OrderService`
- the nexus **service** reference — `nexus OrderEndpoint orders.OrderService.PlaceOrder(order)`
- the backing-workflow reference of an async nexus operation — `async PlaceOrder workflow orders.ProcessOrder`

A qualifier is **not** recognized on the nexus endpoint or the nexus operation (see the
[nexus qualification table](./04-nexus.md#nexus-qualification-table)), nor on in-workflow
constructs that happen to use a dot — the `signal handle.Name(args)` send target, `await`/`promise`
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
