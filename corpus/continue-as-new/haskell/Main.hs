module Main (main) where

import Counter
import Data.Foldable (toList)
import Harness
import Lens.Family2 ((^.))
import Proto.Temporal.Api.History.V1.Message (HistoryEvent'Attributes (..))
import Proto.Temporal.Api.History.V1.Message_Fields qualified as History
import Temporal.Client qualified as C
import Temporal.Worker (ConfigM, setNamespace, setTaskQueue)
import Test.Hspec

main :: IO ()
main = hspec do
  describe "Counter" do
    it "completes at the limit" $ withEnv \env ->
      withWorker env (counterTypes deploy) do
        run env (C.execute counter "counter-1" (C.startWorkflowOptions "counters") 2 3) `shouldReturn` 3

    it "continues as new below it, sleeping a minute each run" $ withEnv \env ->
      withWorker env (counterTypes deploy) do
        h <- run env (C.start counter "counter-2" (C.startWorkflowOptions "counters") 0 3)
        -- The result and the history both follow the chain of runs.
        C.waitWorkflowResult h `shouldReturn` 3
        evs <- map (^. History.maybe'attributes) . toList . (^. History.vec'events) <$> C.fetchHistory h
        length [() | Just (HistoryEvent'WorkflowExecutionContinuedAsNewEventAttributes _) <- evs] `shouldBe` 2
        length [() | Just (HistoryEvent'TimerFiredEventAttributes _) <- evs] `shouldBe` 3

deploy :: ConfigM () ()
deploy = setNamespace "default" >> setTaskQueue "counters"
