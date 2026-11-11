package failure

import (
	"context"

	"go.temporal.io/sdk/temporal"
)

func Reject(ctx context.Context, item string) error {
	return temporal.NewApplicationError("rejected "+item, "Rejected")
}

func Process(ctx context.Context, item string) error {
	return nil
}
