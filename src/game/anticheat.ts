/**
 * Anti-cheat, save-file cipher, masked memory vault, and bundle/environment integrity verifier.
 */

export interface IntegrityViolation {
  code: string;
  title: string;
  message: string;
  detail?: string;
}

export interface ProfilePayload {
  playerLevel: number;
  xp: number;
  selectedBiomeId: string;
  clearedBiomes: string[];
  tutorialStep: string;
  tutorialVersion: number;
  bestKills: number;
  trophies: number;
  coins: number;
  difficulty: string;
  activeSkinId: string;
  ownedSkins: string[];
  ownedWeapons: string[];
  activeWeaponId: string;
  upgrades: Record<string, { damageLevel: number; fireRateLevel: number; magLevel: number }>;
  vitalityLevel: number;
  armorLevel: number;
  dailyStreak: number;
  dailyLastClaimDay: string | null;
  pushEnabled: boolean;
  lastVisitAt: number | null;
  musicVolume: number;
  sfxVolume: number;
}

export type UnsealResult =
  | { status: 'empty' }
  | { status: 'ok'; data: Partial<ProfilePayload> }
  | { status: 'tampered'; violation: IntegrityViolation };

interface SealedEnvelopeV2 {
  v: 2;
  n: string;
  d: string;
  s: string;
}

declare const __OFFICIAL_PUBLIC_HASHES__: Record<string, string> | undefined;

// Decode obfuscated static tokens at runtime so raw identifiers do not sit plainly in the bundle.
function decodeBytes(bytes: readonly number[], mask: number): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ^ mask);
  }
  return out;
}

// Primary encrypted storage key ("dt_vault_r2") and legacy plaintext key ("dark_thicket_profile")
export const VAULT_STORAGE_KEY = decodeBytes(
  [0x3e, 0x2e, 0x05, 0x2c, 0x3b, 0x2f, 0x36, 0x2e, 0x05, 0x28, 0x68],
  0x5a
);
export const LEGACY_PROFILE_KEY = decodeBytes(
  [
    0x3f, 0x3a, 0x29, 0x30, 0x04, 0x2f, 0x33, 0x32, 0x38, 0x30, 0x3e, 0x2f, 0x04, 0x2b, 0x29, 0x34,
    0x3d, 0x32, 0x37, 0x3e,
  ],
  0x5b
);

// App secret material split & XOR-masked for stream cipher and integrity MACs
const K_PART_A = [0x6e, 0x11, 0x42, 0x7d, 0x35, 0x5c, 0x28, 0x09, 0x4f, 0x63, 0x1b, 0x72, 0x21, 0x54, 0x39, 0x6a];
const K_PART_B = [0x2a, 0x53, 0x19, 0x64, 0x71, 0x0e, 0x4b, 0x37, 0x15, 0x4c, 0x68, 0x23, 0x5d, 0x07, 0x7a, 0x1f];

function deriveMasterKeyBytes(): number[] {
  const out: number[] = [];
  for (let i = 0; i < K_PART_A.length; i++) {
    out.push((K_PART_A[i] ^ K_PART_B[(i * 5 + 3) % K_PART_B.length] ^ ((i * 37 + 19) & 0xff)) & 0xff);
  }
  return out;
}

// Pure-JS SHA-256 (works reliably in http://, file://, WebViews, Capacitor APKs, and Node)
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

function computeKeyedMac(message: string): string {
  const key = deriveMasterKeyBytes();
  const keyHex = key.map((b) => b.toString(16).padStart(2, '0')).join('');
  return sha256Hex(`${keyHex}|${message}|${keyHex.split('').reverse().join('')}`);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function deriveStreamState(salt: string): Uint32Array {
  const key = deriveMasterKeyBytes();
  const digest = sha256Hex(`${salt}:${key.join(',')}`);
  const state = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    state[i] = Number.parseInt(digest.slice(i * 8, i * 8 + 8), 16) >>> 0;
  }
  return state;
}

