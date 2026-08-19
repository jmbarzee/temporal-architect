package token

import "testing"

// TestLookupIdentKeywords covers the package/import/as keywords added for the
// packages & imports slice, alongside a representative existing keyword and a
// plain identifier. LookupIdent is case-sensitive: only the lowercase forms are
// keywords.
func TestLookupIdentKeywords(t *testing.T) {
	cases := []struct {
		ident string
		want  TokenType
	}{
		{"package", PACKAGE},
		{"import", IMPORT},
		{"as", AS},
		{"workflow", WORKFLOW},
		// Case-sensitive: capitalized forms are ordinary identifiers.
		{"Package", IDENT},
		{"Import", IDENT},
		{"As", IDENT},
		// Unrelated identifier.
		{"myThing", IDENT},
	}
	for _, c := range cases {
		if got := LookupIdent(c.ident); got != c.want {
			t.Errorf("LookupIdent(%q) = %v, want %v", c.ident, got, c.want)
		}
	}
}

// TestListDelimiterTokenNames covers the display names of the list-literal
// delimiter tokens added for inline list option values. These are symbols, not
// keywords, so LookupIdent never returns them; the compile-time tokenCount
// assertion already enforces that each has a tokenTable entry.
func TestListDelimiterTokenNames(t *testing.T) {
	cases := []struct {
		tt   TokenType
		want string
	}{
		{LBRACKET, "LBRACKET"},
		{RBRACKET, "RBRACKET"},
		{COMMA, "COMMA"},
	}
	for _, c := range cases {
		if got := c.tt.String(); got != c.want {
			t.Errorf("TokenType(%d).String() = %q, want %q", int(c.tt), got, c.want)
		}
		if info := tokenTable[c.tt]; info.isKeyword {
			t.Errorf("%s should not be a keyword", c.want)
		}
	}
}
