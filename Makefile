# ── Configuration ────────────────────────────────────────────────────────────

# Local arch by default — no cross-compilation needed for dev
GOOS   ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

EXT_DIR := packages/vscode

# All supported platforms (for package-all / CI release only)
# Format: VSCE_TARGET:GOOS:GOARCH
PLATFORMS := \
	darwin-arm64:darwin:arm64 \
	darwin-x64:darwin:amd64 \
	linux-x64:linux:amd64 \
	linux-arm64:linux:arm64 \
	win32-x64:windows:amd64

# ── Dev shortcuts ────────────────────────────────────────────────────────────
# These build for the local platform only. Use *-all variants for cross-platform.

.PHONY: build publish clean

## Build everything for the local platform
build: build-lsp build-visualizer build-skills build-extension

## Publish all .vsix files in packages/vscode/ to registries
publish: publish-vscode publish-ovsx

# ── Build targets ────────────────────────────────────────────────────────────

.PHONY: build-lsp build-visualizer build-skills build-extension

## Build the twf binary for the current (or specified) platform
build-lsp:
	@mkdir -p $(EXT_DIR)/bin
	cd tools/lsp && \
		GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 \
		go build -o ../../$(EXT_DIR)/bin/twf$(if $(filter windows,$(GOOS)),.exe) ./cmd/twf
	@echo "Built twf for $(GOOS)/$(GOARCH)"

## Package the twf binary into a standalone archive for release.
## VERSION may be passed with or without a leading "v"; the archive is always
## named twf-v<X.Y.Z>-<goos>-<goarch>.{tar.gz,zip}.
## Usage: make build-twf-archive VERSION=1.2.3 GOOS=darwin GOARCH=arm64
##        make build-twf-archive VERSION=v1.2.3 GOOS=darwin GOARCH=arm64
build-twf-archive: build-lsp
	@mkdir -p dist
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	ARCHIVE=twf-v$$VER-$(GOOS)-$(GOARCH); \
	if [ "$(GOOS)" = "windows" ]; then \
		cp $(EXT_DIR)/bin/twf.exe dist/twf.exe; \
		cd dist && zip $$ARCHIVE.zip twf.exe && rm twf.exe; \
	else \
		cp $(EXT_DIR)/bin/twf dist/twf; \
		cd dist && tar czf $$ARCHIVE.tar.gz twf && rm twf; \
	fi; \
	echo "Packaged $$ARCHIVE"

## Package the skills/ tree into a deterministic release asset.
## VERSION may be passed with or without a leading "v"; the archive is always
## named skills-v<X.Y.Z>.tar.gz.
## Usage: make build-skills-archive VERSION=1.2.3
##        make build-skills-archive VERSION=v1.2.3
build-skills-archive:
	@mkdir -p dist
	@VER=$$(echo "$(VERSION)" | sed 's/^v//'); \
	if [ -z "$$VER" ]; then echo "Error: VERSION not set"; exit 1; fi; \
	OUT=dist/skills-v$$VER.tar.gz; \
	go run ./scripts/gen-skills-manifest --source skills --out $$OUT --version v$$VER; \
	echo "Packaged $$OUT"

## Build the visualizer webview into the extension
build-visualizer:
	cd tools/visualizer && npm run build:webview
	@echo "Built visualizer (webview bundle)"

## Build the visualizer as a publishable npm library (ESM + types + sibling CSS)
build-visualizer-lib:
	cd tools/visualizer && npm run build:lib
	@echo "Built visualizer (npm library)"

## Copy skills into the extension package
build-skills:
	@mkdir -p $(EXT_DIR)/skills
	rsync -a --delete skills/ $(EXT_DIR)/skills/
	@echo "Copied skills"

## Compile the extension TypeScript
build-extension: build-skills
	cd $(EXT_DIR) && npm run compile
	@echo "Compiled extension"

# ── Test targets ─────────────────────────────────────────────────────────────

.PHONY: test vet

## Run Go tests
test:
	cd tools/lsp && go test ./...

## Run Go vet
vet:
	cd tools/lsp && go vet ./...

# ── Package targets ──────────────────────────────────────────────────────────

.PHONY: package package-platform package-all

## Package a VSIX for the local platform
package: build
	cd $(EXT_DIR) && npx @vscode/vsce package
	@echo "Packaged VSIX"

