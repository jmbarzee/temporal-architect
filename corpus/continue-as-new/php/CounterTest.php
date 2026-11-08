<?php

declare(strict_types=1);

namespace Corpus\ContinueAsNew;

use Temporal\Api\Enums\V1\EventType;
use Temporal\Client\WorkflowOptions;
use Temporal\Client\WorkflowStubInterface;
use Temporal\Testing\TimeSkippingWorkflowTestCase;
use Temporal\Workflow\WorkflowExecutionStatus;

final class CounterTest extends TimeSkippingWorkflowTestCase
{
    public function testCounterCompletesAtTheLimit(): void
    {
        $wf = $this->start(2, 3);
        $this->runTo($wf, EventType::EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED);
        self::assertSame(3, $wf->getResult('int'));
    }

    public function testCounterContinuesAsNewBelowIt(): void
    {
        $wf = $this->start(0, 3);
        $first = $this->runTo($wf, EventType::EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW);
        $this->runTo($this->latest($wf), EventType::EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW);
        $this->runTo($this->latest($wf), EventType::EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED);
        self::assertSame(WorkflowExecutionStatus::ContinuedAsNew, $first->describe()->info->status);
        self::assertSame(3, $wf->getResult('int')); // follows the chain of runs
    }

    private function start(int $count, int $limit): WorkflowStubInterface
    {
        $wf = $this->workflowClient->newUntypedWorkflowStub(
            'Counter',
            WorkflowOptions::new()->withTaskQueue(Workers::COUNTERS_TASK_QUEUE)->withWorkflowId('counter-' . \uniqid()),
        );
        $this->workflowClient->start($wf, $count, $limit);
        return $wf;
    }

    /** The workflow's current run, pinned by its run ID. */
    private function latest(WorkflowStubInterface $wf): WorkflowStubInterface
    {
        $id = $wf->getExecution()->getID();
        $run = $this->workflowClient->newUntypedRunningWorkflowStub($id)->describe()->info->execution->getRunID();
        return $this->workflowClient->newUntypedRunningWorkflowStub($id, $run);
    }

    /**
     * Skips one run's timer, then waits for the run to close with $close. The test server skips time
     * past a running activity, so the skip waits for the timer to start and Increment runs with time locked.
     */
    private function runTo(WorkflowStubInterface $run, int $close): WorkflowStubInterface
    {
        $this->until($run, EventType::EVENT_TYPE_TIMER_STARTED);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        $this->until($run, $close);
        return $run;
    }

    /** Waits up to 15s of real time for an event of the type; throws rather than hang. */
    private function until(WorkflowStubInterface $run, int $type): void
    {
        $deadline = \microtime(true) + 15;
        while (true) {
            foreach ($this->workflowClient->getWorkflowHistory($run->getExecution()) as $event) {
                if ($event->getEventType() === $type) {
                    return;
                }
            }
            if (\microtime(true) > $deadline) {
                throw new \RuntimeException(\sprintf('event %d never reached history', $type));
            }
            \usleep(50_000);
        }
    }
}
