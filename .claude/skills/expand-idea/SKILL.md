---
name: expand-idea
description: Expand a one-sentence idea or bare term (e.g. "multi-tenant-ai-rate-limiting") into a first-principles system needs brief — domain context, entities, operations, boundaries, failure modes, and a scope ladder — for a Temporal architecture. Use at the very start of a design, before writing .twf, when the problem is still vague.
---

# Expand Idea to System Needs Brief

Takes a single sentence — or even just a term like "multi-tenant-ai-rate-limiting" — and expands it into a thorough, first-principles system needs brief. The output describes *what the system is, what it must do, and what forces shape it* in domain-native language, without prescribing technology choices or execution frameworks.

This is a synthesis command, not an architecture generator. The output should reflect the depth a senior systems thinker brings after genuinely understanding the domain — the kind of document that makes a downstream architect's job tractable because the hard thinking about *what* and *why* is already done.

## Input

The user provides one sentence (or term) describing the system. Read it from context — do not ask for clarification unless the core system type is genuinely ambiguous.

## Workflow

### Phase 1: Multi-Perspective Analysis (Parallel)

Launch four sub-agents simultaneously. Each explores a different lens on the idea using web search, domain knowledge, and first-principles reasoning. No framework-specific references — pure problem understanding.

---

**Sub-agent A — Domain & Industry Context**

Research the domain this system lives in. Be specific — if this is healthcare prior authorization, describe PA workflows specifically, not "healthcare" generically.

Answer:
- What industry does this serve? What does a sophisticated incumbent implementation look like at scale — not a toy, but what a real company has actually built?
- What are the established conventions, terminologies, and data flows specific to this domain? Name them precisely. (e.g., for payments: auth → capture → settlement → reconciliation; for logistics: pick → pack → manifest → carrier handoff → delivery → return/exception)
- What are the domain-specific failure modes? Not generic "something could fail" — name them: payment declines vs. network timeouts vs. fraud holds; inventory oversells vs. allocation races; webhook delivery failures vs. provider API version deprecation.
- What are the scale characteristics? (transaction volume per day, typical concurrency, data retention requirements, real-time vs. batch processing mix)
- What regulatory or compliance constraints are common? (PCI-DSS, HIPAA, GDPR, SOX, OFAC, FDA — whichever actually apply to this domain)
- What does production observability look like in this domain? What metrics are SLA-critical? What does an on-call engineer watch?

Return a structured domain profile grounded in real industry specifics.

---

**Sub-agent B — Product Journey & User Experience**

Map the end-to-end product experience. Walk the system from trigger to terminal state, through the eyes of every actor who touches it. Stay in the product lane — describe what happens and what people experience, not how the system should handle it internally.

Answer:
- What triggers this system? (user action, scheduled job, external event/webhook, another service calling an API, some combination)
- Walk the complete happy path step by step — name each step with what actually happens, not abstract stages. "Validate the shipping address against USPS Address Verification API" not "validate input."
- At each step: what can go wrong? What does the user or caller *experience* when it does? What are they told, and what can they do about it? (e.g., "user sees 'payment declined' and can update their card" vs. "order silently enters a review queue and the user sees 'processing' for up to 24h")
- Where do humans intervene? (approval gates, exception queues, override mechanisms) — who specifically (ops team, end user, compliance officer, manager), and what do they see and decide?
- What does a caller or end user need to observe while the system runs? (progress phase, percentage, ETA, current blocking step, nothing at all)
- What does the caller see on successful completion? On partial failure? On hard failure?
- What SLA windows govern the experience? Map each to its business source. (payment auth window: typically 7 days per card network rules; shipping label void: typically 24h; approval SLA: business days with clock stop on weekends)
- What makes two requests "the same request" from the user's perspective? If a user re-submits, what should they experience — a duplicate, a resumption, or an error?

Return a detailed product journey with named states, specific user experiences, and concrete failure scenarios.

---

**Sub-agent C — System Architecture Needs**

Analyze the system from first principles. Do not prescribe solutions — describe the fundamental shape of the problem. Let the system's actual structure emerge from the domain rather than fitting it into predetermined categories.

