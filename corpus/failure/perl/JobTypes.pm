# The jobTypes worker, shared by the worker process and the tests.
package JobTypes;
use v5.38;
use Temporalio::Worker;
use Job;
use JobActivities;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'jobs',
        workflows  => ['Job'],
        activities => ['JobActivities'],
        %opts,
    );
}

1;