function xorWithKeystream(bytes: Uint8Array, salt: string): Uint8Array {
  const st = deriveStreamState(salt);
  const out = new Uint8Array(bytes.length);
  let acc = st[0] ^ st[7];
  for (let i = 0; i < bytes.length; i++) {
    const s = st[i & 7];
    acc = (Math.imul(acc ^ s, 0x45d9f3b) + (i * 0x9e3779b1)) >>> 0;
    const keyByte = ((acc >>> 24) ^ (acc >>> 13) ^ (acc >>> 5) ^ acc) & 0xff;
    out[i] = bytes[i] ^ keyByte;
  }
  return out;
}

function generateSaltHex(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compact single-letter mapping so even decrypted inner JSON avoids readable field names when inspected
const FIELD_MAP: ReadonlyArray<readonly [keyof ProfilePayload, string]> = [
  ['playerLevel', 'a'],
  ['xp', 'b'],
  ['coins', 'c'],
  ['trophies', 'd'],
  ['bestKills', 'e'],
  ['ownedWeapons', 'f'],
  ['activeWeaponId', 'g'],
  ['ownedSkins', 'h'],
  ['activeSkinId', 'i'],
  ['upgrades', 'j'],
  ['vitalityLevel', 'k'],
  ['armorLevel', 'l'],
  ['selectedBiomeId', 'm'],
  ['clearedBiomes', 'n'],
  ['tutorialStep', 'o'],
  ['tutorialVersion', 'p'],
  ['difficulty', 'q'],
  ['dailyStreak', 'r'],
  ['dailyLastClaimDay', 's'],
  ['pushEnabled', 't'],
  ['lastVisitAt', 'u'],
  ['musicVolume', 'v'],
  ['sfxVolume', 'w'],
];

export function sealProfileEnvelope(payload: Partial<ProfilePayload>, customSalt?: string): string {
  const compact: Record<string, unknown> = {};
  for (const [longKey, shortKey] of FIELD_MAP) {
    if (payload[longKey] !== undefined) {
      compact[shortKey] = payload[longKey];
    }
  }
  const salt = customSalt || generateSaltHex();
  const plainBytes = new TextEncoder().encode(JSON.stringify(compact));
  const cipherBytes = xorWithKeystream(plainBytes, salt);
  const d = encodeBase64Url(cipherBytes);
  const s = computeKeyedMac(`2|${salt}|${d}`).slice(0, 32);
  const env: SealedEnvelopeV2 = { v: 2, n: salt, d, s };
  return JSON.stringify(env);
}

export function createSaveTamperViolation(detail?: string): IntegrityViolation {
  return {
    code: 'SEC-SAVE-TAMPER',
    title: 'Обнаружена модификация игры',
    message:
      'Система защиты выявила вмешательство в сохранённые данные игры. Использование сторонних редакторов, читов и модификаций запрещено. Пожалуйста, удалите модификацию и посторонние файлы, после чего запустите официальную версию игры.',
    detail,
  };
}

export function unsealProfileEnvelope(raw: string | null | undefined): UnsealResult {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { status: 'empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'tampered',
      violation: createSaveTamperViolation('corrupt-envelope'),
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'tampered',
      violation: createSaveTamperViolation('invalid-structure'),
    };
  }

  const env = parsed as Partial<SealedEnvelopeV2>;
  if (
    env.v !== 2 ||
    typeof env.n !== 'string' ||
    env.n.length < 8 ||
    typeof env.d !== 'string' ||
    env.d.length < 2 ||
    typeof env.s !== 'string' ||
    env.s.length !== 32
  ) {
    return {
      status: 'tampered',
      violation: createSaveTamperViolation('unsealed-payload'),
    };
  }

  const expectedMac = computeKeyedMac(`2|${env.n}|${env.d}`).slice(0, 32);
  if (env.s !== expectedMac) {
    return {
      status: 'tampered',
      violation: createSaveTamperViolation('mac-mismatch'),
    };
  }

  try {
    const cipherBytes = decodeBase64Url(env.d);
    const plainBytes = xorWithKeystream(cipherBytes, env.n);
    const compact = JSON.parse(new TextDecoder().decode(plainBytes)) as Record<string, unknown>;
    if (!compact || typeof compact !== 'object' || Array.isArray(compact)) {
      return {
        status: 'tampered',
        violation: createSaveTamperViolation('inner-corrupt'),
      };
    }

    const out: Partial<ProfilePayload> = {};
    for (const [longKey, shortKey] of FIELD_MAP) {
      if (compact[shortKey] !== undefined) {
        (out as Record<string, unknown>)[longKey] = compact[shortKey];
      }
    }
    return { status: 'ok', data: out };
  } catch {
    return {
      status: 'tampered',
      violation: createSaveTamperViolation('decrypt-failed'),
    };
  }
}

