# Evidence model requirements

## Separation of meanings

The model preserves four independent state families:

1. Device execution: planned, running, executed, failed, or cancelled.
2. Physical delivery: not assessed, pending, meets procedure, deviates from
   procedure, or inconclusive.
3. Microbiological assessment: not assessed, pending, acceptable, alert
   excursion, action excursion, out of specification, or inconclusive.
4. Program review: draft, approved, effective, superseded, withdrawn, or
   expired.

No producer or projection may collapse these meanings into a `compliant`,
`disinfected`, or `sterile` flag.

## Stable authority and configuration

Versioned objects represent continuing facility-controlled identities and
approved revisions:

- compliance program and applicability declaration;
- controlled environment, zone, process, and reference state;
- contamination-control strategy;
- contamination source and transfer-route assessment;
- microbiological risk assessment;
- environmental-monitoring plan;
- monitoring location and schedule;
- sampling and analytical method;
- target, alert, action, and specification limits;
- controlled intervention procedure;
- equipment status, calibration, and verification;
- personnel qualification and scope;
- investigation, CAPA, trend review, and periodic review.

Identity fields remain compact and stable. Approval, effective dates,
supersession, and withdrawal advance versions rather than overwriting history.

## Exact evidence

Immutable evidence records exact events and inputs:

- approval and authorization attempts;
- sample identity and append-only custody events;
- collection conditions and operating state;
- incubation, enumeration, isolate identification, and raw result evidence;
- UVC command, readback, configuration, sensor, and termination observations;
- physical-delivery assessments;
- limit evaluations and excursion detections;
- investigation observations, containment, CAPA actions, and effectiveness
  checks;
- trend inputs, calculation versions, conclusions, and review signatures.

Exact evidence uses `referenceToObj` for the specific revisions consumed.
Continuing authorities use `referenceToId`. A producer writes output and
provenance references when it commits the object; downstream code does not
reconstruct them through storage scans.

## Settled context

At sample, result, intervention, and decision time, the producer binds the
applicable:

- program and applicability revision;
- environment and operating state;
- risk and monitoring-plan revision;
- location, schedule, method, and current limits;
- equipment verification state;
- operator or reviewer qualification;
- controlled procedure and authorization;
- source observations and timestamps.

Later reads use these settled references. Mutable master data must not
retroactively change the interpretation of historical evidence.

## Distribution roots

The shared compliance graph uses program-owned versioned roots and recipe
declared references. Grant the stable root identity before publishing dependent
content. CHUM recursively follows the typed graph; do not add per-child grants,
JSON envelopes, retry scans, or journal-only substitutes to hide a broken
graph.
