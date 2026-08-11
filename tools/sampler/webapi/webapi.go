// Package webapi implements sampling.Backend against Temporal Cloud's web HTTP
// API — the grpc-gateway JSON projection of the frontend served at
// https://<namespace>.web.tmprl.cloud. It exists so the sampler can run against
// Temporal Cloud using only a bearer token pulled from an authenticated browser
// session (plus the caller-type header the Cloud UI sends), rather than mTLS
// certs or a gRPC API key. The three read RPCs the sampler needs
// (CountWorkflow, ListWorkflow, GetWorkflowHistory) map 1:1 onto documented web
// routes, and the JSON responses are proto-JSON, so they decode straight into
// the same go.temporal.io/api types the gRPC path uses.
package webapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Client talks to the Temporal Cloud web HTTP API. It satisfies
// sampling.Backend. The zero value is not usable; construct one with New.
type Client struct {
	// BaseURL is the scheme+host of the web endpoint, e.g.
	// https://production.urgaq.web.tmprl.cloud (no trailing slash required).
	BaseURL string
	// Namespace is the fully-qualified Cloud namespace, e.g. production.urgaq.
	Namespace string
	// Token returns the current bearer token, resolved fresh per request so a
	// rotating (short-lived) browser token can be refreshed underneath a
	// long-running sample. It is sent as `Authorization: Bearer <token>`.
	Token func() (string, error)
	// CallerType is sent as the `caller-type` header the Cloud web API expects
	// (the UI sends "operator"); omitted when empty.
	CallerType string
	// HTTP is the underlying client; New installs one with a sane timeout.
	HTTP *http.Client
}

// New builds a Client for the given web endpoint. baseURL may be given with or
// without a scheme (https:// is assumed when absent). token is resolved once
// per request; see StaticToken and FileToken for the common sources.
func New(baseURL, namespace string, token func() (string, error), callerType string) *Client {
	if !strings.Contains(baseURL, "://") {
		baseURL = "https://" + baseURL
	}
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Namespace:  namespace,
		Token:      token,
		CallerType: callerType,
		HTTP:       &http.Client{Timeout: 60 * time.Second},
	}
}

// StaticToken returns a token source that always yields the same token — for a
// long-lived credential (e.g. a Temporal Cloud API key).
func StaticToken(token string) func() (string, error) {
	return func() (string, error) {
		if strings.TrimSpace(token) == "" {
			return "", fmt.Errorf("empty bearer token")
		}
		return token, nil
	}
}

// FileToken returns a token source that reads (and trims) path on every call,
// so overwriting the file with a freshly-pulled token lets an in-flight sample
// survive the rotation of a short-lived browser-session JWT without a restart.
func FileToken(path string) func() (string, error) {
	return func() (string, error) {
		b, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read bearer file %s: %w", path, err)
		}
		t := strings.TrimSpace(string(b))
		if t == "" {
			return "", fmt.Errorf("bearer file %s is empty", path)
		}
		return t, nil
	}
}

