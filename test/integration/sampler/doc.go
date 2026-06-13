// Package integration holds end-to-end tests that exercise the reverse-history
// toolchain against a real Temporal server.
//
// These tests are NOT part of any shipped binary. They live in their own module
// so the heavyweight test dependencies (the Temporal Go SDK, the in-process dev
// server) never leak into the production modules.
//
// Every test in this package is guarded by the `integration` build tag and also
// skips under `go test -short`, so the default `go test ./...` never runs them.
// To run:
//
//	go test -tags integration ./test/integration/sampler/...
//
// The first run downloads and caches a Temporal dev-server binary, which
// requires network access.
package integration
