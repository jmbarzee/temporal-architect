use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

class CounterActivities :isa(Temporalio::Activity::Definition) {
    async method increment :Defn('Increment') ($count) { return $count + 1 }
}

1;
