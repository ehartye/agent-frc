import {compareViewerControls} from './viewer-controls.mjs';
import {runViewerPairCLI} from './native-viewer-cli.mjs';
runViewerPairCLI({args:process.argv.slice(2),compare:compareViewerControls,schema:'agent-frc/viewer-controls-result@1',usage:'Usage: check-viewer-controls expected-manifest.json observed-receipt.json'});
