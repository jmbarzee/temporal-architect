# A signal's or update's pending arrivals, oldest first (spec 06).
#
# No waiter tickets: the runner re-checks wait_condition predicates in the order
# the waits began and resumes each satisfied waiter synchronously before it
# checks the next (sdk-perl 55816a1, Workflow/Runner.pm:2008-2016,2030-2068), so
# the first waiter takes an arrival before a later waiter's predicate is read.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow;

class Arrivals {
    field @pending;

    # A handler adds its arrival as it returns.
    method add ($v) { push @pending, $v; return }

    # Whether an arrival is pending: an await one case's readiness.
    method ready () { return scalar @pending }

    # Takes the oldest arrival; only a winning await one case calls it.
    method claim () { return shift @pending }

    # Waits for and takes the oldest arrival. A future: `my $p = $xs->take`
    # begins waiting at the call, so a promise waits from its binding.
    async method take () {
        await Temporalio::Workflow::wait_condition(sub { scalar @pending });
        return shift @pending;
    }
}

1;
