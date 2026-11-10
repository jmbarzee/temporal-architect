-module(continue_as_new_counter).
-moduledoc "workflow Counter(count: int, limit: int) -> (int)".

-export([execute/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(Context, [Count, Limit]) ->
    #{worker_opts := #{task_queue := TaskQueue}} = Context,
    start_timer({1, minute}, [wait]),
    case start_activity(~"Increment", [Count], [wait]) of
        #{state := completed, result := [Next]} when Next >= Limit ->
            complete_workflow_execution([Next]);
        #{state := completed, result := [Next]} ->
            continue_as_new_workflow(TaskQueue, ~"Counter", [{input, [Next, Limit]}]);
        #{state := State} ->
            fail_workflow_execution(#{message => <<"Increment ", (atom_to_binary(State))/binary>>})
    end.
