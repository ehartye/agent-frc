/**
 * The path and secret scan, for the plugin's own CI and for the publication check. The scan itself is
 * templates/project-ci/scan.mjs, the one file a project copies: there is one implementation.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {main} from '../templates/project-ci/scan.mjs';

export * from '../templates/project-ci/scan.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
