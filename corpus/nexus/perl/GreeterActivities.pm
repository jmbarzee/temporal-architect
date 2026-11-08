use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

class GreeterActivities :isa(Temporalio::Activity::Definition) {
    async method compose :Defn('Compose') ($name) { return "Greetings, $name" }
}

1;
