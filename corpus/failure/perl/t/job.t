use v5.38;
use warnings;
use Test::More;
use Scalar::Util ();
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/lib", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use JobTypes;
use HeldJobActivities;

# Process, the slow branch, is held until the test ends. Each wait is bounded, so a
# wait-for-all mapping fails here instead of hanging; this END runs before
# CorpusEnv's, so the held Process is released before its workers shut down.
$HeldJobActivities::gate = Future->new;
END { $HeldJobActivities::gate->done unless $HeldJobActivities::gate->is_ready }

my $client = CorpusEnv::start();
CorpusEnv::run_worker(JobTypes::worker($client, activities => ['HeldJobActivities']));

sub start ($id) {
    return wait_for($client->start_workflow('Job', ['a'], id => $id, task_queue => 'jobs'));
}

sub failure_of ($f) {
    $CorpusEnv::loop->await(Future->wait_any($f, $CorpusEnv::loop->timeout_future(after => 20)));
    return $f->is_failed ? ($f->failure)[0] : undef;
}

sub rejected ($err) {
    my $cause = Scalar::Util::blessed($err) ? $err->cause : undef;
    ok(Scalar::Util::blessed($cause) && $cause->isa('Temporalio::Exception::Activity')
            && $cause->activity_type eq 'Reject', "fails with Reject's failure")
        or diag(defined $err ? "$err" : 'did not fail within 20s');
}

# Process was scheduled, and neither completed nor was asked to cancel.
sub process_still_running ($h) {
    my @events = CorpusEnv::events($h);
    ok((grep { CorpusEnv::kind($_) eq 'activity_task_scheduled_event_attributes'
                && $_->activity_task_scheduled_event_attributes->activity_type->name eq 'Process' } @events),
        'Process was scheduled');
    ok(!(grep { CorpusEnv::kind($_) eq 'activity_task_completed_event_attributes' } @events),
        'Process did not complete');
    ok(!(grep { CorpusEnv::kind($_) eq 'activity_task_cancel_requested_event_attributes' } @events),
        'Process was not asked to cancel');
}

subtest 'a branch failure fails the run while the other branch runs' => sub {
    my $h = start('job-1');
    wait_for($h->signal('Proceed'), 20);
    my $err = failure_of($h->result);
    rejected($err);
    process_still_running($h);
};

subtest 'a branch failure in an update fails only that update' => sub {
    my $h = start('job-2');
    my $err = failure_of($h->execute_update('Attempt'));
    rejected($err);
    ok(CorpusEnv::running($h), 'the run goes on');
    process_still_running($h);
};

done_testing;
