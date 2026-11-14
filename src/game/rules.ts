import {
  BIOME_CYCLE,
  BIOMES,
  DAILY_REWARDS,
  INACTIVITY_PUSH_THRESHOLD_MS,
  KILL_HEAL_HP,
  LOADING_TIPS,
  MAX_ARMOR_LEVEL,
  MAX_UPGRADE_LEVEL,
  MAX_VITALITY_LEVEL,
  SKINS,
  STANDARD_WAVES_PER_MATCH,
  WEAPONS,
} from './constants';
import type {
  BiomeId,
  DifficultyId,
  EffectiveWeaponStats,
  PushSmsMessage,
  SkinId,
  SurfaceType,
  TutorialCombatStage,
  UpgradeStatKey,
  WavePlan,
  WaveSpawnEntry,
  WeaponDefinition,
  WeaponId,
  WeaponUpgradeState,
  ZombieKind,
} from './types';

export const WORLD_TILE_SIZE = 32;
export const ARENA_HALF_HEIGHT = 340;
export const TRAIL_HALF_WIDTH = 68;
export const AUTO_AIM_RANGE = 95;

export function getXpToNextLevel(playerLevel: number): number {
  const safeLvl = Math.max(1, Math.floor(playerLevel));
  return Math.round((240 * Math.pow(1.26, safeLvl - 1)) / 5) * 5;
}

export function applyXpGain(
  currentLevel: number,
  currentXp: number,
  gainedXp: number
): { newLevel: number; newXp: number; levelsGained: number; xpToNext: number } {
  const safeLevel = Number.isFinite(currentLevel) ? currentLevel : 1;
  const safeCurXp = Number.isFinite(currentXp) ? currentXp : 0;
  const safeGain = Number.isFinite(gainedXp) ? gainedXp : 0;

  let lvl = Math.max(1, Math.floor(safeLevel));
  let xp = Math.max(0, Math.floor(safeCurXp + Math.max(0, safeGain)));
  let levelsGained = 0;
  let guard = 0;

  while (xp >= getXpToNextLevel(lvl) && guard < 200) {
    xp -= getXpToNextLevel(lvl);
    lvl += 1;
    levelsGained += 1;
    guard += 1;
  }

  return {
    newLevel: lvl,
    newXp: xp,
    levelsGained,
    xpToNext: getXpToNextLevel(lvl),
  };
}

export function isBiomeUnlocked(biomeId: BiomeId, playerLevel: number): boolean {
  return playerLevel >= BIOMES[biomeId].requiredPlayerLevel;
}

export function getUnlockedBiomes(playerLevel: number): BiomeId[] {
  return BIOME_CYCLE.filter((id) => isBiomeUnlocked(id, playerLevel));
}

export function getBiomeForLevel(playerLevel: number): BiomeId {
  const unlocked = getUnlockedBiomes(playerLevel);
  return unlocked[unlocked.length - 1] ?? 'pine_forest';
}

export function calculateRoundXpReward(
  biomeId: BiomeId,
  difficultyXpMult: number,
  isTutorialMatch: boolean
): number {
  if (isTutorialMatch) return 10;
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  const baseRoundBonus = 20 + biomeIdx * 7;
  return Math.round(baseRoundBonus * difficultyXpMult);
}

/**
 * Zombie HP scales steeply in every subsequent biome and across waves so each stage feels noticeably tougher.
 */
export function getBiomeZombieHpMultiplier(
  biomeId: BiomeId,
  waveNumber: number,
  isTutorialMatch: boolean
): number {
  if (isTutorialMatch) return 0.85;
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const biomeFactor = 1 + biomeIdx * 0.56 + biomeIdx * biomeIdx * 0.065;
  const waveFactor = 1 + (safeWave - 1) * 0.14;
  return Number((biomeFactor * waveFactor).toFixed(3));
}

