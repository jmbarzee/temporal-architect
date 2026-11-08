use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use CounterTypes;

my $client = CorpusEnv::start();
CorpusEnv::run_worker(CounterTypes::worker($client));

# No time skipping: each run waits out its 1m timer in real time, so both start at once.
my $at_limit = wait_for($client->start_workflow('Counter', [2, 3], id => 'counter-1', task_queue => 'counters'));
my $below    = wait_for($client->start_workflow('Counter', [1, 3], id => 'counter-2', task_queue => 'counters'));

is(wait_for($at_limit->result, 180), 3, 'completes at the limit');
is(wait_for($below->result, 180), 3, 'continues as new below it');    # result follows the run chain
my $first = $client->get_workflow_handle('counter-2', run_id => $below->first_execution_run_id);
ok((grep { CorpusEnv::kind($_) eq 'workflow_execution_continued_as_new_event_attributes' } CorpusEnv::events($first)),
    'the first run continued as new');

done_testing;
