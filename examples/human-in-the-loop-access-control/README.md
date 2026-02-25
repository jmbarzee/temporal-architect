# Modernize Access Control Requests with Auditable Human-in-the-Loop Workflows

## 1. System Identity

This system governs the lifecycle of access to enterprise resources -- from the moment an employee, contractor, or service account needs access to a system, through human approval, automated provisioning, periodic re-certification, and eventual revocation. The problem is non-trivial because it sits at the intersection of dozens of heterogeneous external systems (identity providers, cloud platforms, SaaS applications, databases, legacy directories), requires long-lived stateful workflows with human decision points that span hours to weeks, enforces combinatorially complex policies (separation-of-duties rules, risk thresholds, multi-level approval chains), and must produce an immutable, tamper-evident audit trail that satisfies SOX, HIPAA, SOC 2, and PCI-DSS auditors. Every access decision that is lost, delayed, or undocumented creates concrete business harm: productivity loss, security exposure, regulatory penalty, or audit failure.

## 2. Domain Context

This system operates in **Identity Governance and Administration (IGA)**, a mature sub-domain of enterprise cybersecurity. The market is served by established platforms -- SailPoint Identity Security Cloud, Okta Identity Governance, CyberArk Privileged Access Manager, Saviynt Enterprise Identity Cloud, Microsoft Entra ID Governance -- each handling the full lifecycle of access requests, approval routing, automated provisioning via connectors, access certification campaigns, and separation-of-duties enforcement. A real Fortune 500 deployment (a major bank with 100,000+ employees) typically involves an authoritative HR source (Workday, SAP SuccessFactors) driving identity lifecycle events, an IGA engine connected to 200-500+ target systems via SCIM, REST, LDAP, JDBC, and custom connectors, ServiceNow ITSM as the user-facing request portal, CyberArk for privileged access, Active Directory and Azure AD/Entra ID as backbone directories, quarterly certification campaigns covering every manager, SoD policy matrices with hundreds of rules, and a role model with thousands of roles maintained by a dedicated team.

The domain vocabulary is precise. An **entitlement** is a discrete unit of access on a target system (an AD group, an AWS IAM policy, a Salesforce permission set). **Roles** bundle entitlements by job function. **Birthright access** is automatically granted based on HR attributes at hire -- no request needed. **Separation of Duties (SoD)** rules prevent a single identity from holding conflicting entitlements (e.g., both "create vendor" and "approve payment" in SAP). **JML** (Joiner-Mover-Leaver) describes the three lifecycle triggers. **Access certification campaigns** are periodic reviews where managers attest that existing entitlements are still appropriate. The canonical data flow is: request initiation -> risk scoring and policy evaluation -> approval routing -> provisioning -> verification and audit -> ongoing governance (certification) -> deprovisioning.

Regulatory pressure is the primary driver of process formality. SOX Section 404 requires documented IT general controls including access certification. HIPAA mandates need-to-know access controls for ePHI. PCI-DSS v4.0 Requirement 7 mandates least privilege and quarterly access reviews. SOC 2 Type II auditors examine access provisioning/deprovisioning procedures over a 6-12 month observation period. NIST SP 800-53 Rev. 5 defines 25 access control family controls (AC-1 through AC-25). ISO 27001:2022 Annex A Controls 5.15-5.18 cover access policy, identity management, and access rights. GDPR Articles 5(1)(f) and 32 require appropriate access controls for personal data. Auditors specifically request provisioning/deprovisioning evidence, certification evidence, SoD violation reports, orphaned account reports, and privileged access inventories.

Scale characteristics at a large enterprise (50,000-200,000 employees): 200-1,000+ connected target systems, 500,000-2,000,000+ total entitlements, 2,000-20,000+ defined roles, 500-10,000+ access requests per day, certification campaigns generating 100,000-1,000,000+ individual review items, and a provisioning mix spanning real-time (SCIM, LDAP -- seconds), near-real-time (REST APIs -- minutes), batch (JDBC, flat file -- hours), and manual fulfillment (ITSM tickets -- days).

## 3. Entities & Data Model

### Quick Reference

