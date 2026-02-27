# Enforce Compliance Reviews on Agent-Generated Document Summaries

## System Needs Brief

### 1. System Identity

This system enforces that no AI-generated document summary reaches production use -- client delivery, regulatory filing, knowledge base, or clinical record -- without passing through structured compliance review. It sits between AI summarization agents and the regulated contexts where their output is consumed: financial reporting, legal due diligence, insurance claims, clinical documentation. The problem is non-trivial because AI-generated summaries hallucinate at measurable rates (0.7-27% depending on task and model), omit material facts without signaling the omission, and soften legal or regulatory language in ways that change meaning. In regulated industries, any of these failures creates direct financial liability, regulatory exposure, or patient safety risk. The system must make AI summarization safe to deploy at scale by guaranteeing review, capturing provenance, and producing audit trails that survive regulatory examination -- while being fast enough that it does not negate the throughput advantage AI provides over manual summarization.

### 2. Domain Context

This system operates at the intersection of AI-assisted document intelligence and regulated compliance review. The primary industries are financial services (SEC filings, investment memos, compliance reporting), legal (contract review, due diligence, litigation support), insurance (claims processing, policy analysis, underwriting), and healthcare (clinical document summarization, trial data extraction, regulatory submissions). Each imposes distinct compliance frameworks, but all share a common requirement: AI-generated content that informs decisions or enters the record must be verified by a qualified human before use.

The established workflow follows a canonical pipeline: **document intake** (ingestion, format normalization, classification) -> **AI summarization** (model-generated abstract or extractive summary with captured provenance) -> **automated pre-checks** (hallucination detection, completeness scoring, PII scanning, regulatory keyword validation) -> **human compliance review** (first-line review by a qualified analyst, optionally followed by senior sign-off under the **four-eye principle** or **maker-checker** pattern) -> **attestation** (formal sign-off carrying legal weight) -> **distribution** to downstream consumers -> **audit trail completion** (immutable provenance chain from source to approved output). The domain vocabulary is precise: "attestation" is distinct from "approval" (it carries legal and regulatory weight); "hallucination" means factual claims not grounded in the source document; "defensibility" means the review process can withstand judicial or regulatory scrutiny; "model card" documents a model's capabilities, limitations, and validated use cases per SR 11-7 guidance.

Sophisticated incumbent implementations already exist at scale. Goldman Sachs deployed a multi-model AI platform to 10,000+ employees with real-time compliance scanning, PII stripping, and full audit trails. JPMorgan saved 360,000 legal work hours per year through AI document review. FINRA's 2026 Annual Regulatory Oversight Report identifies summarization and information extraction as the top GenAI use case among member firms. In healthcare, Hathr.AI provides HIPAA-compliant summarization. In insurance, Five Sigma's Clive orchestrates multiple AI agents across intake, triage, and compliance. In legal e-discovery, Relativity aiR classifies millions of documents per review project with ISO 27001 and SOC 2 Type II certification.

The regulatory environment is rapidly hardening around human oversight of AI. The EU AI Act (full application August 2026) requires high-risk AI systems to be designed for effective human oversight, with penalties up to EUR 35 million or 7% of worldwide turnover. The Colorado AI Act (effective June 2026) requires disclosures and verification for AI systems affecting consumers. The SEC's 2025 examination priorities explicitly review firms' AI representations for accuracy. FINRA requires supervision of AI tools under Rule 3110. California AB 3030 requires AI-generation disclaimers on healthcare communications unless reviewed by a human provider. The state-level regulatory surge saw 1,208 AI bills introduced across all 50 states in 2025, with 145 enacted. Human-in-the-loop for AI-generated content in regulated industries is no longer a best practice -- it is a legal requirement.

### 3. Entities & Data Model

| Entity | Represents | Owner | Cardinality | Key State Transitions |
|--------|-----------|-------|-------------|----------------------|
| **Source Document** | The original file (contract, filing, record) | Upstream system | 10K-1M+/year at enterprise scale | Immutable once ingested; new versions create new entities |
| **AI Summary** | Model-generated summary of a source document | This system (generated) | 1-5x document count (revisions) | Immutable once generated; revisions create new versions |
| **Review Request** | The work item connecting summary to review process | This system | ~1:1 with summaries | pending_assignment -> assigned -> in_review -> approved / rejected / revision_requested / escalated |
| **Review Decision** | A reviewer's recorded judgment | Reviewer (human or automated) | 1.5-3x review request count | Immutable once recorded; corrections are new decisions |
| **Compliance Rule Set** | Rules governing summary acceptability | Compliance team | Tens to low hundreds | Versioned; immutable per version |
| **Reviewer** | Human qualified to perform reviews | Organization | Tens to low hundreds | Mutable (qualifications, workload, availability) |
| **Audit Record** | Immutable event log entry | This system | 10-50x document count over lifetime | Append-only, never modified or deleted |
| **Downstream Consumer** | System or person consuming approved summaries | External | Low tens to hundreds | Mutable configuration |

