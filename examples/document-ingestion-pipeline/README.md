# Fault-Tolerant Document Ingestion Pipeline

## 1. System Identity

A document ingestion pipeline receives unstructured documents — PDFs, scanned images, Office files, faxes, email attachments — from heterogeneous sources, transforms them into structured, classified, validated data, and delivers that data to downstream business systems. It serves any document-heavy industry: insurance claims processing, mortgage origination, healthcare records management, legal discovery, and accounts payable. The problem is non-trivial because the input space is combinatorially vast (thousands of document formats, quality levels, and layouts), the processing depends on expensive and rate-limited external OCR services, the pipeline must pause for human judgment at confidence boundaries, and the regulatory environment demands zero-loss guarantees with multi-year audit trails. From a systems perspective, the interesting challenge is building a stateful, multi-stage pipeline that absorbs the failure characteristics of every external dependency it touches while never silently dropping a document — because regulatory and financial clocks start ticking at receipt regardless of whether processing has finished.

## 2. Domain Context

This system sits in the **Intelligent Document Processing (IDP)** market. Sophisticated incumbents include Tungsten Automation (formerly Kofax) TotalAgility with 25,000+ customers, ABBYY Vantage with 190+ language support, Hyperscience serving the US Social Security Administration at millions-of-forms-per-day scale, and the cloud provider building blocks: AWS Textract, Google Document AI (Layout Parser v1.6 Pro, Gemini-powered), and Azure AI Document Intelligence. A mature enterprise deployment processes 50,000–500,000 documents per day for a large insurance carrier, with mortgage lenders handling millions of pages daily across 100+ document types per loan file.

The canonical processing stages follow an established convention: **ingestion → pre-processing → classification → extraction → validation → enrichment → indexing → archival**. Each stage has domain-specific vocabulary. OCR (Optical Character Recognition) handles machine-printed text; ICR (Intelligent Character Recognition) handles handwriting; OMR (Optical Mark Recognition) handles checkboxes. Classification assigns a document to a type taxonomy. Extraction pulls key-value pairs, tables, and named entities. Validation cross-checks extracted data against business rules and reference databases. The industry measures extraction quality via CER (Character Error Rate) and WER (Word Error Rate), and table extraction quality via TEDS (Tree Edit Distance Score). The critical operational metric is **STP rate** (Straight-Through Processing) — the percentage of documents that complete the full pipeline without human intervention. Industry average with legacy systems is 7%; modern IDP achieves 60–85%.

The confidence-based routing convention is standardized: fields scoring >= 0.95 confidence auto-accept for straight-through processing, 0.80–0.94 route to HITL (Human-in-the-Loop) review, and < 0.80 escalate to specialist review or rejection. This funnel determines the system's throughput economics: every percentage point of STP improvement reduces human review costs linearly.

The regulatory landscape is vertically specific but universally demanding. HIPAA governs healthcare documents with 6-year retention for PHI audit logs and per-violation penalties of $145–$2.19M. PCI DSS prohibits storage of raw cardholder data post-authorization. GDPR mandates right-to-erasure across all copies including backups, training data, and search indices — which directly conflicts with SOX 7-year retention for financial records and legal hold obligations that freeze deletion indefinitely. FedRAMP authorization (12–18 month timeline) is required for government document processing. Chain-of-custody requirements for legal discovery demand SHA-256 hash preservation at every transformation boundary. These constraints are not features to add later; they are structural forces that shape every entity and operation from the start.

## 3. Entities & Data Model

### Entity Graph

