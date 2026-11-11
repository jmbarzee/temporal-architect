module Main (main) where

import Control.Concurrent.MVar (newEmptyMVar, readMVar, tryPutMVar)
import Control.Exception (finally, try)
import Control.Monad (void)
import Data.Foldable (toList)
import Data.Text qualified as T
import Harness
import Job
import Lens.Family2 ((^.))
import Proto.Temporal.Api.Common.V1.Message_Fields qualified as Common
import Proto.Temporal.Api.Failure.V1.Message_Fields qualified as F
import Proto.Temporal.Api.History.V1.Message (HistoryEvent, HistoryEvent'Attributes (..))
import Proto.Temporal.Api.History.V1.Message_Fields qualified as History
import System.Timeout (timeout)
import Temporal.Client qualified as C
import Temporal.Exception (UpdateFailure (..), WorkflowExecutionClosed (..))
import Temporal.Worker (setNamespace, setTaskQueue)
import Test.Hspec

main :: IO ()
main = hspec do
  describe "Job" do
    it "Reject fails the update, then the run, while Process is held and never cancelled" $ withEnv \env -> do
      -- Process is held until the run has failed, so it is still running when Reject fails.
      -- It is released before the worker shuts down, pass or fail.
      held <- newEmptyMVar
      withWorker env (jobTypes (JobEnv (const (readMVar held))) (setNamespace "default" >> setTaskQueue "jobs")) $ flip finally (void (tryPutMVar held ())) do
        h <- run env (C.start job "job" (C.startWorkflowOptions "jobs") "a")

        within (try (run env (C.executeUpdate h attemptUpdate updateOptions))) >>= \case
          Left (UpdateFailure f) -> f ^. F.message `shouldSatisfy` T.isInfixOf "rejected a"
          Right () -> expectationFailure "the update succeeded"
        any closed <$> events h `shouldReturn` False

        run env (C.signal h proceedSignal C.defaultSignalOptions)
        within (try (C.waitWorkflowResult h)) >>= \case
          Left (WorkflowExecutionFailed a) -> a ^. History.failure . F.activityFailureInfo . F.activityType . Common.name `shouldBe` "Reject"
          other -> expectationFailure ("the run did not fail with Reject's failure: " <> show other)

        evs <- events h
        length [() | Just (HistoryEvent'ActivityTaskScheduledEventAttributes a) <- attributes evs, a ^. History.activityType . Common.name == "Process"]
          `shouldBe` 2
        [() | Just (HistoryEvent'ActivityTaskCompletedEventAttributes _) <- attributes evs] `shouldBe` []
        [() | Just (HistoryEvent'ActivityTaskCancelRequestedEventAttributes _) <- attributes evs] `shouldBe` []

updateOptions :: C.UpdateOptions
updateOptions = C.UpdateOptions {C.updateId = "u1", C.updateHeaders = mempty}

-- | Fails the test if m has not returned within 10s of real time, so a wait-for-all
-- regression fails rather than hangs.
within :: IO a -> IO a
within m = timeout 10000000 m >>= maybe (fail "not settled within 10s") pure

events :: C.WorkflowHandle a -> IO [HistoryEvent]
events h = toList . (^. History.vec'events) <$> C.fetchHistory h

attributes :: [HistoryEvent] -> [Maybe HistoryEvent'Attributes]
attributes = map (^. History.maybe'attributes)

closed :: HistoryEvent -> Bool
closed e = case e ^. History.maybe'attributes of
  Just (HistoryEvent'WorkflowExecutionFailedEventAttributes _) -> True
  Just (HistoryEvent'WorkflowExecutionCompletedEventAttributes _) -> True
  _ -> False
