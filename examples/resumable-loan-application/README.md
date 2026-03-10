# Resumable Loan Application Wizard — System Needs Brief

## 1. System Identity

A resumable loan application wizard orchestrates the multi-step process of collecting borrower information, pulling credit, qualifying the applicant, gathering and verifying documents, managing underwriting conditions, and coordinating closing — across a timeline that spans minutes to months. The borrower can abandon the application at any point (browser close, phone dies, life happens) and resume days or weeks later without losing progress. The problem is non-trivial because it weaves together regulatory timing constraints (TRID mandates hard deadlines on disclosure delivery), expiration-driven re-work loops (credit reports, pay stubs, rate locks all expire on different schedules), human-in-the-loop decision gates (underwriters, processors, loan officers with unpredictable response times), and a dense integration surface of third-party services (credit bureaus, automated underwriting systems, appraisal management companies, title companies, employment verification services) — all while maintaining an immutable audit trail and protecting some of the most sensitive PII in consumer finance.

## 2. Domain Context

This system serves **residential mortgage origination** in the U.S. consumer lending industry. The market originates roughly $1.7–2.0 trillion annually. A mid-size lender closes 500–3,000 loans per month; a large lender like Rocket Mortgage or United Wholesale Mortgage closes 10,000–30,000+. The dominant Loan Origination System is ICE Encompass (formerly Ellie Mae), processing over 40% of all U.S. residential mortgage applications. The average loan takes **42 days** from application to close, and the average cost to originate one loan is approximately **$11,800** against total production revenue of roughly **$11,520** per loan — razor-thin margins where every abandoned application that consumed resources is a direct loss.

The canonical loan lifecycle follows established industry stages: **pre-qualification → application (URLA/Form 1003) → document collection → automated underwriting (DU/LPA) → conditional approval → condition satisfaction → clear-to-close → closing disclosure → closing → funding → servicing transfer**. Data flows between stages in formats governed by the MISMO v3.4 Reference Model and the ULAD (Uniform Loan Application Dataset). The URLA — redesigned in 2019, mandatory since March 2021 — is the standard application form containing 9 sections: Borrower Information, Financial Information, Real Estate, Loan & Property Information, Declarations, Acknowledgments, Military Service, Demographics, and Loan Originator Information.

The regulatory environment is dense and non-negotiable. **TRID** (the TILA-RESPA Integrated Disclosure rule, 12 CFR 1026.19(e)/(f)) mandates that a Loan Estimate be delivered within 3 business days of receiving a complete application and that a Closing Disclosure be received at least 3 business days before closing. **ECOA/Reg B** requires adverse action notices within 30 days with specific reasons. **FCRA** governs credit report access and adverse action based on credit data. **HMDA** requires collection and annual reporting of demographic data. **BSA/AML** requires Customer Identification Program checks, SAR filing, and OFAC screening. **GLBA** mandates written information security programs with encryption, monitoring, and breach notification within 30 days. State-level requirements add licensing (NMLS), additional disclosures, and data privacy obligations (CCPA and state breach notification laws). These are not aspirational standards — violations carry CFPB enforcement actions, DOJ consent orders, civil liability (up to $1M class action under TILA), and extended rescission rights.

Online loan application abandonment runs at approximately **68%**. Average time before abandonment: under 19 minutes. The 25–34 age group accounts for three-quarters of abandoned applications. At a mid-size lender closing 2,000 loans/month with this abandonment rate, the system must handle roughly 6,000–7,000 active application sessions concurrently in various stages of completion.

## 3. Entities & Data Model

**LoanApplication** is the root aggregate — long-lived (weeks to months), stateful (progresses through a defined lifecycle), and the anchor for every other entity. It maps to the industry-standard URLA and its fields are codified in MISMO/ULAD.

