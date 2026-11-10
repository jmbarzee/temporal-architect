use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/lib", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use Temporalio::Worker;
use AwaitOneTie;
use TwoTimerTie;

my $n = 0;

# No cache, so no sticky queue: the next workflow task goes to the normal queue, not a stopped worker.
sub worker ($client) {
    return CorpusEnv::run_worker(Temporalio::Worker->new(
        client               => $client,
        task_queue           => 'await-one',
        workflows            => [qw(AwaitOneTie TwoTimerTie)],
        max_cached_workflows => 0,
    ));
}

sub index_of ($events, $which, $nth = 1) {
    my $seen = 0;
    for my $i (0 .. $#$events) {
        return $i if CorpusEnv::kind($events->[$i]) eq $which && ++$seen == $nth;
    }
    die "no #$nth $which\n";
}

# undef when no workflow task started between events $i and $j, otherwise the events between them.
sub miss ($events, $i, $j) {
    ($i, $j) = sort { $a <=> $b } $i, $j;
    my @between = map { CorpusEnv::kind($_) } @$events[$i .. $j];
    return (grep { $_ eq 'workflow_task_started_event_attributes' } @between) ? join(',', @between) : undef;
}

# No time skipping: a short timer fires while no worker runs, then Ack arrives, so
# both reach one workflow task when a worker returns.
sub ack_tie ($client, $type, @args) {
    my $h = wait_for($client->start_workflow($type, [@args], id => 'tie-' . $n++, task_queue => 'await-one'));
    my $tw = worker($client);
    CorpusEnv::until_event($h, 'timer_started_event_attributes');
    CorpusEnv::stop_worker($tw);
    CorpusEnv::until_event($h, 'timer_fired_event_attributes');
    wait_for($h->signal('Ack'));
    $tw = worker($client);
    my $got = wait_for($h->result);
    CorpusEnv::stop_worker($tw);
    my @ev = CorpusEnv::events($h);
    return ($got, miss(\@ev, index_of(\@ev, 'timer_fired_event_attributes'),
        index_of(\@ev, 'workflow_execution_signaled_event_attributes')));
}

sub timer_tie ($client, $form, $order) {
    my $h = wait_for($client->start_workflow('TwoTimerTie', [$form, $order], id => 'tie-' . $n++, task_queue => 'await-one'));
    my $tw = worker($client);
    CorpusEnv::until_event($h, 'timer_started_event_attributes');
    CorpusEnv::stop_worker($tw);
    my $deadline = time + 20;
    until (grep({ CorpusEnv::kind($_) eq 'timer_fired_event_attributes' } CorpusEnv::events($h)) == 2) {
        die "timers never fired\n" if time > $deadline;
        CorpusEnv::sleep_real(0.1);
    }
    $tw = worker($client);
    my $got = wait_for($h->result);
    CorpusEnv::stop_worker($tw);
    my @ev = CorpusEnv::events($h);
    return ($got, miss(\@ev, index_of(\@ev, 'timer_fired_event_attributes', 1),
        index_of(\@ev, 'timer_fired_event_attributes', 2)));
}

# (#529) The setup is real-time and can miss: a stopped worker's open poll can take
# the timer's task. Retry it, up to 3 times, each on a fresh dev server and workflow
# ID, until history shows a real tie, and assert only then. Any other failure dies;
# a setup that never ties skips.
sub at_tie ($name, $want, $setup, @args) {
    my @missed;
    for my $attempt (1 .. 3) {
        my $client = CorpusEnv::start();
        my ($got, $miss) = $setup->($client, @args);
        CorpusEnv::teardown();
        return is($got, $want, $name) unless defined $miss;
        push @missed, $miss;
    }
    SKIP: { skip "$name: the tie was not set up in 3 attempts: " . join('; ', @missed), 1 }
    return;
}

# (#474) sdk-perl applies an activation's signals and checks conditions before it
# resolves timers (sdk-perl 55816a1, Workflow/Runner.pm:2117-2141), so at this tie Ack is ready and the
# timer is not, whichever is listed first. No flag turns that off.
at_tie('Ack listed first wins a tie', 'Ack', \&ack_tie, 'AwaitOneTie', ['Ack', 'timer'], 2);
at_tie('timer listed first: Ack still wins (SDK order)', 'Ack', \&ack_tie, 'AwaitOneTie', ['timer', 'Ack'], 2);

# Non-message cases resolve in one job set, so the shape gives first listed and wait_any does not.
at_tie('two timers: t2 listed first wins', 't2', \&timer_tie, 'shape', ['t2', 't1']);
at_tie('two timers: t1 listed first wins', 't1', \&timer_tie, 'shape', ['t1', 't2']);
at_tie('Future->wait_any picks completion order, not listed', 't1', \&timer_tie, 'wait_any', ['t2', 't1']);

done_testing;
