package history

import (
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
)

// Subject names what an Event is about; Phase names the step it records. The
// README's event table maps every Temporal event type to one (Subject, Phase)
// pair, or to "ignored".
type (
	Subject string
	Phase   string
)

const (
	SubjectWorkflow       Subject = "workflow"
	SubjectTimer          Subject = "timer"
	SubjectActivity       Subject = "activity"
	SubjectSignal         Subject = "signal"
	SubjectUpdate         Subject = "update"
	SubjectChild          Subject = "child"
	SubjectExternalSignal Subject = "externalSignal"
	SubjectExternalCancel Subject = "externalCancel"
	SubjectNexus          Subject = "nexus"
	SubjectMarker         Subject = "marker"
)

const (
	PhaseScheduled       Phase = "scheduled"
	PhaseInitiated       Phase = "initiated"
	PhaseStarted         Phase = "started"
	PhaseFired           Phase = "fired"
	PhaseCompleted       Phase = "completed"
	PhaseFailed          Phase = "failed"
	PhaseTimedOut        Phase = "timedOut"
	PhaseCanceled        Phase = "canceled"
	PhaseCancelRequested Phase = "cancelRequested"
	PhaseTerminated      Phase = "terminated"
	PhaseContinuedAsNew  Phase = "continuedAsNew"
	PhaseReceived        Phase = "received"
	PhaseAccepted        Phase = "accepted"
	PhaseRejected        Phase = "rejected"
	PhaseRecorded        Phase = "recorded"
)

// Event is one step of a run's execution, decoded from one history event.
// Fields a step has no value for stay zero.
type Event struct {
	ID      int64     // the history event's ID
	Time    time.Time // the history event's time
	Subject Subject
	Phase   Phase
	// Name is the subject's name: workflow, child, or activity type, timer ID,
	// signal, update, or marker name, or "service.operation" for nexus. A step
	// that resolves an earlier one (an activity's completion) leaves it empty
	// when the history event does not carry it; resolve it through Opener.
	Name string
	// Target is the counterpart: a child or external workflow's ID, a nexus
	// endpoint, or the next run's ID on continue-as-new.
	Target string
	// Opener is the ID of the event that opened the thing this step advances
	// (the scheduled, initiated, or started event), zero for an opener itself.
	Opener  int64
	Attempt int32  // the attempt a started step belongs to
	Failure string // the failure message, cause, or termination reason
}

// Decode lists a run's execution events in history order. History events the
// README table marks "ignored" yield nothing. Decode does not feed Build: the
// aggregate graph folds its own four event types.
func Decode(h History) []Event {
	var out []Event
	for _, e := range h.Events {
		if ev, ok := decode(e); ok {
			ev.ID, ev.Time = e.GetEventId(), eventTime(e)
			out = append(out, ev)
		}
	}
	return out
}