export function getBiomeZombieSpeedMultiplier(
  biomeId: BiomeId,
  waveNumber: number,
  isTutorialMatch: boolean
): number {
  if (isTutorialMatch) return 0.78;
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const biomeFactor = 1 + biomeIdx * 0.055;
  const waveFactor = 1 + (safeWave - 1) * 0.035;
  return Number((biomeFactor * waveFactor).toFixed(3));
}

export function getBiomeZombieDamageMultiplier(
  biomeId: BiomeId,
  waveNumber: number,
  isTutorialMatch: boolean
): number {
  if (isTutorialMatch) return 0.65;
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const biomeFactor = 1 + biomeIdx * 0.14;
  const waveFactor = 1 + (safeWave - 1) * 0.035;
  return Number((biomeFactor * waveFactor).toFixed(3));
}

export function getTutorialCombatStage(
  moved: boolean,
  shot: boolean,
  reloaded: boolean
): TutorialCombatStage {
  if (!moved) return 'move';
  if (!shot) return 'shoot';
  void reloaded;
  return 'reload_or_clear';
}

export function getBiomeBossHp(biomeId: BiomeId): number {
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  return Math.round(1250 * (1 + biomeIdx * 0.78 + biomeIdx * biomeIdx * 0.055));
}

export function calculateBossTrophyReward(
  biomeId: BiomeId,
  difficulty: DifficultyId = 'normal'
): number {
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));
  const bossHp = getBiomeBossHp(biomeId);
  // Trophies scale with both the biome progression and boss toughness/difficulty
  const biomeBase = 1 + Math.floor(biomeIdx / 4) + Math.floor(bossHp / 5500);
  const diffMult = difficulty === 'nightmare' ? 2 : difficulty === 'hard' ? 1.5 : 1;
  return Math.max(1, Math.round(biomeBase * diffMult));
}

export interface AdrenalineComboBonus {
  tier: number;
  label: string;
  critChance: number;
  fireRateBonus: number;
  speedBonus: number;
}

export function getAdrenalineComboBonus(comboCount: number): AdrenalineComboBonus {
  if (comboCount >= 10) {
    return {
      tier: 3,
      label: `БЕЗУМИЕ ×${comboCount}!`,
      critChance: 0.26,
      fireRateBonus: 0.22,
      speedBonus: 0.12,
    };
  }
  if (comboCount >= 6) {
    return {
      tier: 2,
      label: `ЯРОСТЬ ×${comboCount}!`,
      critChance: 0.18,
      fireRateBonus: 0.14,
      speedBonus: 0.08,
    };
  }
  if (comboCount >= 3) {
    return {
      tier: 1,
      label: `АДРЕНАЛИН ×${comboCount}`,
      critChance: 0.1,
      fireRateBonus: 0.08,
      speedBonus: 0.04,
    };
  }
  return {
    tier: 0,
    label: '',
    critChance: 0.04,
    fireRateBonus: 0,
    speedBonus: 0,
  };
}

/**
 * Restores HP when killing a zombie if the player has spent/lost HP.
 */
export function applyKillHeal(
  hp: number,
  maxHp: number,
  healAmount: number = KILL_HEAL_HP
): { newHp: number; healed: number } {
  if (hp >= maxHp || hp <= 0) {
    return { newHp: Math.min(maxHp, Math.max(0, hp)), healed: 0 };
  }
  const newHp = Math.min(maxHp, hp + healAmount);
  return {
    newHp,
    healed: Math.max(0, newHp - hp),
  };
}

export function getEffectivePlayerStats(
  skinId: SkinId,
  vitalityLevel: number,
  armorLevel: number,
  playerLevel: number
): { maxHp: number; startArmor: number; moveSpeed: number; damageMult: number } {
  const skin = SKINS[skinId];
  const levelBonusHp = Math.max(0, playerLevel - 1) * 5;
  const levelDmgMult = 1 + Math.max(0, playerLevel - 1) * 0.03;
  return {
    maxHp: 100 + vitalityLevel * 20 + skin.bonusHp + levelBonusHp,
    startArmor: armorLevel * 15 + skin.bonusArmor,
    moveSpeed: Math.round(148 * (1 + skin.speedBonusPct / 100)),
    damageMult: Number((levelDmgMult * (1 + skin.damageBonusPct / 100)).toFixed(3)),
  };
}

