package server

import (
	"testing"
)

// A STRING's Literal is unescaped; its highlight still spans the quoted source.
func TestSemanticTokenEscapedString(t *testing.T) {
	data := buildSemanticTokens(`"a\"b\\c" "d\ne"`)
	if len(data) != 10 || data[2] != 9 || data[7] != 6 {
		t.Fatalf("semantic tokens = %v, want two strings of lengths 9 and 6", data)
	}
}