**Entity relationships:**

```
Source Document (1) ---< (N) AI Summary (1) ---< (N) Review Request
                                                         |
                                                    (1:N) Review Decision
                                                    (N:M) Compliance Rule Set
                                                    (N:1) Reviewer

AI Summary (approved) ---< (N:M) Downstream Consumer

Audit Record <--- (all entity state changes emit events)
```

**Source Document** is ingested with content hash (SHA-256), MIME type, classification metadata (document type, jurisdiction, regulatory domains, sensitivity level). Content is immutable; classification metadata may be corrected post-ingestion with audit logging.

**AI Summary** captures full provenance: source document reference (by content hash and version), model identifier (e.g. "claude-opus-4-6"), model version/checkpoint, generation parameters (temperature, max tokens, system prompt hash, prompt template version), token counts, generation duration, and cost. Each summary is immutable -- a revision cycle produces a new summary entity linked to its predecessor, forming a version chain.

**Review Request** is the central lifecycle entity and the mutable core. It tracks current status, assigned reviewer(s), applicable compliance rule set IDs, SLA deadline, priority, and revision cycle count. Each state transition is recorded as an immutable audit event.

**Review Decision** captures not just the outcome (approve/reject/request_revision/escalate) but structured rationale: per-rule checklist outcomes, specific passages cited as evidence, free-text explanation, time spent on review, and sections of the source document viewed. Decisions are immutable -- this is a hard invariant. If a reviewer made an error, the correction is a new decision on a new review request.

**Compliance Rule Set** is versioned. Each version contains individual rules, each with a severity (blocking vs. warning), evaluation method (automated-checkable vs. human-judgment-required), and regulatory citation. Rule types include factual fidelity, completeness, prohibited content (PII/PHI leakage), terminology accuracy, formatting, and bias/tone. Summaries remain associated with the rule set version under which they were reviewed, even after newer versions are published.

**Audit Record** is the trust foundation. Each record captures: event ID, timestamp, actor identity, action type, target entity, before-state, after-state, session context, and correlation ID. This entity has the highest cardinality and demands the most storage and indexing attention at scale.

### 4. Core Operations

**Ingest and Classify a Document.** Triggered when a source document arrives via API, webhook, or file upload. The system stores the document with content hash, normalizes format (OCR if scanned), and runs classification (document type, jurisdiction, regulatory domain, sensitivity). Classification drives everything downstream -- the wrong classification routes to the wrong rule set, wrong reviewers, and wrong compliance criteria. Multi-jurisdiction documents (a cross-border financial contract subject to both SEC and FCA rules) must be recognized and handled. Duplicate or near-duplicate submissions are detected by content hash. Duration: seconds for clear text documents, minutes for scanned or ambiguous documents.

**Generate a Summary.** The classified document is routed to the appropriate AI summarization agent based on document type. A contract summarization agent extracts parties, obligations, termination provisions, and risk factors. A clinical summarization agent captures diagnoses and treatment plans while respecting PHI minimization. The prompt template is itself a compliance-sensitive artifact -- a poorly constructed prompt systematically produces summaries that miss material information. Full provenance is captured: model ID, parameters, prompt template version, token counts, timestamps. Duration: seconds to low minutes. The output is an immutable summary artifact.

**Score Summary Quality and Compliance Risk.** Automated checks run against the summary: factual grounding verification (does each claim trace to the source?), completeness scoring (are required elements present for this document type?), PII/PHI detection, regulatory keyword validation, and terminology accuracy. Factual grounding uses NLI-based scoring, potentially with agentic decomposition (context selection, generation, verification, targeted correction). A composite risk score is computed. Summaries below a configurable faithfulness threshold are flagged or automatically regenerated. Duration: seconds to minutes, with NLI-based grounding checks as the slowest component. Output: structured quality report with per-rule pass/fail/warning and a claim-to-source evidence map.