| Entity | Lifespan | Volume | Mutability | Primary Relationships |
|--------|----------|--------|------------|----------------------|
| Identity | Years | 50K-500K | Mutable (HR-sourced attributes) | Subject of Access Grants, requester/approver of Requests |
| Entitlement | Long-lived (reference) | 5K-20K | Infrequent changes, versioned | Belongs to Target System, object of Access Grants |
| Access Request | Days to weeks | 1000s/month | Append-only state machine | Contains line items, spawns Approval Tasks, produces Grants |
| Approval Task | Hours to days | 2-5x request line items | Mutable until decided, then immutable | Belongs to Request line item, assigned to approver Identity |
| Policy | Long-lived (reference) | 100s-1000s | Versioned; in-flight requests use submission-time version | References Entitlements, Identity attributes, Target Systems |
| Target System | Long-lived (infrastructure) | 10s-100s | Infrequent changes | Hosts Entitlements, destination of Access Grants |
| Access Grant | Months to years | 500K+ active | State transitions append-only | Links Identity to Entitlement on Target System, certified in Campaigns |
| Certification Campaign | Weeks (active period) | 2-4/year | Scope frozen once active | Targets Access Grants, produces review decisions |
| Audit Event | Permanent | Millions/year | Strictly immutable | References all other entities |

### Identity

The subject requesting or holding access -- an employee, contractor, service account, or vendor. Attributes sourced from an authoritative HR system (Workday, BambooHR, SAP SuccessFactors): unique identifier, identity type (human/non-human), department, manager, job code, cost center, location, lifecycle state (pre-hire, active, on-leave, terminated), computed risk score. An Identity is the aggregate of data from multiple systems -- HR is authoritative for humans, a service catalog for service accounts, vendor management for contractors. The system reconciles these without owning the source of truth.

**State transitions:** Pre-hire -> Active -> (On-leave <-> Active) -> Terminated -> Archived

### Entitlement

A discrete, granular permission on a target system -- the atomic unit of access that can be requested, granted, certified, and revoked. Each entitlement carries a risk level (low/medium/high/critical), participates in zero-to-many SoD conflict rules, and references an approval policy. The entitlement catalog grows with the number of integrated target systems and is the dimension that makes policy complexity explode. Entitlement definitions must be versioned for audit -- when a definition changes, existing grants under the old definition must be distinguishable.

### Access Request

The central workflow object. A transactional record containing: requester Identity, beneficiary Identity (may differ -- managers request on behalf of reports), one or more requested Entitlements as line items, business justification, request type (new access, modification, removal, transfer, emergency/break-glass), risk assessment result, and a lifecycle state. Prior states are immutable (append-only state machine); only the current state advances.

**State machine:**
```
DRAFT -> SUBMITTED -> RISK_ASSESSED -> {AUTO_APPROVED | PENDING_APPROVAL}
PENDING_APPROVAL -> {PENDING_MORE_INFO | APPROVED | DENIED | ESCALATED}
APPROVED -> PROVISIONING -> {ACTIVE | PROVISIONING_FAILED | PROVISIONING_PARTIAL}
ACTIVE -> {EXPIRING_SOON -> ACTIVE (renewed) | DEPROVISIONING}
DEPROVISIONING -> {DEPROVISIONED | DEPROVISIONING_FAILED}
DENIED -> {SUBMITTED (appeal) | CLOSED}
```

Break-glass requests follow a compressed variant: BREAK_GLASS_REQUESTED -> BREAK_GLASS_ACTIVE -> BREAK_GLASS_EXPIRED -> BREAK_GLASS_REVIEWED.

### Approval Task

An individual approval decision within a request. A single request line item may require multiple sequential approvals (manager -> resource owner -> security review). Each task is assigned to one approver, carries an SLA deadline, and supports delegation, escalation, and reassignment. Once a decision is recorded, it is immutable. The approval decision must be exactly-once -- race conditions between an approver and an escalation timer, or between an approver and a delegatee, must be resolved deterministically.

### Policy

The rules governing approval routing, SoD enforcement, risk thresholds, and auto-approval conditions. Policies must be versioned -- when a policy changes, in-flight requests continue under the version active at submission time. SoD policies define pairs or sets of conflicting Entitlements. Approval routing policies produce Approval Task structures based on conditions matching identity attributes, entitlement attributes, and risk scores. Policy complexity grows combinatorially with the entitlement catalog.

### Target System

