package main

import (
	"fmt"
	"os"
)

const (
	name    = "twf"
	version = "0.1.0"
)

const usage = `twf - Temporal Workflow Format CLI

Usage:
  twf <command> [options] <file...>

Commands:
  check     Validate files; exit non-zero on error severity (text only)
  parse     Emit the canonical JSON envelope (AST + diagnostics + summary)
  symbols   List workflows and activities; --json for envelope output
  deps      Show the dependency graph; --json for envelope output
  spec      Print the embedded TWF language specification
  lsp       Start the language server (stdio)
  help      Show this help

JSON envelope shape (parse / symbols --json / deps --json):
  {
    "summary":     { workflows, activities, errors, warnings, … },
    "diagnostics": [ { severity, kind, code, file, start, end, message, name } ],
    "definitions" | "symbols" | "graph": <command-specific payload>
  }

Examples:
  twf check workflow.twf
  twf check --lenient workflow.twf
  twf parse workflow.twf | jq '.diagnostics'
  twf symbols --json workflow.twf | jq '.symbols[].name'
  twf deps workflow.twf
  twf spec --list
  twf lsp
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "check":
		os.Exit(checkCommand(os.Args[2:]))
	case "parse":
		os.Exit(parseCommand(os.Args[2:]))
	case "symbols":
		os.Exit(symbolsCommand(os.Args[2:]))
	case "deps":
		os.Exit(depsCommand(os.Args[2:]))
	case "spec":
		os.Exit(specCommand(os.Args[2:]))
	case "lsp":
		lspCommand()
	case "help", "--help", "-h":
		fmt.Print(usage)
		os.Exit(0)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		fmt.Fprint(os.Stderr, usage)
		os.Exit(1)
	}
}
