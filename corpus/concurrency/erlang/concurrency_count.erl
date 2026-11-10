-module(concurrency_count).
-moduledoc "activity Count(items: list[string]) -> (int)".

-export([execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

execute(_Context, [Items]) -> [length(Items)].
