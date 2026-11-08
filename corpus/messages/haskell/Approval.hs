-- | messages.twf: the Approval workflow and the approvalTypes worker.
module Approval
  ( Decision (..)
  , approval
  , openSignal
  , approveSignal
  , reviewUpdate
  , statusQuery
  , approvalTypes
  ) where

import Arrivals qualified as A
import Control.Exception (SomeException)
import Data.Aeson (FromJSON, ToJSON)
import Data.Text (Text)
import GHC.Generics (Generic)
import RequireCallStack (provideCallStack)
import Temporal.Payload (JSON (..))
import Temporal.Worker (ConfigM, WorkerConfig, configure)
import Temporal.Workflow

-- | Field names are the record's, as declared (generic Aeson, no case transform).
data Decision = Decision
  { request :: Text
  , approver :: Text
  , note :: Text
  , status :: Text
  }
  deriving stock (Eq, Show, Generic)
  deriving anyclass (FromJSON, ToJSON)

-- Every wire name is given explicitly: the SDK has no default from a Haskell name
-- (Template Haskell's default is the qualified "Module.function").
openSignal :: KnownSignal '[]
openSignal = KnownSignal "Open" JSON

approveSignal :: KnownSignal '[Text]
approveSignal = KnownSignal "Approve" JSON

reviewUpdate :: KnownUpdate '[Text] Text SomeException
reviewUpdate = KnownUpdate JSON "Review"

statusQuery :: KnownQuery '[] Text
statusQuery = KnownQuery "Status" JSON

approval :: ProvidedWorkflow (Text -> Workflow Decision)
approval = provideCallStack $ provideWorkflow JSON "Approval" \request -> do
  status <- newStateVar "submitted"
  opens <- A.newArrivals
  approves <- A.newArrivals
  reviews <- A.newArrivals
  setSignalHandler openSignal do
    writeStateVar status "open"
    A.add opens ()
  setSignalHandler approveSignal \approver -> do
    writeStateVar status "approved"
    A.add approves approver
  setUpdateHandler
    reviewUpdate
    ( \note -> do
        writeStateVar status "reviewed"
        A.add reviews note
        readStateVar status
    )
    Nothing
  setQueryHandler statusQuery (readStateVar status)

  A.take opens
  pendingApproval <- A.begin approves -- the promise begins waiting here, at its binding
  note <- A.take reviews
  approver <- A.takeAt approves pendingApproval
  Decision request approver note <$> readStateVar status

-- | The approvalTypes worker's registrations; the caller adds its deployment
-- (namespace, task queue). Shared by the worker process and the tests.
approvalTypes :: ConfigM () () -> WorkerConfig ()
approvalTypes = configure () approval
