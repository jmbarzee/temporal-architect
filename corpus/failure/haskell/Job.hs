-- | failure.twf: Job, Reject, Process and the jobTypes worker.
module Job
  ( JobEnv (..)
  , proceedSignal
  , attemptUpdate
  , job
  , reject
  , process
  , jobTypes
  ) where

import Control.Exception (SomeException)
import Control.Monad.IO.Class (liftIO)
import Control.Monad.Reader.Class (ask)
import Data.Text (Text)
import Data.Text qualified as T
import FailFast (failFast)
import RequireCallStack (provideCallStack)
import Temporal.Activity (Activity, ProvidedActivity, provideActivity)
import Temporal.Duration (minutes)
import Temporal.Payload (JSON (..))
import Temporal.Worker (ConfigM, WorkerConfig, configure)
import Temporal.Workflow
import Temporal.Workflow qualified as Activity (StartActivityOptions (..))
import UnliftIO.Exception (throwString)

-- | Process's dependency: the work it does on an item.
newtype JobEnv = JobEnv {work :: Text -> IO ()}

proceedSignal :: KnownSignal '[]
proceedSignal = KnownSignal "Proceed" JSON

attemptUpdate :: KnownUpdate '[] () SomeException
attemptUpdate = KnownUpdate JSON "Attempt"

rejectOptions :: StartActivityOptions
rejectOptions =
  (defaultStartActivityOptions (StartToClose (minutes 1)))
    {Activity.retryPolicy = Just defaultRetryPolicy {maximumAttempts = 1}}

processOptions :: StartActivityOptions
processOptions = defaultStartActivityOptions (StartToClose (minutes 1))

job :: ProvidedWorkflow (Text -> Workflow ())
job = provideCallStack $ provideWorkflow JSON "Job" \item -> do
  proceeding <- newStateVar False
  setSignalHandler proceedSignal (writeStateVar proceeding True)
  -- Reject's failure fails the update at once; the run goes on.
  setUpdateHandler attemptUpdate (rejectOrProcess item) Nothing
  waitCondition (readStateVar proceeding)
  -- Reject's failure fails the run at once; Process is left running, never cancelled.
  rejectOrProcess item

-- | await all over Reject and Process.
rejectOrProcess :: RequireCallStack => Text -> Workflow ()
rejectOrProcess item = failFast \guarded ->
  concurrently_
    (guarded (executeActivity reject rejectOptions item))
    (guarded (executeActivity process processOptions item))

reject :: ProvidedActivity JobEnv (Text -> Activity JobEnv ())
reject = provideActivity JSON "Reject" \item -> throwString ("rejected " <> T.unpack item)

process :: ProvidedActivity JobEnv (Text -> Activity JobEnv ())
process = provideActivity JSON "Process" \item -> do
  env <- ask
  liftIO (env.work item)

-- | The jobTypes worker's registrations; the caller adds its deployment
-- (namespace, task queue). Shared by the worker process and the tests.
jobTypes :: JobEnv -> ConfigM JobEnv () -> WorkerConfig JobEnv
jobTypes env = configure env (job, reject, process)
