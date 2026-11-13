package ast

import (
	"fmt"
	"slices"
	"strings"
)

// QueueForm is how one side of a queue comparison parses a task_queue string
// (spec 03 § Queue matching).
type QueueForm int

const (
	// QueueOpaque is literal text, matched by spelling.
	QueueOpaque QueueForm = iota
	// QueueParsed is fixed-text segments around parameters, matched by shape:
	// a worker's per-instance family, or a call's runtime interpolation.
	QueueParsed
	// QueueMalformed is a worker queue with an instance parameter that breaks a
	// family rule (QUEUE_TEMPLATE_MALFORMED). It matches nothing, its own
	// spelling included, and has no deploy key.
	QueueMalformed
)

// Queue is a task_queue string as one side of a comparison parses it.
type Queue struct {
	Spelling string
	Form     QueueForm
	// Fixed and Params hold a QueueParsed queue: Fixed[i] precedes Params[i]
	// and the last segment trails, so len(Fixed) == len(Params)+1.
	Fixed  []string
	Params []string
	// Problem is a QueueMalformed queue's first broken rule, as spec 03 words it.
	Problem string
}

// reservedQueuePrefixes are the task queue prefixes the server reserves.
var reservedQueuePrefixes = []string{"/_sys/", "temporal-sys-per-ns-"}

// maxQueueBytes is the server's task queue name limit (limit.maxIDLength).
const maxQueueBytes = 1000

// ParseDeployQueue parses a worker instantiation's task_queue. With no IDENT
// parameter it is opaque. Otherwise it declares a per-instance family: parsed
// when well formed, else malformed with the first rule it breaks, in spec 03's
// order.
func ParseDeployQueue(s string) Queue {
	fixed, groups, stray := scanBraces(s)
	q := Queue{Spelling: s}
	if !slices.ContainsFunc(groups, isTemplateName) {
		return q
	}
	if q.Problem = familyProblem(fixed, groups, stray); q.Problem != "" {
		q.Form = QueueMalformed
		return q
	}
	q.Form, q.Fixed, q.Params = QueueParsed, fixed, groups
	return q
}

// ParseCallQueue parses a call site's or default_options' task_queue. When
// every brace group is a dotted path and fixed text separates them, it parses
// and its parameters are runtime parameters; anything else is opaque.
func ParseCallQueue(s string) Queue {
	fixed, groups, stray := scanBraces(s)
	q := Queue{Spelling: s}
	if len(groups) == 0 || stray || slices.ContainsFunc(groups, func(g string) bool { return !isIDPath(g) }) || touching(fixed) {
		return q
	}
	q.Form, q.Fixed, q.Params = QueueParsed, fixed, groups
	return q
}

func familyProblem(fixed, groups []string, stray bool) string {
	if i := slices.IndexFunc(groups, func(g string) bool { return !isTemplateName(g) }); i >= 0 {
		return fmt.Sprintf("{%s} is not a parameter name", groups[i])
	}
	if touching(fixed) {
		return "parameters must be separated by fixed text"
	}
	if stray {
		return "stray or unclosed brace"
	}
	for _, p := range reservedQueuePrefixes {
		if strings.HasPrefix(fixed[0], p) {
			return fmt.Sprintf("fixed text begins with reserved prefix %q", p)
		}
	}
	if len(strings.Join(fixed, ""))+len(groups) > maxQueueBytes {
		return "fixed text plus one byte per parameter exceeds 1000 bytes"
	}
	return ""
}

// Bare reports whether q is one parameter and no fixed text: on the call side
// a learned queue, a name the caller got at runtime; on the deploy side a bare
// family such as "{hostId}".
func (q Queue) Bare() bool {
	return q.Form == QueueParsed && len(q.Params) == 1 && q.Fixed[0] == "" && q.Fixed[1] == ""
}

