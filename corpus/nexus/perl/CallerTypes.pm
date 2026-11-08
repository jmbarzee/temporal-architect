# The callerTypes worker, shared by the worker process and the tests.
package CallerTypes;
use v5.38;
use Temporalio::Worker;
use Caller;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'caller',
        workflows  => ['Caller'],
        %opts,
    );
}

1;
