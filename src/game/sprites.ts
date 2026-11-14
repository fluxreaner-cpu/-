import { BIOMES, BIOME_CYCLE, SKINS, SKIN_ORDER, WEAPON_ORDER } from './constants';
import type { BiomeId, SkinId, SurfaceType, WeaponId, ZombieKind } from './types';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

export function drawPlayerSkinFrame(skinId: SkinId, stepFrame: number, flash = false): HTMLCanvasElement {
  const s = SKINS[skinId];
  const [c, ctx] = makeCanvas(22, 26);
  const outline = flash ? '#ffffff' : '#090d0b';
  const hood = flash ? '#ffffff' : s.hoodColor;
  const hoodHi = flash ? '#ffffff' : s.hoodHiColor;
  const skin = flash ? '#ffffff' : '#e5b88f';
  const jacket = flash ? '#ffffff' : s.jacketColor;
  const jacketHi = flash ? '#ffffff' : s.jacketHiColor;
  const pants = flash ? '#ffffff' : s.pantsColor;
  const boot = flash ? '#ffffff' : '#161311';
  const scarf = flash ? '#ffffff' : s.scarfColor;

  // Boots / legs alternating
  const leftY = stepFrame === 0 ? 19 : 18;
  const rightY = stepFrame === 0 ? 18 : 19;
  px(ctx, 7, leftY, 3, 4, pants);
  px(ctx, 7, leftY + 3, 3, 2, boot);
  px(ctx, 12, rightY, 3, 4, pants);
  px(ctx, 12, rightY + 3, 3, 2, boot);

  // Flowing cloak tail for stealth / elite cloaked characters
  if (
    skinId === 'crimson_hunter' ||
    skinId === 'phantom' ||
    skinId === 'plague_doctor' ||
    skinId === 'blood_paladin' ||
    skinId === 'void_reaper'
  ) {
    px(ctx, 3, 13, 4, 8, outline);
    px(ctx, 4, 13, 3, 7, hood);
    if (skinId === 'void_reaper' || skinId === 'blood_paladin') {
      px(ctx, 4, 18, 2, 2, scarf);
    }
  }

  // Fuel tank / medkit pack / power pack
  if (skinId === 'pyromancer' || skinId === 'hazmat') {
    px(ctx, 4, 12, 3, 6, outline);
    px(ctx, 5, 13, 2, 4, skinId === 'pyromancer' ? '#fb923c' : '#eab308');
  }

  // Torso
  px(ctx, 6, 11, 10, 8, outline);
  px(ctx, 7, 12, 8, 6, jacket);
  px(ctx, 8, 12, 5, 3, jacketHi);
  px(ctx, 7, 11, 8, 2, scarf);

  // Heavy pauldrons for armored tiers
  if (
    skinId === 'juggernaut' ||
    skinId === 'frost_warden' ||
    skinId === 'blood_paladin' ||
    skinId === 'cyber_merc'
  ) {
    px(ctx, 4, 11, 3, 6, outline);
    px(ctx, 5, 12, 2, 4, hoodHi);
    px(ctx, 15, 11, 3, 6, outline);
    px(ctx, 15, 12, 2, 4, hoodHi);
  }

  // Headgear
  if (skinId === 'crimson_hunter' || skinId === 'plague_doctor') {
    // Wide brim hat
    px(ctx, 4, 5, 14, 2, outline);
    px(ctx, 5, 5, 12, 1, hoodHi);
    px(ctx, 6, 2, 10, 4, outline);
    px(ctx, 7, 3, 8, 3, hood);
    if (skinId === 'plague_doctor') {
      // Mask face + pointed beak
      px(ctx, 7, 6, 8, 4, outline);
      px(ctx, 8, 7, 6, 3, '#d6d3d1');
      px(ctx, 13, 8, 4, 2, '#f5f5f4');
    }
  } else if (skinId === 'winter_trapper') {
    // Fur ushanka with ear flaps
    px(ctx, 5, 3, 12, 7, outline);
    px(ctx, 6, 4, 10, 5, hood);
    px(ctx, 6, 3, 10, 2, hoodHi);
    px(ctx, 5, 7, 2, 4, hoodHi);
    px(ctx, 15, 7, 2, 4, hoodHi);
  } else if (skinId === 'medic_scout') {
    // Field medic helmet with crisp red cross
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
    px(ctx, 10, 4, 2, 3, '#ef4444');
    px(ctx, 9, 5, 4, 1, '#ef4444');
  } else if (skinId === 'night_stalker') {
    // Stealth hood + dual NVG goggles
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
    px(ctx, 7, 6, 8, 2, '#09090b');
    px(ctx, 8, 6, 2, 2, '#4ade80');
    px(ctx, 12, 6, 2, 2, '#4ade80');
  } else if (skinId === 'ash_knight' || skinId === 'blood_paladin') {
    // Horned iron / crimson helm
    const horn = skinId === 'blood_paladin' ? '#fbbf24' : '#94a3b8';
    px(ctx, 5, 1, 2, 4, horn);
    px(ctx, 15, 1, 2, 4, horn);
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
    px(ctx, 8, 4, 5, 2, hoodHi);
  } else if (skinId === 'frost_warden') {
    // Ice crystal crown helm
    px(ctx, 6, 1, 2, 3, '#a5f3fc');
    px(ctx, 10, 0, 2, 4, '#e0f2fe');
    px(ctx, 14, 1, 2, 3, '#a5f3fc');
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
    px(ctx, 8, 4, 6, 2, hoodHi);
  } else if (skinId === 'juggernaut' || skinId === 'cyber_merc') {
    px(ctx, 5, 2, 12, 9, outline);
    px(ctx, 6, 3, 10, 7, hood);
    px(ctx, 7, 3, 8, 2, hoodHi);
  } else if (skinId === 'void_reaper') {
    // Pointed shadow cowl
    px(ctx, 7, 1, 8, 3, outline);
    px(ctx, 8, 2, 6, 2, hoodHi);
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
  } else {
    px(ctx, 6, 3, 10, 8, outline);
    px(ctx, 7, 4, 8, 6, hood);
    px(ctx, 8, 4, 5, 2, hoodHi);
  }

  // Face or Visor
  if (skinId === 'plague_doctor' || skinId === 'night_stalker') {
    if (!flash && skinId === 'plague_doctor') {
      px(ctx, 9, 7, 1, 1, s.eyeColor);
      px(ctx, 12, 7, 1, 1, s.eyeColor);
    }
  } else if (s.visorColor && !flash) {
    px(ctx, 8, 6, 6, 3, '#0f172a');
    px(ctx, 9, 7, 4, 2, s.visorColor);
    if (skinId === 'hazmat' || skinId === 'pyromancer') {
      px(ctx, 10, 9, 2, 2, '#475569');
    }
  } else {
    px(ctx, 8, 7, 6, 3, skin);
    if (!flash) {
      px(ctx, 9, 8, 1, 1, s.eyeColor);
      px(ctx, 12, 8, 1, 1, s.eyeColor);
    }
  }

  return c;
}