| Entity | Represents | Owner | Cardinality | Lifespan |
|--------|-----------|-------|-------------|----------|
| **Document** | A single logical document (one invoice, one claim form) | The system (on behalf of the tenant/submitter) | Tens of millions to low billions | Years to decades (retention-governed) |
| **Page** | A single physical page within a document | Child of Document | 3–5x Document count (median 3–5 pages/doc) | Same as parent Document |
| **Submission** | The event of a document arriving (channel, timestamp, submitter) | Immutable record | Matches or exceeds Document count | Same as parent Document |
| **Batch** | Grouping of Submissions (SFTP drop, bulk import) | Operations team | Medium (hundreds/day) | Processing duration + audit retention |
| **Document Type Schema** | Definition of a document type (fields, validation rules, extraction template) | System administrators | Low (tens to hundreds) | Long-lived, versioned |
| **Classification Result** | Links Document to Document Type Schema with confidence | System (overridable by reviewer) | 1+ per Document (versioned) | Same as parent Document |
| **Extraction Result** | Structured data extracted from a Document | System (correctable by reviewer) | 1+ per Document (versioned) | Same as parent Document |
| **Field** | A single extracted datum (name, value, confidence, bounding box) | Child of Extraction Result | 20–50 per invoice, hundreds per mortgage packet | Same as parent Extraction Result |
| **Validation Result** | Outcome of business rule evaluation | System | 1 per Extraction Result | Same as parent Extraction Result |
| **Review Task** | A human review assignment (what failed, which queue, priority) | Assigned reviewer | 5–30% of Document count | Transactional (hours to days) |
| **Reviewer Action** | Immutable record of what a reviewer did (corrected, approved, rejected) | The reviewer | Multiple per Review Task | Permanent (audit trail) |
| **Audit Event** | Every state transition, access, and action | System (append-only) | Highest — dozens per Document | 6–10 years (compliance-governed) |
| **Retention Policy** | Rules for document lifecycle (retain duration, purge rules, hold overrides) | Compliance team | Low (one per Document Type Schema) | Long-lived, versioned |

### Relationships

```
Batch 1──* Submission 1──* Document 1──* Page
                                    1──* Classification Result *──1 Document Type Schema
                                    1──* Extraction Result 1──* Field
                                    1──* Validation Result
                                    1──* Review Task 1──* Reviewer Action
                                    1──* Audit Event
Document Type Schema 1──1 Retention Policy
```

### Mutability Profile

The source document bytes are immutable once stored — the original is preserved alongside all derivatives. Processing results (Classification, Extraction, Validation) are immutable per version; corrections produce new versions, never in-place mutations. Review Tasks are mutable (assigned, in-progress, completed, escalated). Audit Events are append-only, never modified or deleted. This dual nature — immutable content with mutable lifecycle state — is a defining structural characteristic.

### Key State Transitions

A Document moves through: `received` → `scanning` → `normalizing` → `extracting_text` → `classifying` → `extracting_fields` → `validating` → `deduplicating` → `routing` → `delivered` → `completed`. At any stage, it may divert to a `awaiting_*_review` state (awaiting OCR review, classification review, extraction review, validation review, dedup decision, or approval). Terminal states are `completed`, `completed_with_exceptions`, and `failed`. A `failed_retrying` state indicates automatic retry is pending.

## 4. Core Operations

### Ingest

Accepts documents from any source channel — API upload, email attachment, SFTP drop, S3 event, scanner, webhook. Assigns a globally unique ingestion ID, persists the raw bytes to immutable object storage, creates the Document record, and acknowledges the submitter. **Duration:** sub-second for the acknowledgment; the file transfer itself may take seconds to minutes for large documents over slow channels. **What makes it non-trivial:** Must be idempotent — the same document arriving twice (email retry, SFTP re-drop, network timeout causing re-upload) must not create duplicates. Must validate the submission envelope (permissions, size limits, required metadata) before accepting. Must handle wildly varying inputs: a 2KB single-page fax and a 500MB multi-hundred-page scanned PDF enter through the same gate.

### Scan (Malware)

Runs antivirus inspection on the raw file before any content processing. Infected files are tombstoned in quarantine and never reach the content pipeline. **Duration:** seconds. **What makes it non-trivial:** Must execute before any downstream parser touches the file bytes, because malformed documents can exploit PDF/image parsing vulnerabilities. Adds a synchronous dependency in an otherwise asynchronous pipeline. Scanner signature databases require daily updates.

