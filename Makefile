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

.PHONY: build clean

## Build the toolchain for the local platform (binary + the two npm libraries)
build: build-lsp build-graph-view-lib build-visualizer-lib

# ── Build targets ────────────────────────────────────────────────────────────

.PHONY: build-lsp build-twf-archive build-skills-archive build-visualizer-lib build-graph-view-lib

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
build-visualizer-lib: tools/graph-view/node_modules/.package-lock.json
	cd tools/visualizer && npm run build:lib
	@echo "Built visualizer (npm library)"

## Build the graph-view library — the visualizer's engine in its own package
## (tools/graph-view). The visualizer consumes it from source through its build's
## alias, so this is the standalone artifact, not a prerequisite of the above.
build-graph-view-lib: tools/graph-view/node_modules/.package-lock.json
	cd tools/graph-view && npm run build:lib
	@echo "Built graph-view (npm library)"

# ── Release asset packaging + library publish ────────────────────────────────
# The toolchain cuts a GitHub Release of primitive artifacts that the
# distribution repo (jmbarzee/temporal-architect-dist) downloads to build every
# end-user consumption model (CLI, VSIX, claude-plugin, …). The toolchain's own
# *libraries* (visualizer, wire-types) it both attaches to the Release — so dist
# can consume them at build time via file: — and publishes to npm itself, where
# their repository.url matches and provenance succeeds.

.PHONY: pack-visualizer-lib pack-graph-view-lib pack-wire-types publish-npm-libs

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
	@$(call npm-pack-stamped,tools/visualizer,visualizer lib)

## Pack the graph-view library into a release tarball (dist/). CI packs it; the
## release workflow (_build-artifacts.yml) does not yet install the sibling or
## attach this tarball — that workflow is outside the refactor's write bounds
## (#187). Not published to npm by publish-npm-libs: publishing a new package
## under the org's scope is a release decision (D62).
pack-graph-view-lib: build-graph-view-lib
	@mkdir -p dist
	@rm -f dist/temporal-architect-graph-view-*.tgz
	@$(call npm-pack-stamped,tools/graph-view,graph-view lib)

## Pack the wire-types type-only package into a release tarball (dist/).
## Version handling matches pack-visualizer-lib (stamped from VERSION at pack).
pack-wire-types:
	@mkdir -p dist
	@rm -f dist/temporal-architect-wire-types-*.tgz
	@$(call npm-pack-stamped,tools/wire-types,wire-types)

# npm-pack-stamped <module-dir> <label>: stamp the release version from VERSION
# (leading "v" stripped) into the module's manifest, npm pack into dist/, then
# restore the manifest to its pre-stamp contents. VERSION empty -> pack the
# 0.0.0-dev placeholder. `npm version` rewrites package.json AND package-lock.json,
# so both are backed up by content (not `git checkout`, which would clobber any
# uncommitted manifest edits) and restored regardless of pack success.
define npm-pack-stamped
VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
cd $(1) && \
cp package.json .pack-bak.package.json; \
[ -f package-lock.json ] && cp package-lock.json .pack-bak.package-lock.json; \
if [ -n "$$VER" ]; then npm version "$$VER" --no-git-tag-version --allow-same-version >/dev/null; fi; \
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

.PHONY: test vet typecheck typecheck-visualizer typecheck-graph-view verify-visualizer gates-visualizer buildlib-graph-view check-visualizer

## Run every typecheck gate
typecheck: typecheck-graph-view typecheck-visualizer typecheck-catalog

## The visualizer's TypeScript program reaches the library's source, whose files
## resolve React from the sibling's own node_modules: with the sibling not
## installed, tsc prints 77 errors and the declarations build swallows them.
## Every target that compiles either package installs the sibling first, so a
## job that installs only the visualizer still builds correctly.
tools/graph-view/node_modules/.package-lock.json: tools/graph-view/package-lock.json
	cd tools/graph-view && npm ci

## Typecheck the visualizer (strict tsc, no emit). Its path map reaches the
## library's source, so this checks the host against the engine as written.
typecheck-visualizer: tools/graph-view/node_modules/.package-lock.json
	cd tools/visualizer && ./node_modules/.bin/tsc --noEmit

## Typecheck the graph-view library on its own (strict tsc, no emit)
typecheck-graph-view: tools/graph-view/node_modules/.package-lock.json
	cd tools/graph-view && ./node_modules/.bin/tsc --noEmit

## Typecheck the library's example host, which the library's own program does not include
typecheck-catalog: tools/graph-view/node_modules/.package-lock.json
	cd tools/graph-view && ./node_modules/.bin/tsc --noEmit -p examples/course-catalog/tsconfig.json

## Compare the visualizer goldens against the committed baseline
verify-visualizer:
	cd tools/visualizer && npm run verify

## Run the visualizer's ratchet gates: vocabulary, import direction, forbidden patterns
gates-visualizer:
	cd tools/visualizer && npm run map -- --check
	cd tools/visualizer && npm run surface-gate
	cd tools/visualizer && npm run leak-gate
	cd tools/visualizer && npm run boundary-gate
	cd tools/visualizer && npm run pattern-gate

## Build the visualizer as a library (Gate 2) — the packaged entry, not the app
#
# The dts gate runs immediately after, because `build:lib` exiting 0 is a weaker
# claim than it sounds: declarations are emitted from an allowlist, and a source
# tree missing from it is silently not written. Unit 2e shipped a `lib.d.ts` that
# re-exported a module the build never emitted, with every gate green.
buildlib-visualizer:
	cd tools/visualizer && npm run build:lib
	cd tools/visualizer && npm run dts-gate

## Build the graph-view library (Gate 2 for the sibling) and gate its published types
buildlib-graph-view:
	cd tools/graph-view && npm run build:lib
	cd tools/graph-view && npm run dts-gate

## Every visualizer gate, in the order a failure is cheapest to read
#
# Gate 2 is in here because it was NOT, and the omission was invisible: this
# aggregate is what runs at every commit boundary, so a library-build break
# would have sat green locally and surfaced only in CI after a push. CI was
# always covered (`make build`); the local loop was the half that lied.
check-visualizer: typecheck-graph-view typecheck-visualizer typecheck-catalog gates-visualizer verify-visualizer buildlib-graph-view buildlib-visualizer

## Run Go tests
# tools/sampler is its own module (resolved against ../lsp via the repo-root
# go.work), so `./...` from tools/lsp does not reach it. Both must be listed or
# the sampler ships untested.
test:
	cd tools/lsp && go test ./...
	cd tools/sampler && go test ./...

## Run Go vet
vet:
	cd tools/lsp && go vet ./...
	cd tools/sampler && go vet ./...

# ── Docs targets ─────────────────────────────────────────────────────────────

.PHONY: gen-docs check-docs

## Regenerate the twf command reference (tools/lsp/cmd/twf/COMMANDS.md) from the
## cobra command tree. The binary is the single source of truth for flags/help.
gen-docs:
	cd tools/lsp && go run ./cmd/twf gen-docs --out cmd/twf/COMMANDS.md
	@echo "Regenerated tools/lsp/cmd/twf/COMMANDS.md"

## Fail if the committed command reference has drifted from the command tree.
check-docs: gen-docs
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
	rm -rf dist/ tools/visualizer/dist tools/visualizer/dist-lib tools/graph-view/dist-lib
	rm -f tools/visualizer/LICENSE tools/wire-types/LICENSE tools/graph-view/LICENSE tools/visualizer/FRAGMENT.md
	@echo "Cleaned"