**Route to Appropriate Reviewer(s).** A constrained optimization problem: the reviewer must have jurisdiction expertise, document-type certification, no conflict of interest, and workload below capacity. High-risk summaries or summaries with pre-check flags may require dual review (four-eye principle). Low-risk summaries with clean automated scores may follow an expedited single-review path. The SLA clock starts at assignment. Duration: near-instantaneous for the routing logic. The waiting-for-reviewer phase is the long pole -- hours to days. Escalation rules activate when no qualified reviewer is available within a threshold window.

**Present Review Workspace and Record Decision.** The reviewer sees a side-by-side view: source document on the left, AI summary on the right, with automated findings highlighted and a compliance checklist pre-populated from the applicable rule set. Flagged passages link to conflicting source text. The reviewer can annotate, link summary claims to source evidence, reclassify risk levels, and escalate. Their decision (approve, approve-with-annotations, request-revision, reject, escalate) must include structured rationale -- a bare "rejected" is insufficient for compliance purposes. The system prevents incomplete decisions (mandatory checklist items must be evaluated). Duration: minutes to hours for the human deliberation. The recording itself is instantaneous. A key non-trivial aspect: the system must verify temporal consistency -- the source document must not have changed since summary generation, and the rule set must not have been updated mid-review.

**Handle Revision Cycles.** When a reviewer requests revision, structured feedback (which criteria failed, what needs to change, regulatory references) is routed to the AI agent for regeneration or to a human editor. The new summary re-enters the pipeline at automated pre-checks and returns for re-review. The system must detect and prevent infinite loops -- a maximum revision count triggers escalation. The re-review must verify that flagged issues are fixed *and* that no new issues were introduced. This is the regression testing problem. Duration: minutes for AI regeneration, hours for human editing. The full cycle (regenerate + re-review) spans hours to days.

**Approve and Distribute.** The approved summary is stamped with reviewer identity, timestamp, source document content hash, model version, all pre-check scores, and a compliance certificate. Distribution respects access controls -- not all consumers see all document types. Temporal constraints may apply (a quarterly filing summary cannot be distributed before the filing is public). The system must support recall/retraction: if a previously approved summary is later found deficient, all consumers who received it must be notified. This requires maintaining a distribution ledger. Duration: seconds for distribution mechanics.

**Audit and Report.** Aggregation and analysis of the immutable audit trail: review throughput, SLA compliance rate, rejection rate by document type, reviewer utilization, average revision cycles, model performance. Reports must be reproducible from underlying audit records. HIPAA mandates 6 years of PHI-related audit retention; SOX requires 7 years. The system must support both real-time operational dashboards and retrospective compliance reports for regulatory examination. Duration: seconds for pre-computed dashboards, minutes for ad-hoc queries over large datasets.

### 5. System Boundaries

**Inbound -- what calls or triggers this system:**

| Caller | Interface | Volume | Expectations |
|--------|-----------|--------|--------------|
| Document management systems (SharePoint, Box, OpenText) | Webhook or polling integration | 100-10,000 documents/day | Acknowledgment within seconds; classification within minutes |
| AI agent platform (internal or external) | API push with summary + provenance metadata | 1:1 with document volume | Acceptance confirmation; queue position |
| Client portals / intake systems | REST API or file upload | Tens to hundreds/day | Tracking ID, estimated review timeline |
| Scheduled review triggers | Internal cron / scheduler | Periodic (monthly/quarterly) | Bulk re-review initiation |
| Regulatory deadline signals | Event or API from compliance calendar | Infrequent, high-urgency | Immediate escalation of affected reviews |

**Outbound -- what this system depends on:**

| Dependency | Interface | Reliability Profile | Failure Modes |
|------------|-----------|---------------------|---------------|
| LLM APIs (OpenAI, Anthropic, internal models) | REST API, typically 100-500ms latency per request | 99.9% uptime SLA from major providers; rate limits (TPM/RPM) | 429 rate limits, 5xx server errors, model behavior changes on version upgrade, context length exceeded |
| NLI / hallucination detection models | REST API or local inference | Varies; internal models more reliable than external | Latency spikes, false positive/negative rate drift |
| Object storage (S3, Azure Blob, GCS) | SDK / REST | 99.99%+ availability | Rare; regional outages, throttling under extreme load |
| Identity provider (SSO/SAML/OIDC) | Standard auth protocols | 99.9%+ | Auth failures block reviewer access; token expiry mid-review |
| Notification services (email, Slack, Teams) | API | Best-effort delivery | Missed notifications delay reviewer pickup; not blocking |
| Regulatory reference databases (Regology, CUBE) | REST API or data feed | Varies by provider | Stale regulatory data if feed is delayed |

