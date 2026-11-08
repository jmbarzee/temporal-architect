<?php

declare(strict_types=1);

namespace Corpus\Messages;

use Temporal\Api\Enums\V1\EventType;
use Temporal\Client\WorkflowOptions;
use Temporal\Client\WorkflowStubInterface;
use Temporal\Testing\TimeSkippingWorkflowTestCase;

final class ApprovalTest extends TimeSkippingWorkflowTestCase
{
    private function start(): WorkflowStubInterface
    {
        $stub = $this->workflowClient->newUntypedWorkflowStub(
            'Approval',
            WorkflowOptions::new()
                ->withTaskQueue(Workers::APPROVALS_TASK_QUEUE)
                ->withWorkflowId('approval-' . \uniqid()),
        );
        $this->workflowClient->start($stub, 'access');
        return $stub;
    }

    private function statusOf(WorkflowStubInterface $stub): string
    {
        return $stub->query('Status')?->getValue(0, 'string');
    }

    public function testApproval(): void
    {
        $wf = $this->start();
        // Approve arrives before anything waits for it, and stays pending.
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(30);
        $wf->signal('Approve', 'Grace');
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(30);
        self::assertSame('approved', $this->statusOf($wf));
        $wf->signal('Open');
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        self::assertSame('open', $this->statusOf($wf));
        self::assertSame('reviewed', $wf->update('Review', 'LGTM')?->getValue(0, 'string'));
        self::assertEquals(new Decision('access', 'Grace', 'LGTM', 'reviewed'), $wf->getResult(Decision::class));
    }

    public function testReviewCallerGetsItsResultBeforeAnyWaiterTakesIt(): void
    {
        $wf = $this->start();
        // Review arrives while Approval still awaits Open, before anything waits for Review.
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(30);
        self::assertSame('reviewed', $wf->update('Review', 'LGTM')?->getValue(0, 'string'));
        $wf->signal('Open');
        $this->settle($wf);
        $this->testingService->unlockTimeSkippingWithSleep(60);
        $wf->signal('Approve', 'Grace');
        self::assertEquals(new Decision('access', 'Grace', 'LGTM', 'approved'), $wf->getResult(Decision::class));
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
