// Marks a workflow start that is a client start (in a sync nexus operation
// body), not a child of the calling workflow.
export function ClientStartBadge() {
  return (
    <span className="block-start-badge" title="Client start: started through the Temporal client from a sync Nexus operation, not as a child">
      client
    </span>
  )
}