**Trust boundaries:**
- **Separation of duties**: The AI agent (generator) and the human reviewer (attestor) must be independent. System administrators cannot perform reviews. Reviewers cannot modify rule sets.
- **Reviewer qualification enforcement**: Reviewers can only be assigned documents within their credentialed scope (jurisdiction, document type, certification level). Enforced at both assignment time and decision-recording time.
- **Multi-tenant isolation**: Different business units or clients have complete data isolation -- documents, summaries, reviewers, audit trails, and compliance rule sets are scoped to a tenant. Jurisdictional data residency requirements may mandate geographic isolation of storage and processing.
- **Sensitive data handling**: Source documents and their summaries inherit the sensitivity classification of the source. AI summaries of medical records are themselves PHI. Audit records containing metadata about who accessed what are themselves sensitive. PII must be scanned before summaries reach downstream consumers.

### 6. What Goes Wrong

**Common and expected failures (handled gracefully):**
- AI hallucination in summaries (0.7-27% rate depending on model and task). This is the primary failure mode and the reason the system exists. Automated faithfulness scoring catches many; human reviewers catch the rest. The system's value is measured by its catch rate.
- Omission of material facts. More insidious than hallucination because the absence of information is harder to detect. Completeness checklists per document type are the primary defense.
- PII/PHI leakage in summaries. Automated scanning catches most instances, but edge cases (uncommon identifier formats, context-dependent sensitivity) require human judgment.
- Reviewer unavailability causing SLA pressure. Escalation rules, automatic reassignment, and workload balancing mitigate but do not eliminate.
- AI model latency spikes or rate limiting. Retry with backoff; fallback to alternative models or manual summarization for SLA-critical documents.

**Rare but catastrophic failures (prevented or recovered from):**
- An inaccurate summary reaches a client or regulator after passing review. The cost ranges from court sanctions ($3K-$31K for fabricated legal citations) to SEC penalties ($35K-$60K per incident with potential 2-3% stock price drop) to FDA submission rejection (restarting a 10-month review clock on a $30-150M trial). The system must capture enough review metadata (duration, sections viewed, annotations) to demonstrate reviews were substantive, not rubber-stamps.
- Audit trail corruption or gaps. If the system cannot prove the review chain is complete, every approval during the affected period is suspect. This requires retroactive re-review -- potentially the most expensive failure mode.
- Model drift: summary quality degrades over time without any code change, because the model provider updated weights or the document population shifted. Continuous monitoring of hallucination rates and reviewer override rates is the detection mechanism.
- Prompt injection via source documents: adversarial content in a source document causes the summarizer to produce manipulated output (e.g., omitting unfavorable terms). Automated grounding checks partially mitigate; reviewer awareness is the remaining defense.

**Partial completion and inconsistency risks:**
- A summary is approved under rule set v1, but v2 (with stricter requirements) has since been published. The approved summary is compliant per v1 but would fail under v2. The system must track which rule set version governed each review and support scheduled re-review when rules change.
- A batch of 200 documents is partially complete: 180 approved, 15 in revision, 5 rejected. The downstream consumer needs all 200. The system must support partial release with clear status reporting, and the consumer must handle incomplete batches.
- A reviewer approves a summary, then the source document is discovered to have been a superseded version. The approval is technically valid (the summary accurately represents the source) but practically useless (the source was wrong). The system must support recall/retraction with consumer notification.

**Critical invariants:**
1. **No unapproved distribution.** A summary never reaches downstream consumers without a completed, approved review. No bypass mode, no emergency override that skips review.
2. **Review decision immutability.** Once recorded, a decision cannot be modified or deleted. Corrections are new decisions.
3. **Audit trail completeness and tamper-evidence.** Every state transition recorded. The trail must be independently verifiable, ideally through cryptographic chaining or write-once storage.
4. **Provenance completeness.** Every approved summary must have a full chain: source document (by content hash), model, prompt template, generation parameters, rule set version, reviewer, decision with rationale.
5. **Reviewer qualification enforcement.** Enforced at assignment and decision-recording time. A reviewer cannot approve a document type they are not certified for.
6. **Version consistency.** The summary, source document, and rule set must be version-consistent throughout the review. Changes to any element invalidate the in-progress review.

### 7. Scaling & Constraints

**Volume projections:**
- MVP: 50-100 summaries/day, single document type, single jurisdiction.
- Growth: 200-500/day at 6 months as new document types onboard.
- Mature: 1,000+/day across multiple document types, jurisdictions, and compliance frameworks.
- Burst: 3-10x normal volume at month-end, quarter-end, and year-end close cycles. Insurance catastrophe events can spike claims volume 50-100x.

