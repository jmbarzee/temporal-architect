use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Workflow::Definition;

class Audit :isa(Temporalio::Workflow::Definition) {
    # A core boolean (!!) goes out as JSON true/false; a top-level JSON::PP::true
    # is a blessed object the converter rejects, and a plain 1 is a number.
    async method run :Run ($items) {
        return !!(@$items > 0);
    }
}

1;