export function drawZombieFrame(kind: ZombieKind, stepFrame: number, flash = false): HTMLCanvasElement {
  if (kind === 'boss') {
    const [c, ctx] = makeCanvas(44, 50);
    const out = flash ? '#ffffff' : '#080507';
    const skin = flash ? '#ffffff' : '#4e6b48';
    const skinHi = flash ? '#ffffff' : '#6c8f62';
    const rot = flash ? '#ffffff' : '#7f1d1d';
    const armor = flash ? '#ffffff' : '#2c2529';
    const eye = flash ? '#ffffff' : '#ff4d2e';

    const ly = stepFrame === 0 ? 37 : 34;
    const ry = stepFrame === 0 ? 34 : 37;
    px(ctx, 11, ly, 8, 11, out);
    px(ctx, 12, ly + 1, 6, 9, armor);
    px(ctx, 25, ry, 8, 11, out);
    px(ctx, 26, ry + 1, 6, 9, armor);

    px(ctx, 8, 13, 28, 25, out);
    px(ctx, 10, 15, 24, 21, skin);
    px(ctx, 12, 15, 18, 6, skinHi);
    px(ctx, 15, 22, 14, 10, rot);
    if (!flash) {
      px(ctx, 16, 23, 12, 1, '#e7e5e4');
      px(ctx, 17, 26, 10, 1, '#e7e5e4');
      px(ctx, 17, 29, 10, 1, '#e7e5e4');
      px(ctx, 20, 24, 4, 4, '#f97316');
    }

    px(ctx, 3, 13, 9, 10, out);
    px(ctx, 4, 14, 7, 8, armor);
    px(ctx, 5, 9, 2, 4, '#d6d3d1');
    px(ctx, 32, 13, 9, 10, out);
    px(ctx, 33, 14, 7, 8, armor);
    px(ctx, 36, 9, 2, 4, '#d6d3d1');

    const armShift = stepFrame === 0 ? 2 : -1;
    px(ctx, 2, 23 + armShift, 7, 13, out);
    px(ctx, 3, 24 + armShift, 5, 10, skin);
    px(ctx, 35, 23 - armShift, 7, 13, out);
    px(ctx, 36, 24 - armShift, 5, 10, skin);

    px(ctx, 11, 2, 3, 5, '#d6d3d1');
    px(ctx, 30, 2, 3, 5, '#d6d3d1');
    px(ctx, 14, 4, 16, 11, out);
    px(ctx, 15, 5, 14, 9, skin);
    px(ctx, 17, 5, 10, 2, skinHi);
    px(ctx, 17, 8, 3, 2, eye);
    px(ctx, 24, 8, 3, 2, eye);
    if (!flash) {
      px(ctx, 17, 12, 10, 2, '#1f0b0b');
      px(ctx, 18, 12, 1, 1, '#f3f4f6');
      px(ctx, 21, 12, 1, 1, '#f3f4f6');
      px(ctx, 24, 12, 1, 1, '#f3f4f6');
    }
    return c;
  }

  const w = kind === 'brute' || kind === 'shielder' || kind === 'boomer' ? 24 : 18;
  const h = kind === 'brute' || kind === 'shielder' ? 26 : 22;
  const [c, ctx] = makeCanvas(w, h);
  const out = flash ? '#ffffff' : '#0a0d0b';

  const palettes: Record<Exclude<ZombieKind, 'boss'>, { skin: string; skinHi: string; coat: string; eye: string }> = {
    standard: { skin: '#678a5d', skinHi: '#83ad77', coat: '#3f4739', eye: '#fbbf24' },
    runner: { skin: '#8c5858', skinHi: '#b07272', coat: '#452323', eye: '#ef4444' },
    flanker: { skin: '#4f5d75', skinHi: '#6b7d9c', coat: '#1e1b33', eye: '#38bdf8' },
    brute: { skin: '#4d6152', skinHi: '#6b8571', coat: '#374151', eye: '#f97316' },
    spitter: { skin: '#587c5d', skinHi: '#78a37e', coat: '#1f3a2e', eye: '#a3e635' },
    shielder: { skin: '#5a6369', skinHi: '#78848c', coat: '#27272a', eye: '#f59e0b' },
    boomer: { skin: '#658044', skinHi: '#8bb05c', coat: '#3b4d22', eye: '#fde047' },
  };
  const pal = palettes[kind];
  const skin = flash ? '#ffffff' : pal.skin;
  const skinHi = flash ? '#ffffff' : pal.skinHi;
  const coat = flash ? '#ffffff' : pal.coat;
  const eye = flash ? '#ffffff' : pal.eye;

  const cx = Math.floor(w / 2);
  const ly = stepFrame === 0 ? h - 6 : h - 7;
  const ry = stepFrame === 0 ? h - 7 : h - 6;

  px(ctx, cx - 4, ly, 3, 5, '#1f2937');
  px(ctx, cx + 1, ry, 3, 5, '#1f2937');

  const torsoW = kind === 'brute' || kind === 'boomer' ? 14 : kind === 'shielder' ? 12 : 10;
  px(ctx, cx - torsoW / 2 - 1, 9, torsoW + 2, 10, out);
  px(ctx, cx - torsoW / 2, 10, torsoW, 8, coat);
  if (!flash) {
    px(ctx, cx - torsoW / 2 + 2, 11, torsoW - 4, 2, 'rgba(255,255,255,0.12)');
  }

  if (kind === 'spitter' && !flash) {
    px(ctx, cx - 4, 11, 3, 4, '#84cc16');
    px(ctx, cx + 1, 12, 3, 3, '#bef264');
  } else if (kind === 'boomer' && !flash) {
    px(ctx, cx - 6, 10, 5, 6, '#84cc16');
    px(ctx, cx + 1, 11, 5, 5, '#a3e635');
    px(ctx, cx - 2, 12, 4, 4, '#fef08a');
  }

  const armBob = stepFrame === 0 ? 0 : 1;
  px(ctx, cx - torsoW / 2 - 3, 10 + armBob, 3, 5, skin);
  px(ctx, cx + torsoW / 2, 10 - armBob, 3, 5, skin);

  px(ctx, cx - 5, 2, 10, 8, out);
  px(ctx, cx - 4, 3, 8, 6, skin);
  px(ctx, cx - 3, 3, 5, 2, skinHi);
  px(ctx, cx - 2, 5, 2, 1, eye);
  px(ctx, cx + 1, 5, 2, 1, eye);

  if (kind === 'shielder' && !flash) {
    px(ctx, cx + 4, 6, 6, 14, out);
    px(ctx, cx + 5, 7, 4, 12, '#94a3b8');
    px(ctx, cx + 6, 8, 2, 10, '#cbd5e1');
    px(ctx, cx + 5, 11, 4, 2, '#475569');
  }

  return c;
}

