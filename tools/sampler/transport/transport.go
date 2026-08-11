// Package transport builds a sampling.Backend for a target Temporal namespace
// from a small transport Config, and reads the credential from the environment
// or a file at connect time — never from a struct that could be logged or
// (worse) serialized into workflow state. Both the single-process CLI (package
// main) and the Temporal worker's activities construct their backend through
// here, so there is one connection/auth implementation.
package transport

import (
	"context"
	"crypto/tls"
	"fmt"
	"os"
	"strings"

	"go.temporal.io/sdk/client"

	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
	"github.com/jmbarzee/temporal-architect/tools/sampler/webapi"
)

// Config selects and parameterizes the transport to the target namespace. It
// deliberately carries no credential VALUE: the bearer token / API key lives in
// the environment (TEMPORAL_API_KEY) or in the file named by BearerFile, and is
// resolved inside Connect, so it is never placed in a value a caller might
// persist (or serialize into workflow history).
type Config struct {
	Address     string // frontend host:port (grpc) or web API host (http)
	Namespace   string // target namespace being sampled
	Transport   string // "grpc" (default) or "http"
	CallerType  string // caller-type header for the http (Cloud web API) transport
	BearerFile  string // path to a file holding the bearer token, re-read per request
	TLSCertPath string // client cert for mTLS (grpc)
	TLSKeyPath  string // client key for mTLS (grpc)
	TLS         bool   // enable server TLS without mTLS (grpc)
}

// Connect builds the sampling backend for the selected transport and returns a
// cleanup func. The credential is resolved lazily (per request for http, per
// callback for grpc), so a durable/parallel run survives token rotation:
//
//   - BearerFile is re-read on every use, so overwriting it with a freshly
//     pulled token lets an in-flight sample outlive the ~5-minute rotation of a
//     browser-session JWT without a restart. This is the recommended shape for a
//     worker: point BearerFile (SAMPLER_BEARER_FILE) at a file a sidecar keeps
//     refreshed, or supply a long-lived Cloud API key in TEMPORAL_API_KEY.
//   - A raw short-lived JWT placed in TEMPORAL_API_KEY will expire mid-run; do
//     not depend on it for a run that may outlive it.
func Connect(cfg Config) (sampling.Backend, func(), error) {
	switch cfg.Transport {
	case "http":
		token, err := tokenSource(cfg)
		if err != nil {
			return nil, nil, err
		}
		wc := webapi.New(cfg.Address, cfg.Namespace, token, cfg.CallerType)
		return wc, func() {}, nil
	case "", "grpc":
		c, err := dial(cfg)
		if err != nil {
			return nil, nil, fmt.Errorf("connect to %s: %w", cfg.Address, err)
		}
		return c, func() { c.Close() }, nil
	default:
		return nil, nil, fmt.Errorf("unknown transport %q (want grpc or http)", cfg.Transport)
	}
}

// tokenSource picks the http bearer-token source: a re-read-per-request file
// when BearerFile is set, else the static TEMPORAL_API_KEY.
func tokenSource(cfg Config) (func() (string, error), error) {
	switch {
	case cfg.BearerFile != "":
		return webapi.FileToken(cfg.BearerFile), nil
	case strings.TrimSpace(os.Getenv("TEMPORAL_API_KEY")) != "":
		return webapi.StaticToken(strings.TrimSpace(os.Getenv("TEMPORAL_API_KEY"))), nil
	default:
		return nil, fmt.Errorf("http transport requires a bearer token: set BearerFile (SAMPLER_BEARER_FILE) or TEMPORAL_API_KEY")
	}
}

// dial opens a Temporal client. Auth precedence:
//
//  1. BearerFile — API-key dynamic credentials read from the file on every
//     refresh (survives a rotating short-lived token); auto-enables server TLS.
//  2. A bearer token in TEMPORAL_API_KEY (Cloud API key or a UI-pulled token):
//     sent as Authorization: Bearer <token>, auto-enables server TLS.
//  3. mTLS when both TLSCertPath and TLSKeyPath are provided.
//  4. Plain server TLS when TLS is set (no client auth).
//
// Otherwise the connection is plaintext (local dev server).
func dial(cfg Config) (client.Client, error) {
	co := client.Options{HostPort: cfg.Address, Namespace: cfg.Namespace}

	apiKey := strings.TrimSpace(os.Getenv("TEMPORAL_API_KEY"))
	switch {
	case cfg.BearerFile != "":
		co.Credentials = client.NewAPIKeyDynamicCredentials(func(context.Context) (string, error) {
			return readToken(cfg.BearerFile)
		})
		co.ConnectionOptions = client.ConnectionOptions{TLS: &tls.Config{}}
	case apiKey != "":
		co.Credentials = client.NewAPIKeyStaticCredentials(apiKey)
		co.ConnectionOptions = client.ConnectionOptions{TLS: &tls.Config{}}
	case cfg.TLSCertPath != "" && cfg.TLSKeyPath != "":
		cert, err := tls.LoadX509KeyPair(cfg.TLSCertPath, cfg.TLSKeyPath)
		if err != nil {
			return nil, fmt.Errorf("load TLS key pair: %w", err)
		}
		co.ConnectionOptions = client.ConnectionOptions{TLS: &tls.Config{Certificates: []tls.Certificate{cert}}}
	case cfg.TLS:
		co.ConnectionOptions = client.ConnectionOptions{TLS: &tls.Config{}}
	}
	return client.Dial(co)
}

// ConfigFromEnv builds a Config targeting namespace from SAMPLER_* environment
// variables, so the worker's activities can construct a backend without any
// value passed through workflow state. The credential itself is still resolved
// from SAMPLER_BEARER_FILE / TEMPORAL_API_KEY inside Connect.
func ConfigFromEnv(namespace string) Config {
	return Config{
		Namespace:   namespace,
		Address:     getenvDefault("SAMPLER_ADDRESS", "127.0.0.1:7233"),
		Transport:   getenvDefault("SAMPLER_TRANSPORT", "grpc"),
		CallerType:  getenvDefault("SAMPLER_CALLER_TYPE", "operator"),
		BearerFile:  os.Getenv("SAMPLER_BEARER_FILE"),
		TLSCertPath: os.Getenv("SAMPLER_TLS_CERT_PATH"),
		TLSKeyPath:  os.Getenv("SAMPLER_TLS_KEY_PATH"),
		TLS:         truthy(os.Getenv("SAMPLER_TLS")),
	}
}

// ConnectForNamespace is the activity-side entry point: build a Config from the
// environment for the given target namespace and connect. It matches the
// Activities connector signature.
func ConnectForNamespace(namespace string) (sampling.Backend, func(), error) {
	return Connect(ConfigFromEnv(namespace))
}

func readToken(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read bearer file %s: %w", path, err)
	}
	t := strings.TrimSpace(string(b))
	if t == "" {
		return "", fmt.Errorf("bearer file %s is empty", path)
	}
	return t, nil
}

func getenvDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
