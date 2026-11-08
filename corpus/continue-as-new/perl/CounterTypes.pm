# The counterTypes worker, shared by the worker process and the tests.
package CounterTypes;
use v5.38;
use Temporalio::Worker;
use Counter;
use CounterActivities;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'counters',
        workflows  => ['Counter'],
        activities => ['CounterActivities'],
        %opts,
    );
}

1;