export function drawWeaponSprite(weaponId: WeaponId): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(18, 8);
  if (weaponId === 'rusty_pistol') {
    px(ctx, 2, 3, 7, 2, '#6b7280');
    px(ctx, 4, 2, 5, 1, '#92400e');
    px(ctx, 2, 4, 2, 3, '#4b5563');
  } else if (weaponId === 'sawed_carbine') {
    px(ctx, 1, 3, 4, 3, '#78350f');
    px(ctx, 5, 3, 8, 2, '#57534e');
    px(ctx, 10, 2, 3, 1, '#a8a29e');
    px(ctx, 6, 5, 2, 2, '#44403c');
  } else if (weaponId === 'shotgun') {
    px(ctx, 1, 3, 4, 3, '#78350f');
    px(ctx, 5, 3, 10, 2, '#4b5563');
    px(ctx, 7, 5, 5, 1, '#92400e');
  } else if (weaponId === 'revolver') {
    px(ctx, 2, 4, 2, 3, '#78350f');
    px(ctx, 3, 2, 5, 3, '#cbd5e1');
    px(ctx, 8, 2, 7, 2, '#94a3b8');
    px(ctx, 5, 3, 3, 2, '#eab308');
  } else if (weaponId === 'burst_smg') {
    px(ctx, 2, 3, 8, 3, '#334155');
    px(ctx, 10, 3, 5, 2, '#64748b');
    px(ctx, 6, 6, 2, 2, '#1e293b');
    px(ctx, 4, 2, 4, 1, '#facc15');
  } else if (weaponId === 'double_barrel') {
    px(ctx, 1, 3, 5, 3, '#7c2d12');
    px(ctx, 6, 2, 11, 2, '#64748b');
    px(ctx, 6, 4, 11, 1, '#475569');
    px(ctx, 9, 5, 4, 1, '#92400e');
  } else if (weaponId === 'smg') {
    px(ctx, 2, 3, 10, 3, '#1e293b');
    px(ctx, 12, 3, 4, 2, '#475569');
    px(ctx, 7, 6, 2, 2, '#0f172a');
    px(ctx, 4, 2, 4, 1, '#38bdf8');
  } else if (weaponId === 'tactical_pistol') {
    px(ctx, 2, 4, 2, 3, '#1e293b');
    px(ctx, 3, 2, 9, 3, '#334155');
    px(ctx, 12, 3, 4, 2, '#0f172a');
    px(ctx, 5, 2, 4, 1, '#22d3ee');
  } else if (weaponId === 'pump_shotgun') {
    px(ctx, 1, 3, 4, 3, '#27272a');
    px(ctx, 5, 2, 12, 3, '#3f3f46');
    px(ctx, 8, 5, 5, 2, '#fb923c');
  } else if (weaponId === 'combat_crossbow') {
    px(ctx, 1, 3, 5, 3, '#451a03');
    px(ctx, 6, 3, 9, 2, '#65a30d');
    px(ctx, 12, 0, 2, 8, '#a3e635');
    px(ctx, 10, 3, 6, 1, '#e2e8f0');
  } else if (weaponId === 'assault_rifle') {
    px(ctx, 0, 3, 4, 3, '#334155');
    px(ctx, 4, 3, 10, 2, '#1e293b');
    px(ctx, 14, 3, 4, 1, '#94a3b8');
    px(ctx, 8, 5, 2, 3, '#475569');
    px(ctx, 6, 2, 4, 1, '#60a5fa');
  } else if (weaponId === 'auto_shotgun') {
    px(ctx, 0, 3, 4, 3, '#18181b');
    px(ctx, 4, 2, 11, 3, '#3f3f46');
    px(ctx, 15, 3, 3, 2, '#9ca3af');
    px(ctx, 8, 5, 3, 3, '#dc2626');
    px(ctx, 6, 2, 5, 1, '#ef4444');
  } else if (weaponId === 'rifle') {
    px(ctx, 0, 3, 5, 3, '#7c2d12');
    px(ctx, 5, 3, 12, 2, '#334155');
    px(ctx, 7, 1, 5, 2, '#10b981');
  } else if (weaponId === 'lmg') {
    px(ctx, 0, 3, 4, 3, '#78350f');
    px(ctx, 4, 2, 9, 3, '#27272a');
    px(ctx, 13, 3, 5, 1, '#94a3b8');
    px(ctx, 7, 5, 4, 3, '#b45309');
    px(ctx, 8, 6, 2, 1, '#fbbf24');
  } else if (weaponId === 'saw_launcher') {
    px(ctx, 1, 3, 6, 3, '#475569');
    px(ctx, 7, 2, 7, 4, '#94a3b8');
    px(ctx, 13, 1, 4, 5, '#e2e8f0');
    px(ctx, 14, 2, 2, 3, '#ef4444');
  } else if (weaponId === 'plasma_carbine') {
    px(ctx, 1, 3, 4, 3, '#312e81');
    px(ctx, 5, 2, 9, 4, '#4c1d95');
    px(ctx, 14, 3, 4, 2, '#c084fc');
    px(ctx, 7, 3, 5, 2, '#f0abfc');
  } else if (weaponId === 'cryo_cannon') {
    px(ctx, 1, 3, 4, 3, '#0e7490');
    px(ctx, 5, 2, 9, 4, '#164e63');
    px(ctx, 14, 2, 4, 3, '#a5f3fc');
    px(ctx, 7, 3, 5, 2, '#67e8f9');
  } else if (weaponId === 'flamethrower') {
    px(ctx, 1, 3, 6, 4, '#9a3412');
    px(ctx, 7, 3, 8, 2, '#475569');
    px(ctx, 15, 2, 3, 3, '#fb923c');
    px(ctx, 3, 1, 4, 2, '#ef4444');
  } else if (weaponId === 'sniper_rifle') {
    px(ctx, 0, 3, 4, 3, '#14532d');
    px(ctx, 4, 3, 14, 2, '#334155');
    px(ctx, 5, 1, 6, 2, '#4ade80');
  } else if (weaponId === 'minigun') {
    px(ctx, 1, 2, 9, 4, '#374151');
    px(ctx, 10, 2, 7, 1, '#9ca3af');
    px(ctx, 10, 4, 7, 1, '#f59e0b');
    px(ctx, 10, 5, 7, 1, '#9ca3af');
  } else if (weaponId === 'tesla_coil') {
    px(ctx, 1, 3, 4, 3, '#1e3a8a');
    px(ctx, 5, 2, 8, 4, '#0f172a');
    px(ctx, 13, 2, 4, 3, '#7dd3fc');
    px(ctx, 8, 1, 3, 6, '#38bdf8');
  } else if (weaponId === 'railgun') {
    px(ctx, 0, 3, 5, 3, '#0f172a');
    px(ctx, 5, 2, 12, 1, '#38bdf8');
    px(ctx, 5, 4, 12, 1, '#38bdf8');
    px(ctx, 5, 3, 10, 1, '#e0f2fe');
  } else if (weaponId === 'gauss_cannon') {
    px(ctx, 0, 2, 6, 4, '#4c0519');
    px(ctx, 6, 2, 11, 4, '#1e293b');
    px(ctx, 8, 3, 8, 2, '#f43f5e');
    px(ctx, 15, 2, 3, 4, '#fda4af');
  } else {
    // void_annihilator
    px(ctx, 0, 2, 5, 4, '#3b0764');
    px(ctx, 5, 1, 10, 6, '#1e1b4b');
    px(ctx, 7, 3, 8, 2, '#e879f9');
    px(ctx, 15, 2, 3, 4, '#f5d0fe');
  }
  return c;
}