An external system where access is actually provisioned -- Active Directory, Okta, AWS IAM, GCP IAM, Azure RBAC, PostgreSQL, MySQL, Salesforce, GitHub, Kubernetes, CyberArk, ServiceNow, and potentially hundreds of SaaS applications. Each has a specific integration protocol (SCIM 2.0, LDAP/LDAPS, REST API, SQL, PowerShell/SSH), unique reliability characteristics, and different idempotency semantics. The provisioning layer must abstract over all of these while preserving per-target-system status reporting.

### Access Grant

The record of access actually provisioned in a Target System. Links one Identity to one Entitlement on one Target System. Long-lived (persists as long as access exists, potentially years for permanent assignments). This is the highest-cardinality entity at rest -- Identities x Entitlements per identity, potentially 500,000+ active grants. Subject to periodic certification. Must carry a provisioning correlation ID for idempotency.

### Certification Campaign

A periodic, structured review of existing Access Grants driven by compliance requirements. Low volume of campaigns (2-4/year), but each produces review items proportional to the number of in-scope Access Grants -- potentially hundreds of thousands of individual decisions. Also includes micro-certifications triggered by lifecycle events (role change), scoped to a single Identity.

### Audit Event

An immutable log entry for every significant action. Append-only, tamper-evident, with cryptographic integrity guarantees. Every state transition on every other entity produces at least one Audit Event. Retention: SOX requires 7 years, HIPAA 6 years. This is the compliance backbone -- if audit write fails, the operation must fail. The system trades availability for auditability, which is the correct tradeoff for a compliance system.

## 4. Core Operations

### Request Access

An identity (or their manager) selects entitlements from a catalog, provides business justification, and optionally specifies a duration. The system enriches the request with identity attributes and existing grants, evaluates SoD rules against the beneficiary's current grants *and other in-flight requests* (two conflicting requests submitted concurrently must not both be approved), computes a risk score, and either auto-approves (low-risk birthright), routes to the approval chain, or auto-rejects (hard policy violation). Duration: milliseconds for submission and evaluation. The resulting workflow extends to hours or days.

### Approve / Deny

An approver reviews a request with full risk context: the requester's current access footprint, SoD conflicts with specific conflicting entitlements named, peer-group analysis, and a recommended action. Multi-level chains create ordering dependencies -- Level 1 must approve before Level 2 is notified. Approvers can approve, deny (with mandatory reason), request more information (pauses the approval timer), approve with modification (reduce access level or duration), or reassign. Partial approval (some line items approved, others denied) must be handled. The decision itself is milliseconds; the human wait time is hours to days.

### Escalate / Delegate

When an approver is OOO or breaches SLA (detected via configurable timers), the system escalates -- reassigning the task to the approver's manager, a designated backup, or a fallback governance role. Up to 3 escalation levels. Delegation is explicit: an approver forwards the task to a delegate who must be authorized for this entitlement type. Delegation chains must be bounded and cannot delegate to the request beneficiary (self-approval prevention). The original assignment is preserved in the audit trail.

### Provision

Upon final approval, the system creates actual access in each target system. Each target has different protocols and semantics:
- **Active Directory:** LDAP modify (add member to group). Sub-second API, but replication across domain controllers takes minutes to hours.
- **Okta:** Management API (assign application/group). Sub-second API. Rate limited at 1,000 req/min org-wide.
- **AWS IAM:** Attach managed policy, add to permission set. Eventually consistent -- IAM policy propagation up to 60 seconds.
- **PostgreSQL:** Execute GRANT statement. Requires appropriate admin privileges. Sub-second.
- **SaaS (SCIM 2.0):** POST/PATCH to /Users or /Groups. SCIM compliance varies widely across providers.
- **Legacy/manual:** Create an ITSM ticket for a human administrator. Completion depends entirely on human action.

Provisioning is a two-phase operation: execute, then verify (read back target system state to confirm). Must be idempotent -- retrying after a timeout must not create duplicate grants. Partial failure in a multi-entitlement request must be handled (some provisioned, some failed, each with independent status). Credential material may transit during provisioning and must be handled securely.

### Deprovision

Mirrors provisioning. Triggered by: expiration, certification revocation, manager-initiated removal, employee termination (leaver event), or policy change. Must be idempotent. Must handle the case where access was already removed externally (drift). On offboarding, must deprovision across ALL target systems -- missing even one creates an orphaned-access security risk. Must retry, escalate, and alert until deprovisioning is confirmed for every target system.

