# Binds a promise on X, then awaits X.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use Arrivals;

class PromiseThenAwait :isa(Temporalio::Workflow::Definition) {
    field $xs = Arrivals->new;

    method x :Signal('X') ($v) { $xs->add($v); return }

    async method run :Run () {
        my $p       = $xs->take;
        my $awaited = await $xs->take;
        return { promise => await($p), await => $awaited };
    }
}

1;