function drawTreeSprite(biomeId: BiomeId, variant: number): HTMLCanvasElement {
  const biome = BIOMES[biomeId];
  const [c, ctx] = makeCanvas(42, 54);
  const [c0, c1, c2] = biome.treeCanopyColors;
  const trunk = biome.treeTrunkColor;

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(9, 47, 24, 5);

  px(ctx, 17, 30, 8, 19, '#090c0a');
  px(ctx, 18, 30, 6, 18, trunk);
  px(ctx, 19, 32, 2, 14, 'rgba(255,255,255,0.08)');

  // White birch stripes
  if (biomeId === 'birch_hollow') {
    px(ctx, 18, 33, 3, 1, '#1e293b');
    px(ctx, 21, 38, 3, 1, '#1e293b');
    px(ctx, 18, 43, 4, 1, '#1e293b');
  }

  if (biomeId === 'ash_ruins' || biomeId === 'blood_citadel' || biomeId === 'scorched_fort') {
    px(ctx, 10, 20, 7, 3, trunk);
    px(ctx, 24, 15, 8, 3, trunk);
    px(ctx, 17, 9, 7, 22, trunk);
    const ember =
      biomeId === 'blood_citadel' ? '#ef4444' : variant % 2 === 0 ? '#ef4444' : '#f97316';
    px(ctx, 19, 24, 3, 3, ember);
    px(ctx, 20, 25, 1, 1, '#fef08a');
    if (biomeId === 'blood_citadel' || biomeId === 'scorched_fort') {
      px(ctx, 11, 19, 2, 2, '#f87171');
      px(ctx, 29, 14, 2, 2, '#fb923c');
    }
    return c;
  }

  if (biomeId === 'obsidian_canyon' || biomeId === 'abyss_rift') {
    // Jagged crystal spire
    px(ctx, 13, 14, 16, 33, '#090d0b');
    px(ctx, 14, 15, 14, 31, c0);
    px(ctx, 17, 7, 8, 39, c1);
    px(ctx, 19, 9, 4, 26, c2);
    px(ctx, 9, 24, 6, 18, c0);
    px(ctx, 27, 22, 6, 20, c1);
    return c;
  }

  if (biomeId === 'fungal_grove' || biomeId === 'plague_heart') {
    px(ctx, 16, 20, 10, 28, '#2b2433');
    px(ctx, 17, 21, 8, 26, trunk);
    px(ctx, 6, 12, 30, 13, '#090d0b');
    px(ctx, 7, 13, 28, 11, c0);
    px(ctx, 10, 8, 22, 8, c1);
    px(ctx, 11, 14, 4, 3, c2);
    px(ctx, 22, 10, 5, 3, c2);
    px(ctx, 26, 17, 3, 2, c2);
    return c;
  }

  if (biomeId === 'pine_forest' || biomeId === 'winter_woods' || biomeId === 'frozen_lake') {
    const layers = [
      { y: 25, w: 34, h: 10 },
      { y: 17, w: 28, h: 10 },
      { y: 9, w: 20, h: 9 },
      { y: 3, w: 12, h: 7 },
    ];
    for (const l of layers) {
      const x = Math.floor((42 - l.w) / 2);
      px(ctx, x - 1, l.y, l.w + 2, l.h, '#090d0b');
      px(ctx, x, l.y + 1, l.w, l.h - 2, c0);
      px(ctx, x + 2, l.y + 1, l.w - 4, l.h - 4, c1);
      px(ctx, x + 4, l.y + 2, Math.max(2, l.w - 10), 2, c2);
      if (biomeId === 'winter_woods' || biomeId === 'frozen_lake') {
        px(ctx, x + 2, l.y + 1, l.w - 4, 2, '#e0f2fe');
      }
    }
    return c;
  }

  // Lush rounded multi-lobed canopy
  const lobes = [
    { x: 6, y: 12, w: 30, h: 17 },
    { x: 9, y: 7, w: 24, h: 19 },
    { x: 13, y: 4, w: 16, h: 10 },
  ];
  for (const l of lobes) {
    px(ctx, l.x - 1, l.y - 1, l.w + 2, l.h + 2, '#090d0b');
  }
  for (const l of lobes) {
    px(ctx, l.x, l.y, l.w, l.h, c0);
  }
  px(ctx, 10, 9, 22, 13, c1);
  px(ctx, 13, 6, 15, 7, c1);
  px(ctx, 14, 7, 11, 4, c2);
  px(ctx, 11, 13, 6, 4, c2);
  if (biomeId === 'misty_swamp' || biomeId === 'foggy_moor') {
    px(ctx, 8, 28, 2, 7, '#4d7c5b');
    px(ctx, 14, 29, 2, 5, '#4d7c5b');
    px(ctx, 31, 27, 2, 8, '#4d7c5b');
  } else if (biomeId === 'autumn_trail') {
    px(ctx, 16, 8, 3, 2, '#fde047');
    px(ctx, 25, 14, 3, 3, variant === 1 ? '#fb923c' : '#fde047');
    px(ctx, 10, 17, 2, 2, '#ea580c');
  } else if (biomeId === 'cursed_graveyard') {
    px(ctx, 16, 12, 2, 2, '#c4b5fd');
    px(ctx, 25, 16, 2, 2, '#a78bfa');
  }
  return c;
}

