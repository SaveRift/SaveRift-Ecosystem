#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {createLocalWorkbench} from './local.mjs';

const [command, ...args] = process.argv.slice(2);
const {service, principal} = await createLocalWorkbench();
try {
  let result;
  if (command === 'call') result = await service.dispatch(principal, args[0], JSON.parse(args[1] || '{}'));
  else if (command === 'fixture') {
    const [workspaceId, path] = args, bytes = new Uint8Array(await readFile(path));
    const roleIndex = args.indexOf('--role'), role = roleIndex >= 0 ? args[roleIndex + 1] : 'main';
    const prepared = await service.dispatch(principal, 'saverift_fixture_upload_prepare', {workspaceId, name: basename(path), byteLength: bytes.length, role});
    result = await service.trustedUploadFixture(principal, prepared.uploadId, bytes);
    if (args.includes('--allow-ai-inspection')) result = await service.trustedSetFixtureConsent(principal, workspaceId, result.id, true);
  } else result = {usage: ['saverift-workbench call saverift_template_list', 'saverift-workbench call saverift_workspace_create \'{"template":"synthetic-json","name":"My game"}\'', 'saverift-workbench fixture WORKSPACE_ID FILE [--role ROLE] [--allow-ai-inspection]', 'npm start  # browser workbench on 127.0.0.1:4174'], warning: 'No Xbox commands or public publication are available.'};
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.code || 'REQUEST_FAILED'}: ${error.message}\n`); process.exitCode = 1; }
