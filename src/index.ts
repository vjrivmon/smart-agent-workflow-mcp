#!/usr/bin/env node
/**
 * Smart Agent Workflow MCP
 *
 * The only MCP that enforces tests before merge.
 * Full-cycle development automation with testing gates and knowledge graph memory.
 *
 * @author Vicente Rivas Monferrer
 * @license MIT
 */

import { runServer } from './server.js';

runServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
