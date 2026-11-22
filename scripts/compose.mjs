#!/usr/bin/env node
// Runs `<runtime> compose ...args` with docker or podman, whichever is installed.
// Shell aliases (alias docker=podman) are not visible to pnpm scripts, so detect here.
// Override with CONTAINER_CLI=docker|podman.
import { spawnSync } from 'node:child_process';

const has = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;
const cli = process.env.CONTAINER_CLI ?? ['docker', 'podman'].find(has);

if (!cli) {
  console.error('Docker or Podman not found. Install one of them (see README).');
  process.exit(1);
}

const result = spawnSync(cli, ['compose', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
