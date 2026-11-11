# Reject, and a Process held until the test opens $HeldJobActivities::gate.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;
use JobActivities;

our $gate;

class HeldJobActivities :isa(JobActivities) {
    async method process :Defn('Process') ($item) {
        await $HeldJobActivities::gate;
        return;
    }
}

1;
