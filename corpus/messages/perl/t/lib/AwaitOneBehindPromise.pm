# A promise on X binds first; an await one case for X then waits behind it.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use Arrivals;

class AwaitOneBehindPromise :isa(Temporalio::Workflow::Definition) {
    field $xs = Arrivals->new;

    method x :Signal('X') ($v) { $xs->add($v); return }

    async method run :Run () {
        my $p     = $xs->take;
        my $timer = Temporalio::Workflow::sleep(3600);
        await Temporalio::Workflow::wait_condition(sub { $xs->ready || $timer->is_ready });
        my $case = $xs->ready ? 'case ' . $xs->claim : 'timer';
        $timer->cancel unless $timer->is_ready;
        return ['promise ' . await($p), $case];
    }
}

1;
