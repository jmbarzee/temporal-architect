-module(failure_process).
-moduledoc "activity Process(item: string)".

-export([execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

%% Long enough that the run fails while it still runs.
execute(_Context, [_Item]) ->
    timer:sleep(5_000),
    [].
