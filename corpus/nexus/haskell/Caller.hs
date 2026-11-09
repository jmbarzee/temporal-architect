-- | nexus.twf, caller side: the Caller workflow and the callerTypes worker.
module Caller
  ( Greetings (..)
  , caller
  , callerTypes
  ) where

import Data.Aeson (FromJSON, ToJSON)
import Data.Text (Text)
import GHC.Generics (Generic)
import Greeter qualified
import RequireCallStack (provideCallStack)
import Temporal.Payload (JSON (..), decodeJSON, encodeJSON)
import Temporal.Worker (ConfigM, WorkerConfig, configure)
import Temporal.Workflow

data Greetings = Greetings
  { hello :: Text
  , greeting :: Text
  }
  deriving stock (Eq, Show, Generic)
  deriving anyclass (FromJSON, ToJSON)

-- | The caller's operations are untyped: one JSON payload in, one out.
callNexus :: RequireCallStack => NexusClient -> NexusOperationName -> Text -> Workflow Text
callNexus c op input = do
  out <- executeNexusOperation c op defaultScheduleNexusOperationOptions (encodeJSON input)
  either error pure (decodeJSON out)

caller :: ProvidedWorkflow (Text -> Text -> Workflow Greetings)
caller = provideCallStack $ provideWorkflow JSON "Caller" \name friend -> do
  let greeter = makeNexusClient Greeter.endpoint Greeter.service
  hello <- callNexus greeter "Hello" name
  greeting <- callNexus greeter "Greet" name
  -- detach: never waited on. The cancellation type stays the default TryCancel:
  -- ABANDON is unreachable at the pin (NexusOperationAbandon lives in the hidden
  -- Temporal.Workflow.Types), and there is no wait for the start alone.
  _ <-
    startNexusOperation
      greeter
      "Greet"
      defaultScheduleNexusOperationOptions
      (encodeJSON friend)
  pure Greetings {hello, greeting}

-- | The callerTypes worker's registrations; the caller adds its deployment.
callerTypes :: ConfigM () () -> WorkerConfig ()
callerTypes = configure () caller
