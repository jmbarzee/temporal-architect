// Package mcp implements `twf mcp` — a Model Context Protocol server exposing
// the TWF parser as MCP tools and the embedded language spec as MCP resources.
//
// It speaks MCP over stdio (the transport every local client — Claude Desktop,
// Cursor, Continue — launches via `npx … twf mcp`), so stdout is reserved for
// the JSON-RPC protocol stream; all diagnostics must go to stderr.
//
// The tools are thin wrappers over the same internal/envelope pipeline and
// parser packages the CLI commands use, so the JSON they return is identical to
// `twf parse`/`symbols --json`/`graph --json`/`graph chunks --json`. Skills are
// intentionally not exposed yet (the binary does not embed them); the surface
// is parser tools + spec resources.
package mcp

import (
	"context"
	"errors"
	"io"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/spf13/cobra"
)

const instructions = `twf exposes the TWF (Temporal Workflow Format) toolchain over MCP.

Tools wrap the parser: validate and inspect .twf design files (check, parse,
symbols, graph, decomposition) and read the embedded language spec. All tools
take .twf file paths resolved on the local filesystem where this server runs.

Resources expose the TWF language specification (twf://spec and
twf://spec/<slug>) as markdown — consult them before authoring .twf.`

// New builds the `mcp` command. version stamps the server's Implementation so
// connected clients can report which twf build they are talking to.
func New(version string) *cobra.Command {
	return cmdutil.Silence(&cobra.Command{
		Use:   "mcp",
		Short: "Run the MCP server over stdio (parser tools + spec resources)",
		Long: `Run a Model Context Protocol server over stdio.

Exposes the TWF parser as MCP tools (twf_check, twf_parse, twf_symbols,
twf_graph, twf_graph_chunks, twf_spec_list, twf_spec_get) and the embedded
language specification as MCP resources (twf://spec, twf://spec/<slug>).

This is the agent entry point: point any MCP client (Claude Desktop, Cursor,
Continue) at ` + "`twf mcp`" + `. The process serves a single client over stdin/stdout
and exits when the client disconnects.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return serve(cmd.Context(), version)
		},
	})
}

// newServer constructs the MCP server with every tool and resource registered.
// It is separate from serve so tests can drive it over an in-memory transport.
func newServer(version string) (*mcp.Server, error) {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    cmdutil.Name,
		Version: version,
	}, &mcp.ServerOptions{
		Instructions: instructions,
	})

	registerTools(server)
	if err := registerResources(server); err != nil {
		return nil, err
	}
	return server, nil
}

// serve constructs the MCP server and runs it over stdio until the client
// disconnects or ctx is cancelled.
func serve(ctx context.Context, version string) error {
	if ctx == nil {
		ctx = context.Background()
	}

	server, err := newServer(version)
	if err != nil {
		return err
	}

	// StdioTransport owns stdin/stdout for the JSON-RPC stream. Run blocks for
	// the lifetime of the single client session. A client disconnect (stdin
	// EOF) or a cancelled context is a normal shutdown, not a failure.
	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil &&
		!errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) {
		return err
	}
	return nil
}
