# Proto-Driven Temporal Development

Protobuf is the single source of truth for workflow and activity interfaces. Code generators produce the framework — typed interfaces, registration helpers, activity futures, and Nexus stubs — leaving only business logic to be written by hand.

This means:
- Interface contracts are defined once in `.proto` files
- Generated code handles all Temporal SDK boilerplate
- Implementations satisfy well-typed Go interfaces
- Mocks are generated from those same interfaces (see [THREE_LAYER_TESTING.md](./THREE_LAYER_TESTING.md))

---

## Directory Layout

```
<project>/
├── proto/<service>/<version>/
│   └── <service>.proto          # Interface definitions (source of truth)
│
├── gen/<service>/<version>/
│   ├── *.pb.go                  # Generated: message types
│   └── *_temporal.pb.go         # Generated: activities interface, registration helpers, futures
│
└── lib/<service>/<version>/
    ├── activities.go            # Hand-written: implements generated Activities interface
    ├── workflows.go             # Hand-written: implements generated Workflows interface (if any)
    ├── client.go                # Hand-written: external system client (Vault, Kubernetes, etc.)
    └── fx.go                    # Hand-written: dependency injection wiring
```

Everything under `gen/` is generated — never edit it by hand.

---

## Required Tools

### buf

[buf](https://buf.build) manages proto dependencies and drives code generation.

```bash
# macOS
brew install bufbuild/buf/buf

# Linux
curl -sSL https://github.com/bufbuild/buf/releases/download/v1.67.0/buf-Linux-x86_64 -o ~/bin/buf
chmod +x ~/bin/buf
```

### protoc plugins

Install from `go.mod` so versions are pinned to the module:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go
go install github.com/alta/protopatch/cmd/protoc-gen-go-patch
go install github.com/cludden/protoc-gen-go-temporal/cmd/protoc-gen-go_temporal
# Optional: Nexus support
go install github.com/bergundy/protoc-gen-go-nexus/cmd/protoc-gen-go-nexus
go install github.com/bergundy/protoc-gen-go-nexus-temporal/cmd/protoc-gen-go-nexus-temporal
```

These must be on `$PATH` when `buf generate` runs.

---

## Configuration

### `buf.yaml` — module definition and lint rules

Place this at the root of your project (or the directory above `proto/`):

```yaml
version: v2
modules:
  - path: proto/<service>          # relative path to your proto directory

deps:
  - buf.build/cludden/protoc-gen-go-temporal   # Temporal annotations
  - buf.build/alta/protopatch                   # struct tag patching
  # - buf.build/bergundy/nexus                 # add if using Nexus

lint:
  use:
    - STANDARD
  except:
    # Temporal uses XxxInput/XxxOutput instead of XxxRequest/XxxResponse
    - RPC_REQUEST_STANDARD_NAME
    - RPC_RESPONSE_STANDARD_NAME
    - RPC_REQUEST_RESPONSE_UNIQUE
    # Other common exceptions when starting:
    - SERVICE_SUFFIX
    - ENUM_VALUE_PREFIX
    - ENUM_ZERO_VALUE_SUFFIX
    - PACKAGE_DIRECTORY_MATCH

breaking:
  use:
    - FILE
```

### `buf.gen.yaml` — code generation pipeline

```yaml
version: v2
managed:
  enabled: true

plugins:
  # 1. Generate Go message types (with struct tag patching)
  - local: protoc-gen-go-patch
    out: gen/<service>
    opt:
      - paths=source_relative
      - plugin=go

  # 2. Generate Temporal workflow/activity stubs and interfaces
  - local: protoc-gen-go_temporal
    out: gen/<service>
    opt:
      - paths=source_relative
      - enable-patch-support=true
    strategy: all

  # Optional: Nexus handler and client generation
  # - local: protoc-gen-go-nexus
  #   out: gen/<service>
  #   opt:
  #     - include-service-tags=nexus-enabled
  #     - exclude-operation-tags=activity
  #     - paths=source_relative
  # - local: protoc-gen-go-nexus-temporal
  #   out: gen/<service>
  #   opt:
  #     - include-service-tags=nexus-enabled
  #     - exclude-operation-tags=activity
  #     - paths=source_relative

inputs:
  - directory: proto/<service>
```

Run generation with:

```bash
buf generate
```

---

## Writing Proto Files

### Service with activities

```proto
syntax = "proto3";

package myservice.v1;

import "temporal/v1/temporal.proto";
import "patch/go.proto";

option go_package = "github.com/myorg/myproject/gen/myservice/v1;myservicev1";

service MyService {
  option (temporal.v1.service) = {task_queue: "my-task-queue"};

  rpc CreateThing(CreateThingInput) returns (CreateThingOutput) {
    option (temporal.v1.activity) = {
      name: "myservice.v1.CreateThing"
      schedule_to_close_timeout: {seconds: 300}
    };
  }
}

message CreateThingInput {
  string name = 1 [
    json_name = "Name",
    (go.field).tags = 'json:"Name" validate:"required"'
  ];
}

message CreateThingOutput {
  string id = 1 [
    json_name = "ID",
    (go.field).tags = 'json:"ID"'
  ];
}
```

Key points:
- `(temporal.v1.service)` sets the task queue for all RPCs in the service
- `(temporal.v1.activity)` marks an RPC as a Temporal activity; set a unique `name` and timeout
- `(go.field).tags` adds struct tags to the generated Go type (requires `protopatch`)
- Use `XxxInput` / `XxxOutput` naming — the Temporal ecosystem expects these, not `Request`/`Response`

### Service with workflows

```proto
rpc DeployCluster(DeployClusterInput) returns (DeployClusterOutput) {
  option (temporal.v1.workflow) = {
    name: "myservice.v1.DeployCluster"
    execution_timeout: {seconds: 3600}
    id: "deploy-cluster-{{.Input.ClusterName}}"
    id_reuse_policy: WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE_FAILED_ONLY
  };
}
```

Workflows and activities can coexist in the same service definition.

---

## What Gets Generated

For each service, `protoc-gen-go_temporal` generates (in `*_temporal.pb.go`):

| Generated symbol | Purpose |
|---|---|
| `MyServiceActivities` interface | Implement this with your business logic |
| `RegisterMyServiceActivities(worker, impl)` | Register all activities at once |
| `CreateThingActivityName` constant | Activity name string for Temporal |
| `CreateThingFuture` struct | Typed future for async activity calls from workflows |
| `MyServiceWorkflows` interface | Implement for workflows (if RPCs are annotated as workflows) |
| `RegisterMyServiceWorkflows(worker, impl)` | Register all workflows |
| `MyServiceClient` struct | Call activities/workflows from outside Temporal |

You never write these by hand — only the implementations.

---

## Implementing Activities

Implement the generated interface:

```go
// activities.go
package myservice

import (
    "context"
    "errors"
    "fmt"

    pb "github.com/myorg/myproject/gen/myservice/v1"
)

// Activities implements pb.MyServiceActivities
type Activities struct {
    client MyServiceClient  // your hand-written external system client
}

func NewActivities(client MyServiceClient) *Activities {
    return &Activities{client: client}
}

func (a *Activities) CreateThing(ctx context.Context, req *pb.CreateThingInput) (*pb.CreateThingOutput, error) {
    // 1. Validate
    if req.Name == "" {
        return nil, errors.New("name is required")
    }

    // 2. Call external system
    id, err := a.client.Create(ctx, req.Name)
    if err != nil {
        return nil, fmt.Errorf("create thing: %w", err)
    }

    // 3. Return typed output
    return &pb.CreateThingOutput{Id: id}, nil
}
```

Each activity follows three steps: validate → call → return.

---

## Registering With the Worker

Wire up the generated registration function in an `fx.go` (or equivalent):

```go
// fx.go
package myservice

import (
    pb "github.com/myorg/myproject/gen/myservice/v1"
    "go.temporal.io/sdk/worker"
    "go.uber.org/fx"
)

var Module = fx.Options(
    fx.Provide(NewMyServiceClient),
    fx.Provide(func(client MyServiceClient) pb.MyServiceActivities {
        return NewActivities(client)
    }),
)

func RegisterActivities(w worker.Worker, activities pb.MyServiceActivities) {
    pb.RegisterMyServiceActivities(w, activities)
}
```

Call `RegisterActivities` during worker startup. Missing registration causes runtime "activity not found" panics.

---

## The Client Interface

Define an interface for your external system client so it can be mocked in tests:

```go
// client.go
package myservice

import "context"

// MyServiceClient is the interface activities use to talk to the external system.
// Define it here; implement it below.
type MyServiceClient interface {
    Create(ctx context.Context, name string) (id string, err error)
    Delete(ctx context.Context, id string) error
}

// myServiceClient is the real implementation
type myServiceClient struct {
    addr string
}

func NewMyServiceClient(addr string) MyServiceClient {
    return &myServiceClient{addr: addr}
}

func (c *myServiceClient) Create(ctx context.Context, name string) (string, error) {
    // ... real HTTP/gRPC/SDK call ...
}
```

The interface lives in the implementation package. Mockery generates a mock from it. Activities depend only on the interface, not the concrete type.

---

## Makefile Targets

A typical Makefile setup:

```makefile
BUF_VERSION ?= 1.67.0

install-tools-proto:
	go install google.golang.org/protobuf/cmd/protoc-gen-go
	go install github.com/alta/protopatch/cmd/protoc-gen-go-patch
	go install github.com/cludden/protoc-gen-go-temporal/cmd/protoc-gen-go_temporal

proto: install-tools-proto
	buf generate

install-tools-mocks:
	go install github.com/vektra/mockery/v2

mocks: install-tools-mocks
	go generate -run mockery

gen: proto mocks

lint-proto:
	buf lint
	buf format -w
```

---

## Adding a New Service: Checklist

- [ ] Create `proto/<service>/<version>/<service>.proto`
- [ ] Add `go_package` option pointing to your `gen/` directory
- [ ] Annotate service with `(temporal.v1.service)` (task queue)
- [ ] Annotate each RPC with `(temporal.v1.activity)` or `(temporal.v1.workflow)` and a unique name
- [ ] Run `buf generate` → inspect `gen/<service>/<version>/`
- [ ] Implement the generated `XxxActivities` interface in `lib/<service>/<version>/activities.go`
- [ ] Define the client interface in `client.go`, implement it below
- [ ] Wire registration in `fx.go`
- [ ] Add the new interfaces to `.mockery.yaml` and run `go generate -run mockery`
- [ ] Register with the worker at startup
- [ ] Write unit tests (see [THREE_LAYER_TESTING.md](./THREE_LAYER_TESTING.md))

---

## A Note on Generated Test Mocks

The same interfaces used by implementations are used for testing. After generation:

- `pb.MyServiceActivities` → mock used to test workflows that call these activities
- `MyServiceClient` → mock used to test activities in isolation

Mocks are generated by [mockery](https://vektra.github.io/mockery/) from a `.mockery.yaml` config. See [THREE_LAYER_TESTING.md](./THREE_LAYER_TESTING.md) for full details.

---

## References

- [protoc-gen-go-temporal](https://github.com/cludden/protoc-gen-go-temporal) — the core Temporal code generator
- [protopatch](https://github.com/alta/protopatch) — struct tag injection for Go proto types
- [buf](https://buf.build/docs) — proto dependency management and generation pipeline
- [THREE_LAYER_TESTING.md](./THREE_LAYER_TESTING.md) — testing strategy for this architecture
