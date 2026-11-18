import {compareNativeRevision} from './native-revision.mjs';
import {runViewerPairCLI} from './native-viewer-cli.mjs';
runViewerPairCLI({args:process.argv.slice(2),compare:compareNativeRevision,schema:'agent-frc/native-revision-result@1',usage:'Usage: check-native-revision expected-manifest.json observed-receipt.json'});
