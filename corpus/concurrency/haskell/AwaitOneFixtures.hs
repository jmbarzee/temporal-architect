-- | Test workflows for await one; registered only by the tests.
module AwaitOneFixtures
  ( awaitOneTimers
  , boundDeadline
  , fixtures
  ) where

import Arrivals qualified as A
import Batch (ackSignal)
import Data.Foldable (traverse_)
import Data.Functor (($>))
import Data.Text (Text)
import RequireCallStack (provideCallStack)
import Temporal.Duration (hours, seconds)
import Temporal.Payload (JSON (..))
import Temporal.Worker (Definitions, toDefinitions)
import Temporal.Workflow

-- | await one over timer(1s) and timer(2s), listed as named ("1s" or "2s"); returns the winner.
awaitOneTimers :: ProvidedWorkflow (Text -> Text -> Workflow Text)
awaitOneTimers = provideCallStack $ provideWorkflow JSON "AwaitOneTimers" \first second -> do
  oneSecond <- createTimer (seconds 1)
  twoSeconds <- createTimer (seconds 2)
  let timer name = if name == "1s" then oneSecond else twoSeconds
  race (traverse_ wait (timer first)) (traverse_ wait (timer second)) >>= \case
    Left () -> traverse_ cancel (timer second) $> first
    Right () -> traverse_ cancel (timer first) $> second

-- | promise deadline <- timer(24h), then await one over Ack and the deadline, round
-- after round; returns the Acks taken. The deadline is bound, so losing a round never
-- cancels it.
boundDeadline :: ProvidedWorkflow (Workflow Int)
boundDeadline = provideCallStack $ provideWorkflow JSON "BoundDeadline" do
  acks <- A.newArrivals
  setSignalHandler ackSignal (A.add acks ())
  deadline <- createTimer (hours 24)
  let rounds :: RequireCallStack => Int -> Workflow Int
      rounds taken = do
        w <- A.begin acks
        race (waitCondition (A.ready acks w)) (traverse_ wait deadline) >>= \case
          Left () -> A.claim acks w >> rounds (taken + 1)
          Right () -> A.leave acks w $> taken
  rounds 0

fixtures :: Definitions ()
fixtures = toDefinitions (awaitOneTimers, boundDeadline)
