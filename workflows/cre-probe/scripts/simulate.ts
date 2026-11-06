// Host launcher only. Workflow code never reads process.env or a credential file.
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const root = resolve(import.meta.dir, '..');
const mode = process.argv[2] ?? 'all';
const allowed = ['all', 'signatures', 'http', 'evm', 'reject-recipient', 'reject-signature'];
if (!allowed.includes(mode)) throw new Error(`Choose ${allowed.join(', ')}`);
mkdirSync(resolve(root, '.build'), { recursive: true });
const configPath = resolve(root, '.build', `config-${mode}.json`);
const config = mode.startsWith('reject-')
  ? { mode: 'signatures', rejectCase: mode === 'reject-recipient' ? 'tampered-recipient' : 'tampered-signature' }
  : { mode };
await Bun.write(configPath, JSON.stringify(config));
const env: Record<string, string> = {};
// Preserve only normal CLI login location and non-secret runtime paths.
for (const name of ['HOME', 'PATH', 'TMPDIR', 'LANG']) {
  const value = process.env[name];
  if (value) env[name] = value;
}
env.PATH = `${root}/node_modules/.bin:${env.PATH ?? ''}`;
const cli = process.env.CRE_PROBE_CLI ?? `${env.HOME}/.cre/bin/cre`;
const command = [cli, 'workflow', 'simulate', '.', '--project-root', root,
  '--target', 'simulation', '--config', configPath, '--trigger-index', '0',
  '--non-interactive', '--env', '/dev/null', '--public-env', '/dev/null', '--limits', 'default'];
console.log(`Simulation only; mode=${mode}; default production limits; no broadcast; empty env files`);
const child = Bun.spawn(command, { cwd: root, env, stdout: 'inherit', stderr: 'inherit', stdin: 'ignore' });
process.exit(await child.exited);
