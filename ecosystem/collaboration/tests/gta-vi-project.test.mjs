// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRegistry} from '../projects.mjs';

test('GTA VI is one public game project with one package and both platform targets', async () => {
  const project = createProjectRegistry().get('gta-vi');
  assert.equal(project.packageId, 'saverift.gta-vi');
  assert.deepEqual(project.packageRoots, ['ecosystem/plugins/gta-vi/']);
  assert.deepEqual(project.templateIds, ['plugin-saverift.gta-vi']);
  assert.equal(project.repositoryState, 'configured');
  assert.equal(project.repository.id, '1442896703');
});
