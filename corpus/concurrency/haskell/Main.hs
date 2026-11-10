module Main (main) where

import AwaitOneFixtures
import Batch
import Control.Concurrent (threadDelay)
import Control.Concurrent.MVar (newEmptyMVar, putMVar, readMVar)
import Data.Foldable (toList)
import Data.Text (Text)
import Data.Text qualified as T
import Harness
import Lens.Family2 ((^.))
import Proto.Temporal.Api.Common.V1.Message_Fields qualified as Common
import Proto.Temporal.Api.History.V1.Message (HistoryEvent, HistoryEvent'Attributes (..))
import Proto.Temporal.Api.History.V1.Message_Fields qualified as History
import Temporal.Client qualified as C
import Temporal.Duration (hours)
import Temporal.Worker (ConfigM, WorkerConfig, configure, setMaxCachedWorkflows, setNamespace, setTaskQueue)
import Temporal.Workflow (TaskQueue, WorkflowId (..), workflowRef)
import Test.Hspec

main :: IO ()
main = hspec do
  describe "Batch" do
    it "takes Ack, cancels the losing timer, and returns while its detached Archive runs" $ withEnv \env -> do
      held <- newEmptyMVar
      withWorker env (batchTypes (BatchEnv (const (readMVar held))) (deploy "batches")) do
        h <- run env (C.start batch "batch-ack" (C.startWorkflowOptions "batches") items)
        -- Ack after the timer starts: one started and cancelled in one workflow task leaves no events.
        untilEvent h TimerStarted `shouldReturn` True
        run env (C.signal h ackSignal C.defaultSignalOptions)
        C.waitWorkflowResult h `shouldReturn` Report 2 True "acknowledged"
        evs <- events h
        any (is TimerCanceled) evs `shouldBe` True
        -- Archive started, and Batch closed without waiting for it.
        let archiveIds =
              [ a ^. History.workflowExecution . Common.workflowId
              | Just (HistoryEvent'ChildWorkflowExecutionStartedEventAttributes a) <- map (^. History.maybe'attributes) evs
              , a ^. History.workflowType . Common.name == "Archive"
              ]
        archiveId <- case archiveIds of
          [i] -> pure (WorkflowId i)
          other -> fail ("Archive starts: " <> show other)
        a <- run env (C.getHandle (workflowRef archive) archiveId Nothing Nothing)
        any (is Completed) <$> events a `shouldReturn` False
        putMVar held ()
        C.waitWorkflowResult a `shouldReturn` ()

    it "returns on the timer when no Ack comes" $ withEnv \env ->
      withWorker env (batchTypes (BatchEnv (const (pure ()))) (deploy "batches")) do
        h <- run env (C.start batch "batch-timer" (C.startWorkflowOptions "batches") items)
        C.waitWorkflowResult h `shouldReturn` Report 2 True "unacknowledged"
        evs <- events h
        (any (is TimerFired) evs, any (is TimerCanceled) evs) `shouldBe` (True, False)

  describe "await one" do
    it "a bound promise survives the rounds it loses" $ withEnv \env ->
      withWorker env (fixturesWorker 10000) do
        h <- run env (C.start boundDeadline "bound-1" (C.startWorkflowOptions "await-one"))
        untilEvent h TimerStarted `shouldReturn` True
        skip env (hours 1)
        run env (C.signal h ackSignal C.defaultSignalOptions)
        skip env (hours 1)
        run env (C.signal h ackSignal C.defaultSignalOptions)
        C.waitWorkflowResult h `shouldReturn` 2
        evs <- events h
        (any (is TimerFired) evs, any (is TimerCanceled) evs) `shouldBe` (True, False)

    -- Both timers fire in one workflow task: the first listed wins, whichever fired first.
    it "two resolutions at once (2s listed first): the first listed wins" $
      tie "2s" "1s" >>= either pendingWith (`shouldBe` "2s")
    it "two resolutions at once (1s listed first): the first listed wins" $
      tie "1s" "2s" >>= either pendingWith (`shouldBe` "1s")

items :: [Text]
items = ["a", "b"]

deploy :: TaskQueue -> ConfigM env ()
deploy q = setNamespace "default" >> setTaskQueue q

fixturesWorker :: Int -> WorkerConfig ()
fixturesWorker cached = configure () fixtures do
  deploy "await-one"
  setMaxCachedWorkflows (fromIntegral cached)

events :: C.WorkflowHandle a -> IO [HistoryEvent]
events h = toList . (^. History.vec'events) <$> C.fetchHistory h

data Kind = TimerStarted | TimerFired | TimerCanceled | TaskStarted | Completed

is :: Kind -> HistoryEvent -> Bool
is k e = case (k, e ^. History.maybe'attributes) of
  (TimerStarted, Just (HistoryEvent'TimerStartedEventAttributes _)) -> True
  (TimerFired, Just (HistoryEvent'TimerFiredEventAttributes _)) -> True
  (TimerCanceled, Just (HistoryEvent'TimerCanceledEventAttributes _)) -> True
  (TaskStarted, Just (HistoryEvent'WorkflowTaskStartedEventAttributes _)) -> True
  (Completed, Just (HistoryEvent'WorkflowExecutionCompletedEventAttributes _)) -> True
  _ -> False

-- | Waits up to 10s of real time for n events of a kind; False if they never come.
untilEvents :: Int -> C.WorkflowHandle a -> Kind -> IO Bool
untilEvents n h k = go (500 :: Int)
  where
    go 0 = pure False
    go tries = do
      evs <- events h
      if length (filter (is k) evs) >= n then pure True else threadDelay 20000 >> go (tries - 1)

untilEvent :: C.WorkflowHandle a -> Kind -> IO Bool
untilEvent = untilEvents 1

-- | Runs AwaitOneTimers in the given listed order with both timers fired in one workflow
-- task. A setup can miss: a workflow task may start between the two firings, most likely
-- on a poll the stopped worker left open. Each miss is retried on a fresh test server and
-- workflow ID; Left reports the misses when every attempt missed (#529).
tie :: Text -> Text -> IO (Either String Text)
tie first second = go (1 :: Int) []
  where
    attempts = 3
    go n missed
      | n > attempts = pure (Left ("the tie was not set up in " <> show attempts <> " attempts: " <> unwords (reverse missed)))
      | otherwise = do
          let wid = WorkflowId ("tie-" <> first <> "-" <> second <> "-" <> T.pack (show n))
          r <- withEnv \env -> do
            h <- run env (C.start awaitOneTimers wid (C.startWorkflowOptions "await-one") first second)
            setUpTie env h >>= \case
              Just miss -> pure (Left miss)
              Nothing -> Right <$> withWorker env (fixturesWorker 0) (C.waitWorkflowResult h)
          either (\miss -> go (n + 1) (miss : missed)) (pure . Right) r

-- | Fires both timers while no worker runs. Returns Nothing when both reach one
-- workflow task, otherwise the history between them.
setUpTie :: Env -> C.WorkflowHandle a -> IO (Maybe String)
setUpTie env h = do
  -- No cache, so no sticky queue: the next workflow task goes to the normal queue.
  withWorker env (fixturesWorker 0) (untilEvent h TimerStarted) `shouldReturn` True
  -- The timers fire in real time: a skip stops at the first, whose workflow task
  -- then waits. With no worker, nothing reads that task.
  untilEvents 2 h TimerFired `shouldReturn` True
  between <- takeWhile (not . is TimerFired) . drop 1 . dropWhile (not . is TimerFired) <$> events h
  pure
    if any (is TaskStarted) between
      then Just (show (map (^. History.eventType) between) <> ";")
      else Nothing
