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
// "order: Order, item: Item" or "(order: Order)". Commas nested in brackets or braces do not split.
func ParamNames(params string) map[string]bool {
	names := map[string]bool{}
	params = strings.TrimSpace(params)
	if strings.HasPrefix(params, "(") && strings.HasSuffix(params, ")") {
		params = params[1 : len(params)-1]
	}
	depth, start := 0, 0
	add := func(param string) {
		name, _, _ := strings.Cut(param, ":")
		if fields := strings.Fields(name); len(fields) > 0 {
			names[fields[0]] = true
		}
	}
	for i := 0; i < len(params); i++ {
		switch params[i] {
		case '[', '{', '(', '<':
			depth++
		case ']', '}', ')', '>':
			depth--
		case ',':
			if depth == 0 {
				add(params[start:i])
				start = i + 1
			}
		}
	}
	add(params[start:])
	return names
}