### Normalize

Converts the source document into a canonical internal representation. Office files render to PDF. Multi-page TIFFs split into individual page images. PDFs with embedded text are flagged to skip OCR. Email `.eml`/`.msg` files decompose into body + attachments, each attachment entering the pipeline as a linked sub-document. **Duration:** seconds to minutes depending on format complexity. **What makes it non-trivial:** The format zoo is vast — password-protected PDFs, Office files with macros, exotic image codecs (JPEG 2000, TIFF with unusual compression), proprietary formats. Each edge case needs graceful degradation: process what can be processed, flag what cannot, never silently drop content.

### OCR / Text Extraction

The throughput bottleneck and cost center. For image-only pages: cloud OCR (AWS Textract `StartDocumentAnalysis`, Google Document AI, Azure Form Recognizer) produces structured text with bounding-box coordinates, per-word confidence scores, and detected tables/key-value pairs. For pages with embedded text: direct extraction from the PDF text layer. **Duration:** ~2.5 seconds per page async via Textract; a 50-page document takes 2–4 minutes. **What makes it non-trivial:** Cloud OCR services impose rate limits (Textract default: low single-digit TPS for async start calls, throttles with `ProvisionedThroughputExceededException`). Async APIs require polling or SNS callback patterns — jobs can silently fail, requiring timeout detection. Accuracy degrades on faded faxes, skewed scans, and handwriting. Cost scales linearly with page count (~$1.50 per 1,000 pages basic, dropping to ~$0.60 at scale). Silent misreads ("0" vs "O", "1" vs "l", "rn" vs "m") are the worst failures because they pass confidence thresholds.

### Classify

Determines document type from the organization's taxonomy (Explanation of Benefits, W-2, Bank Statement, Deed of Trust, Invoice, etc.) using extracted text, layout features, and submission metadata. Produces a type label and confidence score. **Duration:** milliseconds to seconds (ML inference). **What makes it non-trivial:** The taxonomy is customer-specific and evolves — new document types appear without warning. Classification accuracy determines which extraction model runs downstream, so a misclassification cascades into garbage extraction. Multi-document packets (a single PDF containing both an invoice and a remittance advice) require splitting before classification. Confidence thresholds must be tunable: too low and every document needs human review; too high and errors slip through silently.

### Extract

Applies a type-specific extraction model to pull structured fields from the classified document. From an invoice: vendor name, invoice number, line items, total, due date. From an EOB: patient name, provider, procedure codes, allowed amounts. From a bank statement: account number, period, balance, transactions. Each field carries a confidence score and source coordinates. **Duration:** milliseconds to seconds for rule-based/ML extraction; 5–30 seconds for LLM-based extraction. **What makes it non-trivial:** Field locations vary across document variants — every insurance company's EOB looks different. Table extraction is notoriously difficult (merged cells, spanning headers, implicit row groupings). Some fields require cross-page reasoning (a total on page 5 references line items on pages 2–4).

### Validate

Evaluates extracted data against business rules and external reference data. Required-field presence, format conformance (dates, currency, SSN patterns), cross-field consistency (line items sum to total), cross-document consistency (claim amount matches policy limit), and external lookups (verify provider NPI against CMS registry, check policy number against policy admin system). **Duration:** milliseconds for rule evaluation; seconds if external lookups are required. **What makes it non-trivial:** Validation rules are domain-specific and change frequently. False positives create unnecessary human review overhead. Some validations require calls to slow or unreliable external systems.

### Deduplicate

Detects exact and near-duplicate documents. Exact duplication uses content hashing (SHA-256 of normalized text). Near-duplication uses MinHash/LSH signatures to find documents with high Jaccard similarity — the same document re-scanned at different resolutions is semantically identical but bytewise different. **Duration:** milliseconds for hash lookup; seconds for LSH comparison. **What makes it non-trivial:** A legitimate business scenario exists for the same document appearing in multiple contexts (a bank statement in multiple loan files), so deduplication must be context-aware, not just content-aware. Near-duplicate resolution often requires human judgment.