/**
 * Generates deterministic wave composition for either the 1-wave starter tutorial
 * or a 7-wave biome expedition with biome-specific enemy rosters and rising intensity.
 */
export function generateBiomeWaveComposition(
  biomeId: BiomeId,
  waveNumber: number,
  isTutorialMatch: boolean
): WavePlan {
  if (isTutorialMatch) {
    return {
      waveNumber: 1,
      totalWaves: 1,
      biomeId: 'pine_forest',
      isBossWave: false,
      bossCount: 0,
      standardCount: 3,
      entries: [
        { kind: 'standard', delaySec: 0.4 },
        { kind: 'standard', delaySec: 1.4 },
        { kind: 'standard', delaySec: 2.5 },
      ],
    };
  }

  const safeWave = Math.max(1, Math.min(STANDARD_WAVES_PER_MATCH, Math.floor(waveNumber)));
  const biome = BIOMES[biomeId];
  const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(biomeId));

  // Milestone biomes (with bossName) culminate on wave 7 with 1 giant boss + 7 escort zombies
  if (biome.bossName && safeWave === STANDARD_WAVES_PER_MATCH) {
    const escortKind: ZombieKind =
      biomeIdx >= 14 ? 'shielder' : biomeIdx >= 10 ? 'flanker' : biomeIdx >= 6 ? 'runner' : 'standard';
    const escortEntries: WaveSpawnEntry[] = [];
    for (let i = 0; i < 7; i++) {
      escortEntries.push({
        kind: i % 3 === 2 ? escortKind : 'standard',
        delaySec: Number((1.0 + i * 0.9).toFixed(2)),
      });
    }
    return {
      waveNumber: safeWave,
      totalWaves: STANDARD_WAVES_PER_MATCH,
      biomeId,
      isBossWave: true,
      bossCount: 1,
      standardCount: 7,
      entries: [{ kind: 'boss', delaySec: 0.5 }, ...escortEntries],
    };
  }

  const totalCount = biome.baseZombiesPerWave + Math.round((safeWave - 1) * (1.2 + biomeIdx * 0.1));
  const entries: WaveSpawnEntry[] = [];
  let t = 0.25;
  const interval = Math.max(0.22, 0.92 - biomeIdx * 0.045 - safeWave * 0.045);

  for (let i = 0; i < totalCount; i++) {
    let kind: ZombieKind = 'standard';

    if (biomeId === 'pine_forest') {
      if (safeWave >= 2 && i % 4 === 2) kind = 'runner';
      else if (safeWave >= 4 && i % 5 === 4) kind = 'flanker';
      else if (safeWave >= 6 && i === totalCount - 1) kind = 'brute';
    } else if (biomeId === 'misty_swamp') {
      if (i % 3 === 1) kind = 'flanker';
      else if (safeWave >= 2 && i % 4 === 2) kind = 'spitter';
      else if (safeWave >= 3 && i % 5 === 4) kind = 'runner';
      else if (safeWave >= 6 && i === totalCount - 1) kind = 'brute';
    } else if (biomeId === 'birch_hollow') {
      if (i % 3 === 0) kind = 'runner';
      else if (i % 4 === 2) kind = 'flanker';
      else if (safeWave >= 4 && i % 6 === 5) kind = 'spitter';
    } else if (biomeId === 'autumn_trail') {
      if (i % 3 === 1) kind = 'runner';
      else if (i % 4 === 2) kind = 'flanker';
      else if (safeWave >= 2 && i % 5 === 4) kind = 'brute';
      else if (safeWave >= 5 && i % 6 === 0) kind = 'boomer';
    } else if (biomeId === 'foggy_moor') {
      if (i % 3 === 0) kind = 'spitter';
      else if (i % 3 === 1) kind = 'flanker';
      else if (safeWave >= 2 && i % 4 === 3) kind = 'boomer';
      else kind = 'runner';
    } else if (biomeId === 'winter_woods') {
      if (i % 4 === 0) kind = 'shielder';
      else if (i % 3 === 1) kind = 'flanker';
      else if (i % 4 === 3) kind = 'runner';
      else if (safeWave >= 3 && i % 5 === 2) kind = 'spitter';
    } else if (biomeId === 'frozen_lake') {
      if (i % 4 === 0) kind = 'shielder';
      else if (i % 4 === 2) kind = 'brute';
      else if (i % 3 === 1) kind = 'runner';
      else kind = 'flanker';
    } else if (biomeId === 'cursed_graveyard') {
      if (i % 4 === 1) kind = 'boomer';
      else if (i % 3 === 2) kind = 'spitter';
      else if (i % 5 === 0) kind = 'shielder';
      else kind = 'flanker';
    } else if (biomeId === 'fungal_grove') {
      if (i % 3 === 0) kind = 'spitter';
      else if (i % 4 === 1) kind = 'boomer';
      else if (i % 5 === 3) kind = 'brute';
      else kind = 'flanker';
    } else if (biomeId === 'thorny_thicket') {
      if (i % 3 === 0) kind = 'runner';
      else if (i % 4 === 1) kind = 'flanker';
      else if (i % 5 === 2) kind = 'shielder';
      else kind = 'boomer';
    } else if (biomeId === 'obsidian_canyon') {
      if (i % 3 === 0) kind = 'shielder';
      else if (i % 4 === 1) kind = 'brute';
      else if (i % 4 === 2) kind = 'spitter';
      else kind = 'flanker';
    } else if (biomeId === 'ash_ruins') {
      if (i % 3 === 0) kind = 'shielder';
      else if (i % 4 === 1) kind = 'brute';
      else if (i % 4 === 2) kind = 'boomer';
      else kind = 'runner';
    } else if (biomeId === 'scorched_fort') {
      const pool: ZombieKind[] = ['brute', 'boomer', 'shielder', 'runner', 'flanker'];
      kind = pool[(i + safeWave) % pool.length];
    } else if (biomeId === 'abyss_rift') {
      const pool: ZombieKind[] = ['flanker', 'shielder', 'spitter', 'runner', 'boomer'];
      kind = pool[(i + safeWave) % pool.length];
    } else if (biomeId === 'plague_heart') {
      const pool: ZombieKind[] = ['boomer', 'spitter', 'brute', 'flanker', 'shielder'];
      kind = pool[(i + safeWave) % pool.length];
    } else if (biomeId === 'blood_citadel') {
      const pool: ZombieKind[] = ['shielder', 'flanker', 'boomer', 'brute', 'spitter', 'runner'];
      kind = pool[(i + safeWave) % pool.length];
    }

    entries.push({ kind, delaySec: Number(t.toFixed(2)) });
    // Occasional twin-pack surge so hordes arrive in tense bursts
    t += i % 3 === 2 ? interval * 0.35 : interval;
  }

  return {
    waveNumber: safeWave,
    totalWaves: STANDARD_WAVES_PER_MATCH,
    biomeId,
    isBossWave: false,
    bossCount: 0,
    standardCount: entries.filter((e) => e.kind === 'standard').length,
    entries,
  };
}

