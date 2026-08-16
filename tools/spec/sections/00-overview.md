# Overview

Formal specification for the Temporal Workflow Format (TWF) language.

## File Structure

A TWF file consists of an optional leading `package` clause, zero or more `import` declarations,
and zero or more top-level definitions:

```
file ::= [package_clause] import_decl* definition*
definition ::= workflow_def | activity_def | worker_def | namespace_def | nexus_service_def
```

The `package` clause and `import` declarations are optional; a file with neither behaves exactly as
before (see [Packages and Imports](./14-packages-and-imports.md)).

See:

- [Workflow Definitions](./01-workflows.md)
- [Activity Definitions](./02-activities.md)
- [Worker and Namespace Definitions](./03-workers-and-namespaces.md)
- [Nexus Service Definitions](./04-nexus.md)

Cross-cutting topics:

- [Packages and Imports](./14-packages-and-imports.md)
- [Cross-Workflow Signals](./13-cross-workflow-signals.md)
