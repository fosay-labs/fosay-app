#!/usr/bin/env node
// Runs the TypeScript MCP server through tsx (the workspace ships TypeScript sources).
import { register } from 'tsx/esm/api';

register();
await import('../src/index.ts');
