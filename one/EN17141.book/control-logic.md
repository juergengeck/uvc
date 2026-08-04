# Control and evaluation logic requirements

## Applicability

Applicability is an explicit, approved facility decision. It is not inferred
from room names, facility labels, device types, or the existence of this Book.
Every evaluation resolves one effective applicability declaration for the
environment and time in question. Missing, ambiguous, expired, or contradictory
authority produces an incomplete result.

## Effective revision binding

Controlled work selects revisions using program, scope, validity interval,
approval state, and supersession relationships. Selection must return exactly
one applicable revision. Zero or multiple effective candidates fail closed and
are visible to the operator.

## Intervention authorization

Starting a controlled intervention requires:

- an approved intervention plan and exact procedure revision;
- applicable program and environment authority;
- current operator qualification for the action and scope;
- verified equipment status;
- satisfied safety and exclusion preconditions;
- exact evaluated evidence references;
- an immutable accepted authorization attempt.

A rejected attempt is also evidence. It records the requested plan, actor,
evaluated facts, decision, reason codes, and time without energizing hardware.
Generic device-control operations cannot be presented as controlled treatment.

## Observation and result processing

Sampling and results follow explicit state machines. Custody events append;
they do not rewrite the sample. Result evaluation compares an exact result
against the exact method-, location-, state-, and time-specific limit revision
bound at production time.

The evaluator preserves target, alert, action, and specification outcomes
separately. Missing limits, incompatible units, invalid methods, unresolved
custody, expired equipment status, or absent qualifications produce explicit
incomplete or inconclusive outcomes.

## Excursions and OOS

An alert, action, or specification breach creates a typed excursion or OOS
root. It cannot be cleared by editing the result or changing a limit. Closure
requires the configured investigation, containment, impact assessment,
corrective/preventive action, effectiveness verification, and qualified
approval. All conclusions reference the evidence reviewed.

## Trending and periodic review

Trend calculations only combine compatible environment, location, method,
sample type, operating state, units, and limit context. The trend record binds
the exact input result versions and calculation/rule version. A qualified
reviewer signs the conclusion; the software does not infer an acceptable
program from a chart.

Periodic review resolves the complete governed evidence set for its interval,
including deviations, exclusions, unresolved contradictions, changes,
excursions, CAPA, effectiveness checks, and overdue work.

## Product claims

Projections may state what evidence exists and what a qualified decision says.
They may not upgrade:

- command to readback;
- readback to delivered physical dose;
- physical delivery to microbiological reduction;
- microbiological result to program conformance;
- a mounted Book to facility compliance.
