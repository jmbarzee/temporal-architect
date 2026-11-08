# Batch's await one over Ack and a timer, the cases listed in $order; returns the winner.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class AwaitOneTie :isa(Temporalio::Workflow::Definition) {
    use List::Util qw(any first);

    field $acks = 0;

    method ack :Signal('Ack') () { $acks++; return }

    async method run :Run ($order, $seconds) {
        my $timer = Temporalio::Workflow::sleep($seconds);
        my %ready = (Ack => sub { $acks > 0 }, timer => sub { $timer->is_ready });
        await Temporalio::Workflow::wait_condition(sub { any { $ready{$_}->() } @$order });
        return first { $ready{$_}->() } @$order;
    }
}

1;