### Review (Human-in-the-Loop)

A human examines a document that failed automated processing at sufficient confidence. Reviewers correct field values, override classifications, approve or reject documents. The review UI presents the document image alongside extracted data with inline correction capability. **Duration:** minutes to hours (depends on reviewer workload and complexity). **What makes it non-trivial:** This is where the pipeline becomes a workflow with human wait-times. Task assignment must balance workload, skill matching (a medical coding specialist vs. a general data entry clerk), and SLA pressure. Reviewer corrections should feed back into extraction models via active learning. Timeout and escalation handling is required for tasks that sit too long.

### Route

Directs the processed document to its downstream destination: a claims adjuster's work queue, an underwriter's loan file, an AP clerk's three-way-match queue, a legal review platform, or directly into a system of record via API. **Duration:** milliseconds. **What makes it non-trivial:** Routing rules encode complex business logic — documents over $10K need manager review; documents from new providers always route to manual review for the first 30 days. Must account for downstream system availability; if the target is down, the document queues for delivery with retry.

### Purge

Permanently and irrecoverably deletes document content and all derived artifacts when retention periods expire. **Duration:** seconds to minutes. **What makes it non-trivial:** Must be cryptographically certain — not just database deletion but storage overwrite or encryption key destruction. Must respect legal holds (which override all retention policies). Must cascade correctly: purging a document purges pages, extraction results, and all derivatives, but audit events may need to survive for compliance. GDPR right-to-erasure adds urgency and conflicts directly with SOX retention mandates.

### Re-process

Re-runs part or all of the pipeline against an existing document (improved model, initial failure recovery, schema change). Produces new result versions without destroying previous ones. **Duration:** same as initial processing. **What makes it non-trivial:** Must handle the case where re-processing produces a different classification. Must be triggerable in bulk (re-process all documents of type X with model version Y). Must be resumable — a bulk re-processing job that fails at document 50,000 of 100,000 should not restart from zero.

## 5. System Boundaries

### Inbound — What Calls or Triggers This System

| Caller | Interface | Volume | Expectations |
|--------|-----------|--------|--------------|
| Customer portal / web upload | REST API (multipart file upload) | 100s–10,000s/day per tenant | Synchronous acknowledgment < 2s; status tracking via polling or webhook |
| Email with attachments | IMAP polling or Microsoft Graph API / Gmail API | 100s–1,000s/day | Confirmation reply or portal-visible receipt; async processing |
| Scanner / MFP integration | SFTP drop or direct API | Batch bursts (50–500 pages per scan session) | Batch receipt on MFP panel; walk-away confidence |
| SFTP drop folder | SFTP server monitoring | 100s–10,000s files per drop (nightly batch, partner feeds) | Manifest acknowledgment file in response directory |
| S3 bucket event | S3 Event Notification → SQS/SNS | Variable; burst on upstream ETL completion | Callback webhook or status API poll on completion |
| Upstream application API | REST/gRPC | 1,000s–100,000s/day | HTTP 202 with job ID; poll or subscribe for status |
| Bulk import (migration) | ZIP/CSV manifest via API or admin UI | 10,000s–1,000,000s per job | Batch progress dashboard; hours-to-days completion |

### Outbound — What This System Depends On

