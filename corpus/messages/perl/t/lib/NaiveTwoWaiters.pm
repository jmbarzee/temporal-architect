# The naive mapping: two waiters, each its own wait_condition(sub { @pending }) then shift.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class NaiveTwoWaiters :isa(Temporalio::Workflow::Definition) {
    field @pending;

    method x :Signal('X') ($v) { push @pending, $v; return }

    async method take () {
        await Temporalio::Workflow::wait_condition(sub { scalar @pending });
        return @pending ? shift @pending : undef;
    }

    async method run :Run () {
        my @got = await Future->needs_all($self->take, $self->take);
        return \@got;
    }
}

1;
