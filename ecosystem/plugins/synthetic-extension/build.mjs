import {fileURLToPath} from 'node:url';
import {buildCustomUi} from '../../ui/build-ui.mjs';
const here = fileURLToPath(new URL('.', import.meta.url));
await buildCustomUi({entry: here + 'ui/index.mjs', outputDirectory: here + 'ui/dist'});