/**
 * Deterministic spatial hash for world terrain tiles so surface sounds
 * always match the exact visual tiles rendered under the player's feet.
 */
export function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function getTrailCenterY(worldX: number): number {
  return Math.sin(worldX * 0.0042) * 86 + Math.cos(worldX * 0.0019) * 44;
}

export function isWoodenBridgeAt(worldX: number, worldY: number): boolean {
  const sector = Math.floor((worldX + 240) / 960);
  const localX = worldX + 240 - sector * 960;
  const inBridgeX = Math.abs(localX - 480) < 64;
  if (!inBridgeX) return false;
  const trailY = getTrailCenterY(worldX);
  return Math.abs(worldY - trailY) < TRAIL_HALF_WIDTH + 14;
}

export function getSurfaceAtWorldPos(
  worldX: number,
  worldY: number,
  biomeId: BiomeId
): SurfaceType {
  if (isWoodenBridgeAt(worldX, worldY)) {
    return 'wood';
  }

  const sector = Math.floor((worldX + 240) / 960);
  const localX = worldX + 240 - sector * 960;
  if (Math.abs(localX - 480) < 52) {
    return 'mud';
  }

  const trailY = getTrailCenterY(worldX);
  const distFromTrail = Math.abs(worldY - trailY);
  const tx = Math.floor(worldX / WORLD_TILE_SIZE);
  const ty = Math.floor(worldY / WORLD_TILE_SIZE);
  const h = tileHash(tx, ty);
  const primary = BIOMES[biomeId].primarySurface;

  if (distFromTrail < TRAIL_HALF_WIDTH - (h * 16 - 8)) {
    if (primary === 'stone') return 'stone';
    if (primary === 'mud') return h > 0.45 ? 'mud' : 'gravel';
    return 'gravel';
  }

  if (primary === 'grass' || biomeId === 'winter_woods') {
    if (h > 0.88) return 'mud';
    if (h < 0.08) return 'stone';
    return 'grass';
  }
  if (primary === 'mud') {
    if (h > 0.35) return 'mud';
    if (h < 0.1) return 'stone';
    return 'grass';
  }
  if (primary === 'gravel') {
    if (h > 0.55) return 'gravel';
    if (h < 0.1) return 'mud';
    return 'grass';
  }
  if (h > 0.35) return 'stone';
  if (h < 0.15) return 'mud';
  return 'gravel';
}

