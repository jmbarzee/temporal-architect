-module(concurrency_store).
-moduledoc "activity Store(items: list[string])".

-export([execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

execute(_Context, [_Items]) -> [].
