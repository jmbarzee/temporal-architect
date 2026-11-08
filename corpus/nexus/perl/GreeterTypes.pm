# The greeterTypes worker, shared by the worker process and the tests.
package GreeterTypes;
use v5.38;
use Temporalio::Worker;
use Greet;
use GreeterActivities;
use GreeterService;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client         => $client,
        task_queue     => 'greeter',
        workflows      => ['Greet'],
        activities     => ['GreeterActivities'],
        nexus_services => ['GreeterService'],
        %opts,
    );
}

1;
