-- | nexus.twf, handler side: Greet, Compose, GreeterService and the greeterTypes worker.
module Greeter
  ( endpoint
  , service
  , taskQueue
  , greetId
  , greet
  , compose
  , greeterService
  , greeterTypes
  ) where

import Data.Aeson (FromJSON, ToJSON)
import Data.HashMap.Strict qualified as HashMap
import Data.ProtoLens (defMessage)
import Data.Text (Text)
import Data.Text qualified as T
import Data.Typeable (Typeable)
import Lens.Family2 ((&), (.~), (^.))
import Proto.Temporal.Api.Nexus.V1.Message_Fields qualified as Nexus
import Proto.Temporal.Sdk.Core.Nexus.Nexus qualified as CoreNexus
import RequireCallStack (provideCallStack)
import Temporal.Activity (Activity, ProvidedActivity, provideActivity)
import Temporal.Duration (minutes)
import Temporal.Payload (JSON (..), convertFromProtoPayload, convertToProtoPayload, decodeJSON, encodeJSON)
import Temporal.Worker (ConfigM, NexusOperationHandler (..), NexusServiceHandler (..), WorkerConfig, addNexusServiceHandler, configure)
import Temporal.Workflow hiding (taskQueue)

endpoint :: NexusEndpointName
endpoint = "GreeterEndpoint"

service :: NexusServiceName
service = "GreeterService"

taskQueue :: TaskQueue
taskQueue = "greeter"

-- | Greet's id_scheme: the full workflow ID of every start.
greetId :: Text -> WorkflowId
greetId name = WorkflowId ("greet-" <> name)

compose :: ProvidedActivity () (Text -> Activity () Text)
compose = provideActivity JSON "Compose" \name -> pure ("Greetings, " <> name)

greet :: ProvidedWorkflow (Text -> Workflow Text)
greet = provideCallStack $ provideWorkflow JSON "Greet" \name ->
  executeActivity compose (defaultStartActivityOptions (StartToClose (minutes 1))) name

-- | GreeterService's sync Hello. Greet (async … workflow) has no SDK form at the
-- pin: the SDK has no workflow-run operation handler.
greeterService :: NexusServiceHandler
greeterService =
  NexusServiceHandler
    { serviceName = "GreeterService"
    , operations = HashMap.fromList [("Hello", syncOperation \name -> pure ("Hello, " <> name :: Text))]
    }

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

-- | The greeterTypes worker's registrations; the caller adds its deployment.
greeterTypes :: ConfigM () () -> WorkerConfig ()
greeterTypes deploy = configure () (greet, compose) do
  addNexusServiceHandler greeterService
  deploy
