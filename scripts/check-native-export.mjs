import {compareNativeExport} from './native-export.mjs';
import {runViewerPairCLI} from './native-viewer-cli.mjs';
runViewerPairCLI({args:process.argv.slice(2),compare:compareNativeExport,schema:'agent-frc/native-export-result@1',usage:'Usage: check-native-export expected-manifest.json observed-receipt.json'});
