-- | nexus.twf, handler side: Greet, Compose, GreeterService and the greeterTypes worker.
module Greeter
  ( endpoint
  , service
  , taskQueue
  , greetId
  , greetStartOptions
  , greet
  , compose
  , greeterService
  , syncOperation
  , greeterTypes
  ) where

import Control.Exception (displayException, fromException)
import Data.Aeson (FromJSON, ToJSON)
import Data.HashMap.Strict qualified as HashMap
import Data.ProtoLens (defMessage)
import Data.Text (Text)
import Data.Text qualified as T
import Data.Typeable (Typeable)
import Lens.Family2 ((&), (.~), (^.))
import Proto.Temporal.Api.Enums.V1.Nexus qualified as NexusEnum
import Proto.Temporal.Api.Nexus.V1.Message_Fields qualified as Nexus
import Proto.Temporal.Sdk.Core.Nexus.Nexus qualified as CoreNexus
import RequireCallStack (provideCallStack)
import Temporal.Activity (Activity, ProvidedActivity, provideActivity)
import Temporal.Client qualified as C
import Temporal.Duration (minutes)
import Temporal.Exception (ApplicationFailure (..))
import Temporal.Payload (JSON (..), convertFromProtoPayload, convertToProtoPayload, decodeJSON, encodeJSON)
import Temporal.Worker (ConfigM, NexusOperationHandler (..), NexusServiceHandler (..), WorkerConfig, addNexusServiceHandler, configure)
import Temporal.Workflow hiding (taskQueue)
import UnliftIO.Exception (tryAny)

endpoint :: NexusEndpointName
endpoint = "GreeterEndpoint"

service :: NexusServiceName
service = "GreeterService"

taskQueue :: TaskQueue
taskQueue = "greeter"

-- | Greet's id_scheme: the full workflow ID of every start.
greetId :: Text -> WorkflowId
greetId name = WorkflowId ("greet-" <> name)

-- | Greet's client start options; every client start passes greetId's ID with them.
greetStartOptions :: C.StartWorkflowOptions
greetStartOptions = C.startWorkflowOptions taskQueue

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
-- and answers the start with its JSON result. A thrown ApplicationFailure fails
-- the operation; any other exception is a retryable handler error.
syncOperation :: (FromJSON i, FromJSON o, ToJSON o, Typeable o) => (i -> IO o) -> NexusOperationHandler
syncOperation f =
  NexusOperationHandler
    { handleStartOperation = \req -> case maybe (Left "no input") (decodeJSON . convertFromProtoPayload) (req ^. Nexus.maybe'payload) of
        Left err -> pure (badRequest err)
        Right i -> do
          r <- tryAny (f i)
          pure case r of
            Right o -> started (defMessage & Nexus.syncSuccess .~ (defMessage & Nexus.payload .~ convertToProtoPayload (encodeJSON o)))
            Left e
              | Just ApplicationFailure {message} <- fromException e -> started (defMessage & Nexus.operationError .~ operationFailed message)
              | otherwise -> retryableError (T.pack (displayException e))
    , handleCancelOperation = \_ -> pure (CoreNexus.NexusTaskCompletion'AckCancel True)
    }
  where
    started s = CoreNexus.NexusTaskCompletion'Completed (defMessage & Nexus.startOperation .~ s)
    operationFailed msg =
      defMessage
        & Nexus.operationState .~ "failed"
        & Nexus.failure .~ (defMessage & Nexus.message .~ msg)

retryableError :: Text -> CoreNexus.NexusTaskCompletion'Status
retryableError msg =
  CoreNexus.NexusTaskCompletion'Error
    ( defMessage
        & Nexus.errorType .~ "INTERNAL"
        & Nexus.retryBehavior .~ NexusEnum.NEXUS_HANDLER_ERROR_RETRY_BEHAVIOR_RETRYABLE
        & Nexus.failure .~ (defMessage & Nexus.message .~ msg)
    )

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
