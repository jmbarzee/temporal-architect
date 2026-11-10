# ── Configuration ────────────────────────────────────────────────────────────

# Local arch by default — no cross-compilation needed for dev
GOOS   ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

# Toolchain-local output dir for the compiled binary and release archives.
# Everything under dist/ is gitignored and rebuilt from source. The compiled
# binary no longer lands in an extension tree — packages/ moved to the
# distribution repo (jmbarzee/temporal-architect-dist).
BIN_DIR := dist/bin

# Version stamped into the twf binary (printed by `twf version`). Release/CI
# builds pass VERSION explicitly; local dev builds fall back to `git describe`,
# then "dev". A leading "v" is stripped so the value matches package versions.
TWF_VERSION := $(patsubst v%,%,$(VERSION))
ifeq ($(strip $(TWF_VERSION)),)
TWF_VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
endif

# All supported binary platforms (CI release matrix).
# Format: label:GOOS:GOARCH
PLATFORMS := \
	darwin-arm64:darwin:arm64 \
	darwin-x64:darwin:amd64 \
	linux-x64:linux:amd64 \
	linux-arm64:linux:arm64 \
	win32-x64:windows:amd64

# ── Dev shortcuts ────────────────────────────────────────────────────────────
# These build for the local platform only.

.PHONY: build

## Build the toolchain for the local platform (binary + the visualizer library)
build: build-lsp build-visualizer-lib

# ── Build targets ────────────────────────────────────────────────────────────

.PHONY: build-lsp build-twf-archive build-skills-archive build-visualizer-lib

## Build the twf binary for the current (or specified) platform
build-lsp:
	@mkdir -p $(BIN_DIR)
	cd tools/lsp && \
		GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 \
		go build -ldflags "-X main.version=$(TWF_VERSION)" -o ../../$(BIN_DIR)/twf$(if $(filter windows,$(GOOS)),.exe) ./cmd/twf
	@echo "Built twf $(TWF_VERSION) for $(GOOS)/$(GOARCH)"

## Package the twf binary into a standalone archive for release.
## VERSION may be passed with or without a leading "v"; the archive is always
## named twf-v<X.Y.Z>-<goos>-<goarch>.{tar.gz,zip}.
##
## The archive also carries the binary-covering doc fragments (docs/*.md) so the
## engine's published pitch ships *inside* the artifact it describes — the
## distribution repo reads these directly when composing its listings. No `twf
## docs` command; plain markdown. See docs/README.md.
## Usage: make build-twf-archive VERSION=1.2.3 GOOS=darwin GOARCH=arm64
build-twf-archive: build-lsp
	@mkdir -p dist
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	ARCHIVE=twf-v$$VER-$(GOOS)-$(GOARCH); \
	rm -rf dist/docs && mkdir -p dist/docs; \
	cp docs/fragments/global.md docs/fragments/parser.md docs/fragments/mcp.md dist/docs/; \
	if [ "$(GOOS)" = "windows" ]; then \
		cp $(BIN_DIR)/twf.exe dist/twf.exe; \
		cd dist && zip -rq $$ARCHIVE.zip twf.exe docs && rm -rf twf.exe docs; \
	else \
		cp $(BIN_DIR)/twf dist/twf; \
		cd dist && tar czf $$ARCHIVE.tar.gz twf docs && rm -rf twf docs; \
	fi; \
	echo "Packaged $$ARCHIVE (binary + docs fragments)"

## Package the skills/ tree into a deterministic release asset.
## VERSION may be passed with or without a leading "v"; the archive is always
## named skills-v<X.Y.Z>.tar.gz.
## Usage: make build-skills-archive VERSION=1.2.3
build-skills-archive:
	@mkdir -p dist
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	OUT=dist/skills-v$$VER.tar.gz; \
	go run ./internal/release/gen-skills-manifest --source skills --out $$OUT --version v$$VER; \
	echo "Packaged $$OUT"

