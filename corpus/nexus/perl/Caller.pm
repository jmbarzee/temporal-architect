use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class Caller :isa(Temporalio::Workflow::Definition) {
    async method run :Run ($name, $friend) {
        my $greeter = Temporalio::Workflow::create_nexus_client(
            endpoint => 'GreeterEndpoint', service => 'GreeterService');
        my $hello    = await $greeter->execute_operation('Hello', $name);
        my $greeting = await $greeter->execute_operation('Greet', $name);
        # detach: abandon on cancellation, wait only for the start, never the result.
        await $greeter->start_operation('Greet', $friend, cancellation_type => 'abandon');
        return { hello => $hello, greeting => $greeting };
    }
}

1;
