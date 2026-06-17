// Package symbols implements `twf symbols` — list the workflows, activities,
// workers, namespaces, and Nexus services defined in the given files.
package symbols

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/spf13/cobra"
)

type subSymbol struct {
	Name       string `json:"name"`
	Params     string `json:"params,omitempty"`
	ReturnType string `json:"returnType,omitempty"`
}

type symbolJSON struct {
	Kind       string      `json:"kind"`
	Name       string      `json:"name"`
	Params     string      `json:"params,omitempty"`
	ReturnType string      `json:"returnType,omitempty"`
	Signals    []subSymbol `json:"signals,omitempty"`
	Queries    []subSymbol `json:"queries,omitempty"`
	Updates    []subSymbol `json:"updates,omitempty"`
	Workflows  []subSymbol `json:"workflows,omitempty"`
	Activities []subSymbol `json:"activities,omitempty"`
	Services   []subSymbol `json:"services,omitempty"`
	Workers    []subSymbol `json:"workers,omitempty"`
	Endpoints  []subSymbol `json:"endpoints,omitempty"`
	Operations []subSymbol `json:"operations,omitempty"`
}

// New builds the `symbols` command.
func New() *cobra.Command {
	var jsonOutput bool
	cmd := cmdutil.Silence(&cobra.Command{
		Use:   "symbols [flags] <file...>",
		Short: "List workflows and activities; --json for envelope output",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmdutil.CodeToErr(run(args, jsonOutput))
		},
	})
	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON envelope (default: text)")
	return cmd
}

// run lists all workflows and activities found in the given files.
//
// Text mode (the default) prints a compact human view to stdout and writes
// any diagnostics to stderr. JSON mode wraps the same data in the standard
// twf envelope so consumers get diagnostics alongside the symbol list.
func run(paths []string, jsonOutput bool) int {
	file, diags, err := envelope.ParseFiles(paths)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s\n", err.Error())
		return 1
	}

	if jsonOutput {
		return printJSON(file, diags)
	}

	for _, d := range diags {
		fmt.Fprintln(os.Stderr, envelope.FormatDiagnostic(d))
	}
	if file == nil {
		return 1
	}
	return printText(file)
}

// extractSymbols collects workflow and activity definitions into a uniform slice.
func extractSymbols(file *ast.File) []symbolJSON {
	var symbols []symbolJSON

	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			sym := symbolJSON{
				Kind:       "workflow",
				Name:       d.Name,
				Params:     d.Params,
				ReturnType: d.ReturnType,
			}
			for _, s := range d.Signals {
				sym.Signals = append(sym.Signals, subSymbol{
					Name:   s.Name,
					Params: s.Params,
				})
			}
			for _, q := range d.Queries {
				sym.Queries = append(sym.Queries, subSymbol{
					Name:       q.Name,
					Params:     q.Params,
					ReturnType: q.ReturnType,
				})
			}
			for _, u := range d.Updates {
				sym.Updates = append(sym.Updates, subSymbol{
					Name:       u.Name,
					Params:     u.Params,
					ReturnType: u.ReturnType,
				})
			}
			symbols = append(symbols, sym)
		case *ast.ActivityDef:
			symbols = append(symbols, symbolJSON{
				Kind:       "activity",
				Name:       d.Name,
				Params:     d.Params,
				ReturnType: d.ReturnType,
			})
		case *ast.WorkerDef:
			sym := symbolJSON{
				Kind: "worker",
				Name: d.Name,
			}
			for _, w := range d.Workflows {
				sym.Workflows = append(sym.Workflows, subSymbol{Name: w.Name})
			}
			for _, a := range d.Activities {
				sym.Activities = append(sym.Activities, subSymbol{Name: a.Name})
			}
			for _, s := range d.Services {
				sym.Services = append(sym.Services, subSymbol{Name: s.Name})
			}
			symbols = append(symbols, sym)
		case *ast.NamespaceDef:
			sym := symbolJSON{
				Kind: "namespace",
				Name: d.Name,
			}
			for _, w := range d.Workers {
				sym.Workers = append(sym.Workers, subSymbol{Name: w.Worker.Name})
			}
			for _, e := range d.Endpoints {
				sym.Endpoints = append(sym.Endpoints, subSymbol{Name: e.EndpointName})
			}
			symbols = append(symbols, sym)
		case *ast.NexusServiceDef:
			sym := symbolJSON{
				Kind: "nexusService",
				Name: d.Name,
			}
			for _, op := range d.Operations {
				opKind := "sync"
				if op.OpType == ast.NexusOpAsync {
					opKind = "async"
				}
				sym.Operations = append(sym.Operations, subSymbol{
					Name:   op.Name,
					Params: opKind,
				})
			}
			symbols = append(symbols, sym)
		}
	}

	return symbols
}

func printText(file *ast.File) int {
	for _, sym := range extractSymbols(file) {
		fmt.Printf("%s %s(%s)", sym.Kind, sym.Name, sym.Params)
		if sym.ReturnType != "" {
			fmt.Printf(" -> (%s)", sym.ReturnType)
		}
		fmt.Println()

		for _, s := range sym.Signals {
			fmt.Printf("  signal %s(%s)\n", s.Name, s.Params)
		}
		for _, q := range sym.Queries {
			fmt.Printf("  query %s(%s)", q.Name, q.Params)
			if q.ReturnType != "" {
				fmt.Printf(" -> (%s)", q.ReturnType)
			}
			fmt.Println()
		}
		for _, u := range sym.Updates {
			fmt.Printf("  update %s(%s)", u.Name, u.Params)
			if u.ReturnType != "" {
				fmt.Printf(" -> (%s)", u.ReturnType)
			}
			fmt.Println()
		}
		for _, w := range sym.Workflows {
			fmt.Printf("  workflow %s\n", w.Name)
		}
		for _, a := range sym.Activities {
			fmt.Printf("  activity %s\n", a.Name)
		}
		for _, svc := range sym.Services {
			fmt.Printf("  service %s\n", svc.Name)
		}
		for _, w := range sym.Workers {
			fmt.Printf("  worker %s\n", w.Name)
		}
		for _, e := range sym.Endpoints {
			fmt.Printf("  endpoint %s\n", e.Name)
		}
		for _, op := range sym.Operations {
			fmt.Printf("  operation %s (%s)\n", op.Name, op.Params)
		}
	}
	return 0
}

// printJSON emits the standard twf envelope with the symbol list as
// its payload. Diagnostics ride along inside the envelope so callers never
// need a second invocation to learn what went wrong with a partial parse.
func printJSON(file *ast.File, diags []envelope.Diagnostic) int {
	var symbols []symbolJSON
	if file != nil {
		symbols = extractSymbols(file)
	}
	if symbols == nil {
		symbols = []symbolJSON{}
	}
	env := envelope.Envelope{
		Summary:     envelope.Summarize(file, diags),
		Diagnostics: envelope.EnsureSlice(diags),
		Symbols:     symbols,
	}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "json marshal error: %v\n", err)
		return 1
	}
	fmt.Println(string(data))
	return 0
}
