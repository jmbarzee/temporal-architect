# Overview

Formal specification for the Temporal Workflow Format (TWF) language.

## File Structure

A TWF file consists of zero or more top-level definitions:

```
file ::= definition*
definition ::= workflow_def | activity_def | worker_def | namespace_def | nexus_service_def
```

See:

- [Workflow Definitions](./01-workflows.md)
- [Activity Definitions](./02-activities.md)
- [Worker and Namespace Definitions](./03-workers-and-namespaces.md)
- [Nexus Service Definitions](./04-nexus.md)

Cross-cutting topics:

- [Cross-Workflow Signals](./13-cross-workflow-signals.md)
