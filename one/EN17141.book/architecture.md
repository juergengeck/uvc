# Architecture and ownership

## Direction of truth

`EN17141.book` is authored domain ground. VGER may refine, mount, cite, and
reason from it, but VGER does not become the authority for the standard or for
a facility's quality system.

```text
licensed EN 17141 + local regulatory obligations
        ↓ interpreted and approved by the deploying organization
facility contamination-control program and controlled procedures
        ↓ represented by typed operational evidence
UVC and laboratory producers
        ↓ exact observations, results, decisions, and provenance
facility-owned compliance evidence graph

tracked one/EN17141.book authored source
        ↓ source.git inventory at an exact Git checkpoint
Source + SourceEntry + SourceRun
        ↓ source.core refinement boundary
BookProjection + Book + Library
        ↓ mounted by VGER
planning, implementation, review, citation, and verification support
```

The two paths meet through typed references and requirements. Handbook prose
does not become operational evidence, and operational evidence does not rewrite
the handbook.

## Ownership

- `one/EN17141.book` owns the stable Book identity, authored requirements,
  domains, and source boundary.
- `@refinio/biocontamination.core` owns the reusable program, applicability,
  risk, monitoring, sampling, microbiology, limits, excursions, CAPA, trend,
  review, storage-root, and quality-operation model.
- `@refinio/uvc.core` owns UV-C treatment configuration, safety, dose,
  intervention authorization/execution, physical-delivery assessment, and the
  adapter into the biocontamination program.
- Device authorities own command/readback observations.
- Laboratory and sampling producers own microbiological observations and
  results.
- Facility quality authorities own applicability, approvals, limits,
  investigations, CAPA, and review decisions.
- `source.git` owns Git discovery, tracked-file inventory, and checkpoint
  locators.
- `source.core` owns runtime Book, projection, source, run, and library objects.
- VGER consumes the Book through its normal Book materialization, mounting,
  lineage, and citation surfaces.

## Stable identity

The stable authored and runtime identity is `EN17141.book`. A new Git commit,
new source run, or changed refinement advances the same Book identity. It does
not create another Book solely because the source changed.

The Book source folder does not define a new ONE recipe. Runtime state reuses
the existing `source.core` Book family. Quality evidence and UVC intervention
evidence use recipes owned by their respective domains because they have
different authority, retention, and distribution requirements from the
handbook and from each other.
## Access and publication

A projection is not an access-control boundary. Regulatory interpretation,
engineering implementation, facility-controlled procedures, and operational
evidence may require different readers. The initial Book contains only authored
requirements safe for the repository. Facility records and licensed standard
text must not be added to this authored source.
