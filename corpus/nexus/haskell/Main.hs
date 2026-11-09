module Main (main) where

import Caller
import Control.Concurrent.MVar (MVar, newEmptyMVar, readMVar, tryPutMVar)
import Data.Foldable (toList)
import Data.HashMap.Strict qualified as HashMap
import Data.ProtoLens (defMessage)
import Data.Text (Text)
import Greeter qualified
import Harness
import Lens.Family2 ((&), (.~), (^.))
import Proto.Temporal.Api.History.V1.Message (HistoryEvent'Attributes (..))
import Proto.Temporal.Api.History.V1.Message_Fields qualified as History
import Proto.Temporal.Api.Nexus.V1.Message_Fields qualified as Nexus
import Proto.Temporal.Sdk.Core.Nexus.Nexus qualified as CoreNexus
import System.Timeout (timeout)
import Temporal.Client qualified as C
import Temporal.Operator (createNexusEndpoint)
import Temporal.Payload (convertFromProtoPayload, convertToProtoPayload, decodeJSON, encodeJSON)
import Temporal.Worker (ConfigM, NexusOperationHandler (..), NexusServiceHandler (..), WorkerConfig, addNexusServiceHandler, configure, setNamespace, setTaskQueue)
import Temporal.Workflow (TaskQueue)
import Test.Hspec

main :: IO ()
main = hspec do
  describe "nexus" do
    it "Greet" $ withEnv \env ->
      withWorker env (Greeter.greeterTypes (deploy Greeter.taskQueue)) do
        r <- run env (C.execute Greeter.greet (Greeter.greetId "Ada") (C.startWorkflowOptions Greeter.taskQueue) "Ada")
        r `shouldBe` ("Greetings, Ada" :: Text)

    it "Caller: Hello, Greet, and a detached Greet it never waits for" $ withEnv \env -> do
      ep <- createNexusEndpoint env.core Greeter.endpoint "default" Greeter.taskQueue
      either (expectationFailure . show) (const (pure ())) ep
      held <- newEmptyMVar
      withWorker env (greeterWithStandIn held) $
        withWorker env (callerTypes (deploy "caller")) do
          h <- run env (C.start caller "caller-1" (C.startWorkflowOptions "caller") "Ada" "Grace")
          C.waitWorkflowResult h `shouldReturn` Greetings "Hello, Ada" "Greetings, Ada"
          evs <- map (^. History.maybe'attributes) . toList . (^. History.vec'events) <$> C.fetchHistory h
          [(a ^. History.endpoint, a ^. History.operation) | Just (HistoryEvent'NexusOperationScheduledEventAttributes a) <- evs]
            `shouldBe` [("GreeterEndpoint", "Hello"), ("GreeterEndpoint", "Greet"), ("GreeterEndpoint", "Greet")]
          length [() | Just (HistoryEvent'NexusOperationCompletedEventAttributes _) <- evs] `shouldBe` 2
          [() | Just (HistoryEvent'WorkflowExecutionCompletedEventAttributes _) <- [last evs]] `shouldBe` [()]
          -- Caller closed without the detached Greet; its start still reached the handler.
          timeout 10000000 (readMVar held) `shouldReturn` Just "Grace"

deploy :: TaskQueue -> ConfigM () ()
deploy q = setNamespace "default" >> setTaskQueue q

-- | greeterTypes with a stand-in for Greet. Greet (async … workflow) has no SDK
-- handler at the pin, so the test answers it over the raw Nexus task API, as
-- nexus/ruby does: Greet(Ada) completes synchronously; any other Greet starts
-- asynchronously, puts its name in held, and never completes, so only a detached
-- call lets Caller return.
greeterWithStandIn :: MVar Text -> WorkerConfig ()
greeterWithStandIn held = configure () (Greeter.greet, Greeter.compose) do
  addNexusServiceHandler
    Greeter.greeterService {operations = HashMap.insert "Greet" greetStandIn Greeter.greeterService.operations}
  deploy Greeter.taskQueue
  where
    greetStandIn =
      NexusOperationHandler
        { handleStartOperation = \req -> do
            let name = either error id (decodeJSON (convertFromProtoPayload (req ^. Nexus.payload))) :: Text
            start <-
              if name == "Ada"
                then pure (defMessage & Nexus.syncSuccess .~ (defMessage & Nexus.payload .~ convertToProtoPayload (encodeJSON ("Greetings, " <> name))))
                else tryPutMVar held name >> pure (defMessage & Nexus.asyncSuccess .~ (defMessage & Nexus.operationToken .~ "held"))
            pure (CoreNexus.NexusTaskCompletion'Completed (defMessage & Nexus.startOperation .~ start))
        , handleCancelOperation = \_ -> pure (CoreNexus.NexusTaskCompletion'AckCancel True)
        }
