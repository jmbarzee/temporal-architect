use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class Archive :isa(Temporalio::Workflow::Definition) {
    async method run :Run ($items) {
        await Temporalio::Workflow::execute_activity('Store', args => [$items], start_to_close_timeout => 60);
        return;
    }
}

1;
