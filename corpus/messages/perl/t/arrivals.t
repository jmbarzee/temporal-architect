use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/lib", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use Temporalio::Worker;
use TwoWaiters;
use PromiseThenAwait;
use AwaitOne;
use AwaitOneBehindPromise;
use NaiveTwoWaiters;

my $client = CorpusEnv::start();
CorpusEnv::run_worker(Temporalio::Worker->new(
    client     => $client,
    task_queue => 'arrivals',
    workflows  => [qw(TwoWaiters PromiseThenAwait AwaitOne AwaitOneBehindPromise NaiveTwoWaiters)],
));

my $n = 0;

# Runs a fixture, sending X "1" once its 1s timers are done and X "2" after that.
# No time skipping: the waits are real.
sub with_two_xs ($type, @args) {
    my $h = wait_for($client->start_workflow($type, [@args], id => 'wf-' . $n++, task_queue => 'arrivals'));
    CorpusEnv::sleep_real(2);
    wait_for($h->signal('X', ['1']));
    CorpusEnv::sleep_real(1);
    eval { wait_for($h->signal('X', ['2'])) };    # a fixture that needed one X has completed
    return wait_for($h->result, 20);
}

is_deeply(with_two_xs('TwoWaiters'), { 'began first' => '1', 'created first' => '2' },
    'arrivals go to waiters in the order they began');
is_deeply(with_two_xs('PromiseThenAwait'), { promise => '1', await => '2' },
    'a promise begins waiting at its binding');
is_deeply(with_two_xs('AwaitOne', 3600), ['case 1', 'then 2'],
    'await one: the case wins and takes');
is_deeply(with_two_xs('AwaitOne', 1), ['timer', 'then 1'],
    'await one: the timer wins and the case takes nothing');
is_deeply(with_two_xs('AwaitOneBehindPromise'), ['promise 1', 'case 2'],
    'an await one case waits behind an earlier promise');
# The counterexample other SDKs fail: here the runner resumes one waiter before it
# reads the next predicate, so the naive form loses nothing.
is_deeply(with_two_xs('NaiveTwoWaiters'), ['1', '2'],
    'naive wait_condition per waiter: each arrival goes to one waiter');

done_testing;
