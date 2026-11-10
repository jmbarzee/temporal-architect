-module(messages_approval).
-moduledoc """
workflow Approval(request: string) -> (Decision).
`update Review` is not mapped: the SDK at d2749c7 has no update handling (TODO.md:3), so the
update step and its `note` are skipped.
""".

-export([execute/2, status_query/2, handle_query/2]).

-include_lib("temporal_sdk/include/workflow.hrl").

execute(_Context, [Request]) ->
    put(status, ~"submitted"),
    corpus_arrivals:on(~"Open", fun([]) -> put(status, ~"open") end),
    corpus_arrivals:on(~"Approve", fun([_Approver]) -> put(status, ~"approved") end),
    publish(),
    start_execution(status_query),

    [] = corpus_arrivals:take(~"Open"),
    publish(),
    Approval = corpus_arrivals:promise(~"Approve"),
    %% await update Review -> (note): unsupported at the pin
    [Approver] = corpus_arrivals:await(Approval),
    publish(),

    complete_workflow_execution([
        #{
            ~"request" => Request,
            ~"approver" => Approver,
            ~"note" => null,
            ~"status" => get(status)
        }
    ]).

%% The query handler is a parallel execution answering from the state the main one publishes.
status_query(_Context, _Input) ->
    case await({query_request, ~"Status"}) of
        {ok, _Request} ->
            {true, Status} = is_awaited({info, status}),
            respond_query({query, ~"Status"}, [wait, {answer, [Status]}]),
            status_query(#{}, []);
        {noevent, _} ->
            ok
    end.

%% A closed run has no execution left, so the callback answers from its history.
handle_query(History, #{query_type := ~"Status"}) -> #{answer => [status_from(History)]}.

%% The signal bodies' effects, applied over the run's signal events in history order.
status_from(History) ->
    lists:foldl(
        fun
            ({_, 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED', #{signal_name := ~"Open"}, _}, _) ->
                ~"open";
            ({_, 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED', #{signal_name := ~"Approve"}, _}, _) ->
                ~"approved";
            (_, Status) ->
                Status
        end,
        ~"submitted",
        History
    ).

publish() -> set_info(get(status), [{info_id, status}]).
