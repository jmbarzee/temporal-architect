<?php

declare(strict_types=1);

namespace Corpus\Failure;

use Corpus\Failure\Fixtures\HeldJobActivities;
use Temporal\Api\Enums\V1\EventType;
use Temporal\Client\WorkflowOptions;
use Temporal\Client\WorkflowStubInterface;
use Temporal\Exception\Client\WorkflowFailedException;
use Temporal\Exception\Client\WorkflowUpdateException;
use Temporal\Exception\Failure\ActivityFailure;
use Temporal\Testing\WorkflowTestCase;
use Temporal\Workflow\WorkflowExecutionStatus;

final class JobTest extends WorkflowTestCase
{
    /** Waiting for Process, which runs until tearDown, would hang: fail instead. */
    private const WAIT = 10;

    /** @var list<WorkflowStubInterface> */
    private array $started = [];

    protected function setUp(): void
    {
        parent::setUp();
        // Real time: a skip past Process's timeout would end the slow branch early.
        $this->testingService->lockTimeSkipping();
    }

    protected function tearDown(): void
    {
        foreach ($this->started as $wf) {
            if ($wf->describe()->info->status === WorkflowExecutionStatus::Running) {
                $wf->terminate('test over');
            }
            \touch(HeldJobActivities::releaseFile($wf->getExecution()->getID()));
        }
        $this->testingService->unlockTimeSkipping();
        parent::tearDown();
    }

    private function start(): WorkflowStubInterface
    {
        $item = 'job-' . \uniqid();
        $wf = $this->workflowClient->newUntypedWorkflowStub(
            'Job',
            WorkflowOptions::new()->withTaskQueue(Workers::JOBS_TASK_QUEUE)->withWorkflowId($item),
        );
        $this->workflowClient->start($wf, $item);
        $this->started[] = $wf;
        return $wf;
    }

    public function testABranchFailureFailsTheRunWhileTheOtherBranchRuns(): void
    {
        $wf = $this->start();
        $wf->signal('Proceed');
        try {
            $wf->getResult(null, self::WAIT);
            self::fail('the run completed');
        } catch (WorkflowFailedException $e) {
            self::assertRejected($e->getPrevious());
        }
        $this->assertProcessStillRunning($wf);
    }

    public function testABranchFailureInAnUpdateFailsOnlyThatUpdate(): void
    {
        $wf = $this->start();
        try {
            $wf->startUpdate('Attempt')->getResult(self::WAIT);
            self::fail('the update completed');
        } catch (WorkflowUpdateException $e) {
            self::assertRejected($e->getPrevious());
        }
        self::assertSame(WorkflowExecutionStatus::Running, $wf->describe()->info->status);
        $this->assertProcessStillRunning($wf);
    }

    private static function assertRejected(?\Throwable $cause): void
    {
        self::assertInstanceOf(ActivityFailure::class, $cause);
        self::assertSame('Reject', $cause->getActivityType());
    }

    /** Process was scheduled, and neither completed nor was asked to cancel. */
    private function assertProcessStillRunning(WorkflowStubInterface $wf): void
    {
        $scheduled = false;
        $types = [];
        foreach ($this->workflowClient->getWorkflowHistory($wf->getExecution()) as $event) {
            $types[] = $event->getEventType();
            $scheduled = $scheduled || $event->getActivityTaskScheduledEventAttributes()
                ?->getActivityType()?->getName() === 'Process';
        }
        self::assertTrue($scheduled, 'Process was not scheduled');
        self::assertNotContains(EventType::EVENT_TYPE_ACTIVITY_TASK_COMPLETED, $types, 'Process completed');
        self::assertNotContains(
            EventType::EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED,
            $types,
            'Process was asked to cancel',
        );
    }
}
