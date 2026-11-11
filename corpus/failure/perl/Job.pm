use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use JobActivities;

class Job :isa(Temporalio::Workflow::Definition) {
    field $item;
    field $proceeding = 0;

    method init :Init ($i) {
        $item = $i;
        return;
    }

    method proceed :Signal('Proceed') () {
        $proceeding = 1;
        return;
    }

    async method attempt :Update('Attempt') () {
        await $self->reject_and_process;
        return;
    }

    async method run :Run ($) {
        await Temporalio::Workflow::wait_condition(sub { $proceeding });
        await $self->reject_and_process;
        return;
    }

    # await all: needs_all fails at Reject's failure, and `also` keeps Process running.
    # Left uncaught, the failure fails the run from run and only the update from attempt.
    method reject_and_process () {
        return Future->needs_all(
            also => Temporalio::Workflow::start_activity('Reject',
                args => [$item], JobActivities::reject_options(), start_to_close_timeout => 60),
            also => Temporalio::Workflow::start_activity('Process',
                args => [$item], start_to_close_timeout => 60),
        );
    }
}

1;
