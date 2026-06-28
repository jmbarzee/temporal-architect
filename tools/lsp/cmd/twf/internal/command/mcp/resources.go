package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/spec"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	// specURIRoot is the URI of the full embedded spec; per-section URIs are
	// specURIRoot + "/" + slug.
	specURIRoot = "twf://spec"
	specMIME    = "text/markdown"
)

// registerResources exposes the embedded TWF language spec as MCP resources:
// the full spec at twf://spec and each section at twf://spec/<slug>.
func registerResources(s *mcp.Server) error {
	sections, err := spec.Sections()
	if err != nil {
		return fmt.Errorf("load embedded spec: %w", err)
	}

	s.AddResource(&mcp.Resource{
		URI:         specURIRoot,
		Name:        "twf-spec",
		Title:       "TWF language specification (full)",
		Description: "The complete embedded TWF (Temporal Workflow Format) language specification, all sections in canonical order.",
		MIMEType:    specMIME,
	}, specResourceHandler)

	for _, sec := range sections {
		s.AddResource(&mcp.Resource{
			URI:         specURIRoot + "/" + sec.Slug,
			Name:        "twf-spec-" + sec.Slug,
			Title:       sec.Title,
			Description: "TWF language specification section: " + sec.Title,
			MIMEType:    specMIME,
		}, specResourceHandler)
	}

	return nil
}

// specResourceHandler serves both the full spec (twf://spec) and individual
// sections (twf://spec/<slug>) by inspecting the requested URI.
func specResourceHandler(_ context.Context, req *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
	uri := req.Params.URI

	var text string
	switch {
	case uri == specURIRoot:
		full, err := spec.All()
		if err != nil {
			return nil, err
		}
		text = full
	case strings.HasPrefix(uri, specURIRoot+"/"):
		slug := strings.TrimPrefix(uri, specURIRoot+"/")
		sec, ok, err := spec.Get(slug)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, mcp.ResourceNotFoundError(uri)
		}
		text = strings.TrimRight(sec.Content, "\n") + "\n"
	default:
		return nil, mcp.ResourceNotFoundError(uri)
	}

	return &mcp.ReadResourceResult{
		Contents: []*mcp.ResourceContents{{
			URI:      uri,
			MIMEType: specMIME,
			Text:     text,
		}},
	}, nil
}

// specEntry is one row of the twf_spec_list tool output.
type specEntry struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
}

// buildSpecList returns the spec section index (slug + title) as JSON.
func buildSpecList() ([]byte, error) {
	sections, err := spec.Sections()
	if err != nil {
		return nil, err
	}
	out := make([]specEntry, 0, len(sections))
	for _, s := range sections {
		out = append(out, specEntry{Slug: s.Slug, Title: s.Title})
	}
	return json.MarshalIndent(out, "", "  ")
}

// buildSpecGet returns one spec section's markdown body as a text tool result,
// or a tool error if the slug is unknown.
func buildSpecGet(slug string) (*mcp.CallToolResult, any, error) {
	sec, ok, err := spec.Get(slug)
	if err != nil {
		return nil, nil, err
	}
	if !ok {
		return nil, nil, fmt.Errorf("unknown spec section %q (use twf_spec_list for slugs)", slug)
	}
	return textResult(strings.TrimRight(sec.Content, "\n") + "\n"), nil, nil
}
