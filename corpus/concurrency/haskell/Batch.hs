-- Report's field count shares its name with the Count activity's value, so fields
-- are not selector functions here; they are read with record dot syntax.
{-# LANGUAGE NoFieldSelectors #-}

-- | concurrency.twf: Batch, Audit, Archive, Count, Store and the batchTypes worker.
module Batch
  ( Report (..)
  , BatchEnv (..)
  , ackSignal
  , batch
  , audit
  , archive
  , count
  , store
  , batchTypes
  ) where

import Arrivals qualified as A
import Control.Monad.IO.Class (liftIO)
import Control.Monad.Reader.Class (ask)
import Data.Aeson (FromJSON, ToJSON)
import Data.Foldable (traverse_)
import Data.Text (Text)
import FailFast (failFast)
import GHC.Generics (Generic)
import RequireCallStack (provideCallStack)
import Temporal.Activity (Activity, ProvidedActivity, provideActivity)
import Temporal.Duration (hours, minutes)
import Temporal.Payload (JSON (..))
import Temporal.Worker (ConfigM, WorkerConfig, configure)
import Temporal.Workflow
import Temporal.Workflow qualified as Child (StartChildWorkflowOptions (..))

data Report = Report
  { count :: Int
  , audited :: Bool
  , status :: Text
  }
  deriving stock (Eq, Show, Generic)
  deriving anyclass (FromJSON, ToJSON)

-- | Store's dependency: where it writes the items.
newtype BatchEnv = BatchEnv {write :: [Text] -> IO ()}

ackSignal :: KnownSignal '[]
ackSignal = KnownSignal "Ack" JSON

activityOptions :: StartActivityOptions
activityOptions = defaultStartActivityOptions (StartToClose (minutes 1))

batch :: ProvidedWorkflow ([Text] -> Workflow Report)
batch = provideCallStack $ provideWorkflow JSON "Batch" \items -> do
  status <- newStateVar "unacknowledged"
  acks <- A.newArrivals
  setSignalHandler ackSignal do
    writeStateVar status "acknowledged"
    A.add acks ()

  (counted, audited) <- failFast \guarded ->
    concurrently
      (guarded (executeActivity count activityOptions items))
      (guarded (executeChildWorkflow audit defaultChildWorkflowOptions items))

  -- detach: abandon the child, never request its cancellation, and wait only for its start.
  archived <-
    startChildWorkflow
      archive
      defaultChildWorkflowOptions
        { Child.parentClosePolicy = ParentClosePolicyAbandon
        , Child.cancellationType = ChildWorkflowCancellationAbandon
        }
      items
  waitChildWorkflowStart archived

  -- await one, in listed order: race runs its left side first. The Ack case claims
  -- only if it wins; the losing inline timer is cancelled (spec 06).
  w <- A.begin acks
  t <- createTimer (hours 1)
  race (waitCondition (A.ready acks w)) (traverse_ wait t) >>= \case
    Left () -> A.claim acks w >> traverse_ cancel t
    Right () -> A.leave acks w

  Report counted audited <$> readStateVar status

audit :: ProvidedWorkflow ([Text] -> Workflow Bool)
audit = provideCallStack $ provideWorkflow JSON "Audit" \items ->
  pure (not (null items))

archive :: ProvidedWorkflow ([Text] -> Workflow ())
archive = provideCallStack $ provideWorkflow JSON "Archive" \items ->
  executeActivity store activityOptions items

count :: ProvidedActivity BatchEnv ([Text] -> Activity BatchEnv Int)
count = provideActivity JSON "Count" \items -> pure (length items)

store :: ProvidedActivity BatchEnv ([Text] -> Activity BatchEnv ())
store = provideActivity JSON "Store" \items -> do
  env <- ask
  liftIO (env.write items)

-- | The batchTypes worker's registrations; the caller adds its deployment
-- (namespace, task queue). Shared by the worker process and the tests.
batchTypes :: BatchEnv -> ConfigM BatchEnv () -> WorkerConfig BatchEnv
batchTypes env = configure env (batch, audit, archive, count, store)