| Dependency | Interface | Reliability Profile | Failure Modes |
|------------|-----------|---------------------|---------------|
| AWS Textract (OCR) | `StartDocumentAnalysis` / `GetDocumentAnalysis` async; SNS notification to SQS | 99.9% SLA; regional outages 2–4x/year | `ProvisionedThroughputExceededException` (throttling); 500 internal errors; silent async job failure (timeout detection required); document too large (>500MB async, >10MB sync) |
| ClamAV (malware scan) | TCP socket to clamd port 3310, `INSTREAM` command | Self-hosted; reliability = deployment quality | Connection refused (daemon down); timeout on large files; OOM; false positives on Office macros |
| AWS S3 (object storage) | PutObject/GetObject; Event Notifications; Lifecycle Policies | 99.99% availability, 11-nines durability | 503 SlowDown (rate limit at 3,500 PUT/s per prefix); cross-region replication lag (rare) |
| PostgreSQL / Aurora (metadata) | SQL over TCP:5432 via connection pool | Aurora Multi-AZ 99.99%; failover < 30s | Connection exhaustion; deadlocks; replication lag; storage full |
| Elasticsearch / OpenSearch (search index) | Bulk API for indexing; Search API for queries | Managed service 99.9% | 429 bulk queue full; mapping conflicts; split-brain (rare) |
| Downstream business systems (Guidewire, Encompass, Epic, SAP, etc.) | REST, SOAP, SFTP, EDI — varies per system | Often the least reliable dependency; maintenance windows, limited throughput | Timeouts; schema mismatches; auth failures; system-specific validation rejections |

### Trust Boundaries

**External callers:** API key or OAuth 2.0 client credentials, scoped to tenant and permission set (submit-only, read-only, admin).

**Human reviewers:** SSO/OIDC authentication with RBAC (Reviewer, Senior Reviewer, Queue Manager, Administrator). Reviewers see only documents routed to their assigned queues. Sensitive fields (SSN, DOB) masked based on role.

**Multi-tenant isolation:** Tenant ID is a mandatory, non-nullable foreign key on every entity. Row-level security at the database layer (not just application). Tenant-scoped S3 prefixes or separate buckets with IAM enforcement. Per-tenant encryption keys (KMS customer-managed) so that even a storage-layer breach of one tenant cannot decrypt another's data. Processing queues logically separated so one tenant's bulk import cannot starve another's real-time processing.

**Sensitive data:** Original document files and extracted field values (especially SSN, DOB, financial account numbers) encrypted at rest with AES-256 and tenant-scoped keys. Audit logs are append-only, tamper-evident, and separately access-controlled.

## 6. What Goes Wrong

### Common and Expected (Handle Gracefully)

- **Low-quality scans** — faded ink, skewed pages, cellphone photos of crumpled receipts. OCR confidence drops below threshold. System flags for human review with "please re-scan at 300 DPI" guidance. This is the bread-and-butter failure mode; expect 10–30% of documents to trigger it in early deployment.
- **Cloud OCR throttling** — `ProvisionedThroughputExceededException` during volume spikes. Exponential backoff with jitter, queue-based smoothing. Documents slow down but never drop.
- **Classification ambiguity** — a medical bill that looks like an invoice. Routes to classification review queue. Multiple correct answers exist; the human provides ground truth.
- **Extraction schema mismatch** — a vendor updates their invoice template. The trained model extracts from wrong regions. Produces low-confidence fields that route to review, eventually triggering model retraining.
- **Downstream system temporarily unavailable** — maintenance windows, network blips. Processed documents queue for delivery with retry. No data loss; delivery delayed.
- **Duplicate submission** — same document via email and portal. Content hash detects exact duplicate; links to existing record.
- **Password-protected PDFs** — detected at file validation; rejected with actionable user message.

### Rare but Catastrophic (Prevent or Recover)

- **Storage write failure** — S3 write fails during ingestion. The document was acknowledged but not persisted. This is the cardinal sin: data loss at the gate. Prevention: never acknowledge receipt until bytes are durably stored.
- **Silent OCR misreads** — "0" read as "O", "rn" as "m". These pass confidence thresholds and propagate into extraction results. An invoice for $10,000 becomes $1O,OOO. Prevention: type-specific post-extraction validation (numeric fields must contain only digits); cross-reference checks against known values.
- **Tenant isolation breach** — a bug in query scoping exposes one tenant's documents to another. Prevention: row-level security at the database layer as defense-in-depth against application bugs; per-tenant encryption keys as cryptographic isolation.
- **Audit trail gap** — a state transition occurs but the audit event fails to write. Prevention: audit writes are transactional with the state change (same database transaction); if the audit write fails, the state change rolls back.
- **Retention policy violation** — a document is purged before its retention period expires, or retained past a GDPR erasure request. Prevention: legal hold flags checked at purge time (hold always wins); GDPR erasure requests tracked with specific reconciliation against retention obligations.

