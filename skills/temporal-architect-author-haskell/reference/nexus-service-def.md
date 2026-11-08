# nexus service definition

```twf
nexus service BillingService:
	async ChargePayment workflow BillingChargeWorkflow
	sync RefundPayment(req: RefundRequest) -> (RefundResult):
		signal BillingChargeWorkflow.Refund(req)
			id: "charge-{req.chargeId}"
		close complete(RefundResult{status: "requested"})
```

```haskell
-- | BillingService's handler: its sync operations, over the client their bodies use.
billingService :: C.WorkflowClient -> NexusServiceHandler
billingService client =
  NexusServiceHandler
    { serviceName = "BillingService"
    , operations = HashMap.fromList [("RefundPayment", syncOperation (refundPayment client))]
    }

refundPayment :: C.WorkflowClient -> RefundRequest -> IO RefundResult
refundPayment client req = flip runReaderT client do
  h <- C.getHandle billingChargeWorkflow.reference (billingChargeWorkflowId req.chargeId) Nothing Nothing
  C.signal h refundSignal C.defaultSignalOptions req
  pure RefundResult {status = "requested"}
```

The handler side is raw: `NexusServiceHandler` is the service's name and a map from operation name to `NexusOperationHandler`, whose start and cancel functions take and answer `proto-lens` messages (`Nexus/Worker.hs:32-41`). `C` is `Temporal.Client` imported qualified.

Registration on the **handler** worker (the target namespace's), not the caller: its `<worker>Types` function calls `addNexusServiceHandler (billingService client)` in its settings (`Worker.hs:541-545`) and registers the backing workflows ([worker.md](./worker.md)). A `.twf` `nexus service` is one `NexusServiceHandler` holding **every** operation it declares, keyed by the `.twf` operation names: nothing checks the set at registration, and a call to a missing operation fails at run time (`Nexus/Worker.hs:90-96`). `twf check` rejects `nexus service Svc.Op`; operations a design deploys apart are a separate `nexus service`.

## Contract

**A typed service contract is unsupported at the pin**: a service is a `Text` name and a map of untyped handlers, and the caller passes raw payloads ([nexus.md](./nexus.md)), so nothing checks one side against the other. Put each operation's input and result types in one module both sides import, beside the ID and start-options functions ([workflow-def.md](./workflow-def.md#id_scheme)). An operation takes one input: several values travel as one declared record, per spec 04.

## async

**`async Op workflow Name` is unsupported at the pin.** The SDK has no workflow-run operation handler: `NexusOperationHandler` answers raw start and cancel requests (`Nexus/Worker.hs:32-35`), and `Temporal.Client.start` attaches no completion callback (`Client/Types.hs:19-96`), so no SDK call starts a workflow that completes the operation. Never hand-roll one over the raw RPCs. A service declaring one is hosted in another SDK, whose author skill writes its handler worker. The corpus's `greeterService` registers its sync `Hello` only, and its test answers `Greet` with a stand-in.

## sync

`sync Op(param) -> (T):` → `syncOperation body`, the corpus's typed helper over `NexusOperationHandler`: it decodes the one JSON input, runs the body in `IO`, and answers the start with its JSON result. Copy it with the corpus's imports (`corpus/nexus/haskell/Greeter.hs`):

```haskell
-- | A sync operation over the SDK's raw handler: decodes the one input, runs f,
-- and answers the start with its JSON result.
syncOperation :: (FromJSON i, FromJSON o, ToJSON o, Typeable o) => (i -> IO o) -> NexusOperationHandler
syncOperation f =
  NexusOperationHandler
    { handleStartOperation = \req -> case maybe (Left "no input") (decodeJSON . convertFromProtoPayload) (req ^. Nexus.maybe'payload) of
        Left err -> pure (badRequest err)
        Right i -> do
          o <- f i
          let sync = defMessage & Nexus.payload .~ convertToProtoPayload (encodeJSON o)
          pure (CoreNexus.NexusTaskCompletion'Completed (defMessage & Nexus.startOperation .~ (defMessage & Nexus.syncSuccess .~ sync)))
    , handleCancelOperation = \_ -> pure (CoreNexus.NexusTaskCompletion'AckCancel True)
    }

badRequest :: String -> CoreNexus.NexusTaskCompletion'Status
badRequest msg =
  CoreNexus.NexusTaskCompletion'Error
    ( defMessage
        & Nexus.errorType .~ "BAD_REQUEST"
        & Nexus.failure .~ (defMessage & Nexus.message .~ T.pack msg)
    )
```

The body holds only client forms, each a call on a `WorkflowClient` the handler closes over, or plain Haskell:

| Statement in a sync body | Haskell, in `ReaderT WorkflowClient IO` |
|---|---|
| `workflow Name(args) [-> r]` (a client start) | `h <- C.start name (nameId …) nameStartOptions args`, then `r <- C.waitWorkflowResult h` (`Client.hs:303,665`) |
| `detach workflow Name(args)` | the same `C.start`; never `C.waitWorkflowResult` ([detach.md](./detach.md)) |
| `signal Type.Name(args)` + `id:` | `h <- C.getHandle type.reference workflowId runId Nothing`, then `C.signal h signalRef C.defaultSignalOptions args` (`Client.hs:389-396,537-543`); `workflowId` and args as in [signal-send.md](./signal-send.md) |
| `close complete(r)` | `pure r` |
| `close fail(e)` | no form through `syncOperation` (below) |
| `if` / `for` / `switch` / `break` / `continue`, raw lines (`x = expr`) | Haskell equivalents ([control-flow.md](./control-flow.md)) |

`id:` is the whole workflow ID (`twf spec cross-workflow-signals`), so `RefundPayment` signals the workflow `ChargePayment` starts by calling the ID function its starts use, `billingChargeWorkflowId`.

**A body that throws is never answered.** The SDK runs each Nexus task in an `async` it never waits and completes the task only from the handler's returned status (`Nexus/Worker.hs:62,66-80`), so an exception leaves the task uncompleted and the server retries it until the caller's `schedule_to_close_timeout`. `close fail(e)` therefore has no form through `syncOperation`: it is an answered `StartOperationResponse'OperationError` over the raw messages, which the helper does not build. Tell the user when a design's sync body fails.
