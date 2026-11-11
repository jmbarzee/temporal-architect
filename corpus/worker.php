<?php

declare(strict_types=1);

// The corpus worker process, started by RoadRunner (rr serve) for the PHP tests. Each design's
// Workers class holds its .twf workers' registrations; the fixtures are test-only.

use Corpus\Concurrency\Fixtures\AwaitOneTie;
use Corpus\Concurrency\Fixtures\BoundDeadline;
use Corpus\Failure\Fixtures\HeldJobActivities;
use Corpus\Messages\Fixtures\AwaitOne;
use Corpus\Messages\Fixtures\CancelledWaiter;
use Corpus\Messages\Fixtures\NaiveTwoWaiters;
use Corpus\Messages\Fixtures\PromiseThenAwait;
use Corpus\Messages\Fixtures\TwoWaiters;
use Temporal\Worker\FeatureFlags;
use Temporal\WorkerFactory;

require __DIR__ . '/php/vendor/autoload.php';

// detach workflow is ABANDON on parent close and on cancellation; by default the SDK cancels an
// abandoned child when the parent's scope is cancelled.
FeatureFlags::$cancelAbandonedChildWorkflows = false;

$factory = WorkerFactory::create();

Corpus\Messages\Workers::registerApprovalTypes($factory);
Corpus\Concurrency\Workers::registerBatchTypes($factory);
Corpus\ContinueAsNew\Workers::registerCounterTypes($factory);
Corpus\Failure\Workers::registerJobTypes($factory, HeldJobActivities::class);

$factory->newWorker('arrivals')->registerWorkflowTypes(
    TwoWaiters::class,
    PromiseThenAwait::class,
    CancelledWaiter::class,
    AwaitOne::class,
    NaiveTwoWaiters::class,
);
$factory->newWorker('bound')->registerWorkflowTypes(BoundDeadline::class);
$factory->newWorker('await-one')->registerWorkflowTypes(AwaitOneTie::class);

$factory->run();
