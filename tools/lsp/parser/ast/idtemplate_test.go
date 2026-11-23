package ast

import "testing"

func TestIDTemplatesOverlap(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"ship-{a}-{b}", "ship-{a}", true},
		{"ship-{a}", "refund-{a}", false},
		{"rate-limiter", "rate-{x}", true},
		{"rate-limiter", "rate-limiter", true},
		{"a-{x}", "a-", false},
		{"{x}-done", "start-{y}", true},
		{"order-{x}", "order", false},
	}
	for _, tt := range tests {
		if got := IDTemplatesOverlap(tt.a, tt.b); got != tt.want {
			t.Errorf("IDTemplatesOverlap(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestIDTemplateMatches(t *testing.T) {
	tests := []struct {
		template, id string
		want         bool
	}{
		{"ship-{order.id}", "ship-42", true},
		{"ship-{order.id}", "ship-", false},
		{"ship-{order.id}", "refund-42", false},
		{"ship-{o}-{i}", "ship-42-sku", true},
		{"ship-{o}-{i}", "ship-42", false},
		{"rate-limiter", "rate-limiter", true},
		{"rate-limiter", "rate-limiter-2", false},
	}
	for _, tt := range tests {
		if got := IDTemplateMatches(tt.template, tt.id); got != tt.want {
			t.Errorf("IDTemplateMatches(%q, %q) = %v, want %v", tt.template, tt.id, got, tt.want)
		}
	}
}
