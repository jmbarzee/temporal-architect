package messages;

import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.UpdateMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

/** The workflow type is the interface's simple name; handler names default to the method name, so each sets the .twf name. */
@WorkflowInterface
public interface Approval {
  @WorkflowMethod
  Decision run(String request);

  @SignalMethod(name = "Open")
  void open();

  @SignalMethod(name = "Approve")
  void approve(String approver);

  @UpdateMethod(name = "Review")
  String review(String note);

  @QueryMethod(name = "Status")
  String status();

  record Decision(String request, String approver, String note, String status) {}
}
