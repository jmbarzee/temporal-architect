# Count, and a Store held until the test opens $HeldBatchActivities::gate.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

our $gate;

class HeldBatchActivities :isa(Temporalio::Activity::Definition) {
    async method count :Defn('Count') ($items) { return scalar @$items }

    async method store :Defn('Store') ($items) {
        await $HeldBatchActivities::gate;
        return;
    }
}

1;
