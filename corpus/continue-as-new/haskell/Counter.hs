-- | continue-as-new.twf: the Counter workflow, the Increment activity and the counterTypes worker.
module Counter
  ( counter
  , increment
  , counterTypes
  ) where

import RequireCallStack (provideCallStack)
import Temporal.Activity (Activity, ProvidedActivity, provideActivity)
import Temporal.Duration (minutes)
import Temporal.Payload (JSON (..))
import Temporal.Worker (ConfigM, WorkerConfig, configure)
import Temporal.Workflow

counter :: ProvidedWorkflow (Int -> Int -> Workflow Int)
counter = provideCallStack $ provideWorkflow JSON "Counter" \count limit -> do
  sleep (minutes 1)
  next <- executeActivity increment (defaultStartActivityOptions (StartToClose (minutes 1))) count
  if next >= limit
    then pure next
    else continueAsNew counter defaultContinueAsNewOptions next limit

increment :: ProvidedActivity () (Int -> Activity () Int)
increment = provideActivity JSON "Increment" \count -> pure (count + 1)

-- | The counterTypes worker's registrations; the caller adds its deployment
-- (namespace, task queue). Shared by the worker process and the tests.
counterTypes :: ConfigM () () -> WorkerConfig ()
counterTypes = configure () (counter, increment)
