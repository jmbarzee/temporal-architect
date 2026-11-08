# Compose, with Grace's greeting held until the test opens $HeldCompose::gate.
use v5.38;
use feature 'class';
no warnings 'experimental::class';
use Future::AsyncAwait;
use Temporalio::Activity::Definition;

our $gate;

class HeldCompose :isa(Temporalio::Activity::Definition) {
    async method compose :Defn('Compose') ($name) {
        await $HeldCompose::gate if $name eq 'Grace';
        return "Greetings, $name";
    }
}

1;