### Certify

Generates review items for each Access Grant in a campaign's scope. Assigns items to reviewers (managers or entitlement owners). Reviewers see: when access was granted, by whom, how frequently used, and peer-group comparison. Scale: a campaign may produce hundreds of thousands of review items. Reviewer fatigue leads to rubber-stamping -- the system must detect and flag patterns suggestive of rubber-stamping (e.g., all items certified in under 2 seconds each). Failed certifications flow into the deprovisioning pipeline.

### Emergency Grant (Break-Glass)

Bypasses normal approval. A pre-designated responder (Incident Commander, SRE, SOC analyst) selects from pre-configured emergency access profiles, describes the incident, and receives immediate access. A single on-call approver has 15 minutes to respond; if silent, access is auto-granted with mandatory alerts. Access is time-bound (30-60 minutes), heavily logged (every command, file access, and change captured), and subject to mandatory post-incident review within 48 hours. The system must guarantee the post-hoc review actually happens.

### Transfer (Role Change -- Mover)

The hardest lifecycle event. On an HR position-change event, the system performs a delta calculation: new-role entitlements minus old-role entitlements equals additions and removals. Additions follow the standard request path (possibly auto-approved as birthright). Removals are flagged for the new manager to confirm -- some access from the old role may still be legitimately needed. Without active revocation, users accumulate access from every role they have ever held. This is the dominant source of privilege creep.

### Offboard (Leaver)

Disables authentication across all identity providers (SSO sessions invalidated, OAuth tokens revoked, VPN certificates disabled). Deprovisions all Access Grants across all Target Systems. Transfers ownership of shared resources (mailboxes, service accounts, team drives). Archives identity record for retention. Authentication disablement must be near-immediate (minutes); full deprovisioning may take hours across all systems. Must handle the case where the departing identity has pending approval tasks assigned to them (reassignment).

## 5. System Boundaries

### Inbound -- What Calls or Triggers This System

| Caller | Interface | Volume | Expectations |
|--------|-----------|--------|--------------|
| Self-service portal | Internal web UI + REST/GraphQL API | 100s-1000s requests/day | Real-time submission, immediate risk assessment feedback |
| ServiceNow ITSM | REST Table API / Service Catalog API; bi-directional sync on `sc_req_item` | 100s/day | RITM state must reflect request lifecycle; users watch ticket status |
| Jira Service Management | REST API v2/v3; webhook on issue creation/transition | 10s/day | Issue state must reflect request lifecycle |
| Workday (HR events) | RaaS REST API or Integration Cloud; polling (15-60 min interval) | 10s-100s events/day | Authoritative for JML events; termination events must propagate within minutes |
| BambooHR | REST API v1; webhook on employee changes | 10s events/day | Simpler data model; webhook-driven |
| Programmatic API | REST/gRPC | Variable | For automation, Terraform, CI/CD requesting service account access |

### Outbound -- What This System Depends On

| Dependency | Interface | Reliability Profile | Failure Modes |
|------------|-----------|---------------------|---------------|
| Okta | Management API (REST, OAuth 2.0) | 1,000 req/min org-wide; 99.99% SLA | Token expiration, 429 rate limiting with Retry-After, eventual consistency on group membership |
| Azure AD / Entra ID | Microsoft Graph API (REST, OAuth 2.0) | Per-app/per-tenant throttling; 429 with variable Retry-After | Directory replication lag across tenants (minutes), throttling |
| Active Directory (on-prem) | LDAP/LDAPS (RFC 4511) | No rate limit; 120s default timeout | Replication lag between domain controllers (minutes to hours), 5MB transaction size limit, batch >1500 group members can fail |
| AWS IAM | IAM/STS API (REST, SigV4) | 600 req/s per account/region for STS | Globally eventually consistent (IAM policy propagation up to 60s), throttling (exponential backoff required) |
| GCP IAM | Cloud Resource Manager API (REST, OAuth 2.0) | 1,500 principals per allow policy | Policy size limits, eventual consistency |
| PostgreSQL | SQL over TLS (libpq) | Connection pool constrained | GRANT/REVOKE require appropriate privileges; role existence must be pre-checked |
| SaaS apps (generic) | SCIM 2.0 (REST, Bearer token) | 429 with Retry-After per RFC 7644; limits vary wildly | Schema incompatibilities (SCIM compliance varies), partial attribute support |
| CyberArk PAM | REST API (HTTPS, session token) | Session-based; undocumented limits | Session token expiration, vault availability |
| ServiceNow (fulfillment) | REST Table API | Same as inbound | "Provisioning" is creating a ticket; completion depends on human action (hours to days) |

