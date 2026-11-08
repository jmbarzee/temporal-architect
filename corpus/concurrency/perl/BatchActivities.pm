use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

class BatchActivities :isa(Temporalio::Activity::Definition) {
    async method count :Defn('Count') ($items) { return scalar @$items }

    async method store :Defn('Store') ($items) {
        say STDERR "stored @$items" if $ENV{CORPUS_VERBOSE};    # write(items)
        return;
    }
}

1;
