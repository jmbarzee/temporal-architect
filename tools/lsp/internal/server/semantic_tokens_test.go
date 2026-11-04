package server

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// A STRING's Literal is unescaped; its highlight still spans the quoted source.
func TestTokenLengthEscapedString(t *testing.T) {
	content := `"a\"b\\c" "d\ne"`
	var got []uint32
	for _, tok := range lexer.New(content).AllTokens() {
		if tok.Type == token.STRING {
			got = append(got, tokenLength(tok, content))
		}
	}
	if len(got) != 2 || got[0] != 9 || got[1] != 6 {
		t.Fatalf("string lengths = %v, want [9 6]", got)
	}
}
