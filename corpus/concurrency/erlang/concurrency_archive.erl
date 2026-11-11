-module(concurrency_archive).
-moduledoc "workflow Archive(items: list[string])".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [Items]) ->
    case start_activity(~"Store", [Items], [wait]) of
        #{state := completed} ->
            complete_workflow_execution([]);
        #{state := State} ->
            fail_workflow_execution(#{message => "Store " ++ atom_to_list(State)})
    end.