Answer:
- **Entities & data model.** What are the core entities? How do they relate to each other (one-to-many, many-to-many, hierarchical, temporal)? What is mutable vs. immutable? What is the expected cardinality at scale? Which entities are the primary "nouns" around which the system organizes — and are they long-lived (accounts, subscriptions) or transactional (orders, requests)?
- **Core operations.** What does the system *do*? Name the operations with domain verbs, not engineering verbs. For each: what are its inputs, effects, and outputs? How long does it take — milliseconds, seconds, minutes, hours, days? Is it a single action or a sequence of coordinated steps? What makes it non-trivial?
- **System boundaries & integration surface.** What does this system expose to callers? (APIs, events, webhooks, UIs) What other systems does it depend on? For each external dependency: name the actual integration (not "the payment system" — "Stripe Charges API v2"), characterize its reliability (uptime SLA, typical latency, rate limits, error modes), and note whether it pushes data or must be polled.
- **Data flow topology.** Where does data originate? Where does it live at rest? How does it move between systems? What transforms it along the way? Where are the boundaries between "ours" and "theirs"?
- **Trust & isolation.** Who can do what? If multi-tenant, what is the isolation model — how far does a blast radius extend? What are the authentication and authorization boundaries? Where does sensitive data live, and who can access it?
- **Scaling dimensions.** What axis grows first — users, throughput, data volume, geographic reach, number of integrations? Where are the expected bottlenecks? What are the natural partitioning boundaries in the data and in the operations?
- **Consistency requirements.** Where must the system guarantee strict correctness vs. where is eventual consistency acceptable? What invariants must never be violated (e.g., "a seat can only be booked once," "total debits must equal total credits")? What happens when two operations race on the same entity?

Return a structured analysis of the system's fundamental shape — its entities, operations, boundaries, and constraints.

---

**Sub-agent D — Business & Operational Context**

Analyze the business implications with specifics, not platitudes.

Answer:
- What is the financial motivation for this system existing? (revenue processing, cost reduction, risk mitigation, regulatory requirement, competitive capability, operational efficiency)
- What is the business impact of a dropped or permanently failed operation? Quantify where possible: revenue lost per incident, compliance violation type, SLA penalty, cascading downstream failure, customer trust erosion.
- What are the real business deadlines that govern this system? Map each to its source — not just a number, but *why* that number. (Card network auth windows, regulatory response deadlines, contractual SLAs, customer patience thresholds.)
- What does on-call look like? What alerts matter, what manual intervention is available, what is the blast radius of something going wrong?
- **MVP scope**: what is the smallest useful version of this system? What capabilities can be deferred without undermining the core value?
- **Mature system**: what does this become at 10× volume, with additional compliance requirements, or integrating with more systems?
- Where does this system sit in the broader business architecture? What upstream systems feed it? What downstream systems depend on its outputs? What would break if this system disappeared for an hour?

Return a business context document with specific tradeoffs and a clear MVP-to-mature trajectory.

---

### Phase 2: Synthesis

Read all four sub-agent results. Synthesize into a single coherent system needs brief. The goal is not to concatenate — it's to weave the four perspectives into a unified understanding where domain context informs architecture needs, product journey grounds business tradeoffs, and everything connects.

Resolve contradictions between sub-agents (e.g., if sub-agent B describes a step as instantaneous but sub-agent C identifies it as spanning hours, reconcile with specifics). Fill gaps where one sub-agent's output raises questions another should have answered.

The synthesis should describe the system in its own natural vocabulary — the language that a domain expert and a systems architect would converge on in a whiteboard session. Do not force the description into any predetermined structural categories. If the system is naturally understood through its data flows, describe data flows. If it's naturally understood through its entity lifecycles, describe entity lifecycles. If it's a coordination problem, describe what's being coordinated and why. Let the domain speak.

The richness of this description is what makes downstream architecture work tractable. An architect reading this should understand the system deeply enough to see the structural patterns without being told what they are.

## Output: System Needs Brief

Present a structured document with the following sections. Be specific and opinionated throughout — name real technologies, real APIs, real failure modes. Generic placeholders are a sign of insufficient analysis.