| Entity | Relation | Mutability | Volume | Key Lifecycle |
|--------|----------|------------|--------|---------------|
| **LoanApplication** | Root | Mutable through closing, then frozen | 1 per origination | INTAKE → PROCESSING → UNDERWRITING → CONDITIONAL_APPROVAL → CTC → CLOSING → FUNDED |
| **Borrower / CoBorrower** | 1:N per application | Mutable during intake, frozen after submission | 1–4 per application | PII-heavy (SSN, DOB, address history). Each has independent employment, income, assets. |
| **Property** | 1:1 per application | Mutable until appraisal ordered | 1 | Address, type, occupancy, estimated/appraised value. |
| **Employment / IncomeSource** | N per Borrower | Mutable until verified | 2–5 per borrower | Must cover 2-year history. Self-employment adds Schedule C/K-1 complexity. |
| **Asset** | N per Borrower | Mutable until verified | 3–10 per borrower | Bank accounts, retirement, gift funds. Must document source of down payment. |
| **Document** | N per Application | Immutable once uploaded (versioned) | 10–50+ | Type, upload date, expiration, verification status. Pay stubs expire at 30 days, bank statements at 60. |
| **CreditReport** | N per Application (1 per pull) | Immutable once pulled | 1–3 | Tri-merge from bureaus. Valid 120 days. Contains scores, tradelines, liabilities feeding DTI. |
| **LoanEstimate** | N per Application (initial + revised) | Immutable per version | 1–3+ | Regulatory document. Delivery starts TRID clock. Fee tolerances (0%/10%/unlimited) carry to CD. |
| **ClosingDisclosure** | N per Application | Immutable per version | 1–2 | Must be received 3 business days before closing. Certain changes restart the waiting period. |
| **Condition** | N per Application | Mutable (assigned → submitted → cleared) | 5–30+ | Prior-to-Docs (PTD) and Prior-to-Funding (PTF). Each has description, assigned date, satisfied date, cleared-by. |
| **Appraisal** | 1:1 per Application | Immutable once completed | 1 | Ordered via AMC. Appraised value, comparable sales. Valid ~120 days. |
| **RateLock** | 1 active per Application | Mutable (lock → extend → expire) | 1 active, N historical | 30–60 day duration. Extensions cost 0.125%–0.375% per increment. |
| **AuditTrail** | N per Application | Append-only, never modified | Unbounded | Every state transition, disclosure delivery, and decision. Must survive the application for years. |

Key observations: immutability matters — credit reports, delivered disclosures, and audit logs are write-once. Documents are versioned, not overwritten. Expiration is pervasive and drives re-work loops. The MISMO data model is the industry standard and ignoring it creates an integration tax at every boundary.

## 4. Core Operations

### Collect Borrower Information
Multi-step, resumable data collection across 8–10 logical sections (personal info, employment, income, assets, property, declarations, demographics). Progressive validation — some fields depend on prior answers (self-employment changes the income section entirely). Partial state must persist at every step boundary. The system must detect when the "6-piece rule" is satisfied (borrower name, income, SSN, property address, estimated value, loan amount) because this starts the TRID clock for Loan Estimate delivery. Duration: minutes to weeks depending on borrower behavior.

### Pull Credit
Tri-merge credit report via aggregator (MeridianLink CreditAPI or CoreLogic Credco) hitting Equifax, Experian, and TransUnion. Inputs: borrower SSN, name, address. Outputs: FICO scores from all 3 bureaus, tradelines, public records. Sub-second latency. This is a hard inquiry — must not be duplicated accidentally. Report valid 120 days; expiration must be tracked. Liabilities from the credit report feed into DTI and must be reconciled with borrower-declared debts.

### Run Automated Underwriting
Submission to Fannie Mae Desktop Underwriter (DU) via DU Messages API (JSON/MISMO ULAD) or Freddie Mac Loan Product Advisor (LPA) via system-to-system integration (MISMO v3.4). Outputs: recommendation (Approve/Eligible, Approve/Ineligible, Refer, Caution), conditions list, representation and warranty relief eligibility. Sub-second to seconds. The AUS findings drive the entire downstream workflow — what conditions must be satisfied, whether an appraisal waiver is possible, what documentation is required. Findings change when loan data changes, requiring re-submission.

### Calculate DTI & LTV
Pure calculation, milliseconds. Non-trivial because income calculation is genuinely complex: base salary is straightforward, but variable income (bonuses, overtime, commission) requires 2-year averaging. Self-employment income requires analysis of tax returns, Schedule C, K-1, and business deductions. These ratios are the primary underwriting gatekeepers (43% DTI for QM, 50% for some programs).