function drawBushSprite(biomeId: BiomeId): HTMLCanvasElement {
  const biome = BIOMES[biomeId];
  const [c, ctx] = makeCanvas(20, 16);
  const [c0, c1, c2] = biome.treeCanopyColors;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(2, 12, 16, 3);
  px(ctx, 2, 5, 16, 8, '#090d0b');
  px(ctx, 3, 6, 14, 6, c0);
  px(ctx, 5, 3, 10, 7, c1);
  px(ctx, 7, 4, 5, 3, c2);
  if (biomeId === 'pine_forest' || biomeId === 'birch_hollow') {
    px(ctx, 6, 8, 2, 2, '#f43f5e');
    px(ctx, 13, 7, 2, 2, '#f43f5e');
  } else if (biomeId === 'fungal_grove' || biomeId === 'plague_heart') {
    px(ctx, 6, 7, 3, 2, c2);
    px(ctx, 12, 6, 2, 2, '#99f6e4');
  } else if (biomeId === 'winter_woods' || biomeId === 'frozen_lake') {
    px(ctx, 5, 3, 10, 2, '#e0f2fe');
  }
  return c;
}

function drawRockSprite(biomeId: BiomeId): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(18, 14);
  const isDarkStone =
    biomeId === 'ash_ruins' ||
    biomeId === 'cursed_graveyard' ||
    biomeId === 'blood_citadel' ||
    biomeId === 'obsidian_canyon' ||
    biomeId === 'scorched_fort' ||
    biomeId === 'abyss_rift';
  const dark = isDarkStone ? '#2c2930' : '#3b4248';
  const mid = isDarkStone ? '#46414b' : '#58626b';
  const hi = isDarkStone ? '#68606e' : '#7b8794';
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(2, 10, 14, 3);
  px(ctx, 2, 4, 14, 7, '#090d0b');
  px(ctx, 3, 5, 12, 5, dark);
  px(ctx, 4, 3, 9, 5, mid);
  px(ctx, 5, 3, 5, 2, hi);
  if (biomeId === 'pine_forest' || biomeId === 'misty_swamp' || biomeId === 'birch_hollow') {
    px(ctx, 5, 5, 6, 2, '#3b6e4c');
  } else if (biomeId === 'winter_woods' || biomeId === 'frozen_lake') {
    px(ctx, 4, 3, 9, 2, '#e0f2fe');
  } else if (biomeId === 'cursed_graveyard') {
    px(ctx, 7, 4, 4, 5, '#64748b');
  } else if (biomeId === 'blood_citadel' || biomeId === 'scorched_fort') {
    px(ctx, 6, 6, 4, 2, '#ef4444');
  } else if (biomeId === 'obsidian_canyon' || biomeId === 'abyss_rift') {
    px(ctx, 6, 4, 4, 3, BIOMES[biomeId].accentColor);
  }
  return c;
}

