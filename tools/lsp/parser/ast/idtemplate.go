package ast

import "strings"

// ParseIDTemplate splits an ID template — an `id_scheme:` string or a literal
// `id:` value — into its fixed text and hole paths. fixed always has one more
// element than holes: fixed[i] precedes holes[i], and the last element trails.
// msg is non-empty when the template is malformed: a stray or unclosed brace, a
// hole that is not a dotted path, two touching holes, or no fixed text at all.
func ParseIDTemplate(s string) (fixed, holes []string, msg string) {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '}':
			return nil, nil, "stray `}`"
		case '{':
			end := strings.IndexByte(s[i+1:], '}')
			if end < 0 {
				return nil, nil, "unclosed `{`"
			}
			path := s[i+1 : i+1+end]
			if !isIDPath(path) {
				return nil, nil, "`{" + path + "}` is not a dotted path"
			}
			if len(holes) > 0 && b.Len() == 0 {
				return nil, nil, "holes must be separated by fixed text"
			}
			fixed = append(fixed, b.String())
			b.Reset()
			holes = append(holes, path)
			i += end + 1
		default:
			b.WriteByte(s[i])
		}
	}
	fixed = append(fixed, b.String())
	if strings.Join(fixed, "") == "" {
		return nil, nil, "no fixed text"
	}
	return fixed, holes, ""
}

// IDTemplatesOverlap reports whether some string matches both ID templates, each
// hole standing for one or more arbitrary characters.
func IDTemplatesOverlap(a, b string) bool {
	return globsOverlap(globOf(a), globOf(b))
}

// IDTemplateMatches reports whether a concrete workflow ID fits an ID template.
func IDTemplateMatches(template, id string) bool {
	return globsOverlap(globOf(template), bytesOf(id, []int{}))
}

// globOf turns an ID template into glob tokens: fixed bytes, and each hole as
// globAny followed by globStar.
func globOf(template string) []int {
	fixed, holes, msg := ParseIDTemplate(template)
	if msg != "" {
		return nil
	}
	var out []int
	for i, f := range fixed {
		out = bytesOf(f, out)
		if i < len(holes) {
			out = append(out, globAny, globStar)
		}
	}
	return out
}

// IDPathRoot returns the first segment of a dotted path ("order" for "order.id").
func IDPathRoot(path string) string {
	root, _, _ := strings.Cut(path, ".")
	return root
}

func isIDPath(path string) bool {
	for _, seg := range strings.Split(path, ".") {
		if seg == "" || !isTemplateNameStart(seg[0]) {
			return false
		}
		for j := 1; j < len(seg); j++ {
			if !isTemplateNameContinue(seg[j]) {
				return false
			}
		}
	}
	return true
}

// ParamNames returns the names declared in an opaque parameter list such as
// "order: Order, item: Item" or "(order: Order)".
func ParamNames(params string) map[string]bool {
	names := map[string]bool{}
	params = strings.TrimSpace(params)
	if strings.HasPrefix(params, "(") && strings.HasSuffix(params, ")") {
		params = params[1 : len(params)-1]
	}
	for _, param := range SplitParams(params) {
		name, _, _ := strings.Cut(param, ":")
		if fields := strings.Fields(name); len(fields) > 0 {
			names[fields[0]] = true
		}
	}
	return names
}

// SplitParams splits a parameter list on its top-level commas, so the comma in
// "m: map[string, V]" stays inside its parameter.
func SplitParams(params string) []string {
	var parts []string
	depth, start := 0, 0
	for i := 0; i < len(params); i++ {
		switch params[i] {
		case '[', '{', '(', '<':
			depth++
		case ']', '}', ')', '>':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, params[start:i])
				start = i + 1
			}
		}
	}
	return append(parts, params[start:])
}
