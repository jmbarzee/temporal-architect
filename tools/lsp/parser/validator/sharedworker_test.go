package validator

import "testing"

// Shared-worker joint-ownership regression lock (issue #102).
//
// #102's composition mechanism lets many independently-owned domain packages
// register onto ONE shared worker via a topology-owner file that imports them
// and registers their types through package-qualified refs. The package-aware
// validator (#113) keys coverage on the RESOLVED (package, name) of each worker
// registration (validator.go checkCoverage -> refKey), so this composition
// already validates without the wall of UNCOVERED_* / UNINSTANTIATED_WORKER
// false positives #102 warned about. Nothing pinned that as an explicit
// shared-worker scenario, though — these tests are that regression lock. No
// production code changes; this is a test-only fixture.
//
// The sources below are the shared fixture: two domain packages (each declaring
// its own workflows/activities, one also a nexus service; NO worker/namespace of
// their own) plus a topology-owner package that imports both and declares a
// single shared worker instantiated in one namespace on one task queue.

const swPaymentsDomain = `package payments

workflow Charge(id):
    close complete(id)

activity Settle(id):
    return id
`

const swShippingDomain = `package shipping

workflow Ship(id):
    close complete(id)

activity Pack(id):
    return id

nexus service Fulfillment:
    async Book workflow Ship
`

// Topology owner: one shared worker joint-owning all four domain types across
// the two packages, instantiated in one namespace on one task queue.
const swTopologyOwner = `package topology

import "acme/payments"
import "acme/shipping"

worker fleet:
    workflow payments.Charge
    activity payments.Settle
    workflow shipping.Ship
    activity shipping.Pack
    nexus service shipping.Fulfillment

namespace prod:
    worker fleet
        options:
            task_queue: "fleet-q"
`

// Property 1: a shared-worker topology-owner file over >=2 domain packages
// validates with zero UNCOVERED_WORKFLOW / UNCOVERED_ACTIVITY /
// UNCOVERED_SERVICE / UNINSTANTIATED_WORKER warnings — every domain type is
// covered by the single shared worker (keyed on its resolved package), and the
// worker is instantiated.
func TestSharedWorkerJointOwnershipNoFalsePositives(t *testing.T) {
	errs := Validate(mustMergeAndResolve(t, swPaymentsDomain, swShippingDomain, swTopologyOwner))
	for kind, label := range map[ErrorKind]string{
		ErrUncoveredWorkflow:    "UNCOVERED_WORKFLOW",
		ErrUncoveredActivity:    "UNCOVERED_ACTIVITY",
		ErrUncoveredService:     "UNCOVERED_SERVICE",
		ErrUninstantiatedWorker: "UNINSTANTIATED_WORKER",
	} {
		if got := countKind(errs, kind); got != 0 {
			t.Errorf("expected zero %s in the shared-worker topology, got %d: %v", label, got, errs)
		}
	}
}

// Property 2: a domain slice validated ALONE (no namespace) emits none of those
// coverage warnings. The domain package declares workflows/activities/a service
// but no worker or namespace, so the no-namespace guard (checkCoverage
// early-returns on len(v.namespaces) == 0) suppresses all coverage checks —
// exactly what lets a domain author work on their slice in isolation without a
// wall of "uncovered" noise.
func TestSharedWorkerDomainSliceAloneIsSilent(t *testing.T) {
	for _, domain := range []struct {
		name string
		src  string
	}{
		{"payments", swPaymentsDomain},
		{"shipping", swShippingDomain},
	} {
		t.Run(domain.name, func(t *testing.T) {
			errs := Validate(mustMergeAndResolve(t, domain.src))
			for kind, label := range map[ErrorKind]string{
				ErrUncoveredWorkflow:    "UNCOVERED_WORKFLOW",
				ErrUncoveredActivity:    "UNCOVERED_ACTIVITY",
				ErrUncoveredService:     "UNCOVERED_SERVICE",
				ErrUninstantiatedWorker: "UNINSTANTIATED_WORKER",
			} {
				if got := countKind(errs, kind); got != 0 {
					t.Errorf("expected zero %s validating domain %q alone (no namespace), got %d: %v", label, domain.name, got, errs)
				}
			}
		})
	}
}

// Property 3 (control): a type left off the shared worker STILL produces its
// UNCOVERED_* warning. This proves the clean result in Property 1 is real
// coverage keyed per resolved package — not blanket suppression. Here the
// topology owner registers everything EXCEPT shipping.Pack, so exactly one
// UNCOVERED_ACTIVITY must fire, and only for Pack.
func TestSharedWorkerUncoveredTypeStillWarns(t *testing.T) {
	const topologyMissingPack = `package topology

import "acme/payments"
import "acme/shipping"

worker fleet:
    workflow payments.Charge
    activity payments.Settle
    workflow shipping.Ship
    nexus service shipping.Fulfillment

namespace prod:
    worker fleet
        options:
            task_queue: "fleet-q"
`
	errs := Validate(mustMergeAndResolve(t, swPaymentsDomain, swShippingDomain, topologyMissingPack))

	if got := countKind(errs, ErrUncoveredActivity); got != 1 {
		t.Fatalf("expected exactly 1 UNCOVERED_ACTIVITY (shipping.Pack left off the shared worker), got %d: %v", got, errs)
	}
	if !hasWarning(errs, "activity Pack is not registered on any instantiated worker") {
		t.Errorf("expected the UNCOVERED_ACTIVITY warning to name Pack, got: %v", errs)
	}
	// The rest of the topology is still covered — proving only the genuine gap warns.
	for kind, label := range map[ErrorKind]string{
		ErrUncoveredWorkflow:    "UNCOVERED_WORKFLOW",
		ErrUncoveredService:     "UNCOVERED_SERVICE",
		ErrUninstantiatedWorker: "UNINSTANTIATED_WORKER",
	} {
		if got := countKind(errs, kind); got != 0 {
			t.Errorf("expected zero %s (only Pack should be uncovered), got %d: %v", label, got, errs)
		}
	}
}