export type VaultSlotKey = 'c' | 't' | 'x' | 'l' | 'v' | 'a';

interface MaskedSlot {
  _k: number;
  _o: number;
  _p: number;
  _s: number;
}

/**
 * Memory-obfuscated numeric vault so coin/trophy/XP values are never stored
 * as readable plaintext integers in RAM or directly on engine instances.
 */
export class MaskedIntVault {
  private slots: Record<VaultSlotKey, MaskedSlot>;
  private tampered = false;
  private readonly onViolation?: (v: IntegrityViolation) => void;

  constructor(onViolation?: (v: IntegrityViolation) => void) {
    this.onViolation = onViolation;
    this.slots = {
      c: this.encode(0),
      t: this.encode(0),
      x: this.encode(0),
      l: this.encode(1),
      v: this.encode(0),
      a: this.encode(0),
    };
  }

  private nextKey(): number {
    return (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0;
  }

  private encode(value: number): MaskedSlot {
    const safe = Math.max(0, Math.round(Number.isFinite(value) ? value : 0)) | 0;
    const k = this.nextKey();
    const o = this.nextKey() & 0xffff;
    const p = ((safe ^ k) + o) | 0;
    const s = (Math.imul(safe ^ 0x5bd1e995, 0x9e3779b1) ^ (k >>> 5) ^ (o << 7)) >>> 0;
    return { _k: k, _o: o, _p: p, _s: s };
  }

  private decode(slotKey: VaultSlotKey): number {
    const sl = this.slots[slotKey];
    const raw = ((sl._p - sl._o) | 0) ^ sl._k;
    const expectedS =
      (Math.imul(raw ^ 0x5bd1e995, 0x9e3779b1) ^ (sl._k >>> 5) ^ (sl._o << 7)) >>> 0;
    if (!Number.isFinite(raw) || raw < 0 || sl._s !== expectedS) {
      if (!this.tampered) {
        this.tampered = true;
        this.onViolation?.({
          code: 'SEC-RAM-GUARD',
          title: 'Обнаружена модификация игры',
          message:
            'Античит обнаружил несанкционированное изменение игровых значений в памяти устройства. Пожалуйста, удалите сторонние читы и модификации и запустите официальную версию игры.',
          detail: `slot:${slotKey}`,
        });
      }
      return 0;
    }
    return raw;
  }

  public get(slotKey: VaultSlotKey): number {
    return this.decode(slotKey);
  }

  public set(slotKey: VaultSlotKey, value: number): void {
    // Verify current integrity before mutating
    this.decode(slotKey);
    if (this.tampered) return;
    const safe = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    this.slots[slotKey] = this.encode(safe);
  }

  public add(slotKey: VaultSlotKey, delta: number): number {
    const cur = this.decode(slotKey);
    if (this.tampered) return 0;
    const next = Math.max(0, cur + Math.round(delta));
    this.slots[slotKey] = this.encode(next);
    return next;
  }

  public verifyAll(): boolean {
    const keys: VaultSlotKey[] = ['c', 't', 'x', 'l', 'v', 'a'];
    for (const k of keys) {
      this.decode(k);
    }
    return !this.tampered;
  }
}

export function checkStorageIntegrity(storage: Pick<Storage, 'getItem' | 'length' | 'key'>): IntegrityViolation | null {
  try {
    const vaultRaw = storage.getItem(VAULT_STORAGE_KEY);
    const res = unsealProfileEnvelope(vaultRaw);
    if (res.status === 'tampered') {
      return res.violation;
    }

    // Reject manual injection of legacy plaintext save or cheat keys
    const legacyRaw = storage.getItem(LEGACY_PROFILE_KEY);
    if (legacyRaw !== null && legacyRaw.trim() !== '') {
      return createSaveTamperViolation('legacy-plaintext-injection');
    }

    const suspiciousKeyRe = /^(cheat|mod_|__mod|gameguardian|hack_|gg_)/i;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && suspiciousKeyRe.test(k)) {
        return createSaveTamperViolation(`foreign-key:${k}`);
      }
    }
  } catch {
    // Ignore restricted storage exceptions in private contexts
  }
  return null;
}