**Business SLAs and their sources:**

| SLA | Window | Source |
|-----|--------|--------|
| Summary generation | < 5 minutes standard, < 30 minutes for large documents | Internal engineering target |
| Standard compliance review | 4 business hours (low risk), 8 business hours (medium risk) | Internal policy; client delivery SLAs |
| High-risk / expedited review | 2 business hours | Regulatory filing deadlines; client escalation agreements |
| Regulatory filing support | Varies: SEC 10-K = 60 days after fiscal year end; HIPAA breach notification = 60 days | Federal statute |
| Audit trail availability | Real-time logging; never degraded | SOX, HIPAA, EU AI Act |
| Post-approval distribution | 15 minutes after approval | Downstream system SLAs |
| System availability | 99.9% standard; 99.99% during critical close periods | Business continuity requirements |

**Compliance and regulatory requirements:**
- SOX: 7-year retention for financial audit records. Management certification of financial report accuracy.
- HIPAA: 6-year retention for PHI compliance documentation. Minimum necessary standard for summary content. Business Associate Agreements with AI vendors.
- EU AI Act: Human oversight for high-risk AI systems. Technical documentation. Conformity assessment. Fines up to EUR 35M or 7% turnover.
- FINRA Rule 3110: Supervision of AI tools. Recordkeeping for AI-enabled communications.
- SR 11-7: Model risk management. Model inventory, independent validation, ongoing performance monitoring.
- State-level: Colorado AI Act (June 2026), Texas TRAIGA (Jan 2026), California AB 3030 (2025).

**Natural partitioning boundaries:**
- By document type (different rule sets, reviewers, SLAs -- can be separate workflow pipelines)
- By jurisdiction (different data residency, different regulatory requirements)
- By tenant (business unit or client isolation)
- By risk tier (expedited vs. thorough review paths)

**Structural bottleneck:** Human review. Every other step parallelizes and scales horizontally. Human review capacity is constrained by reviewer count, hours per day, time per review (5-60 minutes), and quality degradation from fatigue. The system's scaling strategy must reduce human review load through better automated scoring and tiered review policies rather than bypassing review.

### 8. Human Touchpoints

| Role | When | What They See | What They Decide | SLA | If They Don't Act |
|------|------|---------------|-----------------|-----|-------------------|
| **Compliance Reviewer** | Every summary passes through | Split-pane: source + summary with automated flags, compliance checklist, risk score | Approve, approve-with-annotations, request revision, reject, escalate | 4-8 business hours (standard), 2 hours (expedited) | Auto-reassignment at 90% SLA elapsed; escalation notification |
| **Senior Reviewer** | Escalations, high-risk documents, contested decisions | Same as reviewer plus junior reviewer's notes and escalation reason | Final approval authority; risk classification override | 2-4 business hours | Further escalation to compliance team lead |
| **Subject Matter Expert** | Domain expertise needed (specialized financial instruments, rare medical conditions, jurisdiction-specific rules) | Flagged section, reviewer's question, relevant source passages | Expert opinion on specific question (does not approve/reject) | 4-8 business hours | Review proceeds with reviewer's best judgment + annotation noting SME was unavailable |
| **Legal Counsel** | Legal risk flagged (ambiguous liability, privilege issues, regulatory exposure) | Flagged section, reviewer's concern, legal context | Legal interpretation, disclaimer recommendations, content exclusion | 24-48 business hours | Review pauses; escalation to general counsel |
| **Compliance Team Lead** | SLA breaches, capacity issues, systemic patterns | Dashboard: queue depth, SLA rates, reviewer throughput, rejection trends | Staffing, routing rule adjustments, training, systemic escalation | Continuous monitoring | Degraded SLA performance across the board |
| **Auditor** | Periodic audit, regulatory examination prep, incident investigation | Complete audit trail for selected reviews -- every transition, decision, annotation | Verifies process was followed; identifies gaps; produces regulatory reports | Per audit schedule (quarterly/annually) | Audit findings cite missing controls |
| **Human Editor** | AI cannot produce acceptable summary after revision cap | Source document, failed AI attempts, reviewer feedback | Writes or rewrites the summary manually (still enters review pipeline) | Inherits parent SLA minus elapsed time | Document flagged as requiring manual intervention; submitter notified of extended timeline |

### 9. Scope Ladder

