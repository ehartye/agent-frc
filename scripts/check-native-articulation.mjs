import {compareNativeArticulation} from './native-articulation.mjs';
import {runViewerPairCLI} from './native-viewer-cli.mjs';
runViewerPairCLI({args:process.argv.slice(2),compare:compareNativeArticulation,schema:'agent-frc/native-articulation-result@1',usage:'Usage: check-native-articulation expected-manifest.json observed-receipt.json'});
