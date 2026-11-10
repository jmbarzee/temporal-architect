module Main (main) where

import Approval
import ArrivalsFixtures
import Control.Concurrent (threadDelay)
import Control.Exception (SomeException, try)
import Control.Monad.Trans.Reader (ReaderT)
import Data.Foldable (toList)
import Data.Map.Strict qualified as Map
import Data.Text (Text)
import Data.Text qualified as T
import Data.Typeable (Typeable)
import Harness
import Lens.Family2 ((^.))
import Proto.Temporal.Api.History.V1.Message (HistoryEvent, HistoryEvent'Attributes (..))
import Proto.Temporal.Api.History.V1.Message_Fields qualified as History
import Temporal.Client qualified as C
import Temporal.Duration (hours, minutes, seconds)
import Temporal.Worker (ConfigM, WorkerConfig, configure, setMaxCachedWorkflows, setNamespace, setTaskQueue)
import Temporal.Workflow (TaskQueue (..), WorkflowId (..))
import Test.Hspec
import UnliftIO.Async (withAsync)

main :: IO ()
main = hspec do
  describe "Approval" do
    it "takes Approve pending before anything waits for it" $ withEnv \env ->
      withWorker env (approvalTypes deploy) do
        h <- run env (C.start approval "approval-1" (startOptions "approvals") "access")
        skip env (seconds 30)
        run env (C.signal h approveSignal C.defaultSignalOptions "Grace")
        skip env (seconds 30)
        run env (C.signal h openSignal C.defaultSignalOptions)
        skip env (minutes 1)
        run env (C.query h statusQuery C.defaultQueryOptions) `shouldReturn` Right "open"
        run env (C.executeUpdate h reviewUpdate updateOptions "LGTM") `shouldReturn` "reviewed"
        C.waitWorkflowResult h `shouldReturn` Decision "access" "Grace" "LGTM" "reviewed"

    it "answers Review's caller before any waiter takes it" $ withEnv \env ->
      withWorker env (approvalTypes deploy) do
        h <- run env (C.start approval "approval-2" (startOptions "approvals") "access")
        skip env (seconds 30)
        run env (C.executeUpdate h reviewUpdate updateOptions "LGTM") `shouldReturn` "reviewed"
        run env (C.signal h openSignal C.defaultSignalOptions)
        skip env (minutes 1)
        run env (C.signal h approveSignal C.defaultSignalOptions "Grace")
        C.waitWorkflowResult h `shouldReturn` Decision "access" "Grace" "LGTM" "approved"

  describe "Arrivals" do
    it "go to waiters in the order they began" do
      (r, _) <- withTwoXs \o -> C.start twoWaiters "wf-two" o
      r `shouldBe` Map.fromList [("began first", "1"), ("created first", "2")]

    it "are served in reverse by one waitCondition per waiter, so the line is positional" do
      (r, _) <- withTwoXs \o -> C.start naiveTwoWaiters "wf-naive" o
      r `shouldBe` Map.fromList [("began first", "2"), ("created first", "1")]

    it "a promise begins waiting at its binding" do
      (r, _) <- withTwoXs \o -> C.start promiseThenAwait "wf-promise" o
      r `shouldBe` Map.fromList [("promise", "1"), ("await", "2")]

    it "await one: the case wins, takes, and the losing timer is cancelled" do
      (r, evs) <- withTwoXs \o -> C.start awaitOneX "wf-case" o 3600
      r `shouldBe` ["case 1", "then 2"]
      any (is TimerCanceled) evs `shouldBe` True

    it "await one: the timer wins and the case takes nothing" do
      (r, _) <- withTwoXs \o -> C.start awaitOneX "wf-timer" o 1
      r `shouldBe` ["timer", "then 1"]

    it "an await one case waits behind an earlier promise" do
      (r, _) <- withTwoXs \o -> C.start promiseBeforeAwaitOne "wf-behind" o
      r `shouldBe` ["promise 1", "case 2"]

    -- Spec 06 has the first-listed case win a tie. This SDK runs a signal's handler,
    -- and the conditions it wakes, before it resolves a timer in the same activation,
    -- so the signal case wins whatever the listing (#474's class; author-haskell's
    -- await-one reference documents the deviation).
    it "await one at a tie (X listed first): the signal case wins" $
      tie ["X", "timer"] >>= either pendingWith (`shouldBe` ["case 1", "none pending"])
    it "await one at a tie (timer listed first): the signal case still wins" $
      tie ["timer", "X"] >>= either pendingWith (`shouldBe` ["case 1", "none pending"])

deploy :: ConfigM () ()
deploy = setNamespace "default" >> setTaskQueue "approvals"

startOptions :: Text -> C.StartWorkflowOptions
startOptions q = C.startWorkflowOptions (TaskQueue q)

updateOptions :: C.UpdateOptions
updateOptions = C.UpdateOptions {C.updateId = "u1", C.updateHeaders = mempty}

fixturesWorker :: Int -> WorkerConfig ()
fixturesWorker cached = configure () fixtures do
  setNamespace "default"
  setTaskQueue "arrivals"
  setMaxCachedWorkflows (fromIntegral cached)

-- | Runs a fixture, sending X "1" after a minute and X "2" after two; returns its
-- result and history.
withTwoXs :: Typeable a => (C.StartWorkflowOptions -> ReaderT C.WorkflowClient IO (C.WorkflowHandle a)) -> IO (a, [HistoryEvent])
withTwoXs start = withEnv \env -> withWorker env (fixturesWorker 10000) do
  h <- run env (start (startOptions "arrivals"))
  skip env (minutes 1)
  run env (C.signal h xSignal C.defaultSignalOptions "1")
  skip env (minutes 1)
  -- A workflow that needed only one X has completed by now.
  _ <- try @SomeException (run env (C.signal h xSignal C.defaultSignalOptions "2"))
  (,) <$> C.waitWorkflowResult h <*> events h

events :: C.WorkflowHandle a -> IO [HistoryEvent]
events h = toList . (^. History.vec'events) <$> C.fetchHistory h

data Kind = TimerStarted | TimerFired | TimerCanceled | Signaled | TaskStarted

is :: Kind -> HistoryEvent -> Bool
is k e = case (k, e ^. History.maybe'attributes) of
  (TimerStarted, Just (HistoryEvent'TimerStartedEventAttributes _)) -> True
  (TimerFired, Just (HistoryEvent'TimerFiredEventAttributes _)) -> True
  (TimerCanceled, Just (HistoryEvent'TimerCanceledEventAttributes _)) -> True
  (Signaled, Just (HistoryEvent'WorkflowExecutionSignaledEventAttributes _)) -> True
  (TaskStarted, Just (HistoryEvent'WorkflowTaskStartedEventAttributes _)) -> True
  _ -> False

-- | Waits up to 10s of real time for an event; False if it never comes.
untilEvent :: C.WorkflowHandle a -> Kind -> IO Bool
untilEvent h k = go (500 :: Int)
  where
    go 0 = pure False
    go n = do
      evs <- events h
      if any (is k) evs then pure True else threadDelay 20000 >> go (n - 1)

-- | Runs AwaitOneXTie in the given listed order, with its timer fired and X "1" sent
-- in one workflow task. A setup can miss: a workflow task may start between the two,
-- most likely on a poll the stopped worker left open. Each miss is retried on a fresh
-- test server and workflow ID; Left reports the misses when every attempt missed (#529).
tie :: [Text] -> IO (Either String [Text])
tie order = go (1 :: Int) []
  where
    attempts = 3
    go n missed
      | n > attempts = pure (Left ("the tie was not set up in " <> show attempts <> " attempts: " <> unwords (reverse missed)))
      | otherwise = do
          let wid = WorkflowId ("tie-" <> T.intercalate "-" order <> "-" <> T.pack (show n))
          r <- withEnv \env -> do
            h <- run env (C.start awaitOneXTie wid (startOptions "arrivals") order)
            setUpTie env h >>= \case
              Just miss -> pure (Left miss)
              Nothing -> Right <$> withWorker env (fixturesWorker 0) (C.waitWorkflowResult h)
          either (\miss -> go (n + 1) (miss : missed)) (pure . Right) r

-- | Fires the timer and sends X "1" while no worker runs. Returns Nothing when both
-- reach one workflow task, otherwise the history between them.
setUpTie :: Env -> C.WorkflowHandle a -> IO (Maybe String)
setUpTie env h = do
  -- No cache, so no sticky queue: the next workflow task goes to the normal queue.
  withWorker env (fixturesWorker 0) (untilEvent h TimerStarted) `shouldReturn` True
  -- Skip time past the timer; with no worker, nothing reads its workflow task.
  withAsync (skip env (hours 1)) (\_ -> untilEvent h TimerFired) `shouldReturn` True
  run env (C.signal h xSignal C.defaultSignalOptions "1")
  between <- takeWhile (not . is Signaled) . dropWhile (not . is TimerFired) <$> events h
  pure
    if any (is TaskStarted) between
      then Just (show (map (^. History.eventType) between) <> ";")
      else Nothing
