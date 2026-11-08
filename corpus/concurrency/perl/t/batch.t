use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/lib", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use JSON::PP ();
use BatchTypes;
use HeldBatchActivities;

my $client = CorpusEnv::start();
my $items  = ['a', 'b'];

subtest 'Batch acknowledged without waiting for its detached Archive' => sub {
    # Archive's Store is held until Batch returns.
    $HeldBatchActivities::gate = $CorpusEnv::loop->new_future;
    my $tw = CorpusEnv::run_worker(BatchTypes::worker($client, activities => ['HeldBatchActivities']));
    my $h = wait_for($client->start_workflow('Batch', [$items], id => 'batch-ack', task_queue => 'batches'));
    CorpusEnv::until_event($h, 'timer_started_event_attributes');    # await one is waiting
    wait_for($h->signal('Ack'));
    my $got = wait_for($h->result);
    my @events = CorpusEnv::events($h);
    ok((grep { CorpusEnv::kind($_) eq 'timer_canceled_event_attributes' } @events), 'the losing timer was cancelled');
    my ($started) = grep { CorpusEnv::kind($_) eq 'child_workflow_execution_started_event_attributes'
            && $_->child_workflow_execution_started_event_attributes->workflow_type->name eq 'Archive' }
        @events;
    my $archive = $client->get_workflow_handle(
        $started->child_workflow_execution_started_event_attributes->workflow_execution->workflow_id);
    ok(CorpusEnv::running($archive), 'Batch did not wait for its detached Archive');
    $HeldBatchActivities::gate->done;
    wait_for($archive->result);
    is_deeply($got, { count => 2, audited => JSON::PP::true, status => 'acknowledged' }, 'report');
    CorpusEnv::stop_worker($tw);
};

my $tw = CorpusEnv::run_worker(BatchTypes::worker($client));

subtest 'Audit' => sub {
    ok(wait_for($client->execute_workflow('Audit', [['a']], id => 'audit', task_queue => 'batches')), 'true');
};

subtest 'Archive' => sub {
    wait_for($client->execute_workflow('Archive', [['a']], id => 'archive', task_queue => 'batches'));
    pass('completed');
};

# "the timer wins" waits 1h of real time: no time-skipping environment in sdk-perl.
# t/await_one.t covers the timer branch with a short timer.

done_testing;