### Partial Completion Creates Inconsistency

- A document is OCR'd and classified but extraction fails mid-way. The document exists in the system as "classified but not extracted." Downstream consumers must handle this partial state — they cannot assume that a classified document has extraction results.
- A document is fully processed and delivered to one downstream system but delivery to a second fails. The document is simultaneously "delivered" from one consumer's perspective and "pending" from another's. Each delivery must be tracked independently.
- A bulk re-processing job updates some documents to new extraction results while others still carry old versions. Consumers querying across documents may see a mix of old and new schemas.

### Critical Invariants

1. **A document acknowledged as received must be retrievable.** If the system says it has the document, the bytes exist in durable storage.
2. **Extraction results are immutable per version.** Once written, a version is never modified. Corrections produce new versions.
3. **The audit trail has no gaps.** Every state transition is recorded atomically with the transition itself.
4. **Tenant data is cryptographically isolated.** No application-layer bug can expose one tenant's document content to another.
5. **Legal hold overrides all deletion.** No automated or manual purge can delete a document under legal hold.

## 7. Scaling & Constraints

### Volume Projections

| Scale | Documents/Day | Pages/Day | Storage Growth | OCR Cost |
|-------|--------------|-----------|----------------|----------|
| Startup / single business unit | 1,000–5,000 | 5,000–25,000 | ~500 MB/day | ~$10/day |
| Mid-size operation | 10,000–50,000 | 50,000–250,000 | ~5 GB/day | ~$100/day |
| Large enterprise | 100,000–500,000 | 500,000–2.5M | ~50 GB/day | ~$1,000/day |
| Platform (multi-tenant) | 1M+ | 5M+ | ~500 GB/day | ~$5,000+/day |

Storage compounds: with 7-year retention and 50 GB/day growth, the system holds ~125 TB after 7 years for a large enterprise. Multi-year retention means storage grows monotonically.

### Business SLAs

| SLA | Window | Source |
|-----|--------|--------|
| Document receipt acknowledgment | < 2 minutes | User patience threshold; re-upload prevention |
| Extraction + classification complete | < 1 hour | Internal operational SLA; batch cycle cadence |
| TRID Loan Estimate delivery | 3 business days | CFPB regulation |
| Early-payment discount capture | 10 days (2/10 net 30) | Vendor contract terms; 36.7% annualized opportunity cost |
| Insurance prompt-pay compliance | 30–60 days | State insurance regulations; 18% annual interest penalties (TX) |
| HIPAA right-of-access response | 30 days | Federal regulation; OCR enforcement |
| Record retention | 6–10 years by vertical | HIPAA (6yr), SOX (7yr), state insurance (5–10yr) |

### Compliance Requirements

HIPAA (healthcare), PCI DSS (financial), GDPR (EU personal data), SOX (public company financials), FedRAMP (government), and legal hold obligations. The cross-framework conflicts are the hard part: GDPR right-to-erasure vs. SOX 7-year retention requires legal basis documentation; GDPR erasure vs. legal hold requires tracking and response.

### Cost Model

Manual document processing costs $5–25 per document ($7.25 average invoice, 12 minutes staff time, 3% error rate). Automation reduces this to $1–3 per document. The ROI model delivers 200–400% first-year return with 2.4–7 month payback. At scale, OCR costs dominate: $1.50/1,000 pages via managed API dropping to $0.60 at volume, or ~$0.14/1,000 pages self-hosted on GPU — a 10x difference that justifies hybrid strategies at the large-enterprise tier.

### Natural Partitioning Boundaries

