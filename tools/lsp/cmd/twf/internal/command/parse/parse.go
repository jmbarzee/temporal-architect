// Package parse implements `twf parse` — emit the canonical JSON envelope for
// one or more TWF files.
package parse

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
	"github.com/spf13/cobra"
)

// New builds the `parse` command.
func New() *cobra.Command {
	return cmdutil.Silence(&cobra.Command{
		Use:   "parse <file...>",
		Short: "Emit the canonical JSON envelope (AST + diagnostics + summary)",
		Long: `Emit the canonical JSON envelope for one or more TWF files. Always JSON;
diagnostics ride inside the envelope alongside the AST. Exits 0 even on a
partial parse; hard I/O errors exit non-zero.`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args))
		},
	})
}

// run emits the canonical JSON envelope for one or more .twf files.
// It is always JSON; there is no text mode. Diagnostics travel inside the
// envelope (not on stderr) and the exit code is 0 even when the AST is
// partial — downstream tools rely on getting both the partial AST and the
// diagnostics together.
//
// On hard I/O failures (e.g. file not found), it prints the error to stderr
// and exits non-zero.
func run(args []string) int {
	file, diags, err := envelope.ParseFiles(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	env := envelope.Envelope{
		Summary:     envelope.Summarize(file, diags),
		Diagnostics: envelope.EnsureSlice(diags),
	}

	// Marshal the AST through its own MarshalJSON so we get the existing
	// `definitions` shape, then splice it into the envelope under the same
	// top-level "definitions" key the visualizer already consumes.
	fileBytes, err := json.Marshal(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal AST: %v\n", err)
		return 1
	}
	var inner struct {
		Definitions json.RawMessage `json:"definitions"`
	}
	if err := json.Unmarshal(fileBytes, &inner); err != nil {
		fmt.Fprintf(os.Stderr, "splice AST: %v\n", err)
		return 1
	}
	env.Definitions = inner.Definitions

	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal envelope: %v\n", err)
		return 1
	}
	fmt.Println(string(data))
	return 0
}
