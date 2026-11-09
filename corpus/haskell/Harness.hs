-- | The corpus's test harness: a time-skipping test server per test, a client
-- on it, and workers that run while a test body runs.
module Harness
  ( Env (..)
  , withEnv
  , withWorker
  , run
  , skip
  ) where

import Control.Monad.Logger (runNoLoggingT)
import Control.Monad.Trans.Reader (ReaderT, runReaderT)
import Data.Text qualified as T
import System.Directory (createDirectoryIfMissing, getTemporaryDirectory)
import System.Environment (getProgName)
import System.FilePath ((</>))
import System.IO.Unsafe (unsafePerformIO)
import Temporal.Client qualified as C
import Temporal.Client.TestService qualified as TestService
import Temporal.Core.Client (Client, ClientConfig (..), connectClient, defaultClientConfig)
import Temporal.Duration (Duration)
import Temporal.EphemeralServer
  ( EphemeralExe (..)
  , EphemeralExeVersion (..)
  , SDKDefault (..)
  , TemporalTestServerConfig (..)
  , getFreePort
  , withTestServer
  )
import Temporal.Runtime (Runtime, TelemetryOptions (..), initializeRuntime)
import Temporal.Worker (WorkerConfig, shutdown, startWorker)
import UnliftIO.Exception (bracket)

runtime :: Runtime
runtime = unsafePerformIO (initializeRuntime NoTelemetry)
{-# NOINLINE runtime #-}

data Env = Env
  { client :: C.WorkflowClient
  , core :: Client
  }

-- | Runs f against a fresh time-skipping test server, downloaded once per suite
-- into its own directory: suites run together never wait on another's download lock.
withEnv :: (Env -> IO a) -> IO a
withEnv f = do
  port <- getFreePort
  dir <- (</>) <$> getTemporaryDirectory <*> (("twf-corpus-" <>) <$> getProgName)
  createDirectoryIfMissing True dir
  let server =
        TemporalTestServerConfig
          { exe = CachedDownload (Default (SDKDefault "community-haskell" "0.1.0.0")) (Just dir) Nothing
          , port = Just (fromIntegral port)
          , extraArgs = []
          }
  withTestServer runtime server \_ -> do
    core <- runNoLoggingT (connectClient runtime defaultClientConfig {targetUrl = "http://127.0.0.1:" <> T.pack (show port)})
    client <- C.workflowClient core (C.mkWorkflowClientConfig "default") {C.enableTimeSkipping = True}
    f Env {client, core}

-- | Runs m with a worker polling; shuts the worker down after.
withWorker :: Env -> WorkerConfig env -> IO a -> IO a
withWorker env conf m = bracket (startWorker env.core conf) shutdown (const m)

-- | Runs a client action.
run :: Env -> ReaderT C.WorkflowClient IO a -> IO a
run env m = runReaderT m env.client

-- | Advances the test server's clock by d.
skip :: Env -> Duration -> IO ()
skip env = TestService.unlockTimeSkippingWithSleep env.core
