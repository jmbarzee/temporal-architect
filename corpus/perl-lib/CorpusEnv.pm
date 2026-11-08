package CorpusEnv;
# A dev server, a client and live workers for one corpus test file. sdk-perl
# has no time-skipping environment, so the corpus tests run against
# `temporal server start-dev` (on a free port) and wait in real time.
use v5.38;
use warnings;

use File::Spec ();
use File::Temp ();
use Future;
use IO::Async::Loop;
use Temporalio::Runtime;
use Temporalio::Test::DevServer;
use Temporalio::Client;
use Temporalio::Test::Client;
use Temporalio::Test::Worker;
use Exporter 'import';
our @EXPORT_OK = qw(wait_for);

our ($loop, $runtime, $server, $client);
my @workers;

sub cli () {
    my $cli = $ENV{TEMPORAL_CLI};
    return $cli if defined $cli && -x $cli;
    ($cli) = grep { -x $_ } map { File::Spec->catfile($_, 'temporal') } File::Spec->path;
    die "temporal CLI not found (install it or set TEMPORAL_CLI)\n" unless defined $cli;
    return $cli;
}

# Starts the dev server and connects; returns the client.
sub start (%opts) {
    $loop    = IO::Async::Loop->new;
    $runtime = Temporalio::Runtime->new(loop => $loop);
    $server  = Temporalio::Test::DevServer->start(
        runtime       => $runtime,
        existing_path => cli(),
        log_level     => 'warn',
        stderr_file   => File::Temp->new(SUFFIX => '.log')->filename,
        %opts,
    );
    $client = Temporalio::Test::Client::connect_with_retry($loop, sub {
        Temporalio::Client->connect($server->target, namespace => 'default', runtime => $runtime);
    });
    return $client;
}

sub target () { $server->target }

# Runs a worker's poll loops on the shared loop until stop_worker.
sub run_worker ($worker) {
    my $tw = Temporalio::Test::Worker->new(worker => $worker, loop => $loop);
    push @workers, $tw;
    return $tw;
}

sub stop_worker ($tw) {
    @workers = grep { $_ != $tw } @workers;
    $tw->shutdown(60);
    return;
}

# Awaits a future on the loop (workers keep running), or dies after $timeout seconds.
sub wait_for ($f, $timeout = 60) {
    $loop->await(Future->wait_any($f, $loop->timeout_future(after => $timeout)));
    die "future did not resolve within ${timeout}s\n" unless $f->is_ready && !$f->is_cancelled;
    return $f->get;
}

sub sleep_real ($seconds) { $loop->await($loop->delay_future(after => $seconds)); return }

# The run's history events, each a temporal.api.history.v1.HistoryEvent.
sub events ($handle) {
    my $iter = $handle->fetch_history_events;
    my @out;
    while (defined(my $e = wait_for($iter->next, 30))) { push @out, $e }
    return @out;
}

# Whether the run is open: describe returns the raw DescribeWorkflowExecutionResponse.
sub running ($handle) {
    my $status = wait_for($handle->describe)->workflow_execution_info->status;
    return $status eq '1' || $status eq 'WORKFLOW_EXECUTION_STATUS_RUNNING';
}

sub kind ($event) { return $event->which_attributes // '' }

# Waits up to $timeout real seconds for an event whose attributes are $which.
sub until_event ($handle, $which, $timeout = 20) {
    my $deadline = time + $timeout;
    until (grep { kind($_) eq $which } events($handle)) {
        die $handle->workflow_id . ": $which never reached history\n" if time > $deadline;
        sleep_real(0.05);
    }
    return;
}

my $torn_down = 0;
sub teardown () {
    return if $torn_down++;
    eval { $_->shutdown(60) } for @workers;
    eval { $client->connection->close if $client };
    eval { $server->shutdown if $server };
    eval { $runtime->shutdown if $runtime };
    return;
}
END { local $?; teardown() }

1;