## Build the visualizer as a publishable npm library (ESM + types + sibling CSS).
## The VS Code webview IIFE bundle is built in the distribution repo from this
## published library (packages/webview); the toolchain no longer builds it.
build-visualizer-lib: tools/visualizer/node_modules/.package-lock.json
	cd tools/visualizer && npm run build:lib
	@echo "Built visualizer (npm library)"

# ── Release asset packaging + library publish ────────────────────────────────
# The toolchain cuts a GitHub Release of primitive artifacts that the
# distribution repo (jmbarzee/temporal-architect-dist) downloads to build every
# end-user consumption model (CLI, VSIX, claude-plugin, …). The toolchain's own
# *libraries* (visualizer, wire-types) it both attaches to the Release — so dist
# can consume them at build time via file: — and publishes to npm itself, where
# their repository.url matches and provenance succeeds.

.PHONY: pack-visualizer-lib pack-wire-types publish-npm-libs

## Pack the visualizer npm library into a release tarball (dist/).
## The published version is stamped from VERSION at pack time (never committed —
## the manifest holds a 0.0.0-dev placeholder); with no VERSION the tarball packs
## as 0.0.0-dev for local testing. The stamp is reverted after packing so a local
## run never leaves the manifest dirty.
pack-visualizer-lib: build-visualizer-lib
	@mkdir -p dist
	@# Drop any stale tarballs first so dist/ holds only the freshly-packed
	@# version. npm pack names the file by the manifest version, so iterative
	@# local builds across versions otherwise accumulate (the dist repo's
	@# file: copy then matches more than one and breaks).
	@rm -f dist/temporal-architect-visualizer-*.tgz
	@$(call npm-pack-stamped,tools/visualizer,visualizer lib,@temporal-architect/wire-types)

## Pack the wire-types type-only package into a release tarball (dist/).
## Version handling matches pack-visualizer-lib (stamped from VERSION at pack).
pack-wire-types:
	@mkdir -p dist
	@rm -f dist/temporal-architect-wire-types-*.tgz
	@$(call npm-pack-stamped,tools/wire-types,wire-types)

# npm-pack-stamped <module-dir> <label> [<in-tree deps>]: stamp the release
# version from VERSION (leading "v" stripped) into the module's manifest, npm pack
# into dist/, then restore the manifest to its pre-stamp contents. VERSION empty ->
# pack the 0.0.0-dev placeholder. Each in-tree dependency's file: spec, which no
# tarball can resolve, is pinned to the packed version, the placeholder included,
# so the tarball installs beside the sibling tarball packed at that version.
# `npm version` rewrites package.json AND package-lock.json, so both are backed up
# by content (not `git checkout`, which would clobber any uncommitted manifest
# edits) and restored regardless of pack success.
define npm-pack-stamped
VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
cd $(1) && \
cp package.json .pack-bak.package.json; \
[ -f package-lock.json ] && cp package-lock.json .pack-bak.package-lock.json; \
if [ -n "$$VER" ]; then npm version "$$VER" --no-git-tag-version --allow-same-version >/dev/null; fi; \
for d in $(3); do npm pkg set "dependencies.$$d=$$(npm pkg get version | tr -d '"')"; done; \
npm pack --pack-destination ../../dist; status=$$?; \
mv .pack-bak.package.json package.json; \
[ -f .pack-bak.package-lock.json ] && mv .pack-bak.package-lock.json package-lock.json; \
[ $$status -eq 0 ] && echo "Packed $(2) tarball into dist/"; \
exit $$status
endef

## Publish the toolchain's two libraries to npm from their packed tarballs.
## CI-only: relies on OIDC trusted publishing (no NPM_TOKEN). --provenance
## succeeds because each package's repository.url points at this repo. Requires
## the dist/*.tgz produced by pack-visualizer-lib + pack-wire-types.
## Usage: make publish-npm-libs VERSION=1.2.3
publish-npm-libs:
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	npm publish --access public --provenance ./dist/temporal-architect-wire-types-$$VER.tgz; \
	npm publish --access public --provenance ./dist/temporal-architect-visualizer-$$VER.tgz; \
	echo "Published wire-types + visualizer $$VER to npm"

# ── Test targets ─────────────────────────────────────────────────────────────

