package messages;

import io.temporal.workflow.Promise;

public class ApprovalImpl implements Approval {
  private String status = "submitted";
  private final Arrivals<Boolean> opens = new Arrivals<>();
  private final Arrivals<String> approves = new Arrivals<>();
  private final Arrivals<String> reviews = new Arrivals<>();

  @Override
  public void open() {
    status = "open";
    opens.add(true);
  }

  @Override
  public void approve(String approver) {
    status = "approved";
    approves.add(approver);
  }

  @Override
  public String review(String note) {
    status = "reviewed";
    reviews.add(note);
    return status;
  }

  @Override
  public String status() {
    return status;
  }

  @Override
  public Decision run(String request) {
    opens.take();
    Promise<String> approval = approves.promise(); // begins waiting here, at its binding
    String note = reviews.take();
    String approver = approval.get();
    return new Decision(request, approver, note, status);
  }
}
