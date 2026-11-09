import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { generateAgentKey, keyInfo, loadAgentSecret } from '../keys';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fosay-keys-'));

describe('agent keys', () => {
  it('generates a 0600 key file in a 0700 directory and reloads it', () => {
    const file = path.join(tmp(), 'nested', 'agent.key');
    const info = generateAgentKey(file);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    const secret = loadAgentSecret({ FOSAY_AGENT_KEY_FILE: file });
    expect(keyInfo(secret)).toEqual(info);
    expect(info.publicKeyHex).toHaveLength(64);
  });

  it('refuses to overwrite, to load world-readable files, and bad secrets', () => {
    const dir = tmp();
    const file = path.join(dir, 'agent.key');
    generateAgentKey(file);
    expect(() => generateAgentKey(file)).toThrow(/already exists/);
    fs.chmodSync(file, 0o644);
    expect(() => loadAgentSecret({ FOSAY_AGENT_KEY_FILE: file })).toThrow(/readable by others/);
    expect(() => loadAgentSecret({ FOSAY_AGENT_SECRET: 'SBAD' })).toThrow(/not a valid/);
    expect(() => loadAgentSecret({ FOSAY_AGENT_KEY_FILE: path.join(dir, 'missing') })).toThrow(
      /no agent key/,
    );
  });

  it('prefers FOSAY_AGENT_SECRET and never puts the secret in errors', () => {
    const kp = Keypair.random();
    expect(loadAgentSecret({ FOSAY_AGENT_SECRET: kp.secret() })).toBe(kp.secret());
    try {
      loadAgentSecret({ FOSAY_AGENT_SECRET: `${kp.secret()}X` });
    } catch (e) {
      expect(String(e)).not.toContain(kp.secret());
    }
  });
});