### Generate Loan Estimate
Produces a TRID-compliant LE document. Must be delivered within **3 business days** of a complete application. A **7-business-day** waiting period begins from delivery before closing can occur. Revised LEs can only be issued for valid changed circumstances. Fee tolerances (0%, 10%, unlimited buckets) must be tracked from LE through to Closing Disclosure. "Business day" definitions differ between LE and CD rules. Getting this wrong is a compliance violation with regulatory penalties.

### Order Appraisal
Ordered through an Appraisal Management Company to maintain appraiser independence (Dodd-Frank requirement). **5–10 business days** for completion — the single longest wait in the process. If appraised value comes in low, triggers renegotiation, additional down payment, or deal cancellation. Some loans qualify for waivers (DU Property Inspection Waiver, Freddie Mac ACE) — detecting eligibility avoids this delay.

### Verify Employment
Automated via Equifax Workforce Solutions / The Work Number (covers ~60% of US workforce, sub-second). Manual fallback (phone, fax, written request) for employers not in the database: 1–2 business days, unreliable. Re-verification (RVOE) required within 10 business days of closing. Self-employed borrowers cannot be verified this way at all.

### Verify Income (IRS Tax Transcripts)
IRS Form 4506-C submitted via IVES (Income Verification Express Service). **3–5 business days** best case, 1–2 weeks typical. The IRS rejects approximately **40%** of 4506-C submissions due to data mismatches (name discrepancies, address changes, filing status). The form is valid 120 days from signature. Transcripts are compared against borrower-provided returns to detect fraud.

### Manage Conditions Loop
The core iterative loop of the process. Conditions come from AUS findings and manual underwriter review, categorized as PTD (Prior-to-Docs) and PTF (Prior-to-Funding). Each condition has independent satisfaction criteria. The cycle: underwriter assigns conditions → borrower/processor provides documentation → underwriter reviews → clears or adds new conditions → repeat. **1–3 weeks** typical, with each review cycle taking 24–72 hours. The number of conditions can increase during review — progress is non-monotonic. This is the number one source of borrower complaints and cannot be fully automated because it requires human judgment.

### Lock Rate
Pricing engine call (Optimal Blue, Polly, or internal) to lock a rate for 30–60 days. Financial commitment with real cost: extensions run 0.125%–0.375% per 15-day increment ($406–$1,219 on a median $325K loan). If the lock expires, the borrower faces current market rates. Lender hedges locks with forward sales; a lock that falls out creates a hedge that must be unwound at 10–50 basis points cost.

### Generate Closing Disclosure
TRID-compliant CD must be received by borrower at least **3 business days** before closing. Three specific changes (APR becoming inaccurate by >1/8%, loan product change, prepayment penalty addition) restart the 3-day clock. Delivery method affects "received" date: in-person = same day; mail/email = 3 business days after sending. Tolerances from the LE carry forward — the CD must reconcile within tolerance bands.

### Coordinate Closing
Multiple parties converge: title company, escrow agent, notary, borrower, seller. Wire fraud is a major risk (business email compromise targeting wire instructions). Final PTF conditions verified. Funding is a time-sensitive wire transfer. Post-closing: loan registered in MERS, delivered to investor (Fannie Mae/Freddie Mac) via ULDD.

## 5. System Boundaries

### Inbound — What Triggers This System

| Caller | Interface | Volume | Expectations |
|--------|-----------|--------|--------------|
| Borrower (web/mobile) | Point-of-sale UI, "Apply Now" | Thousands/month | Sub-second page loads, instant save, resume via secure link |
| Real estate agent referral | Branded URL with agent ID | Subset of above | Pre-populated agent info, co-branding |
| Rate comparison site (LendingTree, Bankrate, Zillow) | Redirect with query params (credit tier, loan amount, state) | Lead volume spikes | Seamless handoff, no data re-entry |
| Existing lender (refi offer) | Deep link from email/SMS | Targeted campaigns | Pre-populated from servicing records |
| Loan officer (phone/in-branch) | Internal portal, creates application on borrower's behalf | Per-LO pipeline | Then emails borrower a link to continue independently |
| CRM (Salesforce, HubSpot) | Lead data feed | Upstream | Borrower contact info, campaign attribution, LO assignment |