### Trust Boundaries

**Within the system:** Not all identities can request all entitlements (catalog visibility scoped by department/role). Approvers are scoped to specific entitlements and risk levels. Policy authoring is a privileged operation. Audit log access is itself audited. Break-glass activation is restricted to pre-designated identities.

**Sensitive data:** PII in identity records (GDPR, CCPA). Credential material during provisioning (temporary passwords, API keys) -- must never be persisted in logs, encrypted in transit/at rest with minimal lifetime. Connector credentials (OAuth tokens, LDAP bind passwords) are the keys to the kingdom. SoD policy rules reveal the organization's control framework.

**Multi-tenant isolation (if SaaS):** Hard isolation boundary. Each tenant's identities, entitlements, grants, policies, and audit logs completely isolated. Connector credentials must never be accessible cross-tenant.

## 6. What Goes Wrong

### Common and Expected Failures (Handle Gracefully)

**Provisioning connector timeout or rate limiting.** Every external integration will intermittently fail. Okta returns 429, AWS IAM throttles, AD connections drop. The system must retry with exponential backoff and jitter, report per-target-system status independently, and fall back to manual fulfillment (ITSM ticket) when retries are exhausted.

**Approver unavailable.** Managers go on vacation, take sick leave, or leave the organization with pending tasks. Delegation, escalation timers, and fallback approvers must be configured per policy. Without them, requests stall indefinitely -- the #1 cause of poor user experience.

**SoD conflicts on legitimate requests.** An employee genuinely needs conflicting entitlements for their role. The system must allow exception approval with documented justification, compensating controls, and an extended approval chain (compliance officer review). These exceptions are expected and must be auditable, not treated as errors.

**Duplicate and redundant requests.** Users re-submit when they don't see progress, or request access they already hold through a different role. Deduplication by composite key (beneficiary + resource + access level + overlapping time window) prevents waste.

### Rare but Catastrophic Failures (Prevent or Guarantee Recovery)

**Orphaned accounts after termination.** A former employee retains active access because deprovisioning failed on one or more target systems. The cost: 89% of former employees in one study retained access to sensitive apps post-departure. Gulf Coast Pain Consultants was fined $1.19M when a former contractor accessed their EMR. Cash App paid $15M settling a breach from a fired employee. The system must guarantee complete deprovisioning -- retry indefinitely, escalate to human operators, and alert until every target system confirms revocation.

**Audit trail gaps.** A period where operations occurred but audit events were not recorded. During SOX audit, this creates an unrecoverable material weakness finding. If audit write fails, the operation must fail. There is no acceptable tradeoff here.

**Concurrent SoD bypass.** Two conflicting access requests approved simultaneously because the SoD check at submission time didn't account for the other in-flight request. This requires serializable evaluation of SoD constraints against the identity's current grants plus all pending requests.

**Connector credential compromise.** An attacker gains access to the OAuth tokens or LDAP bind passwords used for provisioning and can provision arbitrary access. Connector credentials must be rotated, encrypted, scoped to minimum necessary permissions, and never logged.

### Partial Completion Inconsistency

A multi-entitlement request where some target systems were provisioned and others failed. The Access Grant records diverge from the user's expectations. The request is neither fully complete nor cleanly failed. Each line item must track independent provisioning status, and the user must see per-system status rather than a misleading aggregate.

### Critical Invariants

- **SoD rules must never be silently violated.** Every SoD conflict must be either blocked or explicitly approved with documented exception.
- **Deprovisioning on termination must be complete.** No orphaned access. No target system skipped.
- **Audit trail must be continuous and immutable.** No gaps. No modifications. No deletions.
- **Approval decisions must be exactly-once.** No double-approve. No lost decisions.
- **Provisioning must be idempotent.** Retries must not create duplicate grants.

## 7. Scaling & Constraints

### Volume Projections

