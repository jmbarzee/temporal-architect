use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class Greet :isa(Temporalio::Workflow::Definition) {
    # id_scheme: "greet-{name}", used by every start of Greet.
    sub id ($name) { return "greet-$name" }

    async method run :Run ($name) {
        return await Temporalio::Workflow::execute_activity('Compose',
            args => [$name], start_to_close_timeout => 60);
    }
}

1;
