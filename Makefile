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

## Build the toolchain for the local platform (binary + visualizer lib)
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
## Usage: make build-twf-archive VERSION=1.2.3 GOOS=darwin GOARCH=arm64
build-twf-archive: build-lsp
	@mkdir -p dist
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	ARCHIVE=twf-v$$VER-$(GOOS)-$(GOARCH); \
	if [ "$(GOOS)" = "windows" ]; then \
		cp $(BIN_DIR)/twf.exe dist/twf.exe; \
		cd dist && zip $$ARCHIVE.zip twf.exe && rm twf.exe; \
	else \
		cp $(BIN_DIR)/twf dist/twf; \
		cd dist && tar czf $$ARCHIVE.tar.gz twf && rm twf; \
	fi; \
	echo "Packaged $$ARCHIVE"

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
build-visualizer-lib:
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
pack-visualizer-lib: build-visualizer-lib
	@mkdir -p dist
	cd tools/visualizer && npm pack --pack-destination ../../dist
	@echo "Packed visualizer lib tarball into dist/"

## Pack the wire-types type-only package into a release tarball (dist/).
pack-wire-types:
	@mkdir -p dist
	cd tools/wire-types && npm pack --pack-destination ../../dist
	@echo "Packed wire-types tarball into dist/"

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

.PHONY: test vet

## Run Go tests
test:
	cd tools/lsp && go test ./...

## Run Go vet
vet:
	cd tools/lsp && go vet ./...

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
# Bump the version of the toolchain's own published packages (visualizer lib +
# wire-types), commit, tag, and push — the `v*` tag triggers release.yml, which
# cuts the GitHub Release and dispatches to the distribution repo.
#   make release TYPE=patch        (auto-bump from latest tag)
#   make release TYPE=minor
#   make release TYPE=major
#   make release VERSION=1.2.3     (explicit version)

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
	@echo "Releasing v$(NEW_VERSION)"
	@# The toolchain publishes two npm packages from its release assets; their
	@# manifest versions must match the tag (enforced by _check-versions.yml).
	@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' tools/visualizer/package.json && rm -f tools/visualizer/package.json.bak
	@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' tools/wire-types/package.json && rm -f tools/wire-types/package.json.bak
	git add tools/visualizer/package.json tools/wire-types/package.json
	git commit -m "release: v$(NEW_VERSION)"
	git tag "v$(NEW_VERSION)"
	git push origin HEAD "v$(NEW_VERSION)"
	@echo "Pushed v$(NEW_VERSION) — release workflow will cut the release and dispatch to dist"

# ── Clean ────────────────────────────────────────────────────────────────────

.PHONY: clean

## Remove all build artifacts
clean:
	rm -rf dist/ tools/visualizer/dist tools/visualizer/dist-lib
	rm -f tools/visualizer/LICENSE tools/wire-types/LICENSE
	@echo "Cleaned"