.PHONY: test vet typecheck typecheck-visualizer test-visualizer verify-visualizer

## Run every typecheck gate
typecheck: typecheck-visualizer

## Install the visualizer from its lockfile whenever the lockfile moves past the install.
tools/visualizer/node_modules/.package-lock.json: tools/visualizer/package-lock.json
	cd tools/visualizer && npm ci

## Typecheck the visualizer (strict tsc, no emit).
typecheck-visualizer: tools/visualizer/node_modules/.package-lock.json
	cd tools/visualizer && ./node_modules/.bin/tsc --noEmit

## Run the visualizer's unit tests. Not part of `make test`, which is Go-only.
test-visualizer: tools/visualizer/node_modules/.package-lock.json
	cd tools/visualizer && npm test

## The visualizer gate CI runs: its unit tests.
verify-visualizer: test-visualizer

## Run Go tests
# tools/sampler is its own module (resolved against ../lsp via the repo-root
# go.work), so `./...` from tools/lsp does not reach it. Both must be listed or
# the sampler ships untested.
test:
	cd tools/lsp && go test ./...
	cd tools/sampler && go test ./...
	cd internal/tabify && go test ./...

## Run Go vet
vet:
	cd tools/lsp && go vet ./...
	cd tools/sampler && go vet ./...
	cd internal/tabify && go vet ./...

# ── Corpus targets ───────────────────────────────────────────────────────────
# See corpus/README.md. CI runs `make corpus-<sdk>` once per matrix entry.

.PHONY: check-corpus corpus-go corpus-python corpus-typescript corpus-dotnet corpus-java corpus-ruby corpus-clojure corpus-rust corpus-php
.PHONY: corpus-perl
.PHONY: corpus-elixir
.PHONY: corpus-swift
.PHONY: corpus-haskell