const CHEAT_GLOBAL_NAMES = [
  'GameGuardian',
  'frida',
  'Frida',
  'Xposed',
  'xposed',
  '__modMenu',
  '__MOD_MENU__',
  'ModMenu',
  'cheatEngine',
  'CheatEngine',
  '__cheat',
  '__CHEAT__',
  'hackMenu',
  'injectCheat',
  'LuckyPatcher',
  'apkMod',
] as const;

export function scanDomAndGlobalsForIntruders(
  doc: Document,
  win: Window,
  isDev: boolean,
  expectedManifestAssets?: ReadonlySet<string>
): IntegrityViolation | null {
  // 1. Check known cheat/modding globals
  const winRecord = win as unknown as Record<string, unknown>;
  for (const name of CHEAT_GLOBAL_NAMES) {
    if (winRecord[name] !== undefined) {
      return {
        code: 'SEC-CHEAT-HOOK',
        title: 'Обнаружена модификация игры',
        message:
          'Обнаружен сторонний модуль перехвата или чит-меню. Использование сторонних модификаций запрещено. Пожалуйста, удалите модификацию и перезапустите официальную версию игры.',
        detail: name,
      };
    }
  }

  // 2. Inspect <script> elements
  const origin = win.location?.origin || '';
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const sc of scripts) {
    const src = sc.getAttribute('src');
    if (src) {
      let resolved: URL;
      try {
        resolved = new URL(src, win.location.href);
      } catch {
        return {
          code: 'SEC-FOREIGN-SCRIPT',
          title: 'Обнаружена модификация игры',
          message:
            'Обнаружен посторонний скрипт в файлах игры. Пожалуйста, удалите стороннюю модификацию и установите официальную версию.',
          detail: src,
        };
      }

      if (origin && resolved.origin !== origin) {
        return {
          code: 'SEC-FOREIGN-SCRIPT',
          title: 'Обнаружена модификация игры',
          message:
            'Обнаружен сторонний внешний скрипт, не принадлежащий игре. Пожалуйста, удалите модификацию и посторонние расширения, после чего запустите игру снова.',
          detail: resolved.href,
        };
      }

      const path = resolved.pathname;
      if (isDev) {
        const devAllowed =
          path.startsWith('/src/') ||
          path.startsWith('/@vite/') ||
          path.startsWith('/node_modules/') ||
          path === '/@react-refresh' ||
          path.startsWith('/@id/') ||
          path.startsWith('/@fs/');
        if (!devAllowed) {
          return {
            code: 'SEC-FOREIGN-SCRIPT',
            title: 'Обнаружена модификация игры',
            message:
              'Обнаружен посторонний файл сценария в каталоге игры. Пожалуйста, удалите сторонние файлы и перезапустите официальную версию.',
            detail: path,
          };
        }
      } else {
        const isOfficialAsset = path.startsWith('/assets/');
        const inManifest = !expectedManifestAssets || expectedManifestAssets.has(path);
        if (!isOfficialAsset || !inManifest) {
          return {
            code: 'SEC-FOREIGN-SCRIPT',
            title: 'Обнаружена модификация игры',
            message:
              'Обнаружен посторонний или модифицированный файл скрипта. Пожалуйста, удалите модификацию и установите официальную версию игры.',
            detail: path,
          };
        }
      }
    } else {
      // Inline <script>: only Vite React Refresh preamble is permitted in dev mode
      const inlineText = sc.textContent || '';
      const isViteReactPreamble =
        isDev &&
        inlineText.includes('@react-refresh') &&
        inlineText.includes('__vite_plugin_react_preamble_installed__');
      if (!isViteReactPreamble && inlineText.trim().length > 0) {
        return {
          code: 'SEC-FOREIGN-SCRIPT',
          title: 'Обнаружена модификация игры',
          message:
            'Обнаружен встроенный посторонний код модификации. Пожалуйста, удалите модифицированную сборку и установите официальную версию.',
          detail: 'inline-script',
        };
      }
    }
  }

  // 3. Check unexpected direct DOM overlays/frames/elements outside #root
  if (doc.body) {
    const bodyChildren = Array.from(doc.body.children);
    for (const el of bodyChildren) {
      const id = el.id || '';
      const tag = el.tagName.toLowerCase();
      if (id === 'root') continue;
      if (isDev && tag === 'vite-error-overlay') continue;
      return {
        code: 'SEC-FOREIGN-MODULE',
        title: 'Обнаружена модификация игры',
        message:
          'В интерфейсе игры обнаружен посторонний элемент или оверлей модификации. Пожалуйста, удалите сторонние модификации и перезапустите официальную версию игры.',
        detail: `${tag}${id ? '#' + id : ''}`,
      };
    }
  }

  return null;
}

