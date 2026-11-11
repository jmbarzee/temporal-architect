# Corpus

Small `.twf` designs, each authored into every supported SDK and built and tested in CI. Together they cover each construct group once; they are a sample, not an exhaustive harness. Modeled on [`temporalio/features`](https://github.com/temporalio/features).

| Design | Covers |
|---|---|
| [`nexus`](./nexus/nexus.twf) | Nexus service, sync and async operations, caller and handler, `detach nexus`, endpoints |
| [`messages`](./messages/messages.twf) | signal, query and update handlers, `await signal`, `promise <- signal`, `await update` |
| [`concurrency`](./concurrency/concurrency.twf) | `await all`, `await one`, `detach workflow`, child workflows, timers |
| [`continue-as-new`](./continue-as-new/continue-as-new.twf) | `close continue_as_new`, `await timer` |
| [`failure`](./failure/failure.twf) | a branch failure in `await all`, in the main body and in an update handler; no copy yet in go, python, dotnet, ruby, rust, clojure, perl, elixir, erlang, swift, haskell |

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
  mix.exs                globs */elixir; elixir_support/ holds the Elixir support the designs share
  rebar.config           with rebar.config.script, globs */erlang; erlang_support/ holds the Erlang support the designs share, erlang_test/ its suite
  Package.swift          one test target per design, its path the design's swift/
  cabal.project          with corpus.cabal; builds the pinned hs-temporal-sdk checkout; haskell/ holds the shared Harness.hs and Arrivals.hs
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
    elixir/              its Elixir output, tests beside sources, recorded histories/ to replay; nexus has none (no Nexus at the pin)
      <design>.twf       the design plus only @sdk(elixir, …)
    erlang/              its Erlang output, Common Test suites beside sources, recorded histories/ to replay; nexus has none (no Nexus at the pin)
      <design>.twf       the design plus only @sdk(erlang, …)
    swift/               its Swift output, a test target; nexus has none (Swift has no Nexus)
      <design>.twf       the design plus only @sdk(swift, …)
    haskell/             its Haskell output, one test suite; nexus/haskell/ handles Hello only (Greet has no Haskell handler) and stands in for detach nexus (TryCancel, because ABANDON is unreachable at the pin; see skills/temporal-architect-author-haskell/reference/detach.md)
      <design>.twf       the design plus only @sdk(haskell, …)
```

Each SDK's copy of the design names only its own implementation, so no worker carries two SDKs. `check-corpus` checks every `.twf` file on its own (a directory check would load the copies together) and fails when a copy, its `@sdk` lines stripped, differs from the design.

Each output registers the `.twf` names, implements every workflow and activity, and tests each workflow with the SDK's time-skipping test environment, so no Temporal server is needed. Perl's tests need a dev server: sdk-perl has no time-skipping environment, so each test file starts `temporal server start-dev` on a free port and waits in real time. Elixir's need one too, started with the server's time skipping enabled, since its SDK has no test environment; it skips `nexus` and `messages`' `update Review`, which the SDK lacks. Erlang's run the same way on the same SDK pin.

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
make corpus-elixir      # check the corpus, then mix deps.get (locked), compile (warnings as errors) and mix test
make corpus-erlang      # check the corpus, then rebar3 compile (warnings as errors, rebar.lock unchanged) and rebar3 ct
make corpus-swift       # check the corpus, then swift build (warnings are errors, resolved versions) and swift test
make corpus-haskell     # check the corpus, then check out the pinned SDK and cabal test (-Werror, frozen)
```

`corpus-elixir` and `corpus-erlang` need a dev server at `TEMPORAL_ADDRESS` (default `127.0.0.1:7233`): `temporal server start-dev --headless --dynamic-config-value frontend.WorkflowTimeSkippingEnabled=true`. rebar3 builds under `_build/rebar3/`, clear of mix's `_build/<env>/`. It ignores a dependency's own lockfile, so `rebar.lock` and `mix.lock` resolve different `cowlib` versions for the one SDK pin.

## Add an SDK

1. Author each design into `<design>/<sdk>/`, beside a copy of `<design>.twf` carrying only its `@sdk`, with the project file at the corpus root. A Maven SDK lists each design's source root in its pom, and Swift each design in `Package.swift`; a Cargo SDK globs its members (`*/rust`), and mix its paths (`*/elixir`).
2. Add a `corpus-<sdk>` target to the [Makefile](../Makefile) that depends on `check-corpus`, then builds and tests those outputs. A target that names designs iterates `$(call corpus_designs,<sdk>)`, the designs found by `corpus/*/*.twf` that hold its copy, never a directory glob, so a dependency directory such as `node_modules` is never checked or built.
3. Add `<sdk>` to the `corpus` job's matrix in [ci.yml](../.github/workflows/ci.yml), with a setup step if the runner lacks its toolchain. An SDK whose tests need a Temporal server, as Perl's and Elixir's do, adds `temporalio/setup-temporal` as a step gated on `matrix.sdk`.

## Add a design

Write `<design>/<design>.twf`, then author it into every SDK as "Add an SDK" step 1 describes, adding its source root to the pom for a Maven SDK and its name to `Package.swift` for Swift; a Cargo or mix SDK globs its members, so needs no edit.
