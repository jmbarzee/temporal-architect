<?php

declare(strict_types=1);

// Starts the time-skipping test server and the corpus worker once per PHPUnit run.
// Both binaries sit in the corpus root (make corpus-php fetches them; they are gitignored).

use Temporal\Testing\Environment;

\chdir(__DIR__);
require __DIR__ . '/php/vendor/autoload.php';

$environment = Environment::create();
$environment->startTemporalTestServer();
$environment->startRoadRunner(['./rr', 'serve', '-c', '.rr.yaml'], configFile: '.rr.yaml');
\register_shutdown_function(static fn() => $environment->stop());