export function getWeaponEffectiveStats(
  weapon: WeaponDefinition,
  upgrade: WeaponUpgradeState
): EffectiveWeaponStats {
  const dmgMult = 1 + upgrade.damageLevel * 0.24;
  const rateMult = 1 + upgrade.fireRateLevel * 0.16;
  const magMult = 1 + upgrade.magLevel * 0.25;
  const reloadMult = Math.max(0.55, 1 - upgrade.magLevel * 0.09);

  return {
    damage: Math.round(weapon.baseDamage * dmgMult),
    fireRate: Number((weapon.baseFireRate * rateMult).toFixed(2)),
    magSize: Math.max(weapon.baseMagSize, Math.round(weapon.baseMagSize * magMult)),
    reloadSec: Number((weapon.baseReloadSec * reloadMult).toFixed(2)),
    pellets: weapon.pellets,
    spreadRad: weapon.spreadRad,
    projectileSpeed: weapon.projectileSpeed,
    pierce: weapon.pierce,
    knockback: weapon.knockback,
    range: weapon.range,
  };
}

export function getUpgradeCost(
  weaponId: WeaponId,
  statKey: UpgradeStatKey,
  currentLevel: number
): number {
  const weapon = WEAPONS[weaponId];
  const base = Math.max(30, Math.round(weapon.price * 0.16) + 30);
  const statFactor = statKey === 'damage' ? 1.15 : statKey === 'fireRate' ? 1.05 : 0.9;
  return Math.round(base * statFactor * Math.pow(1.85, currentLevel));
}

export function canPurchaseWeapon(
  coins: number,
  owned: WeaponId[],
  weaponId: WeaponId
): boolean {
  if (owned.includes(weaponId)) return false;
  return coins >= WEAPONS[weaponId].price;
}

export function getLatestPurchasedWeapon(ownedWeapons: ReadonlyArray<WeaponId>): WeaponId {
  return ownedWeapons[ownedWeapons.length - 1] ?? 'rusty_pistol';
}

export function canPurchaseSkin(
  coins: number,
  owned: SkinId[],
  skinId: SkinId
): boolean {
  if (owned.includes(skinId)) return false;
  return coins >= SKINS[skinId].price;
}

