# Experimental studies and verification scope

The strategy, contact, retention, acquisition and target studies are preserved exploratory implementations. Their checked-in receipts describe particular historical source and runtime identities. Integrating the implementations does not renew those receipts or establish physical acceptance.

## Current portable checks

Run `npm test` and `npm run validate` from the repository root. The integration checkpoint passes 273 Node tests and validates ten skills plus both compatibility manifests. These checks cover the portable plugin; they do not execute the Java/native experiments.

## Historical and native checks

The Python `scripts/test-*.py` files include tests that reproduce historical receipts or require separately obtained native geometry. Running every file against one current checkout is not a supported all-green regression command: several receipts deliberately pin earlier versions of shared source and `build.gradle`.

An integration audit ran 56 Python test files: 33 passed and 23 failed. The failures reported historical source/runtime hash mismatches or unavailable native inputs. They remain failures, not skips or renewed evidence. In particular, tests for acquisition, catcher supervision, integrated prototypes, season handoffs and powered targets cannot certify the current combined source from their old receipts. The MAXLift and retained-pregrip native tests require their documented supplier geometry; wheel extraction requires an explicitly selected `FRC_WHEEL_STEP`.

For a fresh experiment, select an existing compatible JDK and populated WPILib cache, supply the documented native inputs, and run the experiment's runner into a new output directory. Preserve its complete dependency inventory, runtime classes, logs and negative controls. Do not overwrite an old receipt or replace its hashes with current values. If reproducing historical evidence, reconstruct its exact reviewed source and inputs separately, following [the historical verification contract](simulator-equivalence.md#current-tests-and-historical-evidence-are-different-questions).

No fresh Java/native trajectory replay, hardware calibration, whole-robot acceptance or robot deployment is claimed by this integration. The library and example code remain available for bounded experiments with explicit source and environment requirements.
