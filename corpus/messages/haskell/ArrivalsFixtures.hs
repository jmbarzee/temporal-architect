-- | Test workflows for Arrivals; registered only by the tests.
module ArrivalsFixtures
  ( xSignal
  , fixtures
  , twoWaiters
  , naiveTwoWaiters
  , promiseThenAwait
  , awaitOneX
  , promiseBeforeAwaitOne
  , awaitOneXTie
  ) where

import Arrivals qualified as A
import Data.Functor (($>))
import Data.Map.Strict (Map)
import Data.Map.Strict qualified as Map
import Data.Sequence (Seq (..), (|>))
import Data.Text (Text)
import RequireCallStack (provideCallStack)
import Temporal.Duration (Duration, hours, seconds)
import Temporal.Payload (JSON (..))
import Temporal.Worker (Definitions, toDefinitions)
import Temporal.Workflow

xSignal :: KnownSignal '[Text]
xSignal = KnownSignal "X" JSON

-- | Arrivals of X, queued by its handler.
withX :: RequireCallStack => Workflow (A.Arrivals Text)
withX = do
  xs <- A.newArrivals
  setSignalHandler xSignal (A.add xs)
  pure xs

timer :: RequireCallStack => Duration -> Workflow Timer
timer d = maybe (error "a positive duration starts a timer") pure =<< createTimer d

-- | Two waiters of X; the one listed first sleeps before it waits, so the other begins waiting first.
twoWaiters :: ProvidedWorkflow (Workflow (Map Text Text))
twoWaiters = provideCallStack $ provideWorkflow JSON "TwoWaiters" do
  xs <- withX
  (a, b) <-
    concurrently
      (sleep (seconds 1) >> A.take xs)
      (A.take xs)
  pure (Map.fromList [("created first", a), ("began first", b)])

-- | The naive mapping: two waiters, each a waitCondition on "anything pending", then a pop.
naiveTwoWaiters :: ProvidedWorkflow (Workflow (Map Text Text))
naiveTwoWaiters = provideCallStack $ provideWorkflow JSON "NaiveTwoWaiters" do
  pending <- newStateVar (Empty :: Seq Text)
  setSignalHandler xSignal \v -> modifyStateVar pending (|> v)
  let takeX :: RequireCallStack => Workflow Text
      takeX = do
        waitCondition ((/= Empty) <$> readStateVar pending)
        ps <- readStateVar pending
        case ps of
          p :<| rest -> writeStateVar pending rest $> p
          Empty -> pure "nothing"
  (a, b) <- concurrently (sleep (seconds 1) >> takeX) takeX
  pure (Map.fromList [("created first", a), ("began first", b)])

-- | Binds a promise on X, then awaits X.
promiseThenAwait :: ProvidedWorkflow (Workflow (Map Text Text))
promiseThenAwait = provideCallStack $ provideWorkflow JSON "PromiseThenAwait" do
  xs <- withX
  p <- A.begin xs
  awaited <- A.take xs
  promised <- A.takeAt xs p
  pure (Map.fromList [("promise", promised), ("await", awaited)])

-- | await one: a case for X raced against a timer listed second, then takes X.
-- 'race' runs its left argument first, so a case already ready on entry wins in listed order.
awaitOneX :: ProvidedWorkflow (Int -> Workflow [Text])
awaitOneX = provideCallStack $ provideWorkflow JSON "AwaitOneX" \timeoutSeconds -> do
  xs <- withX
  w <- A.begin xs
  t <- timer (seconds (fromIntegral timeoutSeconds))
  r <- race (waitCondition (A.ready xs w)) (wait t)
  won <- case r of
    Left () -> do
      v <- A.claim xs w
      cancel t -- a losing inline timer is cancelled (spec 06)
      pure ("case " <> v)
    Right () -> A.leave xs w $> "timer"
  v2 <- A.take xs
  pure [won, "then " <> v2]

-- | An await one case for X listed after a promise on X that began first.
promiseBeforeAwaitOne :: ProvidedWorkflow (Workflow [Text])
promiseBeforeAwaitOne = provideCallStack $ provideWorkflow JSON "PromiseBeforeAwaitOne" do
  xs <- withX
  p <- A.begin xs
  w <- A.begin xs
  t <- timer (hours 1)
  r <- race (waitCondition (A.ready xs w)) (wait t)
  won <- case r of
    Left () -> do
      v <- A.claim xs w
      cancel t
      pure ("case " <> v)
    Right () -> A.leave xs w $> "timer"
  promised <- A.takeAt xs p
  pure ["promise " <> promised, won]

-- | await one over a case for X and timer(1h), in the given listed order, with
-- both ready on one resume: returns the winner, then whether X is still pending.
awaitOneXTie :: ProvidedWorkflow ([Text] -> Workflow [Text])
awaitOneXTie = provideCallStack $ provideWorkflow JSON "AwaitOneXTie" \order -> do
  xs <- withX
  w <- A.begin xs
  t <- timer (hours 1)
  let caseX, caseTimer :: RequireCallStack => Workflow Text
      caseX = waitCondition (A.ready xs w) $> ("X" :: Text)
      caseTimer = wait t $> "timer"
  won <-
    either id id <$> case order of
      ["X", "timer"] -> race caseX caseTimer
      _ -> race caseTimer caseX
  first <-
    if won == "X"
      then do
        v <- A.claim xs w
        cancel t
        pure ("case " <> v)
      else A.leave xs w $> "timer"
  -- A non-blocking check: race runs its left side first, and pure () is done at once.
  w2 <- A.begin xs
  pendingNow <- race (waitCondition (A.ready xs w2)) (pure ())
  rest <- case pendingNow of
    Left () -> ("pending " <>) <$> A.claim xs w2
    Right () -> pure "none pending"
  pure [first, rest]

fixtures :: Definitions ()
fixtures =
  toDefinitions (twoWaiters, naiveTwoWaiters, promiseThenAwait, awaitOneX, promiseBeforeAwaitOne, awaitOneXTie)