- **Tenant** — the primary partition key for all data and processing.
- **Document type** — different types may have entirely different processing pipelines, models, and validation rules.
- **Time** — documents are naturally time-ordered; time-based partitioning for database tables, S3 prefixes, and search indices.
- **Processing stage** — each pipeline stage scales independently (OCR workers scale separately from extraction workers).

### Primary Bottleneck

OCR throughput. Cloud OCR services are the tightest external constraint. At default Textract quotas, a spike of 10,000 documents averaging 5 pages each = 50,000 pages, and with limited TPS for async start calls, OCR becomes the dominant latency. Human review throughput is the secondary bottleneck — it does not elastically scale like compute.

## 8. Human Touchpoints

### OCR Exception Review

**Who:** Data entry operator / document processing specialist. **Decision:** Correct OCR misreads, confirm uncertain text, flag pages as truly unreadable ("request re-scan"). **SLA:** < 4 hours; queue depth < 500. **What they see:** Split-screen: original scanned page on left, OCR output on right with low-confidence words highlighted. **If they don't act:** Document remains in queue; processing SLA erodes; downstream business clocks keep ticking.

### Classification Review

**Who:** Trained operations staff (not necessarily domain experts). **Decision:** Select the correct document type from the taxonomy, or escalate unknown types to a taxonomy administrator. **SLA:** < 2 hours; same-business-day resolution. **What they see:** Document thumbnail, first-page preview, extracted text snippet, system's top-3 guesses with confidence percentages. **If they don't act:** Document cannot proceed to extraction; sits unclassified.

### Extraction Verification

**Who:** Data entry clerk (routine), subject matter expert (domain-specific fields like medical codes). **Decision:** Accept, correct, or mark fields as "not present in document." Corrections feed back as training data via active learning. **SLA:** < 4 hours. **What they see:** Pre-populated form color-coded by confidence (green/yellow/red), source document alongside with extraction regions highlighted. **If they don't act:** Low-confidence fields propagate downstream with uncertainty flags.

### Validation Exception Resolution

**Who:** Domain-specific — claims adjuster (insurance), underwriter (mortgage), AP manager (accounts payable), paralegal (legal), coding specialist (healthcare). **Decision:** Override the validation (with reason code), reject back to submitter, or escalate to supervisor. **SLA:** Varies by vertical; 8 business hours for insurance, same business day for AP. **What they see:** The specific validation failure with extracted value, reference value, and violated rule. Example: "Invoice amount $15,420 exceeds PO approved amount $12,000. Tolerance: 10%. Overage: $3,420 (28.5%)." **If they don't act:** Document blocks at validation; downstream process stalls.

### Deduplication Resolution

**Who:** Operations analyst or case worker. **Decision:** "True duplicate — link and discard," "new version — replace the old," or "different documents that look similar — keep both." **SLA:** Same business day. **What they see:** Side-by-side comparison highlighting differences (scan date, resolution, annotations). **If they don't act:** Near-duplicate sits in limbo; both versions may enter downstream systems.

### Compliance/Approval Gate

**Who:** Compliance officer, supervisor, or designated approver. **Decision:** Approve release, hold for additional documentation, or reject with comments. **SLA:** Defined by business process (same-day for AP, within regulatory window for claims). **What they see:** Fully processed document package — classified type, extracted data, validation results, system recommendation. **If they don't act:** Document queues at the gate; regulatory clocks continue.

## 9. Scope Ladder

