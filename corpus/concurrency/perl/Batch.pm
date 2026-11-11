use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class Batch :isa(Temporalio::Workflow::Definition) {
    field $status = 'unacknowledged';
    field $acks   = 0;    # pending arrivals of Ack

    method ack :Signal('Ack') () {
        $status = 'acknowledged';
        $acks++;
        return;
    }

    async method run :Run ($items) {
        # await all: the first failure fails it, and `also` leaves the other branch running.
        my ($count, $audited) = await Future->needs_all(
            also => Temporalio::Workflow::start_activity('Count', args => [$items], start_to_close_timeout => 60),
            also => Temporalio::Workflow::execute_child_workflow('Audit', args => [$items]),
        );

        # detach: abandon the child, never request its cancellation, and wait only for its start.
        await Temporalio::Workflow::start_child_workflow('Archive',
            args                => [$items],
            parent_close_policy => 'abandon',
            cancellation_type   => 'abandon',
        );

        # await one: one condition over every case, then the first listed that is ready wins.
        my $timer = Temporalio::Workflow::sleep(3600);
        await Temporalio::Workflow::wait_condition(sub { $acks > 0 || $timer->is_ready });
        if ($acks > 0) {
            $acks--;
            $timer->cancel unless $timer->is_ready;    # the losing inline timer is cancelled
        }

        return { count => $count, audited => $audited, status => $status };
    }
}

1;
