use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;
use Temporalio::Workflow::Definition;
use Arrivals;

class Approval :isa(Temporalio::Workflow::Definition) {
    field $status   = 'submitted';
    field $opens    = Arrivals->new;
    field $approves = Arrivals->new;
    field $reviews  = Arrivals->new;

    method open :Signal('Open') () {
        $status = 'open';
        $opens->add(1);
        return;
    }

    method approve :Signal('Approve') ($approver) {
        $status = 'approved';
        $approves->add($approver);
        return;
    }

    method review :Update('Review') ($note) {
        $status = 'reviewed';
        $reviews->add($note);
        return $status;
    }

    method status_query :Query('Status') () { return $status }

    async method run :Run ($request) {
        await $opens->take;
        my $approval = $approves->take;    # begins waiting here, at its binding
        my $note     = await $reviews->take;
        my $approver = await $approval;
        return { request => $request, approver => $approver, note => $note, status => $status };
    }
}

1;
