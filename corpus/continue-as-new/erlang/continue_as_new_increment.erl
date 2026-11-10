-module(continue_as_new_increment).
-moduledoc "activity Increment(count: int) -> (int)".

-export([execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

execute(_Context, [Count]) -> [Count + 1].
