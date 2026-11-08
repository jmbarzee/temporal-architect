-- | A signal's or update's pending arrivals and the waiters for them (spec 06).
module Arrivals
  ( Arrivals
  , Waiter
  , newArrivals
  , add
  , begin
  , ready
  , claim
  , leave
  , takeAt
  , take
  ) where

import Data.Sequence (Seq (..), (|>))
import Data.Sequence qualified as Seq
import Temporal.Workflow
import Prelude hiding (take)

-- | Pending arrivals and waiters, each oldest first: a handler adds an arrival
-- when it returns, and the n-th arrival goes to the n-th waiter in line. A
-- waiter need not be running to hold its place: a promise (a 'Waiter' not yet
-- awaited) keeps the arrival it is owed while a later waiter waits for the next.
--
-- The line is positional for two reasons. Woken conditions run newest first
-- (putIVar prepends them to the run queue, sdk/src/Temporal/Workflow/Internal/Monad.hs:576-582
-- at e57a0ae), so one 'waitCondition' per waiter serves waiters in reverse. And
-- the SDK has no fork that returns a handle, so a promise cannot be a running waiter.
data Arrivals a = Arrivals
  { pending :: StateVar (Seq a)
  , waiters :: StateVar (Seq Int)
  , next :: StateVar Int
  }

-- | One waiter's place in line.
newtype Waiter = Waiter Int

newArrivals :: Workflow (Arrivals a)
newArrivals = Arrivals <$> newStateVar Empty <*> newStateVar Empty <*> newStateVar 0

-- | Adds an arrival; a handler calls it last.
add :: Arrivals a -> a -> Workflow ()
add xs v = modifyStateVar xs.pending (|> v)

-- | Begins a waiter. A promise begins waiting at its binding (@p <- begin xs@);
-- an await one case begins, checks 'ready', and claims only if it wins.
begin :: Arrivals a -> Workflow Waiter
begin xs = do
  n <- readStateVar xs.next
  writeStateVar xs.next (n + 1)
  modifyStateVar xs.waiters (|> n)
  pure (Waiter n)

-- | Whether the arrival w is owed is pending: w's place in line is below the
-- number of pending arrivals.
ready :: Arrivals a -> Waiter -> Condition Bool
ready xs (Waiter n) = do
  ps <- readStateVar xs.pending
  ws <- readStateVar xs.waiters
  pure (maybe False (< Seq.length ps) (Seq.elemIndexL n ws))

-- | Gives w the arrival it is owed and ends it; w must be ready.
claim :: Arrivals a -> Waiter -> Workflow a
claim xs (Waiter n) = do
  ps <- readStateVar xs.pending
  ws <- readStateVar xs.waiters
  case Seq.elemIndexL n ws of
    Just i | i < Seq.length ps -> do
      writeStateVar xs.pending (Seq.deleteAt i ps)
      writeStateVar xs.waiters (Seq.deleteAt i ws)
      pure (Seq.index ps i)
    _ -> error "Arrivals.claim: the waiter is not ready"

-- | Ends a waiter that did not claim.
leave :: Arrivals a -> Waiter -> Workflow ()
leave xs (Waiter n) = modifyStateVar xs.waiters (Seq.filter (/= n))

-- | Waits for the oldest arrival, for a waiter that began earlier.
takeAt :: RequireCallStack => Arrivals a -> Waiter -> Workflow a
takeAt xs w = waitCondition (ready xs w) >> claim xs w

-- | Begins a waiter and waits for the oldest arrival.
take :: RequireCallStack => Arrivals a -> Workflow a
take xs = begin xs >>= takeAt xs
