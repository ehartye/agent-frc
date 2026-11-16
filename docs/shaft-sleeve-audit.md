# Nominal shaft-to-sleeve audit

Run `npm run audit:interfaces`. The command reads the three original nominal NOTE, CORAL and FUEL fixtures without editing them. Its JSON result pins the actual fixture bytes, identifies the exact researched shaft variant, separates evidence from proposals, and retains blocked engineering acceptance.

The public manufacturer facts embedded in the audit are an original limited summary, not copied drawings or CAD. REV-21-2813 is a 76.2 mm rounded-hex research candidate listed in the MAXPlanetary base kit, not an installed transmission. Manufacturer text specifies 12.7 mm across flats and a 13.75 mm corner circle. Against the existing circular 12.7 mm sleeve bores, the screen finds nominal 1.05 mm diametral interference. No tolerances or physical fit are inferred. It also flags that this short kit shaft cannot be assumed to span the existing sleeves. Stub-shaft or hub arrangements require a separate design.

A larger circular bore alone does not establish torque transfer. The API deliberately cannot return assembly acceptance, even with nominal clearance. Radial support, axial retention and torque transmission remain separate unresolved interfaces. A regular sharp-hex corner calculation must not replace the stated rounded-hex envelope.

Sources inspected 2026-11-16:
- https://www.revrobotics.com/.5in-Rounded-Hex-Shafts/ (REV-21-2813 option, Features and Specifications).
- https://www.revrobotics.com/maxplanetary-system-kit/ (REV-25-2109 kit contents).

These rolling pages have no recorded manufacturer revision or captured-body hash. No seasonal availability, tolerance stack, CAD inspection, physical measurement, load capacity or inventory is established. Source text was reviewed; no vendor asset is redistributed.

The two alternative interface paths in the output are proposals for a new candidate, not substitutions in current simulation inputs. A changed bore, hub, shaft or support must have new geometry, inertia and replay evidence. This tool performs a nominal geometric rejection screen only, not native CAD, robot control, or physical validation.
