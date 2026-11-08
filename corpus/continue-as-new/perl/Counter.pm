use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;

class Counter :isa(Temporalio::Workflow::Definition) {
    async method run :Run ($count, $limit) {
        await Temporalio::Workflow::sleep(60);
        my $next = await Temporalio::Workflow::execute_activity('Increment',
            args => [$count], start_to_close_timeout => 60);
        return $next if $next >= $limit;
        Temporalio::Workflow::continue_as_new(undef,args => [$next, $limit]);
    }
}

1;
