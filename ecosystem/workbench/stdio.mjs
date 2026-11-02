#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createDeveloperMcpServer} from './mcp.mjs';
import {createLocalWorkbench} from './local.mjs';

const {service, principal} = await createLocalWorkbench();
const handle = serveStdio(() => createDeveloperMcpServer({service, principal}));
process.on('SIGINT', () => { void handle.close(); });
process.on('SIGTERM', () => { void handle.close(); });
