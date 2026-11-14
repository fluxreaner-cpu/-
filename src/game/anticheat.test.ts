import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  LEGACY_PROFILE_KEY,
  MaskedIntVault,
  VAULT_STORAGE_KEY,
  checkStorageIntegrity,
  sealProfileEnvelope,
  sha256Hex,
  unsealProfileEnvelope,
} from './anticheat';

test('pure-JS sha256Hex matches Node crypto SHA-256 identically', () => {
  for (const sample of ['', 'abc', 'Тёмная Чаща · manifest', 'a'.repeat(200)]) {
    const expected = crypto.createHash('sha256').update(sample, 'utf8').digest('hex');
    assert.equal(sha256Hex(sample), expected);
  }
});

test('sealProfileEnvelope encrypts coins/trophies so plaintext keys and values are absent, and rejects tampering', () => {
  const sealed = sealProfileEnvelope({
    coins: 77777,
    trophies: 19,
    playerLevel: 8,
    xp: 432,
    ownedWeapons: ['rusty_pistol', 'shotgun'],
    tutorialStep: 'done',
    tutorialVersion: 2,
  });

  // Plaintext keys and values must NEVER appear in the serialized blob
  assert.equal(sealed.includes('coins'), false);
  assert.equal(sealed.includes('77777'), false);
  assert.equal(sealed.includes('trophies'), false);
  assert.equal(sealed.includes('rusty_pistol'), false);

  const unsealed = unsealProfileEnvelope(sealed);
  assert.equal(unsealed.status, 'ok');
  if (unsealed.status === 'ok') {
    assert.equal(unsealed.data.coins, 77777);
    assert.equal(unsealed.data.trophies, 19);
    assert.equal(unsealed.data.playerLevel, 8);
    assert.equal(unsealed.data.xp, 432);
    assert.deepEqual(unsealed.data.ownedWeapons, ['rusty_pistol', 'shotgun']);
  }

  // Flipping one character in MAC or ciphertext triggers SEC-SAVE-TAMPER
  const env = JSON.parse(sealed) as { v: number; n: string; d: string; s: string };
  const mutatedMac = (env.s[0] === 'a' ? 'b' : 'a') + env.s.slice(1);
  const tamperedMac = unsealProfileEnvelope(JSON.stringify({ ...env, s: mutatedMac }));
  assert.equal(tamperedMac.status, 'tampered');
  if (tamperedMac.status === 'tampered') {
    assert.equal(tamperedMac.violation.code, 'SEC-SAVE-TAMPER');
  }

  // Plaintext JSON injection triggers SEC-SAVE-TAMPER
  const plaintextAttempt = unsealProfileEnvelope(JSON.stringify({ coins: 999999 }));
  assert.equal(plaintextAttempt.status, 'tampered');

  // Empty storage is clean
  assert.equal(unsealProfileEnvelope(null).status, 'empty');
  assert.equal(unsealProfileEnvelope('').status, 'empty');
});

test('MaskedIntVault obfuscates values in RAM and triggers SEC-RAM-GUARD on direct memory tampering', () => {
  let caughtCode: string | null = null;
  const vault = new MaskedIntVault((v) => {
    caughtCode = v.code;
  });

  vault.set('c', 12345);
  vault.add('c', 55);
  vault.set('t', 7);
  assert.equal(vault.get('c'), 12400);
  assert.equal(vault.get('t'), 7);
  assert.equal(vault.verifyAll(), true);
  assert.equal(caughtCode, null);

  // Raw JSON dump of vault slots must not expose 12400 directly
  const serializedVault = JSON.stringify(vault);
  assert.equal(serializedVault.includes('12400'), false);

  // Simulate external memory poke directly on internal slot
  const rawSlots = (vault as unknown as { slots: Record<string, { _p: number }> }).slots;
  rawSlots.c._p += 99999;
  assert.equal(vault.verifyAll(), false);
  assert.equal(caughtCode, 'SEC-RAM-GUARD');
});

test('checkStorageIntegrity flags legacy plaintext injection and cheat keys while allowing sealed saves', () => {
  const map = new Map<string, string>();
  const mockStorage: Pick<Storage, 'getItem' | 'length' | 'key'> = {
    getItem: (k: string) => map.get(k) ?? null,
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };

  map.set(VAULT_STORAGE_KEY, sealProfileEnvelope({ coins: 250, playerLevel: 2 }));
  assert.equal(checkStorageIntegrity(mockStorage), null);

  // Injecting plaintext legacy save triggers tamper
  map.set(LEGACY_PROFILE_KEY, JSON.stringify({ coins: 999999 }));
  assert.equal(checkStorageIntegrity(mockStorage)?.code, 'SEC-SAVE-TAMPER');

  map.delete(LEGACY_PROFILE_KEY);
  assert.equal(checkStorageIntegrity(mockStorage), null);

  // Injecting cheat tool key triggers tamper
  map.set('mod_coins', '999999');
  assert.equal(checkStorageIntegrity(mockStorage)?.code, 'SEC-SAVE-TAMPER');
});