// Matches reports whether call-side queue q can name worker queue deploy:
// their spellings are identical, or both parse with equal fixed text, which
// puts their parameters in the same positions whatever their names. A learned
// q matches any family. Explicit routing compares with it.
func (q Queue) Matches(deploy Queue) bool {
	switch {
	case q.Form == QueueMalformed || deploy.Form == QueueMalformed:
		return false
	case q.Spelling == deploy.Spelling:
		return true
	case q.Form != QueueParsed || deploy.Form != QueueParsed:
		return false
	case q.Bare():
		return true
	}
	return slices.Equal(q.Fixed, deploy.Fixed)
}

// Key returns a worker queue's deploy key: its fixed text with an anonymous
// marker per parameter, so "sandbox-{sandboxId}" and "sandbox-{id}" share one,
// while an opaque queue's key is tagged apart so "sandbox-{}" shares neither's.
// A malformed queue has no key.
func (q Queue) Key() (key string, ok bool) {
	switch q.Form {
	case QueueOpaque:
		return "=" + q.Spelling, true
	case QueueParsed:
		return "~" + strings.Join(q.Fixed, "{}"), true
	}
	return "", false
}

// SameKey reports whether worker queues q and other have equal deploy keys.
// Implicit routing and coherence compare with it.
func (q Queue) SameKey(other Queue) bool {
	k, ok := q.Key()
	ko, oko := other.Key()
	return ok && oko && k == ko
}

// Overlaps reports whether some concrete queue name fits both worker queues,
// each parameter standing for one or more characters and an opaque queue for
// its literal text. A malformed queue overlaps nothing.
func (q Queue) Overlaps(other Queue) bool {
	pa, pb := q.glob(), other.glob()
	if pa == nil || pb == nil {
		return false
	}
	return globsOverlap(pa, pb)
}

// globsOverlap reports whether some string fits both glob token lists.
func globsOverlap(pa, pb []int) bool {
	memo := map[[2]int]bool{}
	var match func(i, j int) bool
	match = func(i, j int) bool {
		key := [2]int{i, j}
		if r, ok := memo[key]; ok {
			return r
		}
		var r bool
		switch {
		case i == len(pa) && j == len(pb):
			r = true
		case i < len(pa) && pa[i] == globStar:
			r = match(i+1, j) || (j < len(pb) && match(i, j+1))
		case j < len(pb) && pb[j] == globStar:
			r = match(i, j+1) || (i < len(pa) && match(i+1, j))
		case i < len(pa) && j < len(pb):
			r = (pa[i] == globAny || pb[j] == globAny || pa[i] == pb[j]) && match(i+1, j+1)
		}
		memo[key] = r
		return r
	}
	return match(0, 0)
}

const (
	globAny  = -1 // exactly one character
	globStar = -2 // zero or more characters
)

// glob turns a worker queue into glob tokens: literal bytes, and each
// parameter as globAny then globStar. A malformed queue yields nil.
func (q Queue) glob() []int {
	switch q.Form {
	case QueueMalformed:
		return nil
	case QueueOpaque:
		return bytesOf(q.Spelling, []int{})
	}
	out := []int{}
	for i, f := range q.Fixed {
		out = bytesOf(f, out)
		if i < len(q.Params) {
			out = append(out, globAny, globStar)
		}
	}
	return out
}

func bytesOf(s string, out []int) []int {
	for _, c := range []byte(s) {
		out = append(out, int(c))
	}
	return out
}

// scanBraces splits s at its brace groups, each `{…}` with no inner brace.
// fixed has one more element than groups; stray reports a brace outside any
// group, which stays in the surrounding fixed text.
func scanBraces(s string) (fixed, groups []string, stray bool) {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '{':
			if end := strings.IndexAny(s[i+1:], "{}"); end >= 0 && s[i+1+end] == '}' {
				fixed = append(fixed, b.String())
				b.Reset()
				groups = append(groups, s[i+1:i+1+end])
				i += end + 1
				continue
			}
			stray = true
		case '}':
			stray = true
		}
		b.WriteByte(s[i])
	}
	return append(fixed, b.String()), groups, stray
}

// touching reports whether two brace groups have no fixed text between them.
func touching(fixed []string) bool {
	return len(fixed) > 2 && slices.Contains(fixed[1:len(fixed)-1], "")
}

func isTemplateName(g string) bool {
	return !strings.Contains(g, ".") && isIDPath(g)
}