| Dimension | Initial | Growth Trajectory |
|-----------|---------|-------------------|
| Identities | 5,000-50,000 | Grows with headcount, M&A, contractor expansion |
| Target systems | 20-50 | SaaS sprawl: ~7.6 new applications/month at large enterprises |
| Access requests/day | 50-500 | Grows with identity count and self-service adoption |
| Entitlements | 5,000-20,000 | Multiplicative with target systems |
| Active grants | 50,000-500,000+ | Identities x entitlements per identity |
| Certification review items/campaign | 50,000-500,000+ | Proportional to active grants in scope |
| Audit events/year | Millions | Every state transition on every entity |

### Business SLAs

| SLA | Target | Source |
|-----|--------|--------|
| Standard request (low risk) | 24h end-to-end | Internal IT policy |
| Standard request (high risk) | 72h end-to-end | Security review depth |
| Emergency/break-glass | 15 minutes to access grant | Incident response requirements |
| Offboarding (involuntary) | Minutes for auth disable; 1 hour for all systems | SOX, HIPAA, PCI-DSS |
| Offboarding (voluntary) | Same-day | SOX, ISO 27001 |
| Certification campaign completion | 14-30 days per campaign | SOX quarterly requirement |
| Audit evidence production | 24 hours for standard reports | External auditor expectations |

### Compliance Requirements

SOX Section 404 (quarterly access certification, SoD controls, documented IT general controls). SOC 2 Type II (6-12 month observation of access controls). HIPAA (need-to-know access to ePHI, documented offboarding). PCI-DSS v4.0 (least privilege, quarterly access reviews, MFA for admin access). NIST 800-53 AC family. ISO 27001:2022 Annex A 5.15-5.18. GDPR Articles 5(1)(f), 15, 17, 32.

### Cost Model

Manual access provisioning: ~$15-22 per ticket. Password resets: ~$70 each (Forrester). Average enterprise: $1.6M and 11,800 hours/year on SOX compliance alone, with 70% spent on administrative tasks. At 25,000-50,000 access requests/year (5,000-person company), manual processing costs $500K-$1M/year in helpdesk labor before accounting for compliance and security costs.

### Natural Partitioning

- **By tenant** (hard isolation if multi-tenant)
- **By target system** (provisioning operations against different systems are independent -- the natural unit of parallelism)
- **By organizational unit** (approval routing, certification, and policy scoping align with org structure)
- **By request** (individual requests are largely independent after SoD evaluation)
- **By time** (audit data naturally time-partitioned; older data to cold storage)

## 8. Human Touchpoints

| Role | Decision Point | What They See | SLA | If They Don't Act |
|------|---------------|---------------|-----|-------------------|
| **End User** | Request composition, justification, appeal, renewal | Access catalog, request form, status dashboard with per-system provisioning detail, denial reasons | N/A (initiator) | Request expires after 30 days in draft |
| **Manager** | Approve/deny (Level 1), mover role-change review, certification | Request with risk context, team member's access footprint, SoD warnings, peer comparison | 12h reminder, 24h escalation | Escalated to manager's manager, then fallback governance role (up to 3 levels) |
| **Resource Owner** | Approve/deny (Level 2), certification for their system | Who wants access, what level, risk score, existing users of the system | 24h reminder, 48h escalation | Escalated to application team lead |
| **IT Security Analyst** | High/critical risk approval (Level 3), SoD exception review, break-glass post-incident review | Full risk assessment, SoD conflict detail, compliance policy results, audit history | 24h for standard, 15min for break-glass | Standard: escalated to CISO. Break-glass: auto-granted with alert |
| **Compliance Officer** | Certification campaign oversight, SoD exception final approval | Campaign completion metrics, exception reports, regulatory mapping | Campaign deadline (14-30 days) | Campaign escalated to CISO; incomplete campaigns flagged as SOX finding risk |
| **IT Helpdesk / System Admin** | Manual provisioning (legacy systems without connectors), provisioning failure remediation | Specific provisioning instructions (SCTASK), error logs from failed automation | 4 business hours | Escalated to helpdesk manager at 4h, IT director at 8h |
| **CISO / Delegate** | Critical risk approval (Level 4), break-glass policy exceptions, escalation backstop | Highest-sensitivity requests, aggregate risk dashboards | 48h for standard critical, 15min for break-glass | No further escalation; request blocked until acted upon |

