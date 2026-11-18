import {compareNativeIdentity} from './native-identity.mjs';
import {runViewerPairCLI} from './native-viewer-cli.mjs';
runViewerPairCLI({args:process.argv.slice(2),compare:compareNativeIdentity,schema:'agent-frc/native-identity-result@1',usage:'Usage: check-native-identity expected-manifest.json observed-receipt.json'});