### Outbound — What This System Depends On

| Dependency | Interface | Latency | Reliability | Failure Modes |
|------------|-----------|---------|-------------|---------------|
| Credit bureaus (Equifax, Experian, TransUnion) | Via MeridianLink CreditAPI or CoreLogic Credco; MISMO XML/REST | Sub-second | 99.9%+ (aggregator) | SSN mismatch, frozen credit, bureau-specific outages, rate limiting |
| Fannie Mae DU | DU Messages API (JSON), MISMO ULAD | Seconds | High (scheduled maintenance) | Strict ULAD schema validation failures, version mismatches |
| Freddie Mac LPA | System-to-system, MISMO v3.4; Datashare APIs | Seconds | High | Schema validation, separate enrollment required |
| IRS / IVES (4506-C) | Batch submission via IVES participants | 3–14 days | Moderate — 40% rejection | Data mismatches, form expiration, IRS backlogs |
| The Work Number (Equifax Workforce Solutions) | REST API | Sub-second if employer in DB | High for automated | ~40% of workforce uncovered; stale data for recent job changes |
| Appraisal Management Companies | MISMO-based order/status APIs | 5–10 business days | Low — human-dependent | Low appraisal, appraiser no-show, rural coverage gaps |
| Flood determination (CoreLogic, ServiceLink) | MISMO Flood 2.1 DTD, SOAP/XML | Seconds | High | Address parsing failures, map revision lag |
| MI companies (MGIC, Radian, Essent, Arch) | REST via LOS (e.g., Encompass MI Center) | Seconds | High | Eligibility rejections, commitment expiration |
| Title companies | Mostly manual (email, fax); some API-enabled | Days for search, hours for commitment | Low — human-dependent | Title defects, lien discoveries, county recorder delays |
| Pricing engines (Optimal Blue, Polly) | REST API | Sub-second | High | Rate sheet staleness, lock desk capacity |
| MERS | Registration API | Minutes | High | Data quality, MIN management |
| Investor delivery (Fannie/Freddie) | Loan Delivery / Loan Selling Advisor, MISMO ULDD | Hours to days | Moderate | Data defects, purchase suspenses, repurchase demands |

### Trust Boundaries

Every entity in this system contains PII. The LoanApplication is one of the most PII-dense data structures in consumer finance: SSN, full financial profile (income, assets, debts, credit history), property details, employment history, tax returns, bank statements.

**GLBA Safeguards Rule** mandates: encryption at rest and in transit, continuous monitoring or penetration testing, employee training, service provider oversight. Breach notification to FTC within 30 days for breaches affecting 500+ individuals. Penalties up to $100,000 per violation for institutions.

**Multi-tenant considerations** (if serving multiple lenders): loan data strictly isolated between tenants. Rate sheets and pricing are competitively sensitive. Credit pulls and third-party service accounts are per-lender. Borrower data may span tenants (same borrower applies at multiple lenders) but must not be cross-linked. **ECOA/Fair Lending**: demographic data collected for HMDA but must not influence underwriting — system must enforce separation.

## 6. What Goes Wrong

### Common and Expected (Handle Gracefully)

- **Mid-application abandonment** (68% of applications). The entire value proposition of this system rests on recovering these borrowers. Nudge emails at 1 hour, 24 hours, 72 hours. Loan officer outreach at 7 days. Application goes STALE at 30 days.
- **Document upload failures**: wrong format, illegible, wrong document type, missing pages, password-protected PDFs. System needs immediate quality checks (format validation, blur detection, OCR-based classification) plus human review fallback.
- **Document expiration mid-process**: pay stubs go stale at 30 days, bank statements at 60 days, credit reports at 120 days. Long-running applications require document refresh cycles — the system must detect approaching expirations and proactively request fresh documents.
- **Income discrepancy**: borrower states $120K, W-2 shows $95K. Underwriter uses documented income. DTI recalculation may require loan restructuring or co-borrower addition.
- **AUS findings change on re-submission**: new credit data can flip an Approve/Eligible to a Refer, triggering manual underwriting.

