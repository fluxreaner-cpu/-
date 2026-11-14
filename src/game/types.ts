export type GameScreenState = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export type TutorialStep =
  | 'menu_intro'
  | 'combat_controls'
  | 'go_to_shop'
  | 'upgrade_pistol'
  | 'final_tips'
  | 'done';

export type TutorialCombatStage = 'move' | 'shoot' | 'reload_or_clear';

export type WeaponId =
  | 'rusty_pistol'
  | 'sawed_carbine'
  | 'shotgun'
  | 'revolver'
  | 'burst_smg'
  | 'double_barrel'
  | 'smg'
  | 'tactical_pistol'
  | 'pump_shotgun'
  | 'combat_crossbow'
  | 'assault_rifle'
  | 'auto_shotgun'
  | 'rifle'
  | 'lmg'
  | 'saw_launcher'
  | 'plasma_carbine'
  | 'cryo_cannon'
  | 'flamethrower'
  | 'sniper_rifle'
  | 'minigun'
  | 'tesla_coil'
  | 'railgun'
  | 'gauss_cannon'
  | 'void_annihilator';

export type SkinId =
  | 'ranger'
  | 'crimson_hunter'
  | 'winter_trapper'
  | 'medic_scout'
  | 'hazmat'
  | 'night_stalker'
  | 'commando'
  | 'pyromancer'
  | 'ash_knight'
  | 'plague_doctor'
  | 'phantom'
  | 'cyber_merc'
  | 'frost_warden'
  | 'blood_paladin'
  | 'juggernaut'
  | 'void_reaper';

export type DifficultyId = 'normal' | 'hard' | 'nightmare';

export type BiomeId =
  | 'pine_forest'
  | 'misty_swamp'
  | 'birch_hollow'
  | 'autumn_trail'
  | 'foggy_moor'
  | 'winter_woods'
  | 'frozen_lake'
  | 'cursed_graveyard'
  | 'fungal_grove'
  | 'thorny_thicket'
  | 'obsidian_canyon'
  | 'ash_ruins'
  | 'scorched_fort'
  | 'abyss_rift'
  | 'plague_heart'
  | 'blood_citadel';

export type SurfaceType = 'grass' | 'mud' | 'gravel' | 'stone' | 'wood';

export type ZombieKind =
  | 'standard'
  | 'runner'
  | 'flanker'
  | 'brute'
  | 'spitter'
  | 'shielder'
  | 'boomer'
  | 'boss';

export type UpgradeStatKey = 'damage' | 'fireRate' | 'mag';

export interface CharacterSkinDefinition {
  id: SkinId;
  name: string;
  description: string;
  price: number;
  bonusHp: number;
  bonusArmor: number;
  speedBonusPct: number;
  damageBonusPct: number;
  hoodColor: string;
  hoodHiColor: string;
  jacketColor: string;
  jacketHiColor: string;
  scarfColor: string;
  visorColor?: string;
  eyeColor: string;
  pantsColor: string;
}

export interface DifficultyDefinition {
  id: DifficultyId;
  name: string;
  description: string;
  enemyHpMult: number;
  enemySpeedMult: number;
  enemyDamageMult: number;
  coinMult: number;
  xpMult: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  role: string;
  price: number;
  baseDamage: number;
  baseFireRate: number;
  baseMagSize: number;
  baseReloadSec: number;
  pellets: number;
  spreadRad: number;
  projectileSpeed: number;
  pierce: number;
  knockback: number;
  range: number;
  accentColor: string;
}

export interface WeaponUpgradeState {
  damageLevel: number;
  fireRateLevel: number;
  magLevel: number;
}

export interface EffectiveWeaponStats {
  damage: number;
  fireRate: number;
  magSize: number;
  reloadSec: number;
  pellets: number;
  spreadRad: number;
  projectileSpeed: number;
  pierce: number;
  knockback: number;
  range: number;
}

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  subtitle: string;
  requiredPlayerLevel: number;
  baseZombiesPerWave: number;
  featuredZombies: string;
  tacticsSummary: string;
  bossName?: string;
  groundColors: [string, string, string];
  trailColor: string;
  trailEdgeColor: string;
  puddleColor: string;
  treeTrunkColor: string;
  treeCanopyColors: [string, string, string];
  fogColor: string;
  accentColor: string;
  primarySurface: SurfaceType;
}

export interface WaveSpawnEntry {
  kind: ZombieKind;
  delaySec: number;
}

export interface WavePlan {
  waveNumber: number;
  totalWaves: number;
  biomeId: BiomeId;
  isBossWave: boolean;
  bossCount: number;
  standardCount: number;
  entries: WaveSpawnEntry[];
}

export interface DailyRewardItem {
  day: number;
  coins: number;
  xp: number;
  trophies?: number;
  label: string;
}

export interface PushSmsMessage {
  id: string;
  title: string;
  body: string;
  daysAway: number;
  timestampText: string;
}

export interface HudSnapshot {
  screenState: GameScreenState;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  coins: number;
  totalCoinsEarned: number;
  kills: number;
  playerLevel: number;
  xp: number;
  xpToNext: number;
  roundXpEarned: number;
  didLevelUpInRound: boolean;
  newlyUnlockedBiomeName: string | null;
  isTutorialMatch: boolean;
  tutorialStep: TutorialStep;
  tutorialCombatStage: TutorialCombatStage;
  waveNumber: number;
  totalWaves: number;
  biomeId: BiomeId;
  biomeName: string;
  selectedBiomeId: BiomeId;
  unlockedBiomes: BiomeId[];
  clearedBiomes: BiomeId[];
  difficulty: DifficultyId;
  currentSurface: SurfaceType;
  surfaceLabel: string;
  isBossWave: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  waveRemaining: number;
  waveTotal: number;
  activeWeaponId: WeaponId;
  ownedWeapons: WeaponId[];
  upgrades: Record<WeaponId, WeaponUpgradeState>;
  activeSkinId: SkinId;
  ownedSkins: SkinId[];
  vitalityLevel: number;
  armorLevel: number;
  ammoInMag: number;
  magSize: number;
  isReloading: boolean;
  reloadProgress: number;
  bannerText: string;
  bannerSubtext: string;
  bestKills: number;
  trophies: number;
  roundTrophiesEarned: number;
  shopOpen: boolean;
  dailyStreak: number;
  dailyLastClaimDay: string | null;
  dailyCanClaim: boolean;
  dailyNextDayIndex: number;
  dailyModalOpen: boolean;
  pushEnabled: boolean;
  pushPermission: 'default' | 'granted' | 'denied' | 'unsupported';
  activePushSms: PushSmsMessage | null;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}
