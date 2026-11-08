# The approvalTypes worker, shared by the worker process and the tests.
package ApprovalTypes;
use v5.38;
use Temporalio::Worker;
use Approval;

sub worker ($client, %opts) {
    return Temporalio::Worker->new(
        client     => $client,
        task_queue => 'approvals',
        workflows  => ['Approval'],
        %opts,
    );
}

1;