### Rare but Catastrophic (Prevent or Recover)

- **TRID timing violation**: Loan Estimate not delivered within 3 business days, or Closing Disclosure not received 3 business days before closing. Extended rescission rights (3 years instead of 3 days), CFPB enforcement, civil liability up to $1M class action. The system must track the triggering event with an immutable timestamp and enforce deadlines automatically.
- **Application state loss**: if a returning borrower cannot load their saved state, abandonment is guaranteed and regulatory audit trail is broken. Data integrity of persisted application state is existential.
- **Data breach**: SSN, financial data, credit reports — GLBA violation, state AG action, average breach cost $4.45M, reputational damage that is existential for a direct-to-consumer lender.
- **Rate lock system failure**: cannot lock rates, borrowers exposed to market movement, hedging desk blind. Each failed lock costs $406–$1,219 in extension fees or worse.
- **Fair lending violation**: system that treats borrowers differently based on channel, abandonment pattern, or data pre-fill can create disparate impact. DOJ enforcement, consent orders (recent example: $6.5M settlement for redlining, 2024). 33 fair lending referrals to DOJ in 2023.

### Partial Completion Creates Inconsistency

- **Credit pulled but application abandoned**: hard inquiry on borrower's credit with no offsetting benefit. Cannot be undone.
- **Rate locked but conditions not cleared by expiration**: lender eats extension fees or borrower gets worse rate. Hedging position must be unwound.
- **Loan Estimate delivered but borrower never returns**: TRID obligations met but origination resources wasted. Application must still be retained for regulatory record-keeping (25 months minimum for withdrawn/denied per Reg B).
- **Appraisal completed but loan denied**: borrower paid $300–$1,000 for an appraisal on a loan that won't close. Appraisal must still be delivered to borrower (ECOA requirement).

### Critical Invariants

1. **TRID Loan Estimate timing**: once 6 data elements received, LE must be delivered within 3 business days. Immutable timestamp required.
2. **TRID Closing Disclosure timing**: borrower must receive CD at least 3 business days before closing. Three specific changes restart the clock.
3. **Audit trail immutability**: every state transition, disclosure delivery, and decision logged with timestamps. Never modified or deleted. Primary evidence in examinations.
4. **One active rate lock per application**: lock, extend, expire, and renegotiate are mutually exclusive transitions.
5. **Condition clearance integrity**: cannot declare CTC while PTD conditions outstanding; cannot fund while PTF conditions outstanding.
6. **Credit report access controls**: FCRA restricts who can view credit data and for what purpose. Access logged.
7. **Fee tolerance tracking**: fees on LE tracked against CD within 0%/10%/unlimited tolerance bands. Overages in 0% and 10% buckets must be cured (lender pays the difference).

## 7. Scaling & Constraints

### Volume and Growth

Applications scale with market conditions — when rates drop, volume spikes (every existing application may need repricing and lock desks become overwhelmed). At any time, thousands of applications are in various lifecycle stages simultaneously. Document volume is the largest storage dimension (10–50+ documents per loan, each potentially multi-page). Each application triggers 10–20+ external API calls over its lifetime.

### Business SLAs and Sources

| SLA | Window | Source |
|-----|--------|--------|
| Loan Estimate delivery | 3 business days | TRID / Reg Z 1026.19(e) |
| Closing Disclosure delivery | 3 business days before closing | TRID / Reg Z 1026.19(f) |
| Adverse action notice | 30 days | ECOA / Reg B 1002.9 |
| Rate lock | 30–60 days | Market convention / hedging cost |
| Credit report validity | 120 days | Fannie Mae / Freddie Mac selling guides |
| Pay stub freshness | 30 days | Underwriting standard |
| Bank statement freshness | 60 days | Underwriting standard |
| Appraisal validity | 120 days (purchase) / 180 days (refi) | Agency guidelines |
| VOE re-verification | Within 10 business days of closing | Underwriting standard |
| Application data retention (denied/withdrawn) | 25 months minimum | ECOA / Reg B |
| Loan file retention | 3–7 years (potentially 30 years for investor repurchase review) | TILA, BSA, investor requirements |