| Dimension | MVP | +1 (6 months) | Mature (18-24 months) |
|-----------|-----|---------------|----------------------|
| **Document types** | 1 (financial reports or contracts) | 3-5 types | Unlimited, configurable per tenant |
| **Jurisdictions** | 1 (US) | 2-3 (US + EU) | Multi-jurisdiction with rule engine and data residency |
| **Volume** | 50-100 summaries/day | 200-500/day | 1,000+/day with burst handling |
| **Reviewer assignment** | Manual by admin | Rule-based routing with qualification matching | ML-optimized matching with workload balancing and fatigue detection |
| **AI models** | 1 model | 2-3 models with confidence scoring | Multi-model with automatic fallback and A/B testing |
| **Automated pre-checks** | Basic faithfulness score + PII scan | Completeness checklists per document type, regulatory keyword validation | Agentic verification (decomposed grounding), cross-document consistency |
| **Audit trail** | Who/what/when/decision | Enhanced: review duration, sections viewed, annotation detail | Full provenance chain with cryptographic chaining and regulatory export formats |
| **Integrations** | API/file upload in, file download out | DMS integration (SharePoint/Box), basic delivery webhooks | Full upstream/downstream integration: DMS, filing systems, knowledge bases, GRC platforms |
| **Dashboards** | Query audit trail manually | Basic queue and SLA metrics | Real-time compliance dashboards with anomaly detection and model drift monitoring |
| **Compliance frameworks** | 1 (SEC or HIPAA) | 2-3 frameworks | EU AI Act, SEC, HIPAA, SOX, FINRA, state-level, configurable |
| **Revision handling** | AI regeneration with manual feedback | Structured revision instructions with categorized deficiency types | ML-assisted revision guidance, automatic deficiency classification, reviewer coaching analytics |
| **Recall/retraction** | Manual notification | Automated consumer notification | Distribution ledger with automated retraction and replacement delivery |

### 10. Open Questions

1. **Primary document type for MVP.** Financial reports (SEC 10-K/10-Q summaries) or contracts (due diligence, M&A)? The choice determines the first compliance rule set, reviewer qualifications, and SLA profile. Financial reports have harder regulatory deadlines; contracts have higher volume and more varied structure.

2. **Single-reviewer vs. dual-reviewer for MVP.** The four-eye principle (two independent reviewers) is standard in banking but adds reviewer capacity cost. Can MVP launch with single-reviewer approval for low-risk summaries while requiring dual review only for high-risk? What risk threshold triggers dual review?

3. **Auto-approval threshold.** At what automated quality score (faithfulness + completeness + PII-clean) can a summary be auto-approved without human review? Or is human review mandatory for every summary regardless of score? This is a risk appetite decision that shapes the system's throughput ceiling. EU AI Act Article 14 requires "effective human oversight" but does not prescribe 100% manual review.

4. **Revision cap and escalation path.** How many AI regeneration attempts before escalating to manual summarization? Two? Three? Each revision cycle burns reviewer time and delays delivery. The cap balances thoroughness against throughput.

5. **Summary recall policy.** If a previously approved summary is later found inaccurate, must it be actively retracted from all consumers, or is a corrected replacement sufficient? Active retraction is operationally expensive but may be required in regulated contexts (SEC material misstatement, HIPAA breach).

6. **Reviewer identity visibility.** Should document submitters see who reviewed their summary? In some compliance regimes, reviewer anonymity prevents social pressure on review outcomes. In others, named attestation is the regulatory requirement.

7. **Model provider change management.** When an AI model provider updates weights (e.g., GPT-4o -> GPT-4o-2025-06), does the system treat this as a new model requiring re-validation, or does it accept provider-guaranteed backward compatibility? SR 11-7 model risk management guidance would suggest formal re-validation.

8. **Cross-document consistency scope.** When two summaries reference the same entity (e.g., two different contracts with the same counterparty), should the system detect and flag contradictions between them? This is powerful but dramatically increases system complexity and the definition of "consistent" is itself a compliance question.

9. **Data residency for multi-jurisdiction operation.** If EU documents must be stored and processed in the EU (GDPR), does the system require regional deployments, or can it operate with a single deployment that routes data to regional storage? This shapes the infrastructure architecture fundamentally.

10. **Reviewer fatigue monitoring.** Should the system cap continuous review hours and flag potential quality degradation? Research suggests review quality drops after 4-6 hours of continuous document review. Implementing this creates a hard capacity ceiling; not implementing it creates a quality risk. Who decides the threshold -- the compliance team or the business?