**1. System Identity**
One paragraph: what this system does, who it serves, why the problem is non-trivial, and what makes it interesting from a systems perspective.

**2. Domain Context**
The industry landscape, established conventions, and constraints that shape every design decision. Include specific terminology, regulatory environment, and scale characteristics. (2–4 paragraphs)

**3. Entities & Data Model**
The core nouns of the system — what they are, how they relate, and what lifecycle they have. For each entity:
- What it represents and who owns it
- Its cardinality and expected volume
- Key state transitions (if stateful)
- Relationships to other entities

Include a quick-reference table for the entity graph. This section grounds everything that follows in concrete domain objects.

**4. Core Operations**
What the system *does*, described with domain verbs. This is the heart of the brief. For each operation:
- What triggers it and what are its inputs
- What it actually does, step by step, with enough specificity that an architect can see the structure
- How long it takes and what determines the duration
- What it touches — which entities, which external systems, which other operations
- How it ends: success, failure, and the messy middle ground

Describe operations at the resolution that matters. A simple CRUD operation gets one line. A multi-step, multi-day, multi-system coordination gets the detail it deserves. Let the domain determine what's interesting, not a template.

**5. System Boundaries**
Everything this system touches, organized by direction:

*Inbound* — what calls or triggers this system:

| Caller | Interface | Volume | Expectations |
|--------|-----------|--------|--------------|

*Outbound* — what this system depends on:

| Dependency | Interface | Reliability Profile | Failure Modes |
|------------|-----------|---------------------|---------------|

Include actual API names, typical latencies, rate limits, and callback/polling characteristics.

*Trust boundaries* — who can do what, isolation model, sensitive data handling.

**6. What Goes Wrong**
The failure landscape, described from the domain outward. Not a taxonomy of failure categories — a concrete enumeration of what actually breaks in this kind of system, what it costs, and what matters:
- Which failures are common and expected (and must be handled gracefully)
- Which failures are rare but catastrophic (and must be prevented or recovered from)
- Where partial completion creates inconsistency — and what the business cost of inconsistency is
- What the system's critical invariants are — the things that must *never* be violated

**7. Scaling & Constraints**
The forces that shape the system's architecture:
- Volume projections and growth trajectory
- Business SLAs and their sources
- Compliance and regulatory requirements
- Cost model and economic constraints
- The natural partitioning boundaries — what can be divided, what must stay together

**8. Human Touchpoints**
Where humans enter the loop, what they see, what they decide, and what happens while the system waits for them. For each touchpoint: who is the human (role), what is the decision, what is the SLA, and what happens if they don't act.

**9. Scope Ladder**

| MVP | +1 | Mature |
|-----|-----|--------|

Three columns showing how the system grows. MVP is the smallest useful version. +1 is the next meaningful capability increment. Mature is the full vision at scale.

**10. Open Questions**
What requires a product, engineering, or domain expert decision before design can proceed. Be specific: not "decide on error handling approach" but "decide whether a 402 from the payment provider (card invalid) should terminate the order immediately or allow the user to update their payment method within a grace period."

## Constraints

- **Be opinionated.** Name things concretely, choose specific characterizations, do not hedge with "it depends" without explaining on what.
- **Ground in domain reality.** Use actual industry terminology. The vocabulary should be recognizable to a domain expert, not just a software engineer.
- **Describe the mature system.** The user controls scope — do not design down to the least ambitious interpretation. The scope ladder shows the path; the core operations describe the destination.
- **No framework prescription.** Do not name execution frameworks, workflow engines, or orchestration platforms in the output. Describe what the system needs; let the next tool choose how.
- **Let the domain lead.** Describe the system in whatever terms the domain demands. If the interesting thing is the data model, linger on the data model. If the interesting thing is the coordination problem, linger on coordination. Do not force every system through the same analytical template.
- **Needs, not solutions.** Describe what the system must accomplish, not how to build it. "This operation spans days and must survive infrastructure failures" not "use a durable execution framework." "The user can cancel at any point during processing" not "use a signal handler."
- **Sub-agents research independently.** Each sub-agent should use web search to ground its analysis in real-world specifics — actual API documentation, industry standards, regulatory requirements. Do not rely on general knowledge when specifics are available.
