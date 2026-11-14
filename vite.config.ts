import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const K_PART_A = [0x6e, 0x11, 0x42, 0x7d, 0x35, 0x5c, 0x28, 0x09, 0x4f, 0x63, 0x1b, 0x72, 0x21, 0x54, 0x39, 0x6a];
const K_PART_B = [0x2a, 0x53, 0x19, 0x64, 0x71, 0x0e, 0x4b, 0x37, 0x15, 0x4c, 0x68, 0x23, 0x5d, 0x07, 0x7a, 0x1f];

function deriveKeyHex(): string {
  const out: number[] = [];
  for (let i = 0; i < K_PART_A.length; i++) {
    out.push((K_PART_A[i] ^ K_PART_B[(i * 5 + 3) % K_PART_B.length] ^ ((i * 37 + 19) & 0xff)) & 0xff);
  }
  return out.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function computeManifestMac(files: Record<string, string>): string {
  const keyHex = deriveKeyHex();
  const sortedKeys = Object.keys(files).sort();
  const canonical = sortedKeys.map((k) => `${k}=${files[k]}`).join('\n');
  const message = `manifest|1|${canonical}`;
  return crypto
    .createHash('sha256')
    .update(`${keyHex}|${message}|${keyHex.split('').reverse().join('')}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

function collectPublicHashes(rootDir: string): Record<string, string> {
  const targets = ['/manifest.webmanifest', '/icon.svg', '/sw.js'];
  const hashes: Record<string, string> = {};
  for (const rel of targets) {
    const abs = path.join(rootDir, 'public', rel.slice(1));
    if (fs.existsSync(abs)) {
      hashes[rel] = sha256Text(fs.readFileSync(abs, 'utf8'));
    }
  }
  return hashes;
}

const SENSITIVE_LITERALS = [
  'dark_thicket_profile',
  'dt_vault_r2',
  'SEC-SAVE-TAMPER',
  'SEC-RAM-GUARD',
  'SEC-FOREIGN-MODULE',
  'SEC-FOREIGN-SCRIPT',
  'SEC-FILE-MODIFIED',
  'SEC-BUILD-INTEGRITY',
  'SEC-CHEAT-HOOK',
  'SEC-SPEEDHACK',
  'GameGuardian',
  'LuckyPatcher',
  'CheatEngine',
  '__modMenu',
  '__MOD_MENU__',
  'coins',
  'trophies',
  'vitalityLevel',
  'armorLevel',
  'ownedWeapons',
  'ownedSkins',
];

function encodeXorBytesLiteral(str: string, keyByte: number): string {
  const bytes = Buffer.from(str, 'utf8');
  const nums: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    nums.push(bytes[i] ^ ((keyByte + i * 11) & 0xff));
  }
  return `__xd([${nums.join(',')}],${keyByte})`;
}

function darkThicketProtectionPlugin(rootDir: string): Plugin {
  const outDir = path.resolve(rootDir, 'dist');
  return {
    name: 'dark-thicket-protection',
    apply: 'build',
    renderChunk(code) {
      let transformed = code;
      let changed = false;
      const keyByte = 0x73;

      for (const literal of SENSITIVE_LITERALS) {
        const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace standalone JS string values only (avoid object keys `"literal":` or import paths)
        const re = new RegExp(`(["'])${escaped}\\1(?!\\s*:)`, 'g');
        transformed = transformed.replace(re, (match, _quote, offset, full) => {
          const before = full.slice(Math.max(0, offset - 20), offset);
          if (/\bfrom\s*$/.test(before) || /\bimport\s*\(\s*$/.test(before)) {
            return match;
          }
          changed = true;
          return encodeXorBytesLiteral(literal, keyByte);
        });
      }

      if (!changed) return null;
      const helper =
        'function __xd(a,k){let s="";for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]^((k+i*11)&255));return s;}\n';
      return {
        code: helper + transformed,
        map: null,
      };
    },
    writeBundle() {
      if (!fs.existsSync(outDir)) return;
      const files: Record<string, string> = {};

      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            const rel = '/' + path.relative(outDir, full).replace(/\\/g, '/');
            if (rel === '/integrity-manifest.json') continue;
            if (/\.(html|js|css|svg|webmanifest|json)$/i.test(rel)) {
              files[rel] = sha256Text(fs.readFileSync(full, 'utf8'));
            }
          }
        }
      };

      walk(outDir);
      const manifest = {
        version: 1,
        files,
        mac: computeManifestMac(files),
      };
      fs.writeFileSync(path.join(outDir, 'integrity-manifest.json'), JSON.stringify(manifest), 'utf8');
    },
  };
}

export default defineConfig(() => {
  const publicHashes = collectPublicHashes(__dirname);
  return {
    plugins: [react(), tailwindcss(), darkThicketProtectionPlugin(__dirname)],
    define: {
      __OFFICIAL_PUBLIC_HASHES__: JSON.stringify(publicHashes),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    esbuild: {
      drop: ['debugger'] as ('console' | 'debugger')[],
    },
    build: {
      sourcemap: false,
      minify: 'esbuild' as const,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