function drawTerrainTile(biomeId: BiomeId, surface: SurfaceType, variant: number): HTMLCanvasElement {
  const biome = BIOMES[biomeId];
  const [c, ctx] = makeCanvas(32, 32);
  const ox = (variant * 11) % 19;
  const oy = (variant * 7) % 17;

  if (surface === 'wood') {
    px(ctx, 0, 0, 32, 32, '#5e3c23');
    px(ctx, 0, 0, 32, 2, '#3b2413');
    px(ctx, 0, 15, 32, 2, '#3b2413');
    px(ctx, 0, 30, 32, 2, '#3b2413');
    px(ctx, 2 + (variant % 3), 4, 11, 2, '#734a2c');
    px(ctx, 16 - (variant % 2), 19, 12, 2, '#734a2c');
    px(ctx, 3, 4, 2, 2, '#1f2937');
    px(ctx, 27, 4, 2, 2, '#1f2937');
    px(ctx, 3, 20, 2, 2, '#1f2937');
    px(ctx, 27, 20, 2, 2, '#1f2937');
    return c;
  }

  if (surface === 'mud') {
    px(ctx, 0, 0, 32, 32, biome.puddleColor);
    if (variant % 2 === 0) {
      px(ctx, 4 + (ox % 12), 6 + (oy % 10), 8, 5, 'rgba(15, 24, 20, 0.24)');
      px(ctx, 6 + (ox % 12), 7 + (oy % 10), 5, 2, 'rgba(148, 210, 195, 0.16)');
    } else {
      px(ctx, 12 - (ox % 8), 18 + (oy % 6), 7, 4, 'rgba(15, 24, 20, 0.22)');
      px(ctx, 15, 11, 3, 2, 'rgba(148, 210, 195, 0.14)');
    }
    px(ctx, 3 + variant * 4, 25 - (variant % 3) * 4, 2, 2, 'rgba(20, 32, 26, 0.35)');
    return c;
  }

  if (surface === 'gravel') {
    px(ctx, 0, 0, 32, 32, biome.trailColor);
    px(ctx, 4 + ox, 5 + oy, 3, 2, biome.trailEdgeColor);
    px(ctx, (ox + 13) % 27, (oy + 11) % 27, 2, 2, 'rgba(0,0,0,0.12)');
    px(ctx, (ox + 21) % 28, (oy + 19) % 28, 2, 1, 'rgba(255,255,255,0.08)');
    if (biomeId === 'autumn_trail' && variant % 2 === 1) {
      px(ctx, 5 + ((variant * 9) % 20), 6 + ((variant * 13) % 18), 3, 2, variant === 1 ? '#c2410c' : '#d97706');
      if (variant === 3) px(ctx, 21, 9, 2, 2, '#eab308');
    }
    return c;
  }

  if (surface === 'stone') {
    const baseStone = biomeId === 'frozen_lake' ? '#274457' : '#2d2c34';
    const plateA = biomeId === 'frozen_lake' ? '#31556b' : '#34333d';
    const plateB = biomeId === 'frozen_lake' ? '#2c4c61' : '#31303a';
    const seam = biomeId === 'frozen_lake' ? '#1a2f3d' : '#1d1c22';
    px(ctx, 0, 0, 32, 32, baseStone);
    px(ctx, 1, 1, 14, 14, plateA);
    px(ctx, 17, 1, 14, 14, plateB);
    px(ctx, 1, 17, 14, 14, plateB);
    px(ctx, 17, 17, 14, 14, plateA);
    px(ctx, 0, 15, 32, 1, seam);
    px(ctx, 15, 0, 1, 32, seam);
    if (variant === 1 || variant === 4) {
      px(ctx, 5 + (variant % 3) * 4, 5, 4, 2, seam);
      if ((biomeId === 'ash_ruins' || biomeId === 'scorched_fort') && variant === 1) {
        px(ctx, 20, 22, 3, 2, '#ea580c');
      } else if (biomeId === 'frozen_lake' && variant === 4) {
        px(ctx, 19, 20, 5, 1, '#bae6fd');
      } else if (biomeId !== 'ash_ruins' && variant === 4) {
        px(ctx, 20, 20, 4, 2, '#3b6645');
      }
    }
    return c;
  }

  px(ctx, 0, 0, 32, 32, biome.groundColors[0]);
  px(ctx, 3 + ox, 5 + oy, 6, 4, biome.groundColors[1]);
  ctx.fillStyle = biome.accentColor;
  ctx.globalAlpha = 0.24;
  px(ctx, 6 + ox, 8 + oy, 2, 3, biome.accentColor);
  px(ctx, 9 + ox, 9 + oy, 2, 2, biome.accentColor);
  if (variant % 2 === 0) {
    px(ctx, (ox + 17) % 26, (oy + 14) % 26, 2, 3, biome.accentColor);
  }
  ctx.globalAlpha = 1;

  if (variant === 5) {
    if (biomeId === 'pine_forest' || biomeId === 'birch_hollow') {
      px(ctx, 15, 22, 2, 2, '#fde047');
    } else if (biomeId === 'autumn_trail') {
      px(ctx, 14, 21, 3, 2, '#ea580c');
    }
  }
  return c;
}