| | MVP | +1 | Mature |
|---|---|---|---|
| **Intake** | Single channel (API upload) | + Email, SFTP, S3 event | 10+ channels incl. fax gateway, mobile capture SDK, EDI/X12 |
| **OCR** | Managed service (Textract or Document AI) | Same, with quota optimization | Hybrid: managed for complex docs, lightweight self-hosted for born-digital |
| **Classification** | Rule-based (keyword/template matching) for 3–5 document types | ML classification with confidence routing | 50+ types, few-shot learning for new types, active learning feedback loop |
| **Extraction** | Type-specific rules or managed extraction | ML extraction with per-field confidence | Multi-model ensemble, cross-page reasoning, handwriting support |
| **Validation** | Basic (required fields, format checks) | Business rules, cross-reference lookups | Full cross-document consistency, external system validation, tolerance tuning |
| **Human Review** | DLQ + email alerts (manual) | Purpose-built review UI with inline correction | Skill-based routing, active learning, workload balancing, SLA escalation |
| **Delivery** | One downstream consumer via webhook/API | 3+ consumers, per-consumer format transformation | Dozens of integrations (REST, SOAP, SFTP, EDI), consumer-specific redaction |
| **Tenancy** | Single tenant | Logical multi-tenancy (shared infra, tenant-scoped data) | Per-tenant encryption keys, dedicated processing for regulated tenants, regional deployment |
| **Compliance** | Structured logging from day one | Audit trail UI, retention policy enforcement | SOC 2 Type II, HIPAA, GDPR erasure, FedRAMP, legal hold management |
| **Observability** | Document in/out counts, latency histogram, DLQ depth | Per-stage metrics, confidence distributions, SLA dashboards | Anomaly detection, model drift alerting, cost tracking, capacity planning |
| **Dedup** | Content hash (exact match) | + Near-duplicate detection (MinHash/LSH) | Context-aware dedup (same doc in different business contexts), human resolution queue |
| **Search** | None (retrieve by ID) | Full-text search over extracted content | Faceted search, temporal queries, cross-document relationship navigation |

**MVP value proposition:** "No document you send us will be silently lost. Every document will be extracted, classified, and delivered, or will appear in a failure queue for human attention, within your SLA window."

**Timeline:** MVP in 2–3 months. v1.0 (review UI, 5 doc types, audit trail) in +2–3 months. Mature platform in 12–18 months.

## 10. Open Questions

1. **Which vertical is first?** Insurance claims, mortgage, healthcare, AP, and legal discovery each have different document taxonomies, validation rules, and compliance requirements. The MVP document types and validation rules depend on which business domain goes first. This is a product decision that determines the first 3–5 document type schemas.

2. **Managed OCR vs. multi-provider strategy?** Starting with a single provider (Textract) is simplest, but creates vendor lock-in on the most expensive and rate-limited operation. Decide whether the MVP should abstract the OCR interface to allow provider switching, or commit to one provider and defer abstraction.

3. **What is the dedup behavior for near-duplicates?** When the same document is re-scanned at higher resolution: replace, keep both, or ask the user? This affects the data model (document versioning vs. document linking) and the user experience.

4. **Who builds the review UI, and when?** The MVP can defer the HITL review interface (using DLQ + email), but the +1 release needs it. Decide whether this is a custom-built internal tool, an integration with an existing operations platform, or a third-party review tool.

5. **Single-tenant or multi-tenant from day one?** Multi-tenant adds isolation complexity (RLS, per-tenant encryption, queue separation) but avoids a painful migration later. If the system will serve multiple business units or customers within 6 months, tenant isolation should be in the data model from the start even if only one tenant exists initially.

6. **How should GDPR erasure interact with the immutable audit trail?** If a data subject requests erasure, the document and all extracted data must be deleted — but the audit trail records that those documents existed and were processed. Decide whether audit events are anonymized (remove document content references but keep the event skeleton) or whether the legal basis for retention of audit events is documented per-tenant.

7. **What is the re-processing trigger model?** When extraction models improve, should the system automatically re-process historical documents, or only process them on access/request? Automatic re-processing has cost implications (re-OCR of millions of pages); on-demand re-processing has consistency implications (some documents have old extractions, others have new).

8. **What confidence thresholds should be tunable per tenant or per document type?** A mortgage lender may want 99% confidence on loan amounts (high cost of error) but accept 85% on borrower middle names (low cost of error). Per-field threshold tuning adds configuration complexity but dramatically affects STP rates and review volume.
