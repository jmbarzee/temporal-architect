// Package cmdutil holds the cross-cutting glue shared by every twf cobra
// command: the process-exit-code convention layered over cobra's RunE error
// model, and the help/usage silencing applied to all commands. It is a leaf
// dependency — command packages import it, and the root assembler imports both
// it and the command packages, so it never creates an import cycle.
package cmdutil

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Name is the CLI's binary name, used in help text and version output.
const Name = "twf"

// ExitError carries a process exit code up through cobra's error channel so the
// int-exit-code convention survives the move to RunE returning error.
type ExitError struct {
	Code int
}

func (e ExitError) Error() string { return fmt.Sprintf("exit code %d", e.Code) }

// CodeToErr adapts a runner's int exit code to RunE's error contract: 0 means
// success (nil); anything else rides up as an ExitError. Runners print their own
// human-readable diagnostics before returning a non-zero code.
func CodeToErr(code int) error {
	if code == 0 {
		return nil
	}
	return ExitError{Code: code}
}

// Exec runs a command and collapses cobra's error return back to a process exit
// code. An ExitError is unwrapped to its code (the runner already printed any
// message); any other error is a cobra-level failure (unknown flag, bad arg
// count) and is printed before exiting 1.
func Exec(cmd *cobra.Command) int {
	err := cmd.Execute()
	if err == nil {
		return 0
	}
	var ee ExitError
	if errors.As(err, &ee) {
		return ee.Code
	}
	fmt.Fprintln(os.Stderr, "Error:", err)
	return 1
}

// Silence sets the flags that keep cobra from printing usage/errors on the
// deliberate exit paths, so runners stay the sole source of stderr output.
func Silence(cmd *cobra.Command) *cobra.Command {
	cmd.SilenceUsage = true
	cmd.SilenceErrors = true
	return cmd
}
