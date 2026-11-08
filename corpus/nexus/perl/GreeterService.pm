use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Nexus::Definition;
use Greet;

# The service registers as the class basename, GreeterService.
class GreeterService :isa(Temporalio::Nexus::Definition) {
    method hello :SyncOperation('Hello') ($ctx, $name) { return "Hello, $name" }

    async method greet :WorkflowRunOperation('Greet') ($ctx, $name) {
        return await $ctx->start_workflow('Greet', [$name],
            id => Greet::id($name), task_queue => $ctx->info->task_queue);
    }
}

1;
