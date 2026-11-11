use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;
use Temporalio::Common::RetryPolicy;
use Temporalio::Exception::Application;

class JobActivities :isa(Temporalio::Activity::Definition) {
    sub reject_options () {
        return (retry_policy => Temporalio::Common::RetryPolicy->new(maximum_attempts => 1));
    }

    async method reject :Defn('Reject') ($item) {
        Temporalio::Exception::Application->throw(message => "rejected $item", type => 'Rejected');
    }

    async method process :Defn('Process') ($item) {
        say STDERR "processed $item" if $ENV{CORPUS_VERBOSE};    # process(item)
        return;
    }
}

1;