## Package a VSIX for a single explicit target (used by CI matrix)
## Usage: make package-platform VSCE_TARGET=darwin-arm64 GOOS=darwin GOARCH=arm64
package-platform: build-lsp
	cd $(EXT_DIR) && npx @vscode/vsce package --target $(VSCE_TARGET)
	@echo "Packaged VSIX for $(VSCE_TARGET)"

## Package VSIXes for all platforms
package-all: build-visualizer build-skills build-extension
	@for entry in $(PLATFORMS); do \
		target=$$(echo $$entry | cut -d: -f1); \
		os=$$(echo $$entry | cut -d: -f2); \
		arch=$$(echo $$entry | cut -d: -f3); \
		echo "Packaging $$target ($$os/$$arch)..."; \
		$(MAKE) package-platform VSCE_TARGET=$$target GOOS=$$os GOARCH=$$arch; \
	done
	@echo "All platform packages built"

# ── Publish targets — VSIX ──────────────────────────────────────────────────

.PHONY: publish-vscode publish-ovsx

## Publish all platform VSIXes to VS Code Marketplace
publish-vscode:
	@if [ -z "$(VSCE_TOKEN)" ]; then \
		echo "Error: VSCE_TOKEN not set"; exit 1; \
	fi
	@for vsix in $(EXT_DIR)/*.vsix; do \
		echo "Publishing $$vsix to VS Code Marketplace..."; \
		cd $(EXT_DIR) && npx @vscode/vsce publish --packagePath $$(basename $$vsix) -p $(VSCE_TOKEN) && cd ../..; \
	done

## Publish all platform VSIXes to Open VSX
publish-ovsx:
	@if [ -z "$(OVSX_TOKEN)" ]; then \
		echo "Error: OVSX_TOKEN not set"; exit 1; \
	fi
	@for vsix in $(EXT_DIR)/*.vsix; do \
		echo "Publishing $$vsix to Open VSX..."; \
		npx ovsx publish $$vsix -p $(OVSX_TOKEN); \
	done

# ── Homebrew tap ────────────────────────────────────────────────────────────

.PHONY: publish-brew

## Bump jmbarzee/homebrew-twf's Formula/twf.rb to point at this version's
## GitHub Release archives. Runs AFTER the GitHub Release exists (so the
## archives the formula references are downloadable).
##
## Required env: HOMEBREW_TAP_TOKEN (PAT with `repo` write on the tap).
## Usage: make publish-brew VERSION=v0.3.2
publish-brew:
	@if [ -z "$(VERSION)" ];            then echo "Error: VERSION not set"; exit 1; fi
	@if [ -z "$(HOMEBREW_TAP_TOKEN)" ]; then echo "Error: HOMEBREW_TAP_TOKEN not set"; exit 1; fi
	go run ./scripts/bump-brew -version $(VERSION) -token $(HOMEBREW_TAP_TOKEN)

# ── PyPI wheel ──────────────────────────────────────────────────────────────

.PHONY: build-pypi-wheel publish-pypi

## Stage the freshly-built binary into the PyPI package and build one
## platform-tagged wheel. Called per matrix entry in CI.
## Usage: make build-pypi-wheel PLATFORM_TAG=macosx_11_0_arm64 GOOS=darwin
##
## Requires `build` and `wheel` Python packages: `pip install build wheel`.
build-pypi-wheel:
	@if [ -z "$(PLATFORM_TAG)" ]; then echo "Error: PLATFORM_TAG not set"; exit 1; fi
	@mkdir -p packages/pypi/twf-cli/src/twf_cli/_binary
	@ext=""; if [ "$(GOOS)" = "windows" ]; then ext=".exe"; fi; \
		cp $(EXT_DIR)/bin/twf$$ext packages/pypi/twf-cli/src/twf_cli/_binary/twf$$ext; \
		chmod +x packages/pypi/twf-cli/src/twf_cli/_binary/twf$$ext 2>/dev/null || true
	@# Build a py3-none-any wheel via hatchling, then retag to the target platform.
	@# Hatchling's wheel target doesn't natively support cross-platform tags, so we
	@# post-process with `wheel tags` (from the `wheel` package).
	cd packages/pypi/twf-cli && rm -rf dist && python3 -m build --wheel
	cd packages/pypi/twf-cli/dist && \
		python3 -m wheel tags --remove --platform-tag $(PLATFORM_TAG) *.whl
	@echo "Built wheel for $(PLATFORM_TAG)"

## Upload all wheels in packages/pypi/twf-cli/dist/ to PyPI via twine.
publish-pypi:
	@if [ -z "$(TWINE_PASSWORD)" ]; then echo "Error: TWINE_PASSWORD not set"; exit 1; fi
	twine upload --non-interactive packages/pypi/twf-cli/dist/*.whl

# ── npm wrapper ─────────────────────────────────────────────────────────────

.PHONY: publish-npm-platform publish-npm

## Stage the freshly-built binary into one platform sub-package and `npm publish`.
## Called per matrix entry in CI; can be run locally for one platform at a time.
## Usage: make publish-npm-platform VSCE_TARGET=darwin-arm64 GOOS=darwin GOARCH=arm64
publish-npm-platform:
	@if [ -z "$(VSCE_TARGET)" ]; then echo "Error: VSCE_TARGET not set"; exit 1; fi
	@ext=""; if [ "$(GOOS)" = "windows" ]; then ext=".exe"; fi; \
		mkdir -p packages/npm/twf-$(VSCE_TARGET)/bin; \
		cp $(EXT_DIR)/bin/twf$$ext packages/npm/twf-$(VSCE_TARGET)/bin/twf$$ext
	cd packages/npm/twf-$(VSCE_TARGET) && npm publish

## Publish the `@temporal-skills/twf` wrapper. Run AFTER all sub-packages have
## published — npm rejects the wrapper if its optionalDependencies reference
## versions that don't exist yet.
publish-npm:
	cd packages/npm/twf && npm publish

# ── Release targets ──────────────────────────────────────────────────────────
# Bump version, commit, tag, and push — triggers the release workflow.
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
	$(eval NEW_VERSION := $(shell bash scripts/version.sh "$(VERSION)" "$(TYPE)"))
	@if [ -z "$(NEW_VERSION)" ]; then exit 1; fi
	@echo "Releasing v$(NEW_VERSION)"
	@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' $(EXT_DIR)/package.json && rm -f $(EXT_DIR)/package.json.bak
	@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' tools/visualizer/package.json && rm -f tools/visualizer/package.json.bak
	@# npm wrapper top-level version
	@sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' packages/npm/twf/package.json && rm -f packages/npm/twf/package.json.bak
	@# npm wrapper optionalDependencies exact-version pins (one sed per package)
	@for p in darwin-arm64 darwin-x64 linux-x64 linux-arm64 win32-x64; do \
		sed -i.bak "s|\"@temporal-skills/twf-$$p\": *\"[^\"]*\"|\"@temporal-skills/twf-$$p\": \"$(NEW_VERSION)\"|" packages/npm/twf/package.json && rm -f packages/npm/twf/package.json.bak; \
	done
	@# npm platform sub-package versions
	@for p in darwin-arm64 darwin-x64 linux-x64 linux-arm64 win32-x64; do \
		sed -i.bak 's/"version": *"[^"]*"/"version": "$(NEW_VERSION)"/' packages/npm/twf-$$p/package.json && rm -f packages/npm/twf-$$p/package.json.bak; \
	done
	@# PyPI package version (pyproject.toml top-level project.version)
	@sed -i.bak 's/^version = "[^"]*"/version = "$(NEW_VERSION)"/' packages/pypi/twf-cli/pyproject.toml && rm -f packages/pypi/twf-cli/pyproject.toml.bak
	@# Mirror the version into the package's __init__.py for `import twf_cli; twf_cli.__version__`
	@sed -i.bak 's/^__version__ = "[^"]*"$$/__version__ = "$(NEW_VERSION)"/' packages/pypi/twf-cli/src/twf_cli/__init__.py && rm -f packages/pypi/twf-cli/src/twf_cli/__init__.py.bak
	git add $(EXT_DIR)/package.json tools/visualizer/package.json packages/npm packages/pypi
	git commit -m "release: v$(NEW_VERSION)"
	git tag "v$(NEW_VERSION)"
	git push origin HEAD "v$(NEW_VERSION)"
	@echo "Pushed v$(NEW_VERSION) — release workflow will build and publish"

# ── Clean ────────────────────────────────────────────────────────────────────

.PHONY: clean

## Remove all build artifacts
clean:
	rm -rf $(EXT_DIR)/bin $(EXT_DIR)/dist $(EXT_DIR)/out $(EXT_DIR)/skills $(EXT_DIR)/*.vsix dist/
	rm -rf packages/npm/twf-*/bin packages/npm/twf*/LICENSE
	rm -rf packages/pypi/twf-cli/dist packages/pypi/twf-cli/src/twf_cli/_binary
	@echo "Cleaned"
