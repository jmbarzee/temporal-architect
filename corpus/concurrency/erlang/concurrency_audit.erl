-module(concurrency_audit).
-moduledoc "workflow Audit(items: list[string]) -> (bool)".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [Items]) -> complete_workflow_execution([length(Items) > 0]).