### Compliance Requirements

TRID, ECOA, FCRA, HMDA, BSA/AML, GLBA, QM/ATR, Fair Lending, state licensing (NMLS), state disclosures, CCPA/state privacy. Each creates constraints on data handling, timing, access control, and record retention. These are architectural requirements, not add-ons.

### Natural Partitioning

Applications are naturally independent — one borrower's application has no data dependency on another's. This is the obvious partition key. Within an application, stages have ordering constraints but some operations parallelize naturally (credit pull, employment verification, appraisal order can run concurrently once triggered). The human bottlenecks (underwriters, processors) are the true throughput constraint — no amount of system scaling fixes this.

## 8. Human Touchpoints

| Role | When | Decision | SLA | If They Don't Act |
|------|------|----------|-----|-------------------|
| **Borrower** | Every intake step, document upload, condition satisfaction, LE/CD acknowledgment, closing | Provide information, upload documents, accept/reject terms | Unbounded (system nudges at 1h, 24h, 72h; STALE at 30 days) | Application stalls; documents expire; rate lock approaches expiration; system sends escalating nudges then marks STALE |
| **Loan Officer** | Pre-approval edge cases, rate lock advisory, low appraisal consultation, borrower re-engagement | Product recommendation, escalation to manual UW, rate lock timing | Contact within 1 business day for referrals | Borrower disengages; conversion drops |
| **Loan Processor** | Document review, condition gathering, underwriter liaison | Accept/reject documents, request specifics, organize file | 24–48 hours per document review cycle | Document queue backs up; conditions stall; rate lock pressure increases |
| **Underwriter** | Full risk assessment, conditions creation, condition clearing, CTC sign-off | Approve/suspend/deny, set conditions, clear conditions | 24–72 hours per review cycle | Pipeline backs up; rate locks expire; TRID deadlines approach |
| **Closer** | Closing package preparation, CD generation, funding authorization | Balance figures, authorize wire, confirm recording | Same-day to 3 days after CTC | Closing delayed; CD re-disclosure may be needed |
| **Compliance Officer** | TRID timing audits, adverse action review, fair lending review, HMDA reporting | Flag violations, approve adverse action notices, audit decisions | Ongoing / periodic | Regulatory exposure accumulates silently |
| **Appraiser** (external) | Property inspection and valuation | Appraised value | 7–10 business days from assignment | Longest single delay in the pipeline; no lender control |

## 9. Scope Ladder

| | MVP | +1 | Mature |
|---|-----|-----|--------|
| **Products** | Single conventional mortgage product | Add FHA, VA, jumbo | Multi-product: mortgage, HELOC, auto, personal, SBA |
| **Intake** | Web-only, 8-step wizard with save-and-resume keyed to email/phone → SSN | Add mobile with camera-based doc capture; Plaid bank/income linking for auto-populate | Multi-channel: web, mobile, in-branch, broker portal, embedded API for fintech partners |
| **Credit** | Tri-merge pull via single aggregator; idempotent (no duplicate pulls) | Soft pull for pre-qual, hard pull deferred to pre-approval; rapid rescore support | Multi-bureau strategy optimization; credit monitoring for pipeline loans |
| **Decisioning** | Basic DTI/credit score eligibility against product matrix; auto-approve or decline | AUS integration (DU submission); manual underwriting path for Refer findings | Full AUS (DU + LPA), automated condition generation, ML fraud detection, dynamic product matching across all programs |
| **Documents** | Upload + manual processor review; freshness tracking with expiration alerts | OCR-based classification and data extraction; automated quality checks (blur, completeness) | Automated document verification, payroll/IRS direct integration, document-free verification paths |
| **Conditions** | Manual condition assignment/clearing by underwriter; borrower sees checklist | Processor workflow with templates; automated satisfaction for simple conditions (insurance binder, flood cert) | Intelligent condition routing, predictive condition generation, automated clearing for verified data |
| **Compliance** | TRID timer enforcement (LE 3-day, CD 3-day); adverse action notices; audit trail | Fee tolerance tracking (LE → CD); HMDA data collection and export; changed circumstance handling | Full QC sampling, fair lending statistical analysis, automated HMDA LAR submission, regulatory exam package generation |
| **Rate Lock** | Manual lock request; expiration tracking and alerts | Lock/float advisor; automated extension requests; renegotiation workflow | Hedging integration; automated best-execution analysis; lock desk capacity management |
| **Closing** | Hand-off to external closing process | CD generation with TRID timing enforcement; closing coordination | Full closing orchestration: title, escrow, e-closing/RON, funding, MERS registration, investor delivery |
| **Notifications** | Email nudges for abandonment + key milestones | SMS + push; per-event notification preferences | Intelligent engagement: ML-driven nudge timing, loan officer outreach triggers, borrower sentiment detection |
| **Observability** | Borrower status bar + document tracker; internal pipeline dashboard | Rate lock countdown; conditions tracker; compliance dashboard | Full operational dashboards: conversion funnel, integration health (per-vendor p50/p95/p99), lock desk exposure, fair lending monitoring |

