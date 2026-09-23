# UVC lab lane

Status: implemented in `/lab`. See [operator runbook](lab-lane-runbook.md) for
current operation and verification.

## Purpose

Exercise the UVC cycle and replication model without physical hardware. Use
independent synthetic identities for Doctor, Lamp, Sensor and Admin. Keep the
professional UVC design: existing logo, restrained green accents, readable
surfaces and a responsive workspace instead of simulated phones or instruments.

## Behavior

- Four isolated ONE workers with a host-switched local mesh. The host only routes
  connections and projects worker data; it does not copy domain records.
- Visible bounded startup and per-pair failure reporting. Success requires the
  exact expected peer instances, not an unrelated active connection.
- Snapshots refreshed by semantic version-head and connection events.
- Lamp owns phase title, target dose, duration and cycle start/close. Doctor
  sees room-cleaning progress and record verification, with technical records
  available in Settings. Room readiness is not inferred from an attestation.
- Explicit simulated energy and irradiance input, review records, team messages,
  journals and role assignments.
- No random readings, timer-derived achieved dose, fake rooms or certification
  claims. A role-attributed review is not a hygiene or compliance certificate.
- All four apps remain in one horizontal row. Narrow windows scroll sideways.
  Each app has independent scrolling, Settings and a header theme control.
  Dark mode recolors logo lettering while preserving the original green checkmark.
- Lazy same-person device invitations through the separate CommServer path.
  Invitation links start one joining worker, validate the owner and preserve
  other active browser storage sessions.
- Excel extracts under Settings → Data. Scope and recent-tail limits are explicit;
  a read error must not become an empty successful export.

## Boundaries

This lane is a development environment, not a medical device controller,
measurement instrument, production identity manager or compliance report.
The main app owns product memory and device settings. Reference architecture is
current `amway.lab` / `ek.lab` and their browser lanes in the sibling Projektor
repository; UVC continues using its canonical `../one` dependencies.
