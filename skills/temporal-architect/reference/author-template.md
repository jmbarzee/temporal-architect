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

## Delegation

This skill owns the `.twf` ↔ SDK translation: call shapes, wire names, options, project layout, verify. How to write the SDK's Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics. One table, each topic with its file there:

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
