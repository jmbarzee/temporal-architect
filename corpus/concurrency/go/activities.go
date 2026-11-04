package concurrency

import "context"

func Count(ctx context.Context, items []string) (int, error) {
	return len(items), nil
}

func Store(ctx context.Context, items []string) error {
	return nil
}