## 10. Open Questions

1. **Save granularity**: per-field (better UX, higher storage/complexity) or per-step (simpler, some data loss on mid-step abandon)? The answer affects storage design, conflict resolution for co-borrowers editing simultaneously, and the definition of "resumable."

2. **Credit pull timing**: early (better qualification accuracy but hard inquiry committed before the borrower may be serious) or deferred until after document collection (less friction but may waste effort on unqualifiable borrowers)? This is a product decision with regulatory implications — a hard pull without a resulting application may generate FCRA questions.

3. **When does the TRID clock start?** The 6-piece rule (name, income, SSN, property address, estimated value, loan amount) defines a "complete application" — but in a wizard where these are collected across multiple steps and sessions, the system must define the exact triggering moment. Does it start when the 6th piece is saved, or when the borrower explicitly submits? Getting this wrong means either premature regulatory obligation or late disclosure delivery.

4. **Application identity for pre-credit-auth resumption**: before SSN is collected, the system uses email + phone as a soft identity key. A borrower using a different email creates a duplicate. Should the system attempt fuzzy matching (name + DOB + address), or accept duplicates and let loan officers merge manually?

5. **Co-borrower simultaneous editing**: co-borrowers can log in independently to complete their sections of the same application. What happens when both are editing concurrently? Last-write-wins on shared fields (property, loan terms)? Optimistic locking? Section-level locks?

6. **Rate lock on declined re-submission**: if AUS findings change from Approve to Refer after re-submission with new credit data, and the borrower has an active rate lock, does the lock persist through manual underwriting (potentially weeks), or is the borrower offered the option to cancel and re-lock later?

7. **Low appraisal workflow**: when the appraisal comes in below purchase price, should the system automatically pause the loan and present options (renegotiate, bring cash, challenge, walk away), or route to the loan officer for a human conversation first? The answer determines whether this is a system-managed state or a human-managed exception.

8. **Abandoned application cleanup vs. retention**: applications go STALE at 30 days and EXPIRED at 90 days of inactivity. But ECOA/Reg B requires retaining denied/withdrawn applications for 25 months, and investor guidelines may require loan files accessible for the life of the loan (30 years). What is the retention policy for applications that were never completed — specifically pre-credit-auth abandonments where no SSN was collected?

9. **Multi-tenancy**: if this system will serve multiple lenders, data isolation is non-negotiable (loan data, rate sheets, pricing are competitively sensitive; credit pulls use per-lender accounts). But should multi-tenancy be designed in from the start, or is single-tenant MVP acceptable with multi-tenant as a +1 capability?

10. **Notification delivery as compliance evidence**: TRID requires that disclosures be "delivered" — and delivery method affects the "received" date calculation (in-person = same day; electronic with e-consent = delivery date; mail = 3 days after mailing). The system must track not just that a notification was sent, but the delivery method and the resulting "received" date. Should electronic delivery require confirmed receipt (read receipt / acknowledgment click), or is send-confirmation sufficient?
