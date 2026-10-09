# three-layer-testing

Temporal Go code has three testable layers, each catching bugs the others structurally cannot. **Each layer mocks only its direct dependency** — a workflow test must not know about HTTP.

| Layer | File | Mocks | Build tag | Speed |
|---|---|---|---|---|
| Workflows | `workflows_test.go` | activities interface | *(none)* | fast, no Docker |
| Activities | `activities_test.go` | client interface | *(none)* | fast, no Docker |
| Clients | `client_test.go` | nothing (real system) | `integration` | slow, needs Docker |

Workflow tests check orchestration (right activities, right order, failures propagate); activity tests check validation and error handling; client tests check the real protocol and error codes that mocks hide. In every table-driven test, build fresh `env` and mocks per case, and name cases as documentation (`"error - empty role name"`, not `"test1"`).

## Layer 1: Workflow tests

Use `testsuite.WorkflowTestSuite`; mock the activities interface to drive the workflow to any outcome:

```go
func TestProcessOrderWorkflow(t *testing.T) {
    tests := []struct {
        name      string
        createErr error
        wantErr   bool
    }{
        {name: "success - order processed", wantErr: false},
        {name: "error - charge fails", createErr: errors.New("declined"), wantErr: true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            env := (&testsuite.WorkflowTestSuite{}).NewTestWorkflowEnvironment()
            mockActivities := mocks.NewMockActivities(t)
            env.RegisterActivity(mockActivities)

            mockActivities.EXPECT().
                ChargePayment(mock.Anything, mock.Anything).
                Return(&pb.ChargeOutput{Id: "ch-1"}, tt.createErr)

            env.ExecuteWorkflow(ProcessOrder, &pb.OrderInput{})

            err := env.GetWorkflowError()
            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
        })
    }
}
```

**Split validation tests from execution tests.** A constructor that validates input is tested directly, with no workflow environment — those run in milliseconds:

```go
func TestNewProcessOrder(t *testing.T) {
    _, err := newProcessOrder(&pb.OrderInput{}) // empty → invalid
    require.ErrorContains(t, err, "order_id")
}
```

Workflow tests also guard **replay safety**: Temporal replays from event history, so if changed code executes activities in a different order, replay breaks. These tests pin the activity-call sequence for given inputs.

## Layer 2: Activity tests

Mock the client interface. Cover, in order: validation errors (caught before any client call), success, then each client error type.

```go
func TestCreateThingActivity(t *testing.T) {
    tests := []struct {
        name      string
        input     *pb.CreateThingInput
        clientErr error
        wantErr   bool
    }{
        {name: "error - empty name", input: &pb.CreateThingInput{}, wantErr: true},                                   // validation
        {name: "success", input: &pb.CreateThingInput{Name: "x"}, wantErr: false},                                    // success
        {name: "error - already exists", input: &pb.CreateThingInput{Name: "x"}, clientErr: errExists, wantErr: true}, // client error
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            env := (&testsuite.WorkflowTestSuite{}).NewTestActivityEnvironment()
            mockClient := mocks.NewMockClient(t)

            // Conditional mock: only expect a client call if validation would pass.
            if tt.input.Name != "" {
                mockClient.EXPECT().Create(mock.Anything, tt.input.Name).Return("id-123", tt.clientErr)
            }

            acts := NewActivities(mockClient)
            env.RegisterActivity(acts.CreateThing)
            _, err := env.ExecuteActivity(acts.CreateThing, tt.input)

            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
        })
    }
}
```

**Conditional mocks mirror code flow:** set no expectation for input validation rejects — mockery then fails the test if the client is called anyway, proving the validation layer works.

## Layer 3: Client tests (integration)

Real system in a container via [testcontainers-go](https://golang.testcontainers.org), gated by a build tag so normal `go test ./...` skips them:

```go
//go:build integration

func TestMyServiceClient(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }
    ctx := context.Background()
    container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image:        "myservice:latest",
            ExposedPorts: []string{"8080/tcp"},
            WaitingFor:   wait.ForHTTP("/health").WithPort("8080/tcp"),
        },
        Started: true,
    })
    require.NoError(t, err)
    defer container.Terminate(ctx)

    host, _ := container.Host(ctx)
    port, _ := container.MappedPort(ctx, "8080")
    client := NewMyServiceClient(fmt.Sprintf("http://%s:%s", host, port.Port()))

    id, err := client.Create(ctx, "my-thing")
    require.NoError(t, err)
    require.NotEmpty(t, id)
}
```

- The `//go:build integration` tag keeps these out of normal runs; include with `go test -tags=integration ./...`.
- Start a fresh container per test function; always `defer container.Terminate(ctx)`.
- Assert against the client's **real error types** (`ErrNotFound`), not test sentinels — this verifies the client translates system error codes correctly.

## Mock generation (the proto seam)

Hand-written interfaces can be mocked by hand or generated. In a [proto-driven](./proto-driven.md) project the activities interface (`XxxActivities`) is itself generated, so its mock must be too; [mockery](https://vektra.github.io/mockery/) generates both kinds from `.mockery.yaml`:

```yaml
with-expecter: true
packages:
  github.com/myorg/myproject/gen/myservice/v1:   # generated activities interface → workflow tests
    interfaces:
      MyServiceActivities:
  github.com/myorg/myproject/lib/myservice/v1:    # hand-written client interface → activity tests
    interfaces:
      MyServiceClient:
```
