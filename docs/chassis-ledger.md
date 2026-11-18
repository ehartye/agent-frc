# Estimate chassis coverage and mass

Record the selected manufacturer's part number, assembly configuration and exact source revision. Attach a source or an explicitly labeled design assumption to each dimension and mass. Give each component a stable identity, placement frame, interface and inclusion status. Unknown mass remains an open measurement.

Use the validators in `scripts/chassis-ledger.mjs` to check the input shape and summarize which components contribute to the estimate. Review omitted mechanisms, wiring, fasteners and service additions before using a subtotal to size a drivetrain. Re-run after a placement or source revision changes.
