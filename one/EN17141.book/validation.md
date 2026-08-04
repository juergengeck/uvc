# Validation requirements

## Handbook validation

The authored Book is valid when:

- its stable identity is the `one/EN17141.book` authored source boundary;
- every required source path exists under that boundary;
- the PRD, architecture, evidence model, logic, and validation documents are
  selected from tracked Git content;
- VGER materialization records the exact Git checkpoint and selected
  `SourceEntry` objects in a successful `SourceRun`;
- the stable `BookProjection` advances without replacing the Book identity;
- `Book` and `Library` are stored through `source.core`;
- lineage can resolve from the mounted Book back to source entries and run.

Dirty or untracked files are not evidence for a materialized checkpoint.

## Recipe and creator tests

Every compliance recipe must be registered and tested for:

- correct stable identity fields;
- branded `referenceToId` and `referenceToObj` relationships;
- required authority and provenance;
- effective/expiry interval validation;
- illegal state transitions;
- incompatible units, methods, scopes, or operating states;
- missing or ambiguous inputs;
- immutable evidence and append-only custody behavior.

## Plan and logic tests

Tests must demonstrate:

- applicability cannot be inferred;
- effective revision selection returns exactly one revision or fails closed;
- rejected intervention authorization never energizes hardware;
- accepted authorization binds exact plan, procedure, qualification, equipment,
  and precondition evidence;
- device execution cannot produce a physical or microbiological claim;
- results bind exact limits and produce correct excursion classes;
- investigations cannot close without required CAPA/effectiveness evidence;
- trend calculations reject incompatible series;
- periodic reviews expose unresolved or missing evidence.

## Distribution and restart tests

Four-instance tests must prove that program roots and their recipe-declared
children synchronize through CHUM, remain attributable after restart, and
reopen from producer-owned registries without whole-store scans. Missing
children are treated as recipe, access, or feed-forward defects—not repaired by
granting every child.

## Physical and microbiological validation

Software tests cannot validate UV-C delivery, recovery efficiency, sampling
methods, media, incubation, enumeration, isolate identification, or facility
limits. Those require approved protocols, qualified personnel, calibrated and
verified equipment, suitable reference standards, objective records, and the
deploying organization's quality-system approval.

Acceptance of the software means it preserves those records and decisions
without changing their meaning. It does not certify the underlying process.
