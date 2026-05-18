package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// parseCommand emits the canonical JSON envelope for one or more .twf files.
// It is always JSON; there is no text mode. Diagnostics travel inside the
// envelope (not on stderr) and the exit code is 0 even when the AST is
// partial — downstream tools rely on getting both the partial AST and the
// diagnostics together.
//
// On hard I/O failures (e.g. file not found), it prints the error to stderr
// and exits non-zero.
func parseCommand(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: twf parse <file...>")
		return 1
	}

	file, diags, err := parseFiles(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	env := Envelope{
		Summary:     summarize(file, diags),
		Diagnostics: ensureSlice(diags),
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