export interface BuildIntegrityManifest {
  version: number;
  files: Record<string, string>;
  mac: string;
}

export async function verifyOfficialFiles(isDev: boolean): Promise<{
  violation: IntegrityViolation | null;
  manifestAssets?: Set<string>;
}> {
  if (typeof fetch !== 'function') {
    return { violation: null };
  }

  const expectedPublic =
    typeof __OFFICIAL_PUBLIC_HASHES__ !== 'undefined' ? __OFFICIAL_PUBLIC_HASHES__ : undefined;

  if (expectedPublic) {
    for (const [relPath, expectedHash] of Object.entries(expectedPublic)) {
      try {
        const res = await fetch(relPath, { cache: 'no-store' });
        if (!res.ok) {
          return {
            violation: {
              code: 'SEC-FILE-MODIFIED',
              title: 'Обнаружена модификация игры',
              message:
                'Отсутствуют или повреждены обязательные официальные файлы игры. Пожалуйста, удалите модификацию и установите официальную версию.',
              detail: relPath,
            },
          };
        }
        const text = (await res.text()).replace(/\r\n/g, '\n');
        const actualHash = sha256Hex(text);
        if (actualHash !== expectedHash) {
          return {
            violation: {
              code: 'SEC-FILE-MODIFIED',
              title: 'Обнаружена модификация игры',
              message:
                'Один из файлов игры был изменён или заменён на посторонний. Пожалуйста, удалите модификацию и установите официальную версию.',
              detail: relPath,
            },
          };
        }
      } catch {
        // Skip only if offline/network blocked in sandbox; real mismatches above block immediately
      }
    }
  }

  if (isDev) {
    return { violation: null };
  }

  // Production / APK build: verify signed build integrity manifest & active scripts/styles
  try {
    const manifestRes = await fetch('/integrity-manifest.json', { cache: 'no-store' });
    if (!manifestRes.ok) {
      return {
        violation: {
          code: 'SEC-BUILD-INTEGRITY',
          title: 'Обнаружена модификация игры',
          message:
            'Нарушена контрольная подпись сборки игры. Пожалуйста, удалите модификацию и установите официальную версию.',
          detail: 'missing-manifest',
        },
      };
    }
    const manifest = (await manifestRes.json()) as Partial<BuildIntegrityManifest>;
    if (!manifest || manifest.version !== 1 || !manifest.files || typeof manifest.mac !== 'string') {
      return {
        violation: {
          code: 'SEC-BUILD-INTEGRITY',
          title: 'Обнаружена модификация игры',
          message:
            'Контрольный манифест сборки повреждён или подделан. Пожалуйста, удалите модификацию и установите официальную версию.',
          detail: 'invalid-manifest',
        },
      };
    }

    const sortedKeys = Object.keys(manifest.files).sort();
    const canonical = sortedKeys.map((k) => `${k}=${manifest.files![k]}`).join('\n');
    const expectedMac = computeKeyedMac(`manifest|1|${canonical}`).slice(0, 32);
    if (manifest.mac !== expectedMac) {
      return {
        violation: {
          code: 'SEC-BUILD-INTEGRITY',
          title: 'Обнаружена модификация игры',
          message:
            'Цифровая подпись файлов сборки недействительна — игра была пересобрана или модифицирована. Пожалуйста, удалите модификацию и установите официальную версию.',
          detail: 'manifest-mac-mismatch',
        },
      };
    }

    const assetSet = new Set<string>(sortedKeys);
    // Verify loaded bundle scripts & stylesheets in DOM against manifest hashes
    if (typeof document !== 'undefined') {
      const bundleEls = [
        ...Array.from(document.querySelectorAll('script[src]')).map((el) =>
          new URL(el.getAttribute('src')!, window.location.href).pathname
        ),
        ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map((el) =>
          new URL(el.getAttribute('href')!, window.location.href).pathname
        ),
      ];
      for (const p of bundleEls) {
        if (!manifest.files[p]) {
          return {
            violation: {
              code: 'SEC-BUILD-INTEGRITY',
              title: 'Обнаружена модификация игры',
              message:
                'Обнаружен посторонний файл ресурсов в сборке игры. Пожалуйста, удалите модификацию и установите официальную версию.',
              detail: p,
            },
          };
        }
        const assetRes = await fetch(p, { cache: 'no-store' });
        if (!assetRes.ok) {
          return {
            violation: {
              code: 'SEC-BUILD-INTEGRITY',
              title: 'Обнаружена модификация игры',
              message:
                'Не удалось подтвердить подлинность загруженного модуля игры. Пожалуйста, удалите модификацию.',
              detail: p,
            },
          };
        }
        const assetText = (await assetRes.text()).replace(/\r\n/g, '\n');
        if (sha256Hex(assetText) !== manifest.files[p]) {
          return {
            violation: {
              code: 'SEC-BUILD-INTEGRITY',
              title: 'Обнаружена модификация игры',
              message:
                'Код исполняемого файла игры был модифицирован. Пожалуйста, удалите модификацию и установите официальную версию.',
              detail: p,
            },
          };
        }
      }
    }

    return { violation: null, manifestAssets: assetSet };
  } catch {
    return {
      violation: {
        code: 'SEC-BUILD-INTEGRITY',
        title: 'Обнаружена модификация игры',
        message:
          'Проверка подлинности файлов сборки не пройдена. Пожалуйста, удалите модификацию и установите официальную версию.',
        detail: 'manifest-fetch-error',
      },
    };
  }
}