// CountWorkflow implements the grouped/plain Count call via GET
// /api/v1/namespaces/{ns}/workflow-count.
func (c *Client) CountWorkflow(ctx context.Context, req *workflowservice.CountWorkflowExecutionsRequest) (*workflowservice.CountWorkflowExecutionsResponse, error) {
	q := url.Values{}
	if req.GetQuery() != "" {
		q.Set("query", req.GetQuery())
	}
	var out workflowservice.CountWorkflowExecutionsResponse
	if _, err := c.get(ctx, c.nsPath("/workflow-count"), q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListWorkflow implements the visibility list via GET
// /api/v1/namespaces/{ns}/workflows. The opaque next-page token is carried
// through as its raw base64 string (see tokenBytes) so it round-trips back into
// the next request unchanged, independent of the server's byte encoding.
func (c *Client) ListWorkflow(ctx context.Context, req *workflowservice.ListWorkflowExecutionsRequest) (*workflowservice.ListWorkflowExecutionsResponse, error) {
	q := url.Values{}
	if req.GetQuery() != "" {
		q.Set("query", req.GetQuery())
	}
	if req.GetPageSize() > 0 {
		q.Set("pageSize", strconv.Itoa(int(req.GetPageSize())))
	}
	if len(req.GetNextPageToken()) > 0 {
		q.Set("nextPageToken", string(req.GetNextPageToken()))
	}
	var out workflowservice.ListWorkflowExecutionsResponse
	rawTok, err := c.get(ctx, c.nsPath("/workflows"), q, &out)
	if err != nil {
		return nil, err
	}
	out.NextPageToken = tokenBytes(rawTok)
	return &out, nil
}

// GetWorkflowHistory returns a lazily-paginating iterator over one execution's
// history via GET /api/v1/namespaces/{ns}/workflows/{id}/history. isLongPoll is
// ignored (the sampler only reads settled histories).
func (c *Client) GetWorkflowHistory(ctx context.Context, workflowID, runID string, _ bool, filterType enumspb.HistoryEventFilterType) client.HistoryEventIterator {
	return &historyIterator{ctx: ctx, c: c, workflowID: workflowID, runID: runID, filterType: filterType}
}

// historyIterator implements client.HistoryEventIterator over the paginated
// history endpoint, fetching one page at a time as it is drained.
type historyIterator struct {
	ctx        context.Context
	c          *Client
	workflowID string
	runID      string
	filterType enumspb.HistoryEventFilterType

	buf   []*historypb.HistoryEvent
	idx   int
	token string
	done  bool
	err   error
}

func (it *historyIterator) HasNext() bool {
	for it.idx >= len(it.buf) && !it.done && it.err == nil {
		it.fetch()
	}
	return it.idx < len(it.buf) || it.err != nil
}

func (it *historyIterator) Next() (*historypb.HistoryEvent, error) {
	if it.idx < len(it.buf) {
		e := it.buf[it.idx]
		it.idx++
		return e, nil
	}
	if it.err != nil {
		err := it.err
		it.err = nil
		return nil, err
	}
	return nil, fmt.Errorf("history iterator exhausted")
}

func (it *historyIterator) fetch() {
	q := url.Values{}
	if it.runID != "" {
		q.Set("execution.runId", it.runID)
	}
	q.Set("maximumPageSize", "1000")
	q.Set("waitNewEvent", "false")
	if it.filterType != enumspb.HISTORY_EVENT_FILTER_TYPE_UNSPECIFIED {
		q.Set("historyEventFilterType", it.filterType.String())
	}
	if it.token != "" {
		q.Set("nextPageToken", it.token)
	}

	var out workflowservice.GetWorkflowExecutionHistoryResponse
	rawTok, err := it.c.get(it.ctx, it.c.nsPath("/workflows/"+url.PathEscape(it.workflowID)+"/history"), q, &out)
	if err != nil {
		it.err = err
		it.done = true
		return
	}
	it.buf = append(it.buf, out.GetHistory().GetEvents()...)
	it.token = rawTok
	if rawTok == "" {
		it.done = true
	}
}

// nsPath builds an /api/v1/namespaces/{ns}<suffix> path with the namespace
// escaped (Cloud namespaces contain a dot, e.g. production.urgaq).
func (c *Client) nsPath(suffix string) string {
	return "/api/v1/namespaces/" + url.PathEscape(c.Namespace) + suffix
}

// get performs one authenticated GET, decoding a proto-JSON body into out (when
// non-nil) and returning the response's raw nextPageToken string (empty when
// absent) so callers can round-trip it verbatim.
func (c *Client) get(ctx context.Context, path string, q url.Values, out proto.Message) (string, error) {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	token, err := c.Token()
	if err != nil {
		return "", fmt.Errorf("resolve bearer token: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if c.CallerType != "" {
		req.Header.Set("caller-type", c.CallerType)
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return "", fmt.Errorf("GET %s: HTTP %d (auth failed — the bearer token is likely expired; refresh it and re-run): %s", path, resp.StatusCode, snippet(body))
		}
		return "", fmt.Errorf("GET %s: HTTP %d: %s", path, resp.StatusCode, snippet(body))
	}
	if out != nil {
		if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(body, out); err != nil {
			return "", fmt.Errorf("decode %s response: %w (body: %s)", path, err, snippet(body))
		}
	}
	var tok struct {
		NextPageToken string `json:"nextPageToken"`
	}
	_ = json.Unmarshal(body, &tok)
	return tok.NextPageToken, nil
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

// tokenBytes carries a base64 next-page token as opaque bytes without decoding
// it: the sampler treats the token as an opaque []byte and hands it straight
// back, so storing the raw base64 string sidesteps any std-vs-url base64
// mismatch on the round trip.
func tokenBytes(raw string) []byte {
	if raw == "" {
		return nil
	}
	return []byte(raw)
}

// snippet trims a response body for inclusion in an error message.
func snippet(b []byte) string {
	const max = 512
	s := strings.TrimSpace(string(b))
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
