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
