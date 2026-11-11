-- | An unrouted failure that fails its body at once (spec 06): an await all's
-- branch, or a signal handler's.
module FailFast (failFast) where

import Control.Applicative ((<|>))
import Control.Exception (SomeException)
import Control.Monad.Catch (catch, throwM)
import Data.Maybe (fromJust, isJust)
import Temporal.Workflow

-- | Runs body, which wraps each computation that may fail in the guard it is passed,
-- and fails with the first failure a guarded computation throws, as soon as it is
-- thrown. Losing the race cancels nothing: guarded computations still running keep
-- running, and end with the run.
failFast :: RequireCallStack => ((forall x. Workflow x -> Workflow x) -> Workflow a) -> Workflow a
failFast body = do
  failure <- newStateVar Nothing
  let guarded m = m `catch` \e -> modifyStateVar failure (<|> Just e) >> throwM (e :: SomeException)
  race (waitCondition (isJust <$> readStateVar failure)) (body guarded) >>= \case
    Left () -> throwM . fromJust =<< readStateVar failure
    Right a -> pure a
