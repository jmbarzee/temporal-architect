-module(failure_reject).
-moduledoc "activity Reject(item: string)".

-export([defaults/0, execute/2]).

-include_lib("temporal_sdk/include/activity.hrl").

defaults() -> [{retry_policy, #{maximum_attempts => 1}}].

execute(_Context, [Item]) ->
    fail(#{message => "rejected " ++ unicode:characters_to_list(Item), type => ~"Rejected"}).