function drawGlowCanvas(radius: number, innerColor: string, midColor: string): HTMLCanvasElement {
  const size = radius * 2;
  const [c, ctx] = makeCanvas(size, size);
  const grad = ctx.createRadialGradient(radius, radius, 4, radius, radius, radius);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.55, midColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export class SpriteAtlas {
  public playerSkins: Record<SkinId, [HTMLCanvasElement, HTMLCanvasElement]>;
  public playerFlash: HTMLCanvasElement;
  public zombies: Record<ZombieKind, [HTMLCanvasElement, HTMLCanvasElement]>;
  public zombieFlash: Record<ZombieKind, HTMLCanvasElement>;
  public weapons: Record<WeaponId, HTMLCanvasElement>;
  public trees: Record<BiomeId, [HTMLCanvasElement, HTMLCanvasElement]>;
  public bushes: Record<BiomeId, HTMLCanvasElement>;
  public rocks: Record<BiomeId, HTMLCanvasElement>;
  public tiles: Record<BiomeId, Record<SurfaceType, HTMLCanvasElement[]>>;
  public campfireGlow: HTMLCanvasElement;
  public lanternGlow: HTMLCanvasElement;

  constructor() {
    this.playerSkins = {} as SpriteAtlas['playerSkins'];
    for (const skinId of SKIN_ORDER) {
      this.playerSkins[skinId] = [
        drawPlayerSkinFrame(skinId, 0),
        drawPlayerSkinFrame(skinId, 1),
      ];
    }
    this.playerFlash = drawPlayerSkinFrame('ranger', 0, true);

    this.zombies = {
      standard: [drawZombieFrame('standard', 0), drawZombieFrame('standard', 1)],
      runner: [drawZombieFrame('runner', 0), drawZombieFrame('runner', 1)],
      flanker: [drawZombieFrame('flanker', 0), drawZombieFrame('flanker', 1)],
      brute: [drawZombieFrame('brute', 0), drawZombieFrame('brute', 1)],
      spitter: [drawZombieFrame('spitter', 0), drawZombieFrame('spitter', 1)],
      shielder: [drawZombieFrame('shielder', 0), drawZombieFrame('shielder', 1)],
      boomer: [drawZombieFrame('boomer', 0), drawZombieFrame('boomer', 1)],
      boss: [drawZombieFrame('boss', 0), drawZombieFrame('boss', 1)],
    };

    this.zombieFlash = {
      standard: drawZombieFrame('standard', 0, true),
      runner: drawZombieFrame('runner', 0, true),
      flanker: drawZombieFrame('flanker', 0, true),
      brute: drawZombieFrame('brute', 0, true),
      spitter: drawZombieFrame('spitter', 0, true),
      shielder: drawZombieFrame('shielder', 0, true),
      boomer: drawZombieFrame('boomer', 0, true),
      boss: drawZombieFrame('boss', 0, true),
    };

    this.weapons = {} as SpriteAtlas['weapons'];
    for (const wId of WEAPON_ORDER) {
      this.weapons[wId] = drawWeaponSprite(wId);
    }

    this.trees = {} as SpriteAtlas['trees'];
    this.bushes = {} as SpriteAtlas['bushes'];
    this.rocks = {} as SpriteAtlas['rocks'];
    this.tiles = {} as SpriteAtlas['tiles'];

    const surfaces: SurfaceType[] = ['grass', 'mud', 'gravel', 'stone', 'wood'];
    for (const b of BIOME_CYCLE) {
      this.trees[b] = [drawTreeSprite(b, 0), drawTreeSprite(b, 1)];
      this.bushes[b] = drawBushSprite(b);
      this.rocks[b] = drawRockSprite(b);
      this.tiles[b] = {} as Record<SurfaceType, HTMLCanvasElement[]>;
      for (const s of surfaces) {
        this.tiles[b][s] = [0, 1, 2, 3, 4, 5].map((v) => drawTerrainTile(b, s, v));
      }
    }

    this.campfireGlow = drawGlowCanvas(48, 'rgba(251, 191, 36, 0.34)', 'rgba(234, 88, 12, 0.14)');
    this.lanternGlow = drawGlowCanvas(68, 'rgba(253, 230, 138, 0.14)', 'rgba(253, 230, 138, 0.05)');
  }
}
