# The batchTypes worker, shared by the worker process and the tests.
package BatchTypes;
use v5.38;
use Temporalio::Worker;
use Batch;
use Audit;
use Archive;
use BatchActivities;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'batches',
        workflows  => [qw(Batch Audit Archive)],
        activities => ['BatchActivities'],
        %opts,
    );
}

1;
