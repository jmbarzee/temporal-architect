# Two waiters of X; the one created first sleeps before it waits, so the other begins waiting first.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use Arrivals;

class TwoWaiters :isa(Temporalio::Workflow::Definition) {
    field $xs = Arrivals->new;

    method x :Signal('X') ($v) { $xs->add($v); return }

    async method run :Run () {
        my %took;
        my $created_first = (async sub {
            await Temporalio::Workflow::sleep(1);
            $took{'created first'} = await $xs->take;
        })->();
        my $began_first = (async sub { $took{'began first'} = await $xs->take })->();
        await Future->needs_all($created_first, $began_first);
        return \%took;
    }
}

1;
