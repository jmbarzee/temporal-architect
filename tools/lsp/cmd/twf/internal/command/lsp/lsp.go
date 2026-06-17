// Package lsp implements `twf lsp` — start the language server over stdio.
package lsp

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/internal/server"
	"github.com/spf13/cobra"
	"github.com/tliron/commonlog"
	_ "github.com/tliron/commonlog/simple"
	glspServer "github.com/tliron/glsp/server"
)

// New builds the `lsp` command. Its RunE calls serve, which blocks on RunStdio
// and never returns, so the exit-code mapping in main is not reached.
func New(version string) *cobra.Command {
	return cmdutil.Silence(&cobra.Command{
		Use:   "lsp",
		Short: "Start the language server (stdio)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			serve(version)
			return nil
		},
	})
}

// serve starts the LSP server over stdio.
func serve(version string) {
	commonlog.Configure(1, nil)

	handler, _ := server.NewHandler(cmdutil.Name, version)

	s := glspServer.NewServer(handler, cmdutil.Name, false)

	s.RunStdio()
}