# A design is a corpus directory holding a .twf; node_modules is not one.
CORPUS_DESIGNS := $(patsubst corpus/%/,%,$(sort $(dir $(wildcard corpus/*/*.twf))))

## Check each corpus design and each SDK's copy of it file by file (a directory
## check would load the copies together), and fail if a copy differs from its
## design in anything but its @sdk lines.
check-corpus: build-lsp
	for d in $(CORPUS_DESIGNS); do \
		$(BIN_DIR)/twf check corpus/$$d/$$d.twf || exit 1; \
		for c in corpus/$$d/*/$$d.twf; do \
			$(BIN_DIR)/twf check $$c || exit 1; \
			grep -v '^@sdk' $$c | diff -u corpus/$$d/$$d.twf - || { echo "$$c drifts from corpus/$$d/$$d.twf"; exit 1; }; \
		done; \
	done

## Check the corpus, then vet and test its Go outputs. The corpus is a user's
## project, not part of the toolchain workspace, so go.work is off. The
## packages are named so that ./... does not walk corpus/node_modules.
corpus-go: check-corpus
	cd corpus && GOWORK=off go vet $(CORPUS_DESIGNS:%=./%/go/...) && GOWORK=off go test $(CORPUS_DESIGNS:%=./%/go/...)

## Check the corpus, then typecheck and test its Python outputs, design by
## design: each design's modules (worker.py, workflows.py) are top-level, so
## one run over several designs would import one design's worker as another's.
corpus-python: check-corpus
	cd corpus && uv sync --locked
	for d in $(CORPUS_DESIGNS); do \
		( cd corpus/$$d/python && uv run --locked mypy . && uv run --locked pytest -q ) || exit 1; \
	done

## Check the corpus, then typecheck and test its TypeScript outputs.
corpus-typescript: check-corpus
	cd corpus && npm ci && npx tsc -p . && npm test

## Check the corpus, then restore (pinned by packages.lock.json), build and test its .NET outputs.
corpus-dotnet: check-corpus
	cd corpus && dotnet restore --locked-mode && dotnet test --no-restore

## Check the corpus, then compile (javac -Werror) and test its Java outputs.
corpus-java: check-corpus
	cd corpus && ./mvnw -B -q verify

## Check the corpus, then compile and test its Perl outputs, design by design
## (each design's modules are top-level). sdk-perl has no time-skipping
## environment, so each test file starts a dev server through the temporal CLI.
corpus-perl: check-corpus
	for d in $(CORPUS_DESIGNS); do \
		( cd corpus/$$d/perl && for m in *.pm; do perl -I. -I../../perl-lib -c $$m || exit 1; done && prove t ) || exit 1; \
	done

## Check the corpus, then syntax-check (ruby -wc) and test (Minitest) its Ruby
## outputs design by design, against the gems pinned by Gemfile.lock.
corpus-ruby: check-corpus
	cd corpus && BUNDLE_FROZEN=true bundle install --quiet
	for d in $(CORPUS_DESIGNS); do \
		( cd corpus/$$d/ruby && for f in *.rb; do ruby -wc $$f >/dev/null || exit 1; done && \
		  BUNDLE_GEMFILE=../../Gemfile bundle exec ruby -e 'Dir["*_test.rb"].sort.each { |f| require File.expand_path(f) }' ) || exit 1; \
	done

## Check the corpus, then test its Clojure outputs via the Maven wrapper.
corpus-clojure: check-corpus
	cd corpus && ./mvnw -B -q -f pom-clojure.xml verify

## Check the corpus, then lint (clippy -D warnings) and test its Rust outputs: one Cargo
## workspace whose members are the designs' rust/ directories (Cargo.lock pins them).
corpus-rust: check-corpus
	cd corpus && cargo clippy --locked --workspace --all-targets -- -D warnings && cargo test --locked --workspace

## Check the corpus, then fetch (pinned by mix.lock), compile (warnings as errors) and test its
## Elixir outputs against a dev server at TEMPORAL_ADDRESS (default 127.0.0.1:7233) started with
## --dynamic-config-value frontend.WorkflowTimeSkippingEnabled=true.
corpus-elixir: check-corpus
	cd corpus && MIX_ENV=test mix deps.get --check-locked && MIX_ENV=test mix compile && mix test

## Check the corpus, then install (composer.lock), fetch rr and the test server (dload.xml),
## analyse (PHPStan) and test its PHP outputs; the PHPUnit bootstrap starts both binaries.
## Composer installs into php/vendor/: a corpus/vendor/ beside go.mod would switch Go to vendor
## mode, and dload finds its autoloader only in a directory named vendor.
corpus-php: check-corpus
	cd corpus && composer install --no-interaction --no-progress && php/vendor/bin/dload get -n -q && php/vendor/bin/phpstan analyse --no-progress && php/vendor/bin/phpunit

## Check the corpus, then build (warnings are errors) and test its Swift outputs under the
## TestKit's time-skipping server, against the packages pinned by Package.resolved.
corpus-swift: check-corpus
	cd corpus && swift build --build-tests --force-resolved-versions && swift test --skip-build

## Check the corpus, then build (-Wall -Werror) and test its Haskell outputs, pinned by
## cabal.project.freeze and the hs-temporal-sdk commit, which is checked out into corpus/ and
## built as local packages (see corpus/cabal.project). The clone may already hold CI's cached
## Rust target/, so it is initialized in place rather than cloned.
HS_TEMPORAL_SDK_REV := e57a0ae8f7458777d06c82d77dfa8cde14eed58c
corpus-haskell: check-corpus
	test -d corpus/.hs-temporal-sdk/.git || git init -q corpus/.hs-temporal-sdk
	git -C corpus/.hs-temporal-sdk cat-file -e $(HS_TEMPORAL_SDK_REV) 2>/dev/null || \
		git -C corpus/.hs-temporal-sdk fetch -q --depth 1 https://github.com/MercuryTechnologies/hs-temporal-sdk $(HS_TEMPORAL_SDK_REV)
	git -C corpus/.hs-temporal-sdk checkout -q $(HS_TEMPORAL_SDK_REV)
	cd corpus && cabal test all

# ── Docs targets ─────────────────────────────────────────────────────────────

.PHONY: gen-docs check-docs check-tabs

## Regenerate the twf command reference (tools/lsp/cmd/twf/COMMANDS.md) from the
## cobra command tree. The binary is the single source of truth for flags/help.
gen-docs:
	cd tools/lsp && go run ./cmd/twf gen-docs --out cmd/twf/COMMANDS.md
	@echo "Regenerated tools/lsp/cmd/twf/COMMANDS.md"

## Fail if a tracked .twf file or ```twf Markdown block is not tab-indented.
check-tabs:
	go run ./internal/tabify -check

## Fail if the committed command reference has drifted from the command tree,
## or any TWF is not tab-indented.
check-docs: gen-docs check-tabs
	@git diff --exit-code -- tools/lsp/cmd/twf/COMMANDS.md \
		|| { echo "COMMANDS.md is stale — run 'make gen-docs' and commit the result."; exit 1; }

# ── Wire-types targets ───────────────────────────────────────────────────────

.PHONY: gen-types check-types

# tygo version is pinned here so local and CI generation are byte-identical.
TYGO_VERSION := v0.2.21

## Regenerate the TypeScript projection of twf's JSON wire contract
## (tools/wire-types/src/generated/) from the Go DTO structs — the single source
## of truth. The hand-written sibling residue.ts holds the discriminated overlays
## and string-literal enums tygo can't express, and index.ts is the public API;
## keep them in step by hand. @temporal-architect/wire-types ships as a published
## release artifact (consumed type-only by the visualizer and the extension).
gen-types:
	@mkdir -p tools/wire-types/src/generated
	go run github.com/gzuidhof/tygo@$(TYGO_VERSION) generate --config tools/wire-types/tygo.yaml
	@echo "Regenerated tools/wire-types/src/generated/"

## Fail if the committed generated wire types have drifted from the Go DTOs.
check-types: gen-types
	@git diff --exit-code -- tools/wire-types/src/generated \
		|| { echo "Generated wire types are stale — run 'make gen-types' and commit the result."; exit 1; }

# ── Release targets ──────────────────────────────────────────────────────────
# Cut a release by pushing the version tag — nothing else. The `v*` tag triggers
# release.yml, which stamps the version into every artifact at build time (npm
# libs, twf binary, skills tarball) and dispatches to the distribution repo. No
# version is committed; the tag is the single source of truth.
#   make release TYPE=patch        (auto-bump from latest tag)
#   make release TYPE=minor
#   make release TYPE=major
#   make release VERSION=1.2.3     (explicit version)
#
# The tag is cut on the current commit, which MUST be on origin/main (the release
# workflow's release-guard job re-checks this and refuses to publish otherwise).

.PHONY: release release-patch release-minor release-major

release-patch:
	$(MAKE) release TYPE=patch

release-minor:
	$(MAKE) release TYPE=minor

release-major:
	$(MAKE) release TYPE=major

release:
	$(eval NEW_VERSION := $(shell bash internal/version.sh "$(VERSION)" "$(TYPE)"))
	@if [ -z "$(NEW_VERSION)" ]; then exit 1; fi
	@# Refuse to tag anything that isn't already on origin/main. Fast local
	@# mirror of the release-guard CI job; the CI check is authoritative.
	@git fetch --quiet origin main
	@git merge-base --is-ancestor HEAD origin/main \
		|| { echo "Refusing to release: HEAD is not on origin/main. Release from main."; exit 1; }
	@echo "Releasing v$(NEW_VERSION) at $$(git rev-parse --short HEAD) (on main)"
	git tag "v$(NEW_VERSION)"
	git push origin "v$(NEW_VERSION)"
	@echo "Pushed v$(NEW_VERSION) — release workflow will stamp, publish, and dispatch to dist"

# ── Clean ────────────────────────────────────────────────────────────────────

.PHONY: clean

## Remove all build artifacts
clean:
	rm -rf dist/ tools/visualizer/dist tools/visualizer/dist-lib
	rm -f tools/visualizer/LICENSE tools/wire-types/LICENSE tools/visualizer/FRAGMENT.md
	@echo "Cleaned"
