# UVC Biocontamination-Control Lane

## Status

UVC product correlation with the requirements owned by `EN17141.book`.

## Normative base

The lane is based on **EN 17141:2020, _Cleanrooms and associated controlled
environments — Biocontamination control_**. For German deployments, the
corresponding adoption is DIN EN 17141:2021-02.

This document does not reproduce the standard or replace a licensed copy. Each
deploying organization must identify the controlled environments to which the
standard applies, record the applicable edition, and connect its approved local
contamination-control strategy, procedures, limits, and responsibilities.

Public standard records:

- [BS EN 17141:2020](https://knowledge.bsigroup.com/products/cleanrooms-and-associated-controlled-environments-biocontamination-control)
- [DIN EN 17141:2021-02](https://www.dinmedia.de/de/norm/din-en-17141/312457370)

## Product purpose

The authored [`one/EN17141.book`](../one/EN17141.book/README.md)
package is the stable requirements boundary for managing biocontamination
control in medical-facility clean and controlled environments. It connects the
facility's approved control strategy to qualification, monitoring, trends,
excursions, investigations, actions, and review.

`uvc.book` remains the UVC product and device-implementation boundary. VGER may
mount both books in a workload, but neither book is treated as a substitute for
the other.

UVC is one possible controlled intervention in that program. A completed UVC
run is not microbiological evidence and does not by itself demonstrate
conformance to EN 17141.

## Applicability boundary

Applicability is declared per facility environment; it is never inferred from a
room name or facility type. A declaration identifies:

- the facility and controlled environment;
- intended use and contamination risk;
- applicable standard edition and local regulatory context;
- the approved contamination-control strategy and procedures;
- accountable roles and approval authority;
- the period for which the declaration is valid.

Ordinary spaces outside the declared clean or controlled environment may use
infection-prevention workflows, but they must not be presented as EN 17141
evidence unless applicability has been established by the responsible
organization.

## Evidence model

The lane keeps these meanings distinct:

1. **Program authority** — applicability, approved strategy, procedures,
   responsibilities, review interval, and change control.
2. **Environment definition** — facility, zone, process, reference state,
   contamination risks, and relevant operating conditions.
3. **Qualification and verification** — approved protocol, method, location,
   acceptance criteria, result, reviewer, and source records.
4. **Routine monitoring** — monitoring plan, sampling event, method, location,
   observation, result, alert/action criteria, and provenance.
5. **Interpretation and trend** — scoped assessment over referenced results,
   with method, period, author, and confidence visible.
6. **Excursion handling** — detected excursion, investigation, containment,
   corrective or preventive action, effectiveness check, and closure authority.
7. **Controlled intervention** — intervention plan and execution evidence,
   including a UVC run when selected by the approved strategy.

Every conclusion references its observations. Corrective actions reference the
excursion or investigation that authorized them. Reviews reference the complete
evidence set they assessed.

## UVC intervention boundary

A UVC intervention records, at minimum:

- the controlled environment and approved procedure;
- device identity, configuration, and authorization;
- operator or controlling peer identity;
- planned target, exclusion/safety state, start, end, and termination reason;
- commanded output and separately observed device or I/O state;
- relevant sensor observations and their provenance;
- deviations, interruptions, and linked follow-up actions.

Device authority and readback prove only what the device layer observed. They
must not be transformed into a microbiological result, a successful
decontamination claim, or a standards-conformance claim. Effectiveness claims
require the microbiological methods, observations, review, and authority
defined by the approved contamination-control program.

## Integrity rules

- Do not create a single `compliant` flag. Preserve the applicable edition,
  evidence, criteria, reviewer, and decision.
- Do not invent missing limits, sampling locations, baselines, authorities, or
  results.
- Do not substitute commanded state for observed state.
- Do not substitute device telemetry for viable microbiological observations.
- Do not silently merge evidence from different environments, methods, states,
  or review periods.
- Missing or contradictory authority, provenance, or observation leaves the
  relevant assessment incomplete and visible.
- Superseded strategies and procedures remain attributable to the evidence
  produced under them.

## Book materialization

`one/EN17141.book` contains the EN 17141 PRD and its architecture,
evidence-model, control-logic, and validation documents. The folder path is the
stable authored Book boundary. VGER selects those documents and derives
`Source`, `SourceEntry`, `SourceRun`, `BookProjection`, `Book`, and `Library`
objects from the tracked source at a specific Git commit.

`uvc.book` separately contains the existing UVC device-authority,
integration-test, deployment, discovery, application, and Cube/Groov
documentation selected by `ProductBookService`.

Later implementation slices should introduce typed ONE objects for the evidence
model above. Reusable program, monitoring, microbiology, excursion, CAPA, and
review objects belong to `@refinio/biocontamination.core`; UV-C-specific
authorization, execution, safety, dose, and physical-delivery objects belong
to `@refinio/uvc.core`. Their stable identities and references must preserve
facility, environment, method, authority, and provenance rather than
flattening the program into UI state or free-form journal text.
