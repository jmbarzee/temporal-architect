package ast

// ExtractTemplateParams returns the distinct template-hole identifiers in s —
// the `{param}` holes — in order of first appearance. A name (or option-value
// string) with no holes yields an empty slice, so callers that store the result
// on a node emit no wire field for static names.
//
// A hole is `{` immediately followed by an identifier (letter or '_', then
// letters/digits/'_') and a closing `}`. A `{` that does not open a well-formed
// hole is skipped, so this is safe to run over arbitrary option-value strings
// (e.g. `Result{ok: true}` yields no params).
func ExtractTemplateParams(s string) []string {
	var params []string
	seen := map[string]bool{}
	for i := 0; i < len(s); i++ {
		if s[i] != '{' {
			continue
		}
		j := i + 1
		if j >= len(s) || !isTemplateNameStart(s[j]) {
			continue
		}
		k := j + 1
		for k < len(s) && isTemplateNameContinue(s[k]) {
			k++
		}
		if k < len(s) && s[k] == '}' {
			name := s[j:k]
			if !seen[name] {
				seen[name] = true
				params = append(params, name)
			}
			i = k // resume after the closing '}'
		}
	}
	return params
}

func isTemplateNameStart(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_'
}

func isTemplateNameContinue(ch byte) bool {
	return isTemplateNameStart(ch) || (ch >= '0' && ch <= '9')
}
