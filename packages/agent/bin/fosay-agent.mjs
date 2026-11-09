#!/usr/bin/env node
// Runs the TypeScript CLI through tsx (the workspace ships TypeScript sources).
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