export function canUpgradeWeapon(
  coins: number,
  owned: WeaponId[],
  upgrades: Record<WeaponId, WeaponUpgradeState>,
  weaponId: WeaponId,
  statKey: UpgradeStatKey
): boolean {
  if (!owned.includes(weaponId)) return false;
  const state = upgrades[weaponId];
  const current =
    statKey === 'damage'
      ? state.damageLevel
      : statKey === 'fireRate'
        ? state.fireRateLevel
        : state.magLevel;
  if (current >= MAX_UPGRADE_LEVEL) return false;
  return coins >= getUpgradeCost(weaponId, statKey, current);
}

export function getVitalityUpgradeCost(currentLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  return Math.round(140 * Math.pow(1.125, safeLevel) + safeLevel * 95);
}

export function getArmorUpgradeCost(currentLevel: number): number {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  return Math.round(180 * Math.pow(1.128, safeLevel) + safeLevel * 120);
}

export function canUpgradeVitality(coins: number, currentLevel: number): boolean {
  if (currentLevel >= MAX_VITALITY_LEVEL) return false;
  return coins >= getVitalityUpgradeCost(currentLevel);
}

export function canUpgradeArmor(coins: number, currentLevel: number): boolean {
  if (currentLevel >= MAX_ARMOR_LEVEL) return false;
  return coins >= getArmorUpgradeCost(currentLevel);
}

