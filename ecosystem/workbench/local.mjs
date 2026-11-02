// SPDX-License-Identifier: Apache-2.0
import {createDirectoryStore} from './directory-store.mjs';
import {createWorkspaceService} from './service.mjs';
import {createIsolatedExecutor} from './executor.mjs';
import {DEFAULT_SCOPES} from './tool-definitions.mjs';
import {resolve} from 'node:path';
import {localTemplates} from './local-templates.mjs';
export const LOCAL_PRINCIPAL = Object.freeze({id: 'local-developer', scopes: [...DEFAULT_SCOPES]});
export async function createLocalWorkbench({directory = process.env.SAVERIFT_WORKBENCH_DIR || resolve('.saverift-workbench'), schedule} = {}) {
  const store = await createDirectoryStore(directory);
  const service = createWorkspaceService({store, executeJob: createIsolatedExecutor(), schedule, templates: await localTemplates()});
  return {store, service, principal: LOCAL_PRINCIPAL};
}
