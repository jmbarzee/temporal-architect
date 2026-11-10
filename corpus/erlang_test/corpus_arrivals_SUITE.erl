-module(corpus_arrivals_SUITE).
-moduledoc "Offline checks of `corpus_arrivals:first/1`, the `await one` ranking.".

-export([all/0, earliest_task_wins/1, listed_order_breaks_a_tie/1, none_ready/1]).

all() -> [earliest_task_wins, listed_order_breaks_a_tie, none_ready].

earliest_task_wins(_Config) ->
    b = corpus_arrivals:first([{a, 9}, {b, 4}, {c, undefined}, {d, infinity}]).

listed_order_breaks_a_tie(_Config) ->
    b = corpus_arrivals:first([{a, undefined}, {b, 4}, {c, 4}]).

none_ready(_Config) ->
    undefined = corpus_arrivals:first([{a, undefined}, {b, undefined}]).