export function checkCircleCollision(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function getBiomeDisplayName(biomeId: BiomeId): string {
  return BIOMES[biomeId].name;
}

export interface AutoAimCandidate {
  id: number;
  x: number;
  y: number;
  radius: number;
  isDead: boolean;
}

export interface AutoAimTarget {
  id: number;
  x: number;
  y: number;
  angle: number;
  edgeDistance: number;
}

export function findAutoAimTarget(
  playerX: number,
  playerY: number,
  candidates: ReadonlyArray<AutoAimCandidate>,
  maxRange: number = AUTO_AIM_RANGE,
  muzzleOffsetY: number = -4
): AutoAimTarget | null {
  let best: AutoAimTarget | null = null;

  for (const z of candidates) {
    if (z.isDead) continue;
    const dx = z.x - playerX;
    const dy = z.y - playerY;
    const centerDist = Math.hypot(dx, dy);
    const edgeDist = Math.max(0, centerDist - z.radius);
    if (edgeDist > maxRange) continue;

    if (!best || edgeDist < best.edgeDistance) {
      const aimDy = z.y - (playerY + muzzleOffsetY);
      best = {
        id: z.id,
        x: z.x,
        y: z.y,
        angle: Math.atan2(aimDy, dx),
        edgeDistance: edgeDist,
      };
    }
  }

  return best;
}

export function isViewportPortrait(width: number, height: number): boolean {
  return height > width;
}

/**
 * Converts pointer delta relative to center of a CSS +90deg rotated stage back into
 * the stage's local horizontal/vertical coordinates.
 */
export function transformRotatedPointerDelta(
  dx: number,
  dy: number,
  isRotated: boolean
): { x: number; y: number } {
  if (!isRotated) return { x: dx, y: dy };
  return {
    x: dy,
    y: -dx,
  };
}

export function pickRandomLoadingTip(
  lastIndex: number | null = null,
  rng: () => number = Math.random
): { index: number; text: string } {
  const count = LOADING_TIPS.length;
  if (count === 0) {
    return { index: 0, text: '' };
  }
  if (count === 1) {
    return { index: 0, text: LOADING_TIPS[0] };
  }

  const normalizedLast =
    typeof lastIndex === 'number' && Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < count
      ? lastIndex
      : null;

  if (normalizedLast === null) {
    const idx = Math.min(count - 1, Math.max(0, Math.floor(rng() * count)));
    return { index: idx, text: LOADING_TIPS[idx] };
  }

  // Pick from the remaining (count - 1) indices so two launches never repeat the same tip
  const offset = 1 + Math.min(count - 2, Math.max(0, Math.floor(rng() * (count - 1))));
  const idx = (normalizedLast + offset) % count;
  return { index: idx, text: LOADING_TIPS[idx] };
}

export function getLocalDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffCalendarDays(fromDayKey: string, toDayKey: string): number {
  const parse = (k: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  };
  const a = parse(fromDayKey);
  const b = parse(toDayKey);
  if (a === null || b === null) return 999;
  return b - a;
}

export interface DailyRewardStatus {
  canClaim: boolean;
  nextDayIndex: number;
  effectiveStreak: number;
  streakBroken: boolean;
}

export function evaluateDailyRewardStatus(
  lastClaimDay: string | null,
  currentStreak: number,
  todayKey: string = getLocalDayKey()
): DailyRewardStatus {
  const totalDays = DAILY_REWARDS.length;
  const safeStreak = Number.isFinite(currentStreak)
    ? Math.max(0, Math.min(totalDays, Math.floor(currentStreak)))
    : 0;

  if (!lastClaimDay) {
    return {
      canClaim: true,
      nextDayIndex: 0,
      effectiveStreak: 0,
      streakBroken: false,
    };
  }

  const delta = diffCalendarDays(lastClaimDay, todayKey);
  if (delta <= 0) {
    // Already claimed today (or clock moved back)
    const clampedStreak = Math.max(1, safeStreak);
    return {
      canClaim: false,
      nextDayIndex: clampedStreak % totalDays,
      effectiveStreak: clampedStreak,
      streakBroken: false,
    };
  }

  if (delta === 1) {
    // Consecutive day! Advance to next reward in 7-day cycle (or roll back to Day 1 after Day 7)
    const nextIdx = safeStreak >= totalDays ? 0 : safeStreak;
    return {
      canClaim: true,
      nextDayIndex: nextIdx,
      effectiveStreak: safeStreak >= totalDays ? 0 : safeStreak,
      streakBroken: false,
    };
  }

  // Missed 1+ full days: streak resets back to Day 1
  return {
    canClaim: true,
    nextDayIndex: 0,
    effectiveStreak: 0,
    streakBroken: safeStreak > 0,
  };
}

export function computeDaysInactive(lastVisitAt: number | null, nowMs: number = Date.now()): number {
  if (typeof lastVisitAt !== 'number' || !Number.isFinite(lastVisitAt) || lastVisitAt <= 0) {
    return 0;
  }
  const elapsed = Math.max(0, nowMs - lastVisitAt);
  if (elapsed < INACTIVITY_PUSH_THRESHOLD_MS) return 0;
  return Math.max(1, Math.floor(elapsed / INACTIVITY_PUSH_THRESHOLD_MS));
}

export function buildInactivityPushSms(
  daysAway: number,
  canClaimDaily: boolean,
  biomeName: string
): PushSmsMessage | null {
  const safeDays = Math.floor(daysAway);
  if (!Number.isFinite(safeDays) || safeDays < 1) return null;

  const dayWord =
    safeDays % 10 === 1 && safeDays % 100 !== 11
      ? 'день'
      : safeDays % 10 >= 2 && safeDays % 10 <= 4 && (safeDays % 100 < 12 || safeDays % 100 > 14)
        ? 'дня'
        : 'дней';

  const bonusHint = canClaimDaily
    ? 'Ежедневная награда уже ждёт в лагере!'
    : 'Твой отряд и стволы готовы к зачистке!';

  const body =
    safeDays >= 5
      ? `СМС от штаба: тебя не было ${safeDays} ${dayWord}! Орда подступает к «${biomeName}». ${bonusHint}`
      : safeDays >= 2
        ? `СМС от костра: ${safeDays} ${dayWord} тишины в чащобе — пора вернуться в «${biomeName}». ${bonusHint}`
        : `СМС из «Тёмной чащи»: прошёл ${safeDays} ${dayWord} без вылазок! Загляни в «${biomeName}». ${bonusHint}`;

  return {
    id: `sms-${safeDays}-${biomeName}`,
    title: 'Тёмная Чаща',
    body,
    daysAway: safeDays,
    timestampText: 'сейчас',
  };
}


