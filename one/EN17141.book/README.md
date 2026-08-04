# EN17141.book

`EN17141.book` is the authored requirements and implementation handbook for
systems that preserve evidence for an EN 17141 biocontamination-control
program.

The Book is owned here, next to the UVC domain that first implements it. Its
content is broader than UV-C: it covers facility applicability, program
authority, contamination risks and transfer routes, environmental monitoring,
measurement methods, limits, trends, excursions, investigations, CAPA,
competence, and periodic review. UV-C is represented only as one possible
controlled intervention.

The reusable quality model belongs to `@refinio/biocontamination.core`.
`@refinio/uvc.core` owns only UV-C-specific intervention evidence and its typed
bridge into that model. Inventory and supply systems may provide referenced
equipment, material, lot, location, or custody facts; they do not own the
quality decisions defined by this Book.

## Book boundary

The top-level `one/EN17141.book` folder is the tracked source boundary:

- `EN17141-PRD.md` is the product requirements baseline.
- `architecture.md` defines ownership and the path into VGER.
- `evidence-model.md` fixes the evidence graph and identity boundaries.
- `control-logic.md` defines fail-closed evaluation and workflow rules.
- `validation.md` defines the proof required before product claims.

VGER builds upon this authored source. It inventories the tracked files at a
Git checkpoint and materializes the corresponding `source.core` objects,
including `Source`, `SourceEntry`, `SourceRun`, `BookProjection`, `Book`, and
`Library`.

## Authority boundary

This Book does not reproduce EN 17141 and is not a certification. A deploying
organization must use a licensed copy of the applicable standard, declare its
facility-specific applicability, and supply approved procedures, methods,
limits, qualifications, and quality-system records.

Mounting the Book makes its requirements available to VGER. It does not prove
that a facility, process, device, UVC cycle, or software system conforms.
