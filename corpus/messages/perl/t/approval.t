use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use ApprovalTypes;

my $client = CorpusEnv::start();
CorpusEnv::run_worker(ApprovalTypes::worker($client));

subtest 'approval' => sub {
    my $h = wait_for($client->start_workflow('Approval', ['access'], id => "approval-1", task_queue => 'approvals'));
    # Approve arrives before anything waits for it, and stays pending.
    CorpusEnv::sleep_real(0.5);
    wait_for($h->signal('Approve', ['Grace']));
    CorpusEnv::sleep_real(0.5);
    wait_for($h->signal('Open'));
    CorpusEnv::sleep_real(0.5);
    is(wait_for($h->query('Status')), 'open', 'status after Open');
    is(wait_for($h->execute_update('Review', ['LGTM'])), 'reviewed', 'Review answered');
    is_deeply(wait_for($h->result),
        { request => 'access', approver => 'Grace', note => 'LGTM', status => 'reviewed' }, 'decision');
};

subtest 'review answered before a waiter takes it' => sub {
    my $h = wait_for($client->start_workflow('Approval', ['access'], id => "approval-2", task_queue => 'approvals'));
    # Review arrives while Approval still awaits Open, before anything waits for Review.
    CorpusEnv::sleep_real(0.5);
    is(wait_for($h->execute_update('Review', ['LGTM'])), 'reviewed', 'Review answered at once');
    wait_for($h->signal('Open'));
    CorpusEnv::sleep_real(0.5);
    wait_for($h->signal('Approve', ['Grace']));
    is_deeply(wait_for($h->result),
        { request => 'access', approver => 'Grace', note => 'LGTM', status => 'approved' }, 'decision');
};

done_testing;
