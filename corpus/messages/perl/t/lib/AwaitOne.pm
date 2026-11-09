# await one: a case for X raced against a timer (listed second), then takes X.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use Arrivals;

class AwaitOne :isa(Temporalio::Workflow::Definition) {
    field $xs = Arrivals->new;

    method x :Signal('X') ($v) { $xs->add($v); return }

    async method run :Run ($timeout) {
        my @took;
        my $timer = Temporalio::Workflow::sleep($timeout);
        await Temporalio::Workflow::wait_condition(sub { $xs->ready || $timer->is_ready });
        if ($xs->ready) {    # first listed wins
            push @took, 'case ' . $xs->claim;
            $timer->cancel unless $timer->is_ready;    # an inline timer that loses is cancelled
        }
        else {
            push @took, 'timer';
        }
        push @took, 'then ' . await $xs->take;
        return \@took;
    }
}

1;
