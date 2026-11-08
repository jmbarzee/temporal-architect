# Corpus

Small `.twf` designs, each authored into every supported SDK and built and tested in CI. Together they cover each construct group once; they are a sample, not an exhaustive harness. Modeled on [`temporalio/features`](https://github.com/temporalio/features).

| Design | Covers |
|---|---|
| [`nexus`](./nexus/nexus.twf) | Nexus service, sync and async operations, caller and handler, `detach nexus`, endpoints |
| [`messages`](./messages/messages.twf) | signal, query and update handlers, `await signal`, `promise <- signal`, `await update` |
| [`concurrency`](./concurrency/concurrency.twf) | `await all`, `await one`, `detach workflow`, child workflows, timers |
| [`continue-as-new`](./continue-as-new/continue-as-new.twf) | `close continue_as_new`, `await timer` |

## Layout

```
corpus/
  go.mod                 one project per SDK, at the corpus root
  package.json
  pyproject.toml
  pom.xml
  Gemfile
  pom-clojure.xml
  Cargo.toml             a workspace whose root package, testkit.rs, is Rust's time-skipping kit
  composer.json
  Package.swift          one test target per design, its path the design's swift/
  <design>/
    <design>.twf         the design, with no @sdk
    go/                  its Go output, per skills/temporal-architect-author-go
      <design>.twf       the design plus only @sdk(go, …)
    typescript/          its TypeScript output
      <design>.twf       the design plus only @sdk(typescript, …)
    python/              its Python output, as top-level modules
      <design>.twf       the design plus only @sdk(python, …)
    java/                its Java output, tests beside sources
      <design>.twf       the design plus only @sdk(java, …)
    perl/                its Perl output, one attributed class per .pm, tests in t/
      <design>.twf       the design plus only @sdk(perl, …)
    ruby/                its Ruby output; nexus/ruby/ is caller-only (Ruby has no Nexus handler)
      <design>.twf       the design plus only @sdk(ruby, …)
    clojure/             its Clojure output, a source root holding <design>/*.clj; nexus has none (Clojure has no Nexus API)
      <design>.twf       the design plus only @sdk(clojure, …)
    rust/                its Rust output, a workspace member; nexus/rust/ is caller-only (Rust has no Nexus handler)
      <design>.twf       the design plus only @sdk(rust, …)
    php/                 its PHP output, tests beside sources; nexus has none (PHP has no Nexus)
      <design>.twf       the design plus only @sdk(php, …)
    swift/               its Swift output, a test target; nexus has none (Swift has no Nexus)
      <design>.twf       the design plus only @sdk(swift, …)
```

Each SDK's copy of the design names only its own implementation, so no worker carries two SDKs. `check-corpus` checks every `.twf` file on its own (a directory check would load the copies together) and fails when a copy, its `@sdk` lines stripped, differs from the design.

Each output registers the `.twf` names, implements every workflow and activity, and tests each workflow with the SDK's time-skipping test environment, so no Temporal server is needed. Perl's tests need a dev server: sdk-perl has no time-skipping environment, so each test file starts `temporal server start-dev` on a free port and waits in real time.

## Run

```shell
make corpus-go          # check the corpus, then go vet and go test the Go outputs
make corpus-typescript  # check the corpus, then npm ci, tsc and the node:test suites
make corpus-python      # check the corpus, then uv sync, mypy and pytest in each design's python/
make corpus-dotnet      # check the corpus, then dotnet restore (locked) and dotnet test
make corpus-java        # check the corpus, then javac -Werror and the JUnit suites via the Maven wrapper
make corpus-perl        # check the corpus, then perl -c and prove in each design's perl/ (needs the temporal CLI and sdk-perl, see perl-lib/install-sdk.sh)
make corpus-ruby        # check the corpus, then bundle install (locked), ruby -wc and Minitest in each design's ruby/
make corpus-clojure     # check the corpus, then the clojure.test suites via the Maven wrapper and pom-clojure.xml
make corpus-rust        # check the corpus, then cargo clippy (-D warnings) and cargo test, locked
make corpus-php         # check the corpus, then composer install (locked), dload (rr, test server), PHPStan and PHPUnit
make corpus-swift       # check the corpus, then swift build (warnings are errors, resolved versions) and swift test
```

## Add an SDK

1. Author each design into `<design>/<sdk>/`, beside a copy of `<design>.twf` carrying only its `@sdk`, with the project file at the corpus root. A Maven SDK lists each design's source root in its pom, and Swift each design in `Package.swift`; a Cargo SDK globs its members (`*/rust`).
2. Add a `corpus-<sdk>` target to the [Makefile](../Makefile) that depends on `check-corpus`, then builds and tests those outputs. The targets iterate `CORPUS_DESIGNS`, the designs found by `corpus/*/*.twf`, never a directory glob, so a dependency directory such as `node_modules` is never checked or built.
3. Add `<sdk>` to the `corpus` job's matrix in [ci.yml](../.github/workflows/ci.yml), with a setup step if the runner lacks its toolchain. An SDK whose tests need a Temporal server, as Perl's do, adds `temporalio/setup-temporal` as a step gated on `matrix.sdk`.

## Add a design

Write `<design>/<design>.twf`, then author it into every SDK as "Add an SDK" step 1 describes, adding its source root to the pom for a Maven SDK and its name to `Package.swift` for Swift; a Cargo SDK globs its members, so needs no edit.
