use v5.38;
use warnings;
use Test::More;
use FindBin ();
use lib "$FindBin::Bin/..", "$FindBin::Bin/lib", "$FindBin::Bin/../../../perl-lib";
use CorpusEnv qw(wait_for);
use CallerTypes;
use GreeterTypes;
use HeldCompose;

my $client = CorpusEnv::start();
my @cmd = (CorpusEnv::cli(), qw(operator nexus endpoint create --name GreeterEndpoint
    --target-namespace default --target-task-queue greeter --address), CorpusEnv::target());
my $out = qx(@cmd 2>&1);
die "nexus endpoint create failed: $out" if $?;

subtest 'Caller: sync, async, and a detached Greet it never waits for' => sub {
    # Grace's greeting is held until after Caller returns.
    $HeldCompose::gate = $CorpusEnv::loop->new_future;
    my $caller  = CorpusEnv::run_worker(CallerTypes::worker($client));
    my $greeter = CorpusEnv::run_worker(GreeterTypes::worker($client, activities => ['HeldCompose']));
    my $got = wait_for($client->execute_workflow('Caller', ['Ada', 'Grace'], id => 'caller-1', task_queue => 'caller'));
    my $grace = $client->get_workflow_handle('greet-Grace');
    ok(CorpusEnv::running($grace), 'Caller did not wait for its detached Greet');
    $HeldCompose::gate->done;
    is(wait_for($grace->result), 'Greetings, Grace', 'detached Greet completes');
    is_deeply($got, { hello => 'Hello, Ada', greeting => 'Greetings, Ada' }, 'greetings');
    CorpusEnv::stop_worker($_) for $caller, $greeter;
};

subtest 'Greet' => sub {
    my $tw = CorpusEnv::run_worker(GreeterTypes::worker($client));
    is(wait_for($client->execute_workflow('Greet', ['Ada'], id => 'greet-1', task_queue => 'greeter')),
        'Greetings, Ada', 'greeting');
    CorpusEnv::stop_worker($tw);
};

done_testing;