// decode reads one history event's attributes; ID and Time are Decode's.
func decode(e *historypb.HistoryEvent) (Event, bool) {
	switch e.EventType {
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
		a := e.GetWorkflowExecutionStartedEventAttributes()
		return Event{Subject: SubjectWorkflow, Phase: PhaseStarted, Name: a.GetWorkflowType().GetName(), Attempt: a.GetAttempt()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
		return Event{Subject: SubjectWorkflow, Phase: PhaseCompleted}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
		return Event{Subject: SubjectWorkflow, Phase: PhaseFailed, Failure: e.GetWorkflowExecutionFailedEventAttributes().GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT:
		return Event{Subject: SubjectWorkflow, Phase: PhaseTimedOut}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CANCEL_REQUESTED:
		return Event{Subject: SubjectWorkflow, Phase: PhaseCancelRequested, Failure: e.GetWorkflowExecutionCancelRequestedEventAttributes().GetCause()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
		return Event{Subject: SubjectWorkflow, Phase: PhaseCanceled}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED:
		return Event{Subject: SubjectWorkflow, Phase: PhaseTerminated, Failure: e.GetWorkflowExecutionTerminatedEventAttributes().GetReason()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW:
		a := e.GetWorkflowExecutionContinuedAsNewEventAttributes()
		return Event{Subject: SubjectWorkflow, Phase: PhaseContinuedAsNew, Name: a.GetWorkflowType().GetName(), Target: a.GetNewExecutionRunId()}, true

	case enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
		return Event{Subject: SubjectActivity, Phase: PhaseScheduled, Name: e.GetActivityTaskScheduledEventAttributes().GetActivityType().GetName()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED:
		a := e.GetActivityTaskStartedEventAttributes()
		return Event{Subject: SubjectActivity, Phase: PhaseStarted, Opener: a.GetScheduledEventId(), Attempt: a.GetAttempt()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
		return Event{Subject: SubjectActivity, Phase: PhaseCompleted, Opener: e.GetActivityTaskCompletedEventAttributes().GetScheduledEventId()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_FAILED:
		a := e.GetActivityTaskFailedEventAttributes()
		return Event{Subject: SubjectActivity, Phase: PhaseFailed, Opener: a.GetScheduledEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
		a := e.GetActivityTaskTimedOutEventAttributes()
		return Event{Subject: SubjectActivity, Phase: PhaseTimedOut, Opener: a.GetScheduledEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED:
		return Event{Subject: SubjectActivity, Phase: PhaseCancelRequested, Opener: e.GetActivityTaskCancelRequestedEventAttributes().GetScheduledEventId()}, true
	case enumspb.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
		return Event{Subject: SubjectActivity, Phase: PhaseCanceled, Opener: e.GetActivityTaskCanceledEventAttributes().GetScheduledEventId()}, true

	case enumspb.EVENT_TYPE_TIMER_STARTED:
		return Event{Subject: SubjectTimer, Phase: PhaseStarted, Name: e.GetTimerStartedEventAttributes().GetTimerId()}, true
	case enumspb.EVENT_TYPE_TIMER_FIRED:
		a := e.GetTimerFiredEventAttributes()
		return Event{Subject: SubjectTimer, Phase: PhaseFired, Name: a.GetTimerId(), Opener: a.GetStartedEventId()}, true
	case enumspb.EVENT_TYPE_TIMER_CANCELED:
		a := e.GetTimerCanceledEventAttributes()
		return Event{Subject: SubjectTimer, Phase: PhaseCanceled, Name: a.GetTimerId(), Opener: a.GetStartedEventId()}, true

	case enumspb.EVENT_TYPE_MARKER_RECORDED:
		return Event{Subject: SubjectMarker, Phase: PhaseRecorded, Name: e.GetMarkerRecordedEventAttributes().GetMarkerName()}, true

	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED:
		return Event{Subject: SubjectSignal, Phase: PhaseReceived, Name: e.GetWorkflowExecutionSignaledEventAttributes().GetSignalName()}, true

	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_ACCEPTED:
		return Event{Subject: SubjectUpdate, Phase: PhaseAccepted, Name: e.GetWorkflowExecutionUpdateAcceptedEventAttributes().GetAcceptedRequest().GetInput().GetName()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_REJECTED:
		a := e.GetWorkflowExecutionUpdateRejectedEventAttributes()
		return Event{Subject: SubjectUpdate, Phase: PhaseRejected, Name: a.GetRejectedRequest().GetInput().GetName(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_UPDATE_COMPLETED:
		a := e.GetWorkflowExecutionUpdateCompletedEventAttributes()
		return Event{Subject: SubjectUpdate, Phase: PhaseCompleted, Opener: a.GetAcceptedEventId(), Failure: a.GetOutcome().GetFailure().GetMessage()}, true

	case enumspb.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED:
		a := e.GetStartChildWorkflowExecutionInitiatedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseInitiated, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowId()}, true
	case enumspb.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_FAILED:
		a := e.GetStartChildWorkflowExecutionFailedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseFailed, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowId(), Opener: a.GetInitiatedEventId(), Failure: a.GetCause().String()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED:
		a := e.GetChildWorkflowExecutionStartedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseStarted, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED:
		a := e.GetChildWorkflowExecutionCompletedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseCompleted, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_FAILED:
		a := e.GetChildWorkflowExecutionFailedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseFailed, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_CANCELED:
		a := e.GetChildWorkflowExecutionCanceledEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseCanceled, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TIMED_OUT:
		a := e.GetChildWorkflowExecutionTimedOutEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseTimedOut, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true
	case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_TERMINATED:
		a := e.GetChildWorkflowExecutionTerminatedEventAttributes()
		return Event{Subject: SubjectChild, Phase: PhaseTerminated, Name: a.GetWorkflowType().GetName(), Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true

	case enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED:
		a := e.GetSignalExternalWorkflowExecutionInitiatedEventAttributes()
		return Event{Subject: SubjectExternalSignal, Phase: PhaseInitiated, Name: a.GetSignalName(), Target: a.GetWorkflowExecution().GetWorkflowId()}, true
	case enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_FAILED:
		a := e.GetSignalExternalWorkflowExecutionFailedEventAttributes()
		return Event{Subject: SubjectExternalSignal, Phase: PhaseFailed, Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId(), Failure: a.GetCause().String()}, true
	case enumspb.EVENT_TYPE_EXTERNAL_WORKFLOW_EXECUTION_SIGNALED:
		a := e.GetExternalWorkflowExecutionSignaledEventAttributes()
		return Event{Subject: SubjectExternalSignal, Phase: PhaseCompleted, Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true

	case enumspb.EVENT_TYPE_REQUEST_CANCEL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED:
		return Event{Subject: SubjectExternalCancel, Phase: PhaseInitiated, Target: e.GetRequestCancelExternalWorkflowExecutionInitiatedEventAttributes().GetWorkflowExecution().GetWorkflowId()}, true
	case enumspb.EVENT_TYPE_REQUEST_CANCEL_EXTERNAL_WORKFLOW_EXECUTION_FAILED:
		a := e.GetRequestCancelExternalWorkflowExecutionFailedEventAttributes()
		return Event{Subject: SubjectExternalCancel, Phase: PhaseFailed, Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId(), Failure: a.GetCause().String()}, true
	case enumspb.EVENT_TYPE_EXTERNAL_WORKFLOW_EXECUTION_CANCEL_REQUESTED:
		a := e.GetExternalWorkflowExecutionCancelRequestedEventAttributes()
		return Event{Subject: SubjectExternalCancel, Phase: PhaseCompleted, Target: a.GetWorkflowExecution().GetWorkflowId(), Opener: a.GetInitiatedEventId()}, true

	case enumspb.EVENT_TYPE_NEXUS_OPERATION_SCHEDULED:
		a := e.GetNexusOperationScheduledEventAttributes()
		return Event{Subject: SubjectNexus, Phase: PhaseScheduled, Name: a.GetService() + "." + a.GetOperation(), Target: a.GetEndpoint()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_STARTED:
		return Event{Subject: SubjectNexus, Phase: PhaseStarted, Opener: e.GetNexusOperationStartedEventAttributes().GetScheduledEventId()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_COMPLETED:
		return Event{Subject: SubjectNexus, Phase: PhaseCompleted, Opener: e.GetNexusOperationCompletedEventAttributes().GetScheduledEventId()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_FAILED:
		a := e.GetNexusOperationFailedEventAttributes()
		return Event{Subject: SubjectNexus, Phase: PhaseFailed, Opener: a.GetScheduledEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_CANCELED:
		a := e.GetNexusOperationCanceledEventAttributes()
		return Event{Subject: SubjectNexus, Phase: PhaseCanceled, Opener: a.GetScheduledEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_TIMED_OUT:
		a := e.GetNexusOperationTimedOutEventAttributes()
		return Event{Subject: SubjectNexus, Phase: PhaseTimedOut, Opener: a.GetScheduledEventId(), Failure: a.GetFailure().GetMessage()}, true
	case enumspb.EVENT_TYPE_NEXUS_OPERATION_CANCEL_REQUESTED:
		return Event{Subject: SubjectNexus, Phase: PhaseCancelRequested, Opener: e.GetNexusOperationCancelRequestedEventAttributes().GetScheduledEventId()}, true
	}
	return Event{}, false
}
