# Two timers that fire in one workflow task: the await one shape (listed order) and
# Future->wait_any (completion order). t1 (1s) is created, so fires, before t2 (2s).
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class TwoTimerTie :isa(Temporalio::Workflow::Definition) {
    use List::Util qw(any first);

    async method run :Run ($form, $order) {
        my %t = (t1 => Temporalio::Workflow::sleep(1), t2 => Temporalio::Workflow::sleep(2));
        if ($form eq 'wait_any') {
            await Future->wait_any(map { $t{$_} } @$order);
            return first { $t{$_}->is_done } @$order;    # the loser is cancelled, not done
        }
        await Temporalio::Workflow::wait_condition(sub { any { $t{$_}->is_ready } @$order });
        return first { $t{$_}->is_ready } @$order;
    }
}

1;