export async function verifyGameIntegrity(isDev: boolean): Promise<IntegrityViolation | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const storageViolation = checkStorageIntegrity(window.localStorage);
  if (storageViolation) {
    return storageViolation;
  }

  const domViolationBefore = scanDomAndGlobalsForIntruders(document, window, isDev);
  if (domViolationBefore) {
    return domViolationBefore;
  }

  const fileCheck = await verifyOfficialFiles(isDev);
  if (fileCheck.violation) {
    return fileCheck.violation;
  }

  if (fileCheck.manifestAssets) {
    const domViolationAfter = scanDomAndGlobalsForIntruders(
      document,
      window,
      isDev,
      fileCheck.manifestAssets
    );
    if (domViolationAfter) {
      return domViolationAfter;
    }
  }

  return null;
}

export function triggerSecurityExit(): void {
  try {
    const win = window as unknown as {
      Capacitor?: { Plugins?: { App?: { exitApp?: () => void } } };
    };
    win.Capacitor?.Plugins?.App?.exitApp?.();
  } catch {
    // ignore
  }
  try {
    const nav = navigator as unknown as { app?: { exitApp?: () => void } };
    nav.app?.exitApp?.();
  } catch {
    // ignore
  }
  try {
    window.close();
  } catch {
    // ignore
  }
  try {
    window.location.replace('about:blank');
  } catch {
    // ignore
  }
}
