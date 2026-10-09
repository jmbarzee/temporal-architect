# proto-driven

Codegen variant where **protobuf is the single source of truth** for workflow and activity interfaces (alias "PFI"). Generators emit the Temporal framework — typed interfaces, registration helpers, futures, Nexus stubs — and only business logic is hand-written. Routed here by the [Orient](../SKILL.md#orient) signals. In an existing repo, its layout, tooling, and naming win over the skeleton below.

## Contract + layout

One direction of flow: `proto/` → `gen/` (generated — never hand-edit) → `lib/` (hand-written).

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

## Tools

[buf](https://buf.build/docs) drives generation (`buf generate`) with [protoc-gen-go-temporal](https://github.com/cludden/protoc-gen-go-temporal) and [protopatch](https://github.com/alta/protopatch) (struct tags). Install the plugins from `go.mod`, so versions are pinned to the module, and put them on `$PATH`:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go
go install github.com/alta/protopatch/cmd/protoc-gen-go-patch
go install github.com/cludden/protoc-gen-go-temporal/cmd/protoc-gen-go_temporal
# Optional: Nexus support
go install github.com/bergundy/protoc-gen-go-nexus/cmd/protoc-gen-go-nexus
go install github.com/bergundy/protoc-gen-go-nexus-temporal/cmd/protoc-gen-go-nexus-temporal
```

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

  rpc TeardownCluster(TeardownClusterInput) returns (TeardownClusterOutput) {
    option (temporal.v1.workflow) = {
      name: "myservice.v1.TeardownCluster"
      id: "teardown-cluster-{{.Input.ClusterName}}"
    };
    option (.nexus.v1.operation).tags = "activity"; // opt out of Nexus exposure
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
- `(.nexus.v1.operation)` controls Nexus exposure, **default-on, opt-out**: with the Nexus plugins enabled, every `(temporal.v1.workflow)` RPC is a Nexus operation unless tagged `(.nexus.v1.operation).tags = "activity"` (as `TeardownCluster` is). It lives in `nexus.v1`, outside `temporal.v1.*`, so a scan of only `temporal.v1.*` annotations reports the wrong Nexus surface — recover the true surface from the generated Nexus stubs (below).

## Generated-symbol table

`protoc-gen-go_temporal` emits these per annotated service in `*_temporal.pb.go`; you write only the implementations. [Reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md) reads this table backward to recover intent from generated code.

| Generated symbol | Purpose |
|---|---|
| `XxxActivities` interface | implement with your business logic |
| `RegisterXxxActivities(worker, impl)` | register all activities at once |
| `XxxActivityName` constant | activity name string for Temporal |
| `XxxFuture` struct | typed future for async activity calls from workflows |
| `XxxWorkflows` interface | implement for workflows (if RPCs are annotated as workflows) |
| `RegisterXxxWorkflows(worker, impl)` | register all workflows |
| `XxxClient` struct | call activities/workflows from outside Temporal |
| Nexus operation stub (Nexus plugins only) | present ⇒ the workflow RPC is Nexus-exposed; missing for an annotated workflow RPC ⇒ opted out |

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

**Register** with the generated helper, commonly via `fx`:

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

**Client interface** — hand-written, in the implementation package, so activities depend on it rather than the concrete client and tests can mock it ([three-layer-testing.md](./three-layer-testing.md)):

```go
// client.go
type MyServiceClient interface {
    Create(ctx context.Context, name string) (id string, err error)
    Delete(ctx context.Context, id string) error
}
```
