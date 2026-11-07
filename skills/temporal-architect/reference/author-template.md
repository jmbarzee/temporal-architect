# Author Skill Template

Every `temporal-architect-author-<lang>` SKILL.md carries these sections, in this order, under front matter naming the skill `temporal-architect-author-<lang>` and its SDK.

## Orient

The project layout the code lands in, and the signals that pick a codegen variant.

## Wire names

A `.twf` name is the registered name, byte for byte (`twf spec workflows`, `activities`, `nexus`). Where the SDK's default differs, the code sets the `.twf` name explicitly; the `.twf` is never renamed to fit the SDK. One table, each default cited from the SDK source:

| Construct | SDK default | Set the `.twf` name by |
|---|---|---|
| workflow | | |
| activity | | |
| signal | | |
| query | | |
| update | | |
| Nexus service | | |
| Nexus operation | | |

Types map by the SDK's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ SDK translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write the SDK's Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics. One table, each topic with its file there:

| Topic | `temporal-developer` |
|---|---|
| worker setup | |
| testing | |
| determinism | |
| errors | |
| data | |
| versioning | |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

## Process

The layers, root-down, each with its check.

## Verify

One fenced command, run from the module root, that builds, statically checks, and tests the generated code and exits 0 only when all pass. Selective dispatch ([decomposition.md](decomposition.md#selective-dispatch)) runs it from this section, so it keeps this heading.

## Output conventions

Where files land and how they are named.

## Reference index

| DSL | SDK | File |
|---|---|---|

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics, each cited from the SDK:

- **`detach workflow`**: a child start takes parent-close policy `ABANDON` and waits for the child to start, so a failed start fails the caller. A client start just starts. Neither gets the result.
- **`detach nexus`**: cancellation type `ABANDON`; wait for the operation to start (a sync operation starts by completing) and never get the result. After the caller closes, the operation's completion callback to it fails and is dropped.