## 9. Scope Ladder

| Dimension | MVP | +1 | Mature |
|-----------|-----|-----|--------|
| **Request intake** | Self-service web portal with catalog browse | + ServiceNow/Jira integration, HR-triggered auto-requests | + Programmatic API for CI/CD, predictive access recommendations |
| **Approval** | Single-level manager approval | + Multi-level (manager -> owner -> security), SoD warnings | + Risk-based auto-approval for low-risk, ML-based recommendations |
| **Policy engine** | None (all requests to manager) | + SoD rules, risk scoring, configurable routing | + Attribute-based policies, continuous SoD monitoring, policy simulation |
| **Provisioning** | Manual (notification to IT admin) | + Automated connectors for top 20 systems (AD, Okta, AWS, SCIM) | + 50-100+ connectors, JDBC, PowerShell, SSH, RPA for legacy |
| **Deprovisioning** | Manual notification on expiry/revocation | + Automated for connected systems, HR-triggered offboarding | + Same-day offboard guarantee, drift detection and auto-remediation |
| **Certification** | None | + Annual campaigns with reviewer assignment | + Quarterly SOX campaigns, micro-certifications on role change, rubber-stamp detection |
| **Break-glass** | None (use existing ad-hoc process) | + Structured break-glass with compressed approval, time-bound access | + Session recording, auto-revoke, mandatory post-incident review |
| **Audit** | Immutable event log, exportable for auditors | + Structured compliance reports (SOX, SOC 2), query interface | + Auditor portal, continuous compliance monitoring, tamper-evident cryptographic chaining |
| **Identity lifecycle** | Manual identity management | + HR integration (Workday/BambooHR) for JML automation | + Non-human identity governance, ML anomaly detection, JIT access |
| **Target systems** | 0 automated | 20-30 | 50-100+ |
| **Provisioning latency** | Days (manual) | Minutes (automated) | Seconds (real-time for connected systems) |

## 10. Open Questions

1. **Fail-open vs. fail-closed for SoD evaluation.** When the policy engine is unavailable, should access requests be queued (fail-closed, blocking productivity) or approved with a flag for retroactive SoD review (fail-open, creating compliance risk)? This is a risk tolerance decision that must come from the CISO.

2. **Deprovisioning on involuntary termination: pre-notification or post-notification?** Should access be revoked before the employee is told they are terminated (preventing data exfiltration but requiring tight HR-security coordination), or after (standard but creates a window of exposure)? Different organizations have different legal and cultural norms here.

3. **SoD exception duration and renewal.** When an SoD exception is approved with compensating controls, is it permanent (re-evaluated only during certification) or time-bound (requiring periodic re-approval)? If time-bound, what is the maximum duration -- 90 days? 6 months?

4. **Approval delegation depth limit.** Can a delegate further delegate? If so, to how many levels? Each delegation level dilutes accountability. Most organizations allow exactly one level of delegation, but the policy must be explicit.

5. **Provisioning rollback on partial failure.** If a multi-entitlement request provisions 3 of 5 target systems and fails on the other 2, should the successful 3 be rolled back to maintain atomicity, or should they remain provisioned with the failed 2 retried independently? Rolling back is cleaner but slower; keeping partial state is faster but creates inconsistency between what the user can access and what the request status says.

6. **Certification campaign scope: manager-based or application-based?** Manager-based campaigns (each manager reviews their reports' access across all applications) are easier for managers but harder for application owners to oversee. Application-based campaigns (each application owner reviews all users of their application) give better per-system oversight but fragment the review across many owners. Most mature organizations run both, but MVP must choose one.

7. **Non-human identity governance MVP inclusion.** Service accounts and API keys are a growing attack surface (75% lack designated owners, 68% of cloud breaches involve non-human credentials). Should the MVP include non-human identities in the access catalog, or defer this to a later phase? Deferral is simpler but leaves a significant security gap.

8. **Audit log tamper evidence mechanism.** Hash chaining (each event includes a hash of the previous event) provides cryptographic tamper evidence but adds write-path complexity and makes log ingestion sequential. An external tamper-evident ledger (append-only storage with independent integrity verification) is simpler operationally but adds an infrastructure dependency. The choice affects both the audit architecture and the system's compliance posture.
