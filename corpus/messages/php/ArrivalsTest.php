<?php

declare(strict_types=1);

namespace Corpus\Messages;

use Temporal\Api\Enums\V1\EventType;
use Temporal\Client\WorkflowOptions;
use Temporal\Client\WorkflowStubInterface;
use Temporal\Exception\Client\WorkflowNotFoundException;
use Temporal\Testing\TimeSkippingWorkflowTestCase;

final class ArrivalsTest extends TimeSkippingWorkflowTestCase
{
    public const TASK_QUEUE = 'arrivals';

    /** Runs the workflow type, sending X "1" after a minute and X "2" after two. */
    private function withTwoXs(string $type, mixed $resultType, mixed ...$args): mixed
    {
        $stub = $this->workflowClient->newUntypedWorkflowStub(
            $type,
            WorkflowOptions::new()->withTaskQueue(self::TASK_QUEUE)->withWorkflowId($type . '-' . \uniqid()),
        );
        $this->workflowClient->start($stub, ...$args);
        $this->settle($stub);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        $this->settle($stub);
        $stub->signal('X', '1');
        $this->settle($stub);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        $this->settle($stub);
        try {
            $stub->signal('X', '2');
        } catch (WorkflowNotFoundException) {
            // A workflow that needed only one X has completed by now.
        }
        return $stub->getResult($resultType);
    }

    public function testArrivalsGoToWaitersInTheOrderTheyBegan(): void
    {
        self::assertSame(['began first' => '1', 'created first' => '2'], $this->withTwoXs('TwoWaiters', 'array'));
    }

    public function testAPromiseBeginsWaitingAtItsBinding(): void
    {
        self::assertEquals(['promise' => '1', 'await' => '2'], $this->withTwoXs('PromiseThenAwait', 'array'));
    }

    public function testAwaitOneTheCaseWinsAndTakes(): void
    {
        self::assertSame(['case 1', 'then 2'], $this->withTwoXs('AwaitOne', 'array', 3600));
    }

    public function testAwaitOneTheTimerWinsAndTheCaseTakesNothing(): void
    {
        self::assertSame(['timer', 'then 1'], $this->withTwoXs('AwaitOne', 'array', 1));
    }

    public function testACancelledWaiterLeavesTheQueue(): void
    {
        self::assertSame('1', $this->withTwoXs('CancelledWaiter', 'string'));
    }

    public function testNaiveAwaitPerWaiterLosesAnArrival(): void
    {
        // One condition pass releases every waiter whose condition holds, and resumes them
        // afterwards: both take from a queue holding one arrival, so one finds it empty (here the
        // waiter that began first).
        self::assertSame(['began first' => 'lost', 'created first' => '1'], $this->withTwoXs('NaiveTwoWaiters', 'array'));
    }
    /**
     * Waits (real time, up to 15s) until no workflow task is pending, so a time skip cannot run
     * ahead of the worker: the test server fast-forwards even while a workflow task is scheduled.
     */
    private function settle(WorkflowStubInterface $wf): void
    {
        $deadline = \microtime(true) + 15;
        while (true) {
            $scheduled = $completed = $i = -1;
            foreach ($this->workflowClient->getWorkflowHistory($wf->getExecution()) as $event) {
                ++$i;
                match ($event->getEventType()) {
                    EventType::EVENT_TYPE_WORKFLOW_TASK_SCHEDULED => $scheduled = $i,
                    EventType::EVENT_TYPE_WORKFLOW_TASK_COMPLETED => $completed = $i,
                    default => null,
                };
            }
            if ($scheduled >= 0 && $completed > $scheduled) {
                return;
            }
            if (\microtime(true) > $deadline) {
                throw new \RuntimeException('a workflow task never completed');
            }
            \usleep(20_000);
        }
    }
}
