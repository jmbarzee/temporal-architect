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

SDK idioms delegated to `temporal-developer`. Filled by #375.

## Process

The layers, root-down, each with its check.

## Verify

The command that checks the generated code. Filled by #375.

## Output conventions

Where files land and how they are named.

## Reference index

| DSL | SDK | File |
|---|---|---|
