# proto-driven

Codegen variant where **protobuf is the single source of truth** for workflow and activity interfaces. Generators produce the Temporal framework — typed interfaces, registration helpers, activity futures, Nexus stubs — leaving only business logic hand-written. Route here when the [Orient](../SKILL.md#orient) signals fire (`buf.gen.yaml` → `protoc-gen-go_temporal`, generated `*_temporal.pb.go`, `(temporal.v1.activity|workflow)` annotations).

Sometimes called **PFI** (proto-first interfaces). Detect it from those repo signals, never from the name.

In an existing proto-first repo, the layout, tooling, and naming are **requirements to match** — conform to what discovery found; do not impose this skeleton over a different one.

---

## Contract + layout

Three directories, one direction of flow: `proto/` (source of truth) → `gen/` (generated, never edit) → `lib/` (hand-written).

```
<project>/
├── proto/<service>/<version>/<service>.proto   # interface definitions (source of truth)
├── gen/<service>/<version>/
│   ├── *.pb.go                                  # generated: message types
│   └── *_temporal.pb.go                         # generated: interfaces, registration helpers, futures
└── lib/<service>/<version>/
    ├── activities.go                            # hand-written: implements generated Activities interface
    ├── workflows.go                             # hand-written: implements generated Workflows interface (if any)
    ├── client.go                                # hand-written: external system client
    └── fx.go                                    # hand-written: dependency injection wiring
```

Everything under `gen/` is generated — never hand-edit it.

---

## Tools

[buf](https://buf.build) drives generation; plugins are installed from `go.mod` so versions are pinned to the module:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go
go install github.com/alta/protopatch/cmd/protoc-gen-go-patch
go install github.com/cludden/protoc-gen-go-temporal/cmd/protoc-gen-go_temporal
# Optional: Nexus support
go install github.com/bergundy/protoc-gen-go-nexus/cmd/protoc-gen-go-nexus
go install github.com/bergundy/protoc-gen-go-nexus-temporal/cmd/protoc-gen-go-nexus-temporal
```

These must be on `$PATH` when `buf generate` runs.

### `buf.yaml` skeleton

```yaml
version: v2
modules:
  - path: proto/<service>
deps:
  - buf.build/cludden/protoc-gen-go-temporal   # Temporal annotations
  - buf.build/alta/protopatch                   # struct tag patching
lint:
  use:
    - STANDARD
  except:
    # Temporal uses XxxInput/XxxOutput, not XxxRequest/XxxResponse
    - RPC_REQUEST_STANDARD_NAME
    - RPC_RESPONSE_STANDARD_NAME
    - RPC_REQUEST_RESPONSE_UNIQUE
breaking:
  use:
    - FILE
```

### `buf.gen.yaml` skeleton

```yaml
version: v2
managed:
  enabled: true
plugins:
  - local: protoc-gen-go-patch       # Go message types (with struct tag patching)
    out: gen/<service>
    opt: [paths=source_relative, plugin=go]
  - local: protoc-gen-go_temporal    # Temporal workflow/activity stubs and interfaces
    out: gen/<service>
    opt: [paths=source_relative, enable-patch-support=true]
    strategy: all
inputs:
  - directory: proto/<service>
```

Run generation with `buf generate`.

---

## Proto annotations

```proto
service MyService {
  option (temporal.v1.service) = {task_queue: "my-task-queue"};

  rpc CreateThing(CreateThingInput) returns (CreateThingOutput) {
    option (temporal.v1.activity) = {
      name: "myservice.v1.CreateThing"
      schedule_to_close_timeout: {seconds: 300}
    };
  }

  rpc DeployCluster(DeployClusterInput) returns (DeployClusterOutput) {
    option (temporal.v1.workflow) = {
      name: "myservice.v1.DeployCluster"
      id: "deploy-cluster-{{.Input.ClusterName}}"
    };
  }
}

message CreateThingInput {
  string name = 1 [(go.field).tags = 'json:"Name" validate:"required"'];
}
```

- `(temporal.v1.service)` sets the task queue for all RPCs in the service.
- `(temporal.v1.activity)` / `(temporal.v1.workflow)` mark an RPC; set a unique `name` and timeouts. Workflows and activities coexist in one service.
- `(go.field).tags` injects struct tags on the generated Go type (requires `protopatch`).
- Use `XxxInput` / `XxxOutput` naming — the Temporal ecosystem expects these, not `Request`/`Response`.

---

## Generated-symbol table

For each annotated service, `protoc-gen-go_temporal` emits these in `*_temporal.pb.go`. This is the Rosetta Stone — the same table is read **backward** during [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md) to recover intent from generated code.

| Generated symbol | Purpose |
|---|---|
| `XxxActivities` interface | implement with your business logic |
| `RegisterXxxActivities(worker, impl)` | register all activities at once |
| `XxxActivityName` constant | activity name string for Temporal |
| `XxxFuture` struct | typed future for async activity calls from workflows |
| `XxxWorkflows` interface | implement for workflows (if RPCs are annotated as workflows) |
| `RegisterXxxWorkflows(worker, impl)` | register all workflows |
| `XxxClient` struct | call activities/workflows from outside Temporal |

You never write these — only the implementations.

---

## Implement, register, client

**Implement** the generated interface; each method is validate → call → return:

```go
// activities.go
type Activities struct {
    client MyServiceClient // hand-written external system client
}

func (a *Activities) CreateThing(ctx context.Context, req *pb.CreateThingInput) (*pb.CreateThingOutput, error) {
    if req.Name == "" {                              // 1. validate
        return nil, errors.New("name is required")
    }
    id, err := a.client.Create(ctx, req.Name)        // 2. call external system
    if err != nil {
        return nil, fmt.Errorf("create thing: %w", err)
    }
    return &pb.CreateThingOutput{Id: id}, nil        // 3. return typed output
}
```

**Register** the generated helper at worker startup (commonly via `fx`):

```go
// fx.go
var Module = fx.Options(
    fx.Provide(NewMyServiceClient),
    fx.Provide(func(c MyServiceClient) pb.MyServiceActivities { return NewActivities(c) }),
)

func RegisterActivities(w worker.Worker, a pb.MyServiceActivities) {
    pb.RegisterMyServiceActivities(w, a) // generated; missing registration → "activity not found" at runtime
}
```

**Client interface** — define a hand-written interface for the external system in the implementation package so activities depend on the interface, not the concrete type (and it can be mocked in tests):

```go
// client.go
type MyServiceClient interface {
    Create(ctx context.Context, name string) (id string, err error)
    Delete(ctx context.Context, id string) error
}
```

For the testing seam on these generated and hand-written interfaces, see [three-layer-testing.md](./three-layer-testing.md).

---

## References

- [protoc-gen-go-temporal](https://github.com/cludden/protoc-gen-go-temporal) — the core Temporal code generator
- [protopatch](https://github.com/alta/protopatch) — struct tag injection for Go proto types
- [buf](https://buf.build/docs) — proto dependency management and generation pipeline
- [three-layer-testing.md](./three-layer-testing.md) — testing strategy; the generated activities interface is the proto seam for mocks
