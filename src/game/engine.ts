import {
  type IntegrityViolation,
  MaskedIntVault,
  VAULT_STORAGE_KEY,
  checkStorageIntegrity,
  sealProfileEnvelope,
  unsealProfileEnvelope,
} from './anticheat';
import { soundEngine } from './audio';
import {
  BIOMES,
  BIOME_CYCLE,
  DAILY_REWARDS,
  DIFFICULTIES,
  INACTIVITY_PUSH_THRESHOLD_MS,
  KILL_HEAL_HP,
  MAX_ARMOR_LEVEL,
  MAX_UPGRADE_LEVEL,
  MAX_VITALITY_LEVEL,
  SKINS,
  STANDARD_WAVES_PER_MATCH,
  SURFACE_LABELS,
  WEAPONS,
  WEAPON_ORDER,
  createInitialUpgrades,
} from './constants';
import {
  ARENA_HALF_HEIGHT,
  AUTO_AIM_RANGE,
  TRAIL_HALF_WIDTH,
  WORLD_TILE_SIZE,
  applyKillHeal,
  applyXpGain,
  buildInactivityPushSms,
  calculateBossTrophyReward,
  calculateRoundXpReward,
  canPurchaseSkin,
  canPurchaseWeapon,
  canUpgradeArmor,
  canUpgradeVitality,
  canUpgradeWeapon,
  checkCircleCollision,
  computeDaysInactive,
  evaluateDailyRewardStatus,
  findAutoAimTarget,
  generateBiomeWaveComposition,
  getAdrenalineComboBonus,
  getArmorUpgradeCost,
  getBiomeBossHp,
  getBiomeDisplayName,
  getBiomeForLevel,
  getBiomeZombieDamageMultiplier,
  getBiomeZombieHpMultiplier,
  getBiomeZombieSpeedMultiplier,
  getEffectivePlayerStats,
  getLatestPurchasedWeapon,
  getLocalDayKey,
  getSurfaceAtWorldPos,
  getTrailCenterY,
  getTutorialCombatStage,
  getUnlockedBiomes,
  getUpgradeCost,
  getVitalityUpgradeCost,
  getWeaponEffectiveStats,
  getXpToNextLevel,
  isBiomeUnlocked,
  isWoodenBridgeAt,
  tileHash,
} from './rules';
import { SpriteAtlas } from './sprites';
import type {
  BiomeId,
  DifficultyId,
  GameScreenState,
  HudSnapshot,
  PushSmsMessage,
  SkinId,
  SurfaceType,
  TutorialStep,
  UpgradeStatKey,
  WavePlan,
  WeaponId,
  WeaponUpgradeState,
  ZombieKind,
} from './types';

interface ZombieEntity {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  coinReward: number;
  xpReward: number;
  facing: number; // 1 or -1
  strafeSign: number;
  walkCycle: number;
  flashTimer: number;
  attackCooldown: number;
  telegraphTimer: number;
  telegraphType: 'none' | 'lunge' | 'slam' | 'spit' | 'charge' | 'explode';
  telegraphX: number;
  telegraphY: number;
  chargeDirX: number;
  chargeDirY: number;
  koTimer: number;
  isDead: boolean;
}

interface BulletEntity {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  pierceLeft: number;
  traveled: number;
  maxRange: number;
  color: string;
  radius: number;
  hitIds: Set<number>;
}

interface CoinPickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  kind: 'coin' | 'medkit';
  life: number;
  magnetDelay: number;
  bobOffset: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale?: number;
}

interface ShellCasing {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  color: string;
  life: number;
}

const MAX_PARTICLES = 360;
const MAX_BULLETS = 180;
const MAX_CASINGS = 90;

export class ZombieForestEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: SpriteAtlas;
  private onHudChange: (snapshot: HudSnapshot) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private hudSyncTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private viewW = 1280;
  private viewH = 720;
  private dpr = 1;

  // Game State Machine
  private screenState: GameScreenState = 'title';
  private shopOpen = false;
  private gameOverDelay = 0;

  // Player state
  private player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 11,
    hp: 100,
    maxHp: 100,
    armor: 0,
    maxArmor: 50,
    speed: 148,
    aimAngle: 0,
    walkDist: 0,
    stepAccum: 0,
    invulnTimer: 0,
    flashTimer: 0,
    recoil: 0,
    surface: 'gravel' as SurfaceType,
  };

  // Economy, Profile, EXP Progression & Arsenal (encrypted RAM vault + sealed storage)
  private _v: MaskedIntVault;
  private securityViolation: IntegrityViolation | null = null;
  private securityHalted = false;
  private onSecurityViolation?: (violation: IntegrityViolation) => void;
  private lastPerfAuditMs = typeof performance !== 'undefined' ? performance.now() : 0;
  private lastWallAuditMs = Date.now();
  private speedAnomalyStreak = 0;
  private vaultAuditAccum = 0;

  private totalCoinsEarned = 0;
  private kills = 0;
  private xpBuffer = 0;
  private roundXpEarned = 0;
  private didLevelUpInRound = false;
  private newlyUnlockedBiomeName: string | null = null;
  private selectedBiomeId: BiomeId = 'pine_forest';
  private clearedBiomes: BiomeId[] = [];
  private static readonly SPOTLIGHT_TUTORIAL_VERSION = 2;
  private tutorialVersion = ZombieForestEngine.SPOTLIGHT_TUTORIAL_VERSION;
  private tutorialStep: TutorialStep = 'menu_intro';
  private isTutorialMatch = false;
  private tutMoved = false;
  private tutShot = false;
  private tutReloaded = false;
  private bestKills = 0;
  private roundTrophiesEarned = 0;
  private difficulty: DifficultyId = 'normal';
  private activeSkinId: SkinId = 'ranger';
  private ownedSkins: SkinId[] = ['ranger'];
  private ownedWeapons: WeaponId[] = ['rusty_pistol'];
  private activeWeaponId: WeaponId = 'rusty_pistol';
  private upgrades: Record<WeaponId, WeaponUpgradeState> = createInitialUpgrades();
  private dailyStreak = 0;
  private dailyLastClaimDay: string | null = null;
  private dailyModalOpen = false;
  private pushEnabled = true;
  private notificationPrompted = false;
  private lastVisitAt: number | null = null;
  private previousVisitAt: number | null = null;
  private activePushSms: PushSmsMessage | null = null;
  private autoDailyChecked = false;
  private playerDamageMult = 1;
  private ammoMap: Record<WeaponId, number> = Object.fromEntries(
    WEAPON_ORDER.map((id) => [id, WEAPONS[id].baseMagSize])
  ) as Record<WeaponId, number>;
  private fireCooldown = 0;
  private reloadTimer = 0;
  private reloadDuration = 0;
  private isReloading = false;
  private muzzleFlashTimer = 0;

  // Wave & Round state (7 waves per regular round, 1 wave for tutorial)
  private waveNumber = 1;
  private totalWaves = STANDARD_WAVES_PER_MATCH;
  private biomeId: BiomeId = 'pine_forest';
  private currentWave: WavePlan = generateBiomeWaveComposition('pine_forest', 1, false);
  private waveElapsed = 0;
  private nextSpawnIndex = 0;
  private waveClearPause = 0;
  private bannerText = '';
  private bannerSubtext = '';
  private bannerTimer = 0;

  // Entities & Pooled buffers
  private nextEntityId = 1;
  private zombies: ZombieEntity[] = [];
  private pickups: CoinPickup[] = [];
  private floatingTexts: FloatingText[] = [];
  private bullets: BulletEntity[] = [];
  private particles: Particle[] = [];
  private casings: ShellCasing[] = [];
  private particleCursor = 0;
  private casingCursor = 0;

  // Camera & Juice
  private camX = 0;
  private camY = 0;
  private titleCamX = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private worldTime = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private lastComboTier = 0;
  private dangerProximity = 0;
  private attackTokenBudget = 5;
  private lastHudKey = '';
  private upgradesVersion = 0;
  private staticFrameDirty = true;

  // Input Hub
  private keysPressed = new Set<string>();
  private mouseClientX = 0;
  private mouseClientY = 0;
  private hasMousePos = false;
  private aimMode: 'mouse' | 'stick' = 'mouse';
  private mouseDown = false;
  private fireButtonHeld = false;
  private moveStickX = 0;
  private moveStickY = 0;
  private aimStickX = 0;
  private aimStickY = 0;
  private aimStickActive = false;
  private autoAimTargetId: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    onHudChange: (snapshot: HudSnapshot) => void,
    onSecurityViolation?: (violation: IntegrityViolation) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not initialize 2D context');
    this.ctx = context;
    this.atlas = new SpriteAtlas();
    this.onHudChange = onHudChange;
    this.onSecurityViolation = onSecurityViolation;
    this._v = new MaskedIntVault((violation) => this.haltForSecurityViolation(violation));

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#fff',
        life: 0,
        maxLife: 1,
      });
    }
    for (let i = 0; i < MAX_BULLETS; i++) {
      this.bullets.push({
        active: false,
        fromPlayer: true,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        damage: 10,
        knockback: 40,
        pierceLeft: 1,
        traveled: 0,
        maxRange: 300,
        color: '#fbbf24',
        radius: 3,
        hitIds: new Set<number>(),
      });
    }
    for (let i = 0; i < MAX_CASINGS; i++) {
      this.casings.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: 0,
        vrot: 0,
        color: '#f59e0b',
        life: 0,
      });
    }

    this.loadProfile();
    if (!this.securityHalted) {
      const nowMs = Date.now();
      const daysAway = computeDaysInactive(this.previousVisitAt, nowMs);
      const dailyStatus = evaluateDailyRewardStatus(
        this.dailyLastClaimDay,
        this.dailyStreak,
        getLocalDayKey(new Date(nowMs))
      );
      if (daysAway >= 1) {
        const sms = buildInactivityPushSms(
          daysAway,
          dailyStatus.canClaim,
          getBiomeDisplayName(this.selectedBiomeId)
        );
        if (sms) {
          this.activePushSms = sms;
          if (this.pushEnabled) {
            this.dispatchBrowserNotification(sms);
          }
        }
      }
      this.lastVisitAt = nowMs;
      this.saveProfile();
    }

    for (const wId of WEAPON_ORDER) {
      const stats = getWeaponEffectiveStats(WEAPONS[wId], this.upgrades[wId]);
      this.ammoMap[wId] = stats.magSize;
    }
    this.biomeId = this.selectedBiomeId;
    soundEngine.setBiome(this.biomeId);
    this.bindEvents();
    this.handleResize();
    this.player.y = getTrailCenterY(0);
    this.camX = 0;
    this.camY = this.player.y;
    this.emitHud();
  }

  private _gc(): number {
    return this._v.get('c');
  }
  private _sc(val: number): void {
    this._v.set('c', val);
  }
  private _ac(delta: number): void {
    this._v.add('c', delta);
  }
  private _gt(): number {
    return this._v.get('t');
  }
  private _st(val: number): void {
    this._v.set('t', val);
  }
  private _at(delta: number): void {
    this._v.add('t', delta);
  }
  private _gx(): number {
    return this._v.get('x');
  }
  private _sx(val: number): void {
    this._v.set('x', val);
  }
  private _gl(): number {
    return this._v.get('l');
  }
  private _sl(val: number): void {
    this._v.set('l', val);
  }
  private _gv(): number {
    return this._v.get('v');
  }
  private _sv(val: number): void {
    this._v.set('v', val);
  }
  private _ga(): number {
    return this._v.get('a');
  }
  private _sa(val: number): void {
    this._v.set('a', val);
  }

  public getSecurityViolation(): IntegrityViolation | null {
    return this.securityViolation;
  }

  public haltForSecurityViolation(violation: IntegrityViolation): void {
    if (this.securityHalted) return;
    this.securityHalted = true;
    this.securityViolation = violation;
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.shopOpen = false;
    this.dailyModalOpen = false;
    soundEngine.setMusicMode('none');
    if (!soundEngine.isMuted()) {
      soundEngine.toggleMute();
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onSecurityViolation?.(violation);
  }

  private loadProfile(): void {
    try {
      const storageViolation = checkStorageIntegrity(localStorage);
      if (storageViolation) {
        this.haltForSecurityViolation(storageViolation);
        return;
      }

      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      const unsealed = unsealProfileEnvelope(raw);
      if (unsealed.status === 'tampered') {
        this.haltForSecurityViolation(unsealed.violation);
        return;
      }
      if (unsealed.status === 'ok') {
        const parsed = unsealed.data as Record<string, unknown>;
        if (typeof parsed.playerLevel === 'number' && Number.isFinite(parsed.playerLevel) && parsed.playerLevel >= 1) {
          this._sl(Math.floor(parsed.playerLevel));
        }
        if (typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0) {
          this._sx(Math.floor(parsed.xp));
        }
        if (typeof parsed.bestKills === 'number' && Number.isFinite(parsed.bestKills) && parsed.bestKills >= 0) {
          this.bestKills = Math.floor(parsed.bestKills);
        }
        if (typeof parsed.trophies === 'number' && Number.isFinite(parsed.trophies) && parsed.trophies >= 0) {
          this._st(Math.floor(parsed.trophies));
        }
        if (typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) && parsed.coins >= 0) {
          this._sc(Math.floor(parsed.coins));
        }
        const validTutorialSteps: ReadonlySet<TutorialStep> = new Set([
          'menu_intro',
          'combat_controls',
          'go_to_shop',
          'upgrade_pistol',
          'final_tips',
          'done',
        ]);
        const savedTutorialVer =
          typeof parsed.tutorialVersion === 'number' && Number.isFinite(parsed.tutorialVersion)
            ? parsed.tutorialVersion
            : 1;
        if (savedTutorialVer < ZombieForestEngine.SPOTLIGHT_TUTORIAL_VERSION) {
          this.tutorialStep = 'menu_intro';
          this.tutorialVersion = ZombieForestEngine.SPOTLIGHT_TUTORIAL_VERSION;
          this.saveProfile();
        } else if (
          typeof parsed.tutorialStep === 'string' &&
          validTutorialSteps.has(parsed.tutorialStep as TutorialStep)
        ) {
          this.tutorialStep = parsed.tutorialStep as TutorialStep;
        } else if (this.bestKills > 0 || this._gc() > 0 || this._gl() > 1) {
          this.tutorialStep = 'done';
        }
        if (Array.isArray(parsed.clearedBiomes)) {
          this.clearedBiomes = parsed.clearedBiomes.filter((b): b is BiomeId => Boolean(BIOMES[b as BiomeId]));
        }
        this.selectedBiomeId = getBiomeForLevel(this._gl());
        this.difficulty = 'normal';
        if (Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length > 0) {
          this.ownedSkins = parsed.ownedSkins.filter((s): s is SkinId => Boolean(SKINS[s as SkinId]));
          if (!this.ownedSkins.includes('ranger')) this.ownedSkins.unshift('ranger');
        }
        if (typeof parsed.activeSkinId === 'string' && this.ownedSkins.includes(parsed.activeSkinId as SkinId)) {
          this.activeSkinId = parsed.activeSkinId as SkinId;
        }
        if (Array.isArray(parsed.ownedWeapons) && parsed.ownedWeapons.length > 0) {
          this.ownedWeapons = parsed.ownedWeapons.filter((w): w is WeaponId => Boolean(WEAPONS[w as WeaponId]));
          if (!this.ownedWeapons.includes('rusty_pistol')) this.ownedWeapons.unshift('rusty_pistol');
        }
        this.activeWeaponId = getLatestPurchasedWeapon(this.ownedWeapons);
        if (parsed.upgrades && typeof parsed.upgrades === 'object') {
          const parsedUpgrades = parsed.upgrades as Partial<Record<WeaponId, Partial<WeaponUpgradeState>>>;
          const base = createInitialUpgrades();
          for (const wId of WEAPON_ORDER) {
            const u = parsedUpgrades[wId];
            if (u) {
              const clampUpg = (val: unknown) =>
                typeof val === 'number' && Number.isFinite(val)
                  ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(val)))
                  : 0;
              base[wId] = {
                damageLevel: clampUpg(u.damageLevel),
                fireRateLevel: clampUpg(u.fireRateLevel),
                magLevel: clampUpg(u.magLevel),
              };
            }
          }
          this.upgrades = base;
        }
        if (typeof parsed.vitalityLevel === 'number' && Number.isFinite(parsed.vitalityLevel) && parsed.vitalityLevel >= 0) {
          this._sv(Math.min(MAX_VITALITY_LEVEL, Math.floor(parsed.vitalityLevel)));
        }
        if (typeof parsed.armorLevel === 'number' && Number.isFinite(parsed.armorLevel) && parsed.armorLevel >= 0) {
          this._sa(Math.min(MAX_ARMOR_LEVEL, Math.floor(parsed.armorLevel)));
        }
        if (typeof parsed.dailyStreak === 'number' && Number.isFinite(parsed.dailyStreak) && parsed.dailyStreak >= 0) {
          this.dailyStreak = Math.min(DAILY_REWARDS.length, Math.floor(parsed.dailyStreak));
        }
        if (typeof parsed.dailyLastClaimDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dailyLastClaimDay)) {
          this.dailyLastClaimDay = parsed.dailyLastClaimDay;
        }
        if (typeof parsed.pushEnabled === 'boolean') {
          this.pushEnabled = parsed.pushEnabled;
        }
        if (typeof parsed.lastVisitAt === 'number' && Number.isFinite(parsed.lastVisitAt) && parsed.lastVisitAt > 0) {
          this.previousVisitAt = parsed.lastVisitAt;
          this.lastVisitAt = parsed.lastVisitAt;
        }
        if (typeof parsed.musicVolume === 'number' && Number.isFinite(parsed.musicVolume)) {
          soundEngine.setMusicVolume(parsed.musicVolume);
        }
        if (typeof parsed.sfxVolume === 'number' && Number.isFinite(parsed.sfxVolume)) {
          soundEngine.setSfxVolume(parsed.sfxVolume);
        }
        return;
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveProfile(): void {
    if (this.securityHalted) return;
    if (!this._v.verifyAll()) return;
    try {
      const nowMs = Date.now();
      this.lastVisitAt = nowMs;
      const sealed = sealProfileEnvelope({
        playerLevel: this._gl(),
        xp: Math.round(this._gx()),
        selectedBiomeId: this.selectedBiomeId,
        clearedBiomes: this.clearedBiomes,
        tutorialStep: this.tutorialStep,
        tutorialVersion: this.tutorialVersion,
        bestKills: this.bestKills,
        trophies: this._gt(),
        coins: Math.round(this._gc()),
        difficulty: this.difficulty,
        activeSkinId: this.activeSkinId,
        ownedSkins: this.ownedSkins,
        ownedWeapons: this.ownedWeapons,
        activeWeaponId: this.activeWeaponId,
        upgrades: this.upgrades,
        vitalityLevel: this._gv(),
        armorLevel: this._ga(),
        dailyStreak: this.dailyStreak,
        dailyLastClaimDay: this.dailyLastClaimDay,
        pushEnabled: this.pushEnabled,
        lastVisitAt: nowMs,
        musicVolume: soundEngine.getMusicVolume(),
        sfxVolume: soundEngine.getSfxVolume(),
      });
      localStorage.setItem(VAULT_STORAGE_KEY, sealed);
    } catch {
      // ignore storage errors
    }
  }

  private getPushPermission(): 'default' | 'granted' | 'denied' | 'unsupported' {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
      }
      const perm = window.Notification.permission;
      if (perm === 'granted' || perm === 'denied') return perm;
      return 'default';
    } catch {
      return 'unsupported';
    }
  }

  private dispatchBrowserNotification(sms: PushSmsMessage): void {
    try {
      if (this.getPushPermission() !== 'granted') return;
      if ('serviceWorker' in navigator && navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready
          .then((reg) =>
            reg.showNotification(sms.title, {
              body: sms.body,
              icon: '/icon.svg',
              badge: '/icon.svg',
              tag: sms.id,
            })
          )
          .catch(() => {
            try {
              new window.Notification(sms.title, { body: sms.body, icon: '/icon.svg', tag: sms.id });
            } catch {
              // ignore blocked notifications in sandboxed frames
            }
          });
        return;
      }
      new window.Notification(sms.title, { body: sms.body, icon: '/icon.svg', tag: sms.id });
    } catch {
      // ignore unsupported notification contexts
    }
  }

  private getCapacitorLocalNotifications():
    | {
        requestPermissions?: () => Promise<unknown>;
        schedule?: (options: {
          notifications: Array<{
            id: number;
            title: string;
            body: string;
            schedule: { at: Date };
          }>;
        }) => Promise<unknown>;
        cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<unknown>;
      }
    | null {
    try {
      const cap = (
        window as unknown as {
          Capacitor?: {
            Plugins?: {
              LocalNotifications?: {
                requestPermissions?: () => Promise<unknown>;
                schedule?: (options: {
                  notifications: Array<{
                    id: number;
                    title: string;
                    body: string;
                    schedule: { at: Date };
                  }>;
                }) => Promise<unknown>;
                cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<unknown>;
              };
            };
          };
        }
      ).Capacitor;
      return cap?.Plugins?.LocalNotifications ?? null;
    } catch {
      return null;
    }
  }

  public requestNotificationPermissionOnce(): void {
    if (this.notificationPrompted) return;
    this.notificationPrompted = true;
    try {
      const nativeNotif = this.getCapacitorLocalNotifications();
      if (nativeNotif?.requestPermissions) {
        void nativeNotif.requestPermissions().catch(() => {});
      }
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'default') {
        void window.Notification.requestPermission().catch(() => {});
      }
    } catch {
      // ignore restricted notification permission prompts
    }
  }

  public scheduleInactivityPushNotification(): void {
    if (!this.pushEnabled) return;
    const sms = buildInactivityPushSms(1, true, getBiomeDisplayName(this.selectedBiomeId));
    if (!sms) return;

    try {
      const nativeNotif = this.getCapacitorLocalNotifications();
      if (nativeNotif?.schedule) {
        void nativeNotif.cancel?.({ notifications: [{ id: 7001 }] }).catch(() => {});
        void nativeNotif
          .schedule({
            notifications: [
              {
                id: 7001,
                title: 'Тёмная Чаща',
                body: sms.body,
                schedule: { at: new Date(Date.now() + INACTIVITY_PUSH_THRESHOLD_MS) },
              },
            ],
          })
          .catch(() => {});
      }

      if (this.getPushPermission() === 'granted' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.active?.postMessage({
              type: 'SCHEDULE_INACTIVITY_SMS',
              title: 'Тёмная Чаща',
              body: sms.body,
              delayMs: INACTIVITY_PUSH_THRESHOLD_MS,
              tag: 'dark-thicket-comeback',
            });
          })
          .catch(() => {});
      }
    } catch {
      // ignore unsupported scheduling contexts
    }
  }

  public cancelInactivityPushNotification(): void {
    try {
      const nativeNotif = this.getCapacitorLocalNotifications();
      if (nativeNotif?.cancel) {
        void nativeNotif.cancel({ notifications: [{ id: 7001 }] }).catch(() => {});
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.active?.postMessage({ type: 'CANCEL_INACTIVITY_SMS' });
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  public startLoop(): void {
    if (this.rafId !== null || this.securityHalted) return;
    this.lastTimestamp = performance.now();
    this.lastPerfAuditMs = this.lastTimestamp;
    this.lastWallAuditMs = Date.now();
    const step = (now: number) => {
      this.rafId = null;
      if (this.securityHalted) return;
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      const isStaticModal =
        this.shopOpen ||
        this.dailyModalOpen ||
        this.screenState === 'paused' ||
        this.screenState === 'gameover' ||
        this.screenState === 'victory';
      try {
        if (!isStaticModal) {
          this.staticFrameDirty = true;
          this.tick(dt);
          this.render();
        } else if (this.staticFrameDirty) {
          this.staticFrameDirty = false;
          this.render();
        }
      } catch (err) {
        console.error('Game loop frame error:', err);
      }
      if (!this.securityHalted) {
        this.rafId = window.requestAnimationFrame(step);
      }
    };
    this.rafId = window.requestAnimationFrame(step);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbindEvents();
    soundEngine.setMusicMode('none');
  }

  // --- External State Controls ---

  public startNewGame(fromUserGesture = true, requestedBiome?: BiomeId): void {
    if (this.securityHalted) return;
    soundEngine.unlock(fromUserGesture);
    if (fromUserGesture) {
      this.requestNotificationPermissionOnce();
    }
    this.activeWeaponId = getLatestPurchasedWeapon(this.ownedWeapons);
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.shopOpen = false;
    this.dailyModalOpen = false;
    this.autoDailyChecked = true;
    this.gameOverDelay = 0;

    // Tutorial starter match runs 1 wave of 3 zombies only on genuine first launch
    this.isTutorialMatch =
      fromUserGesture &&
      (this.tutorialStep === 'menu_intro' || this.tutorialStep === 'combat_controls');

    if (!fromUserGesture && this.tutorialStep === 'menu_intro') {
      // Bypass blocking tutorial for automated quick-start launches
      this.tutorialStep = 'done';
    }

    if (this.isTutorialMatch) {
      this.tutorialStep = 'combat_controls';
      this.biomeId = 'pine_forest';
      this.selectedBiomeId = 'pine_forest';
      this.totalWaves = 1;
    } else {
      const targetBiome =
        requestedBiome && isBiomeUnlocked(requestedBiome, this._gl())
          ? requestedBiome
          : getBiomeForLevel(this._gl());
      this.selectedBiomeId = targetBiome;
      this.biomeId = targetBiome;
      this.totalWaves = STANDARD_WAVES_PER_MATCH;
    }

    const playerStats = getEffectivePlayerStats(
      this.activeSkinId,
      this._gv(),
      this._ga(),
      this._gl()
    );
    this.player.x = 0;
    this.player.y = getTrailCenterY(0);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.maxHp = playerStats.maxHp;
    this.player.hp = playerStats.maxHp;
    this.player.maxArmor = Math.max(50, playerStats.startArmor);
    this.player.armor = playerStats.startArmor;
    this.player.speed = playerStats.moveSpeed;
    this.playerDamageMult = playerStats.damageMult;
    this.player.invulnTimer = 0.8;
    this.player.flashTimer = 0;
    this.player.walkDist = 0;
    this.player.stepAccum = 0;
    this.player.aimAngle = 0;

    this.totalCoinsEarned = 0;
    this.kills = 0;
    this.xpBuffer = 0;
    this.roundXpEarned = 0;
    this.roundTrophiesEarned = 0;
    this.didLevelUpInRound = false;
    this.newlyUnlockedBiomeName = null;
    this.tutMoved = false;
    this.tutShot = false;
    this.tutReloaded = false;

    for (const wId of WEAPON_ORDER) {
      const stats = getWeaponEffectiveStats(WEAPONS[wId], this.upgrades[wId]);
      this.ammoMap[wId] = stats.magSize;
    }
    this.fireCooldown = 0;
    this.isReloading = false;
    this.reloadTimer = 0;

    this.zombies = [];
    this.pickups = [];
    this.floatingTexts = [];
    for (const b of this.bullets) b.active = false;
    for (const p of this.particles) p.active = false;
    for (const c of this.casings) c.active = false;

    this.camX = this.player.x + 36;
    this.camY = this.player.y;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastComboTier = 0;
    this.dangerProximity = 0;
    const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
    this.attackTokenBudget = this.isTutorialMatch ? 2 : 5 + Math.floor(biomeIdx / 3);
    this.aimMode = 'mouse';
    this.autoAimTargetId = null;

    this.setupWave(1);
    this.screenState = 'playing';
    document.body.dataset.state = 'playing';
    this.canvas.focus?.();
    this.emitHud(true);
  }

  private setupWave(waveNum: number): void {
    this.waveNumber = waveNum;
    this.currentWave = generateBiomeWaveComposition(
      this.biomeId,
      waveNum,
      this.isTutorialMatch
    );
    this.totalWaves = this.currentWave.totalWaves;
    this.waveElapsed = 0;
    this.nextSpawnIndex = 0;
    this.waveClearPause = 0;

    soundEngine.setBiome(this.biomeId);
    if (this.currentWave.isBossWave) {
      soundEngine.setMusicMode('boss');
      const bossTitle = BIOMES[this.biomeId].bossName ?? 'ТИТАН ЧАЩИ';
      this.showBanner(
        `ВОЛНА ${this.waveNumber}/${this.totalWaves}: ${bossTitle}`,
        `Босс этапа «${getBiomeDisplayName(this.biomeId)}»!`
      );
      soundEngine.playZombieGroan(true);
    } else {
      soundEngine.setMusicMode('forest');
      if (this.isTutorialMatch) {
        this.showBanner('ОБУЧАЮЩИЙ БОЙ', 'Разберись с первыми зомби по тропе');
      } else {
        this.showBanner(
          `ВОЛНА ${this.waveNumber} ИЗ ${this.totalWaves}`,
          waveNum === 1
            ? `${getBiomeDisplayName(this.biomeId)} · ${BIOMES[this.biomeId].featuredZombies}`
            : `${this.currentWave.entries.length} врагов наступают`
        );
      }
    }
  }

  private completeRoundVictory(): void {
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    soundEngine.setMusicMode('none');

    // Auto-collect any remaining coin drops still flying toward the player from the final wave/boss
    for (const p of this.pickups) {
      if (p.kind === 'coin' && p.value > 0) {
        this._ac(p.value);
        this.totalCoinsEarned += p.value;
      }
    }
    this.pickups = [];

    const diff = DIFFICULTIES[this.difficulty];
    const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
    const roundCoins = this.isTutorialMatch ? 35 : Math.round((25 + biomeIdx * 12) * diff.coinMult);
    this._ac(roundCoins);
    this.totalCoinsEarned += roundCoins;

    if (!this.isTutorialMatch && !this.clearedBiomes.includes(this.biomeId)) {
      this.clearedBiomes.push(this.biomeId);
    }

    const roundXp = calculateRoundXpReward(this.biomeId, diff.xpMult, this.isTutorialMatch);
    this.roundXpEarned += roundXp;

    const prevUnlocked = new Set(getUnlockedBiomes(this._gl()));
    const xpResult = applyXpGain(this._gl(), this._gx(), roundXp);
    this._sl(xpResult.newLevel);
    this._sx(xpResult.newXp);
    if (xpResult.levelsGained > 0) {
      this.didLevelUpInRound = true;
    }

    const nowUnlocked = getUnlockedBiomes(this._gl());
    const newBiome = nowUnlocked.find((b) => !prevUnlocked.has(b));
    if (newBiome) {
      this.newlyUnlockedBiomeName = BIOMES[newBiome].name;
      this.selectedBiomeId = newBiome;
    }

    if (this.isTutorialMatch && this.tutorialStep === 'combat_controls') {
      this.tutorialStep = 'go_to_shop';
    }

    this.saveProfile();
    if (this.didLevelUpInRound) {
      soundEngine.playLevelUp();
    } else {
      soundEngine.playWaveClear();
    }

    this.screenState = 'victory';
    document.body.dataset.state = 'victory';
    this.emitHud(true);
  }

  private showBanner(title: string, sub: string): void {
    this.bannerText = title;
    this.bannerSubtext = sub;
    this.bannerTimer = 2.0;
  }

  public togglePause(): void {
    if (this.screenState === 'playing') {
      if (this.gameOverDelay > 0 || this.player.hp <= 0) return;
      this.screenState = 'paused';
      document.body.dataset.state = 'paused';
      this.keysPressed.clear();
      this.mouseDown = false;
      this.fireButtonHeld = false;
      soundEngine.setMusicMode('none');
      this.emitHud(true);
    } else if (this.screenState === 'paused') {
      this.resumeGame();
    }
  }

  public resumeGame(): void {
    if (this.screenState !== 'paused') return;
    soundEngine.unlock();
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.screenState = 'playing';
    document.body.dataset.state = 'playing';
    soundEngine.setMusicMode(this.currentWave.isBossWave ? 'boss' : 'forest');
    this.emitHud(true);
  }

  public returnToTitle(openShopAfter = false): void {
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.shopOpen = openShopAfter;
    if (this.tutorialStep === 'combat_controls') {
      this.tutorialStep = 'menu_intro';
      this.saveProfile();
    }
    if (openShopAfter && this.tutorialStep === 'go_to_shop') {
      const canUpgradeDamage = canUpgradeWeapon(
        this._gc(),
        this.ownedWeapons,
        this.upgrades,
        'rusty_pistol',
        'damage'
      );
      this.tutorialStep =
        this.upgrades.rusty_pistol.damageLevel >= MAX_UPGRADE_LEVEL || !canUpgradeDamage
          ? 'final_tips'
          : 'upgrade_pistol';
      this.saveProfile();
    }
    this.screenState = 'title';
    this.selectedBiomeId = getBiomeForLevel(this._gl());
    this.biomeId = this.selectedBiomeId;
    soundEngine.setBiome(this.biomeId);
    document.body.dataset.state = 'title';
    soundEngine.setMusicMode('menu');
    this.emitHud(true);
  }

  public selectBiome(biomeId: BiomeId): void {
    if (!isBiomeUnlocked(biomeId, this._gl())) return;
    this.selectedBiomeId = biomeId;
    if (this.screenState === 'title') {
      this.biomeId = biomeId;
      soundEngine.setBiome(biomeId);
      this.staticFrameDirty = true;
    }
    this.saveProfile();
    this.emitHud(true);
  }

  public completeTutorial(): void {
    this.tutorialStep = 'done';
    this.tutorialVersion = ZombieForestEngine.SPOTLIGHT_TUTORIAL_VERSION;
    this.saveProfile();
    this.emitHud(true);
  }

  public restartTutorial(): void {
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.shopOpen = false;
    this.tutorialStep = 'menu_intro';
    this.tutorialVersion = ZombieForestEngine.SPOTLIGHT_TUTORIAL_VERSION;
    this.screenState = 'title';
    this.selectedBiomeId = getBiomeForLevel(this._gl());
    this.biomeId = this.selectedBiomeId;
    soundEngine.setBiome(this.biomeId);
    document.body.dataset.state = 'title';
    soundEngine.setMusicMode('menu');
    this.saveProfile();
    this.emitHud(true);
  }

  public setDifficulty(difficultyId: DifficultyId): void {
    this.difficulty = difficultyId;
    this.saveProfile();
    this.emitHud();
  }

  public buyOrEquipSkin(skinId: SkinId): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    if (this.ownedSkins.includes(skinId)) {
      this.activeSkinId = skinId;
      this.saveProfile();
      this.staticFrameDirty = true;
      soundEngine.playReload();
      this.emitHud(true);
      return;
    }

    if (!canPurchaseSkin(this._gc(), this.ownedSkins, skinId)) return;
    this._ac(-SKINS[skinId].price);
    this.ownedSkins.push(skinId);
    this.activeSkinId = skinId;
    this.saveProfile();
    this.staticFrameDirty = true;
    soundEngine.playUpgrade();
    this.emitHud(true);
  }

  public setMusicVolume(v: number): void {
    soundEngine.unlock();
    soundEngine.setMusicVolume(v);
    this.saveProfile();
    this.emitHud();
  }

  public setSfxVolume(v: number): void {
    soundEngine.unlock();
    soundEngine.setSfxVolume(v);
    this.saveProfile();
    this.emitHud();
  }

  public setShopOpen(open: boolean): void {
    if (this.securityHalted || this.screenState !== 'title') {
      this.shopOpen = false;
      return;
    }
    this.shopOpen = open;
    if (open) {
      this.dailyModalOpen = false;
    }
    if (open && this.tutorialStep === 'go_to_shop') {
      const canUpgradeDamage = canUpgradeWeapon(
        this._gc(),
        this.ownedWeapons,
        this.upgrades,
        'rusty_pistol',
        'damage'
      );
      this.tutorialStep =
        this.upgrades.rusty_pistol.damageLevel >= MAX_UPGRADE_LEVEL || !canUpgradeDamage
          ? 'final_tips'
          : 'upgrade_pistol';
      this.saveProfile();
    }
    this.staticFrameDirty = true;
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.emitHud(true);
  }

  public maybeAutoOpenDailyModal(): void {
    if (this.autoDailyChecked) return;
    this.autoDailyChecked = true;
    if (this.screenState !== 'title' || this.shopOpen || this.tutorialStep !== 'done') return;
    const status = evaluateDailyRewardStatus(this.dailyLastClaimDay, this.dailyStreak);
    if (status.canClaim) {
      this.dailyModalOpen = true;
      this.staticFrameDirty = true;
      this.emitHud(true);
    }
  }

  public setDailyModalOpen(open: boolean): void {
    if (this.screenState !== 'title') {
      this.dailyModalOpen = false;
      return;
    }
    if (open) {
      this.shopOpen = false;
    }
    this.dailyModalOpen = open;
    this.staticFrameDirty = true;
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
    this.emitHud(true);
  }

  public claimDailyReward(): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    const todayKey = getLocalDayKey();
    const status = evaluateDailyRewardStatus(this.dailyLastClaimDay, this.dailyStreak, todayKey);
    if (!status.canClaim) return;

    const reward = DAILY_REWARDS[status.nextDayIndex];
    if (!reward) return;

    this._ac(reward.coins);
    if (reward.trophies && reward.trophies > 0) {
      this._at(reward.trophies);
    }

    const prevUnlocked = new Set(getUnlockedBiomes(this._gl()));
    const xpResult = applyXpGain(this._gl(), this._gx(), reward.xp);
    this._sl(xpResult.newLevel);
    this._sx(xpResult.newXp);

    if (xpResult.levelsGained > 0) {
      const nowUnlocked = getUnlockedBiomes(this._gl());
      const newly = nowUnlocked.find((b) => !prevUnlocked.has(b));
      if (newly) {
        this.newlyUnlockedBiomeName = BIOMES[newly].name;
        this.selectedBiomeId = getBiomeForLevel(this._gl());
        if (this.screenState === 'title') {
          this.biomeId = this.selectedBiomeId;
          soundEngine.setBiome(this.biomeId);
        }
      }
      soundEngine.playLevelUp();
    } else {
      soundEngine.playUpgrade();
    }

    this.dailyStreak = status.nextDayIndex + 1;
    this.dailyLastClaimDay = todayKey;
    this.saveProfile();
    this.staticFrameDirty = true;
    this.emitHud(true);
  }

  public setPushEnabled(enabled: boolean): void {
    soundEngine.unlock();
    this.pushEnabled = enabled;
    this.saveProfile();
    this.emitHud(true);
  }

  public dismissPushSms(): void {
    if (!this.activePushSms) return;
    this.activePushSms = null;
    this.emitHud(true);
  }

  public triggerTestInactivityPushSms(daysAway = 3): void {
    soundEngine.unlock();
    const status = evaluateDailyRewardStatus(this.dailyLastClaimDay, this.dailyStreak);
    const sms = buildInactivityPushSms(
      daysAway,
      status.canClaim,
      getBiomeDisplayName(this.selectedBiomeId)
    );
    if (!sms) return;
    this.activePushSms = {
      ...sms,
      id: `${sms.id}-${Date.now()}`,
    };
    if (this.pushEnabled) {
      this.dispatchBrowserNotification(this.activePushSms);
    }
    soundEngine.playComboUp(1);
    this.emitHud(true);
  }

  public recordVisitTimestamp(): void {
    if (this.securityHalted) return;
    const nowMs = Date.now();
    this.lastVisitAt = nowMs;
    try {
      const storageViolation = checkStorageIntegrity(localStorage);
      if (storageViolation) {
        this.haltForSecurityViolation(storageViolation);
        return;
      }
      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      const res = unsealProfileEnvelope(raw);
      if (res.status === 'tampered') {
        this.haltForSecurityViolation(res.violation);
        return;
      }
      if (res.status === 'ok') {
        res.data.lastVisitAt = nowMs;
        localStorage.setItem(VAULT_STORAGE_KEY, sealProfileEnvelope(res.data));
        return;
      }
    } catch {
      // fallback to full save
    }
    this.saveProfile();
  }

  public buyOrEquipWeapon(weaponId: WeaponId): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    if (this.ownedWeapons.includes(weaponId)) {
      return;
    }
    if (!canPurchaseWeapon(this._gc(), this.ownedWeapons, weaponId)) return;
    this._ac(-WEAPONS[weaponId].price);
    this.ownedWeapons.push(weaponId);
    const stats = getWeaponEffectiveStats(WEAPONS[weaponId], this.upgrades[weaponId]);
    this.ammoMap[weaponId] = stats.magSize;
    this.activeWeaponId = getLatestPurchasedWeapon(this.ownedWeapons);
    this.isReloading = false;
    this.saveProfile();
    soundEngine.playUpgrade();
    this.emitHud(true);
  }

  public upgradeWeaponStat(weaponId: WeaponId, statKey: UpgradeStatKey): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    if (!canUpgradeWeapon(this._gc(), this.ownedWeapons, this.upgrades, weaponId, statKey)) return;
    const upg = this.upgrades[weaponId];
    const current =
      statKey === 'damage'
        ? upg.damageLevel
        : statKey === 'fireRate'
          ? upg.fireRateLevel
          : upg.magLevel;
    const cost = getUpgradeCost(weaponId, statKey, current);
    this._ac(-cost);

    if (statKey === 'damage') upg.damageLevel += 1;
    else if (statKey === 'fireRate') upg.fireRateLevel += 1;
    else {
      upg.magLevel += 1;
      const newStats = getWeaponEffectiveStats(WEAPONS[weaponId], upg);
      this.ammoMap[weaponId] = newStats.magSize;
    }
    this.upgradesVersion += 1;

    if (this.tutorialStep === 'upgrade_pistol') {
      this.tutorialStep = 'final_tips';
    }

    this.saveProfile();
    soundEngine.playUpgrade();
    this.emitHud(true);
  }

  public upgradeVitality(): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    if (!canUpgradeVitality(this._gc(), this._gv())) return;
    this._ac(-getVitalityUpgradeCost(this._gv()));
    this._v.add('v', 1);
    this.saveProfile();
    soundEngine.playUpgrade();
    this.emitHud(true);
  }

  public upgradeArmor(): void {
    if (this.securityHalted) return;
    soundEngine.unlock();
    if (!canUpgradeArmor(this._gc(), this._ga())) return;
    this._ac(-getArmorUpgradeCost(this._ga()));
    this._v.add('a', 1);
    this.saveProfile();
    soundEngine.playUpgrade();
    this.emitHud(true);
  }

  public triggerReload(): void {
    if (this.screenState !== 'playing' || this.shopOpen || this.isReloading) return;
    const stats = getWeaponEffectiveStats(
      WEAPONS[this.activeWeaponId],
      this.upgrades[this.activeWeaponId]
    );
    if (this.ammoMap[this.activeWeaponId] >= stats.magSize) return;
    this.isReloading = true;
    this.tutReloaded = true;
    this.reloadDuration = stats.reloadSec;
    this.reloadTimer = stats.reloadSec;
    soundEngine.playReload();
    this.emitHud();
  }

  public setMoveStick(x: number, y: number): void {
    this.moveStickX = Math.max(-1, Math.min(1, x));
    this.moveStickY = Math.max(-1, Math.min(1, y));
  }

  public setAimStick(x: number, y: number, active: boolean): void {
    this.aimStickX = x;
    this.aimStickY = y;
    this.aimStickActive = active;
    if (active && Math.hypot(x, y) > 0.12) {
      this.aimMode = 'stick';
      this.player.aimAngle = Math.atan2(y, x);
    }
  }

  public setFireButtonHeld(held: boolean): void {
    soundEngine.unlock();
    this.fireButtonHeld = held;
  }

  public toggleMute(): boolean {
    soundEngine.unlock();
    const muted = soundEngine.toggleMute();
    this.emitHud();
    return muted;
  }

  // --- Event Listeners ---

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const code = e.code;
    const isInteractiveTarget =
      e.target instanceof HTMLButtonElement ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement;

    if (this.screenState === 'title') {
      if (code === 'Escape' && this.dailyModalOpen) {
        e.preventDefault();
        this.setDailyModalOpen(false);
        return;
      }
      if (code === 'Escape' && this.shopOpen) {
        e.preventDefault();
        this.setShopOpen(false);
        return;
      }
      if (code === 'KeyB') {
        if (this.tutorialStep === 'menu_intro' || this.tutorialStep === 'upgrade_pistol' || this.tutorialStep === 'final_tips') {
          return;
        }
        e.preventDefault();
        this.setShopOpen(!this.shopOpen);
        return;
      }
      if (code === 'KeyM') {
        this.toggleMute();
        return;
      }
      if (!this.shopOpen && !this.dailyModalOpen && !isInteractiveTarget && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        this.startNewGame();
      }
      return;
    }

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.screenState === 'playing' || this.screenState === 'paused') {
        e.preventDefault();
        this.togglePause();
      }
      return;
    }

    if (this.screenState === 'gameover') {
      if (!isInteractiveTarget && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        this.startNewGame(true);
      }
      return;
    }

    if (this.screenState === 'victory') {
      if (!isInteractiveTarget && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        if (this.tutorialStep === 'go_to_shop') {
          this.returnToTitle(true);
        } else {
          this.startNewGame(true);
        }
      }
      return;
    }

    if (this.screenState !== 'playing') return;

    if (code === 'Space') {
      e.preventDefault();
    }
    soundEngine.unlock();
    this.keysPressed.add(code);

    if (code === 'KeyR') {
      this.triggerReload();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.target !== this.canvas || this.aimStickActive) return;
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMousePos = true;
    this.aimMode = 'mouse';
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.target !== this.canvas) return;
    soundEngine.unlock();
    if (e.pointerType === 'mouse') {
      this.mouseClientX = e.clientX;
      this.mouseClientY = e.clientY;
      this.hasMousePos = true;
      this.aimMode = 'mouse';
    }
    if (e.button === 0 && this.screenState === 'playing' && !this.shopOpen && e.pointerType === 'mouse') {
      this.mouseDown = true;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.mouseDown = false;
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.mouseDown = false;
    }
  };

  private onWindowBlur = () => {
    this.keysPressed.clear();
    this.mouseDown = false;
    this.fireButtonHeld = false;
  };

  private handleResize = () => {
    const parent = this.canvas.parentElement;
    const rawW = this.canvas.clientWidth || parent?.clientWidth || Math.max(window.innerWidth, window.innerHeight);
    const rawH = this.canvas.clientHeight || parent?.clientHeight || Math.min(window.innerWidth, window.innerHeight);
    this.viewW = Math.max(320, rawW);
    this.viewH = Math.max(240, rawH);
    this.dpr = 1;
    this.canvas.width = Math.round(this.viewW);
    this.canvas.height = Math.round(this.viewH);
    this.staticFrameDirty = true;
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onWindowBlur);

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.canvas);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onWindowBlur);
    this.resizeObserver?.disconnect();
  }

  private getZoom(): number {
    if (this.viewW < 480) return 1.45;
    if (this.viewW < 768) return 1.85;
    return 2.3;
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.getZoom();
    const rawDx = clientX - rect.left - rect.width / 2;
    const rawDy = clientY - rect.top - rect.height / 2;
    const stageRotatedAttr = this.canvas.parentElement?.dataset.rotated;
    const isPortraitRotated =
      stageRotatedAttr === 'true'
        ? true
        : stageRotatedAttr === 'false'
          ? false
          : window.innerHeight > window.innerWidth;
    const sx = isPortraitRotated ? rawDy : rawDx;
    const sy = isPortraitRotated ? -rawDx : rawDy;
    return {
      x: this.camX + sx / zoom,
      y: this.camY + sy / zoom,
    };
  }

  // --- Simulation Loop ---

  private tick(dt: number): void {
    this.worldTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);

    this.vaultAuditAccum += dt;
    if (this.vaultAuditAccum >= 1.2) {
      this.vaultAuditAccum = 0;
      if (!this._v.verifyAll()) return;
      const storageViolation = checkStorageIntegrity(localStorage);
      if (storageViolation) {
        this.haltForSecurityViolation(storageViolation);
        return;
      }
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
      const nowWall = Date.now();
      const perfDelta = nowPerf - this.lastPerfAuditMs;
      const wallDelta = nowWall - this.lastWallAuditMs;
      this.lastPerfAuditMs = nowPerf;
      this.lastWallAuditMs = nowWall;
      if (perfDelta < -50 || (wallDelta > 20 && perfDelta > 1500 && perfDelta / wallDelta > 6)) {
        this.speedAnomalyStreak += 1;
        if (this.speedAnomalyStreak >= 4) {
          this.haltForSecurityViolation({
            code: 'SEC-SPEEDHACK',
            title: 'Обнаружена модификация игры',
            message:
              'Обнаружено искусственное ускорение игрового времени или вмешательство в таймер. Пожалуйста, отключите ускорители и удалите модификации, после чего запустите официальную версию.',
          });
          return;
        }
      } else {
        this.speedAnomalyStreak = Math.max(0, this.speedAnomalyStreak - 1);
      }
    }

    if (this.screenState === 'title') {
      this.titleCamX += dt * 36;
      this.camX = this.titleCamX;
      this.camY = getTrailCenterY(this.titleCamX);
      return;
    }

    if (this.screenState !== 'playing' || this.shopOpen) {
      return;
    }

    if (this.gameOverDelay > 0) {
      this.gameOverDelay -= dt;
      this.updateParticles(dt);
      if (this.gameOverDelay <= 0) {
        this.keysPressed.clear();
        this.mouseDown = false;
        this.fireButtonHeld = false;
        this.saveProfile();
        this.screenState = 'gameover';
        document.body.dataset.state = 'gameover';
        soundEngine.setMusicMode('none');
        this.emitHud(true);
      }
      return;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.lastComboTier = 0;
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateParticles(dt);
      this.updateCasings(dt);
      return;
    }

    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.updateWaveSpawner(dt);
    this.updateZombies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateCasings(dt);
    this.updateFloatingTexts(dt);

    // Feed combat intensity (low HP + close threats + combo adrenaline) into music engine
    const hpDanger = Math.max(0, 1 - this.player.hp / Math.max(1, this.player.maxHp * 0.65));
    const comboHeat = Math.min(1, this.comboCount / 10);
    soundEngine.setCombatIntensity(Math.max(0.25, Math.min(1, 0.25 + hpDanger * 0.45 + this.dangerProximity * 0.35 + comboHeat * 0.25)));

    // Smooth framerate-independent camera centered steadily on player (no aim-lead jitter)
    const targetCamX = this.player.x + 36;
    const targetCamY = this.player.y;
    const camBlend = 1 - Math.exp(-9.5 * dt);
    this.camX += (targetCamX - this.camX) * camBlend;
    this.camY += (targetCamY - this.camY) * camBlend;

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number): void {
    let moveX = this.moveStickX;
    let moveY = this.moveStickY;

    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) moveX -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) moveX += 1;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) moveY -= 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) moveY += 1;

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    // Mud slightly slows movement; adrenaline combo speeds up nimble dodging
    const comboBonus = getAdrenalineComboBonus(this.comboCount);
    const surfaceSpeedMod = (this.player.surface === 'mud' ? 0.82 : 1.0) * (1 + comboBonus.speedBonus);
    const prevX = this.player.x;
    const prevY = this.player.y;

    this.player.vx = moveX * this.player.speed * surfaceSpeedMod;
    this.player.vy = moveY * this.player.speed * surfaceSpeedMod;

    this.player.x += this.player.vx * dt;
    this.player.y = Math.max(
      -ARENA_HALF_HEIGHT + 24,
      Math.min(ARENA_HALF_HEIGHT - 24, this.player.y + this.player.vy * dt)
    );

    // Gentle tree trunk collision pushout so player never clips inside trunks
    this.resolveTreeCollisions(this.player);

    const distMoved = Math.hypot(this.player.x - prevX, this.player.y - prevY);
    this.player.walkDist += distMoved;
    this.player.stepAccum += distMoved;
    if (this.isTutorialMatch && !this.tutMoved && this.player.walkDist >= 24) {
      this.tutMoved = true;
      this.emitHud();
    }

    const surface = getSurfaceAtWorldPos(this.player.x, this.player.y, this.biomeId);
    this.player.surface = surface;

    if (this.player.stepAccum >= 29) {
      this.player.stepAccum = 0;
      soundEngine.playFootstep(surface);
      const stepColor =
        surface === 'mud'
          ? '#3b2e22'
          : surface === 'grass'
            ? '#3b6645'
            : surface === 'gravel'
              ? '#8c7a62'
              : surface === 'wood'
                ? '#78512f'
                : '#71717a';
      this.spawnBurst(this.player.x, this.player.y + 8, 3, stepColor, 34);
    }

    // Aiming priority:
    // 1. Active manual right aim stick overrides everything while held
    // 2. Close-range auto-aim locks onto nearest zombie within AUTO_AIM_RANGE
    // 3. Mouse cursor or walking direction when zombies are outside close range
    if (this.aimStickActive && Math.hypot(this.aimStickX, this.aimStickY) > 0.12) {
      this.aimMode = 'stick';
      this.autoAimTargetId = null;
      this.player.aimAngle = Math.atan2(this.aimStickY, this.aimStickX);
    } else {
      const closeTarget = findAutoAimTarget(
        this.player.x,
        this.player.y,
        this.zombies,
        AUTO_AIM_RANGE,
        -4
      );
      if (closeTarget) {
        this.autoAimTargetId = closeTarget.id;
        this.player.aimAngle = closeTarget.angle;
      } else {
        this.autoAimTargetId = null;
        if (this.aimMode === 'mouse' && this.hasMousePos) {
          const worldMouse = this.screenToWorld(this.mouseClientX, this.mouseClientY);
          this.player.aimAngle = Math.atan2(
            worldMouse.y - (this.player.y - 4),
            worldMouse.x - this.player.x
          );
        } else if (len > 0.15) {
          this.player.aimAngle = Math.atan2(moveY, moveX);
        }
      }
    }

    if (this.player.invulnTimer > 0) this.player.invulnTimer = Math.max(0, this.player.invulnTimer - dt);
    if (this.player.flashTimer > 0) this.player.flashTimer = Math.max(0, this.player.flashTimer - dt);
    if (this.player.recoil > 0) this.player.recoil = Math.max(0, this.player.recoil - dt * 18);
  }

  private resolveTreeCollisions(entity: { x: number; y: number; radius: number }): void {
    const cellSize = 52;
    const cx = Math.floor(entity.x / cellSize);
    const cy = Math.floor(entity.y / cellSize);

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const tree = this.getTreeAtCell(gx, gy);
        if (!tree) continue;
        const dx = entity.x - tree.x;
        const dy = entity.y - tree.y;
        const minDist = entity.radius + 7;
        const d2 = dx * dx + dy * dy;
        if (d2 < minDist * minDist && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = minDist - d;
          entity.x += (dx / d) * push;
          entity.y += (dy / d) * push;
        }
      }
    }
  }

  private getTreeAtCell(gx: number, gy: number): { x: number; y: number; variant: number } | null {
    const h = tileHash(gx * 17 + 3, gy * 31 + 7);
    if (h < 0.28) return null;
    const tx = gx * 52 + 10 + tileHash(gx, gy + 10) * 32;
    const ty = gy * 52 + 10 + tileHash(gx + 10, gy) * 32;
    if (Math.abs(ty) > ARENA_HALF_HEIGHT + 50) return null;
    // Keep the forest trail clear & >= 2 tiles wide
    const trailY = getTrailCenterY(tx);
    if (Math.abs(ty - trailY) < TRAIL_HALF_WIDTH + 18) return null;
    // Keep bridge approaches clear
    if (isWoodenBridgeAt(tx, ty)) return null;
    return { x: tx, y: ty, variant: h > 0.64 ? 1 : 0 };
  }

  private getPropAtCell(gx: number, gy: number): { x: number; y: number; kind: 'bush' | 'rock' } | null {
    const h = tileHash(gx * 41 + 11, gy * 23 + 5);
    if (h < 0.68) return null;
    const px = gx * 44 + 8 + tileHash(gx + 3, gy + 19) * 28;
    const py = gy * 44 + 8 + tileHash(gx + 19, gy + 3) * 28;
    if (Math.abs(py) > ARENA_HALF_HEIGHT + 20) return null;
    const trailY = getTrailCenterY(px);
    // Place bushes/rocks just off the trail edges
    if (Math.abs(py - trailY) < TRAIL_HALF_WIDTH + 6) return null;
    if (isWoodenBridgeAt(px, py)) return null;
    return { x: px, y: py, kind: h > 0.86 ? 'rock' : 'bush' };
  }

  private updateWeapons(dt: number): void {
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);

    const weaponDef = WEAPONS[this.activeWeaponId];
    const stats = getWeaponEffectiveStats(weaponDef, this.upgrades[this.activeWeaponId]);

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.ammoMap[this.activeWeaponId] = stats.magSize;
        this.emitHud();
      }
      return;
    }

    const wantsFire =
      this.mouseDown ||
      this.fireButtonHeld ||
      this.keysPressed.has('Space');

    if (wantsFire && this.fireCooldown <= 0) {
      const currentAmmo = this.ammoMap[this.activeWeaponId];
      if (currentAmmo <= 0) {
        soundEngine.playDryFire();
        this.triggerReload();
        return;
      }

      const comboBonus = getAdrenalineComboBonus(this.comboCount);
      this.ammoMap[this.activeWeaponId] = currentAmmo - 1;
      if (this.isTutorialMatch && !this.tutShot) {
        this.tutShot = true;
      }
      this.fireCooldown = 1 / (stats.fireRate * (1 + comboBonus.fireRateBonus));
      this.muzzleFlashTimer = 0.06;
      this.player.recoil = 5;
      this.trauma = Math.min(
        0.34,
        this.trauma +
          (this.activeWeaponId === 'double_barrel' ||
          this.activeWeaponId === 'sniper_rifle' ||
          this.activeWeaponId === 'gauss_cannon' ||
          this.activeWeaponId === 'void_annihilator'
            ? 0.13
            : this.activeWeaponId === 'shotgun' ||
                this.activeWeaponId === 'pump_shotgun' ||
                this.activeWeaponId === 'auto_shotgun' ||
                this.activeWeaponId === 'revolver' ||
                this.activeWeaponId === 'combat_crossbow' ||
                this.activeWeaponId === 'railgun'
              ? 0.095
              : 0.025)
      );

      soundEngine.playGunshot(this.activeWeaponId);

      const muzzleX = this.player.x + Math.cos(this.player.aimAngle) * 14;
      const muzzleY = this.player.y - 4 + Math.sin(this.player.aimAngle) * 14;
      this.spawnBurst(muzzleX, muzzleY, 6, '#fde68a', 135);
      this.spawnShellCasing(this.activeWeaponId, this.player.aimAngle);

      const finalDamage = Math.max(1, Math.round(stats.damage * this.playerDamageMult));
      const bulletRadius =
        this.activeWeaponId === 'saw_launcher' ||
        this.activeWeaponId === 'gauss_cannon' ||
        this.activeWeaponId === 'void_annihilator'
          ? 4.6
          : this.activeWeaponId === 'flamethrower'
            ? 4.0
            : this.activeWeaponId === 'rifle' ||
                this.activeWeaponId === 'revolver' ||
                this.activeWeaponId === 'combat_crossbow' ||
                this.activeWeaponId === 'plasma_carbine' ||
                this.activeWeaponId === 'cryo_cannon' ||
                this.activeWeaponId === 'tesla_coil' ||
                this.activeWeaponId === 'sniper_rifle' ||
                this.activeWeaponId === 'railgun'
              ? 3.4
              : 2.5;

      for (let i = 0; i < stats.pellets; i++) {
        const spreadOffset = (Math.random() - 0.5) * stats.spreadRad;
        const angle = this.player.aimAngle + spreadOffset;
        this.spawnBullet(
          true,
          muzzleX,
          muzzleY,
          Math.cos(angle) * stats.projectileSpeed,
          Math.sin(angle) * stats.projectileSpeed,
          finalDamage,
          stats.knockback,
          stats.pierce,
          stats.range,
          weaponDef.accentColor,
          bulletRadius
        );
      }

      if (this.ammoMap[this.activeWeaponId] === 0) {
        this.triggerReload();
      } else {
        this.emitHud();
      }
    }
  }

  private spawnBullet(
    fromPlayer: boolean,
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    knockback: number,
    pierce: number,
    maxRange: number,
    color: string,
    radius: number
  ): void {
    for (const b of this.bullets) {
      if (!b.active) {
        b.active = true;
        b.fromPlayer = fromPlayer;
        b.x = x;
        b.y = y;
        b.vx = vx;
        b.vy = vy;
        b.damage = damage;
        b.knockback = knockback;
        b.pierceLeft = pierce;
        b.traveled = 0;
        b.maxRange = maxRange;
        b.color = color;
        b.radius = radius;
        b.hitIds.clear();
        return;
      }
    }
  }

  private updateWaveSpawner(dt: number): void {
    this.waveElapsed += dt;

    while (
      this.nextSpawnIndex < this.currentWave.entries.length &&
      this.waveElapsed >= this.currentWave.entries[this.nextSpawnIndex].delaySec
    ) {
      const entry = this.currentWave.entries[this.nextSpawnIndex];
      this.spawnZombie(entry.kind);
      this.nextSpawnIndex += 1;
    }

    const aliveCount = this.zombies.filter((z) => !z.isDead).length;
    if (this.nextSpawnIndex >= this.currentWave.entries.length && aliveCount === 0) {
      if (this.waveClearPause === 0) {
        soundEngine.playWaveClear();
        const diff = DIFFICULTIES[this.difficulty];
        const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
        const bonus = this.isTutorialMatch
          ? 5
          : Math.round((4 + biomeIdx * 1.6 + this.waveNumber) * diff.coinMult);
        this._ac(bonus);
        this.totalCoinsEarned += bonus;
        this.grantPlayerXp(
          this.isTutorialMatch
            ? 2
            : (2 + Math.floor(biomeIdx * 0.6)) * diff.xpMult
        );
        this.saveProfile();
        this.addFloatingText(this.player.x, this.player.y - 24, `+${bonus} монет`, '#fbbf24');
        this.waveClearPause = this.waveNumber >= this.totalWaves ? 0.9 : 1.35;
        this.emitHud();
      } else {
        this.waveClearPause -= dt;
        if (this.waveClearPause <= 0) {
          if (this.waveNumber >= this.totalWaves) {
            this.completeRoundVictory();
          } else {
            this.setupWave(this.waveNumber + 1);
            this.emitHud();
          }
        }
      }
    }
  }

  private grantPlayerXp(rawXp: number): void {
    if (!Number.isFinite(rawXp) || rawXp <= 0) return;
    this.xpBuffer += rawXp;
    const amount = Math.floor(this.xpBuffer);
    if (amount <= 0) return;
    this.xpBuffer -= amount;
    this.roundXpEarned += amount;
    const prevUnlocked = new Set(getUnlockedBiomes(this._gl()));
    const res = applyXpGain(this._gl(), this._gx(), amount);
    this._sl(res.newLevel);
    this._sx(res.newXp);

    if (res.levelsGained > 0) {
      this.didLevelUpInRound = true;
      soundEngine.playLevelUp();
      this.addFloatingText(
        this.player.x,
        this.player.y - 36,
        `НОВЫЙ УРОВЕНЬ ${this._gl()}!`,
        '#4ade80'
      );
      const nowUnlocked = getUnlockedBiomes(this._gl());
      const newly = nowUnlocked.find((b) => !prevUnlocked.has(b));
      if (newly) {
        this.newlyUnlockedBiomeName = BIOMES[newly].name;
        this.selectedBiomeId = getBiomeForLevel(this._gl());
      }
    }
    this.saveProfile();
  }

  private spawnZombie(kind: ZombieKind): void {
    const diff = DIFFICULTIES[this.difficulty];
    const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
    const waveScale = getBiomeZombieHpMultiplier(
      this.biomeId,
      this.waveNumber,
      this.isTutorialMatch
    );
    const speedScale = getBiomeZombieSpeedMultiplier(
      this.biomeId,
      this.waveNumber,
      this.isTutorialMatch
    );
    const dmgScale = getBiomeZombieDamageMultiplier(
      this.biomeId,
      this.waveNumber,
      this.isTutorialMatch
    );

    // Pincer ambush spawns: front trail, flanks, and rear pressure so players cannot camp
    const roll = Math.random();
    let spawnX = this.player.x + 335 + Math.random() * 95;
    let spawnY = getTrailCenterY(spawnX) + (Math.random() - 0.5) * 200;
    if (!this.isTutorialMatch && kind !== 'boss') {
      if (kind === 'flanker' || roll > 0.62) {
        const fromLeft = roll > 0.82;
        spawnX = this.player.x + (fromLeft ? -255 - Math.random() * 65 : 195 + Math.random() * 110);
        spawnY = Math.random() > 0.5 ? -ARENA_HALF_HEIGHT + 28 : ARENA_HALF_HEIGHT - 28;
      } else if (roll < 0.22) {
        // Rear trail pursuers!
        spawnX = this.player.x - 280 - Math.random() * 80;
        spawnY = getTrailCenterY(spawnX) + (Math.random() - 0.5) * 140;
      }
    }
    spawnY = Math.max(-ARENA_HALF_HEIGHT + 24, Math.min(ARENA_HALF_HEIGHT - 24, spawnY));

    let hp = Math.round(40 * waveScale);
    let speed = 56 * speedScale;
    let radius = 10;
    let damage = Math.round(7 * dmgScale);
    let coinReward = 2 + Math.floor(biomeIdx * 0.65);
    let xpReward = 0.35 + biomeIdx * 0.08;

    if (this.isTutorialMatch) {
      speed = 38;
      damage = 4;
      coinReward = 2;
      xpReward = 1;
    } else if (kind === 'runner') {
      hp = Math.round(30 * waveScale);
      speed = 92 * speedScale;
      damage = Math.round(6 * dmgScale);
      coinReward = 2 + Math.floor(biomeIdx * 0.75);
      xpReward = 0.45 + biomeIdx * 0.1;
    } else if (kind === 'flanker') {
      hp = Math.round(35 * waveScale);
      speed = 82 * speedScale;
      radius = 10;
      damage = Math.round(8 * dmgScale);
      coinReward = 3 + Math.floor(biomeIdx * 0.8);
      xpReward = 0.55 + biomeIdx * 0.12;
    } else if (kind === 'brute') {
      hp = Math.round(115 * waveScale);
      speed = 43 * speedScale;
      radius = 14;
      damage = Math.round(14 * dmgScale);
      coinReward = 6 + Math.floor(biomeIdx * 1.25);
      xpReward = 1.2 + biomeIdx * 0.25;
    } else if (kind === 'spitter') {
      hp = Math.round(38 * waveScale);
      speed = 58 * speedScale;
      damage = Math.round(8 * dmgScale);
      coinReward = 3 + Math.floor(biomeIdx * 0.85);
      xpReward = 0.65 + biomeIdx * 0.14;
    } else if (kind === 'shielder') {
      hp = Math.round(98 * waveScale);
      speed = 50 * speedScale;
      radius = 12;
      damage = Math.round(10 * dmgScale);
      coinReward = 4 + Math.floor(biomeIdx * 1.0);
      xpReward = 0.85 + biomeIdx * 0.18;
    } else if (kind === 'boomer') {
      hp = Math.round(52 * waveScale);
      speed = 66 * speedScale;
      radius = 12;
      damage = Math.round(17 * dmgScale);
      coinReward = 4 + Math.floor(biomeIdx * 0.95);
      xpReward = 0.85 + biomeIdx * 0.16;
    } else if (kind === 'boss') {
      hp = getBiomeBossHp(this.biomeId);
      speed = 58 * speedScale;
      radius = 23;
      damage = Math.round(16 * dmgScale);
      coinReward = 50 + biomeIdx * 10;
      xpReward = 12 + biomeIdx * 2;
    }

    hp = Math.max(10, Math.round(hp * diff.enemyHpMult));
    speed = Number((speed * diff.enemySpeedMult).toFixed(1));
    damage = Math.max(3, Math.round(damage * diff.enemyDamageMult));
    coinReward = Math.max(2, Math.round(coinReward * diff.coinMult));
    xpReward = Number(Math.max(0.2, xpReward * diff.xpMult).toFixed(2));

    this.zombies.push({
      id: this.nextEntityId++,
      kind,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      radius,
      hp,
      maxHp: hp,
      speed,
      damage,
      coinReward,
      xpReward,
      facing: -1,
      strafeSign: Math.random() > 0.5 ? 1 : -1,
      walkCycle: Math.random() * 10,
      flashTimer: 0,
      attackCooldown: 0.65,
      telegraphTimer: 0,
      telegraphType: 'none',
      telegraphX: 0,
      telegraphY: 0,
      chargeDirX: 0,
      chargeDirY: 0,
      koTimer: 0,
      isDead: false,
    });

    if (Math.random() < 0.35 || kind === 'boss') {
      soundEngine.playZombieGroan(kind === 'boss');
    }
  }

  private updateZombies(dt: number): void {
    let activeTokens = this.zombies.filter((z) => !z.isDead && z.telegraphTimer > 0).length;
    const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
    const windupFactor = Math.max(0.68, 1 - biomeIdx * 0.02);
    let nearestDist = 999;

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.flashTimer > 0) z.flashTimer = Math.max(0, z.flashTimer - dt);

      if (z.isDead) {
        z.koTimer -= dt;
        z.x += z.vx * dt;
        z.y += z.vy * dt;
        z.vx *= 0.88;
        z.vy *= 0.88;
        if (z.koTimer <= 0) {
          this.zombies.splice(i, 1);
        }
        continue;
      }

      if (z.attackCooldown > 0) z.attackCooldown = Math.max(0, z.attackCooldown - dt);

      const dx = this.player.x - z.x;
      const dy = this.player.y - z.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      if (dist < nearestDist) nearestDist = dist;
      const nx = dx / dist;
      const ny = dy / dist;
      z.facing = dx >= 0 ? 1 : -1;

      // Active Telegraph Windup -> Execute Attack
      if (z.telegraphTimer > 0) {
        z.telegraphTimer -= dt;
        if (z.telegraphTimer <= 0) {
          this.executeZombieAttack(z, nx, ny, dist);
        }
        continue;
      }

      // Movement Policies & Aggressive Tactics by Archetype
      let moveScale = 1.0;
      let strafeWeight = 0;
      const isBossEnraged = z.kind === 'boss' && z.hp < z.maxHp * 0.55;
      if (isBossEnraged) moveScale = 1.24;

      if (z.kind === 'spitter') {
        if (dist < 145) moveScale = -0.7;
        else if (dist < 225) moveScale = 0.25;
        if (dist < 320 && z.attackCooldown <= 0 && activeTokens < this.attackTokenBudget) {
          z.telegraphType = 'spit';
          z.telegraphTimer = 0.44 * windupFactor;
          z.telegraphX = this.player.x;
          z.telegraphY = this.player.y;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'runner') {
        if (dist < 140 && dist > 34 && z.attackCooldown <= 0 && activeTokens < this.attackTokenBudget) {
          z.telegraphType = 'lunge';
          z.telegraphTimer = 0.26 * windupFactor;
          z.chargeDirX = nx;
          z.chargeDirY = ny;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'flanker') {
        if (dist > 44 && dist < 240) {
          strafeWeight = 0.78 * z.strafeSign;
        }
        if (dist < 110 && dist > 30 && z.attackCooldown <= 0 && activeTokens < this.attackTokenBudget) {
          z.telegraphType = 'lunge';
          z.telegraphTimer = 0.24 * windupFactor;
          z.chargeDirX = nx;
          z.chargeDirY = ny;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'shielder') {
        if (dist > 74 && dist < 205 && z.attackCooldown <= 0 && activeTokens < this.attackTokenBudget) {
          z.telegraphType = 'charge';
          z.telegraphTimer = 0.4 * windupFactor;
          z.chargeDirX = nx;
          z.chargeDirY = ny;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'boomer') {
        if (dist < 48 && z.attackCooldown <= 0) {
          z.telegraphType = 'explode';
          z.telegraphTimer = 0.42 * windupFactor;
          z.telegraphX = z.x;
          z.telegraphY = z.y;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'brute') {
        if (dist < 54 && z.attackCooldown <= 0 && activeTokens < this.attackTokenBudget) {
          z.telegraphType = 'slam';
          z.telegraphTimer = 0.45 * windupFactor;
          z.telegraphX = z.x;
          z.telegraphY = z.y;
          activeTokens++;
          continue;
        }
      } else if (z.kind === 'boss') {
        if (dist < 72 && z.attackCooldown <= 0) {
          z.telegraphType = 'slam';
          z.telegraphTimer = (isBossEnraged ? 0.5 : 0.62) * windupFactor;
          z.telegraphX = z.x;
          z.telegraphY = z.y;
          soundEngine.playZombieGroan(true);
          continue;
        }
        if (dist > 105 && dist < 300 && z.attackCooldown <= 0) {
          z.telegraphType = isBossEnraged && Math.random() < 0.45 ? 'spit' : 'charge';
          z.telegraphTimer = (isBossEnraged ? 0.48 : 0.58) * windupFactor;
          z.telegraphX = this.player.x;
          z.telegraphY = this.player.y;
          z.chargeDirX = nx;
          z.chargeDirY = ny;
          soundEngine.playZombieGroan(true);
          continue;
        }
      }

      // Soft separation between zombies so hordes spread organically
      let sepX = 0;
      let sepY = 0;
      for (let j = 0; j < this.zombies.length; j++) {
        if (i === j || this.zombies[j].isDead) continue;
        const o = this.zombies[j];
        const sx = z.x - o.x;
        const sy = z.y - o.y;
        const sd2 = sx * sx + sy * sy;
        const minD = z.radius + o.radius + 4;
        if (sd2 < minD * minD && sd2 > 0.01) {
          const sd = Math.sqrt(sd2);
          sepX += (sx / sd) * 28;
          sepY += (sy / sd) * 28;
        }
      }

      const strafeX = -ny * strafeWeight;
      const strafeY = nx * strafeWeight;
      const desiredVx = (nx * moveScale + strafeX) * z.speed + sepX;
      const desiredVy = (ny * moveScale + strafeY) * z.speed + sepY;
      z.vx += (desiredVx - z.vx) * Math.min(1, dt * 7);
      z.vy += (desiredVy - z.vy) * Math.min(1, dt * 7);
      z.x += z.vx * dt;
      z.y = Math.max(
        -ARENA_HALF_HEIGHT + 20,
        Math.min(ARENA_HALF_HEIGHT - 20, z.y + z.vy * dt)
      );
      z.walkCycle += Math.hypot(z.vx, z.vy) * dt * 0.12;

      // Contact melee bite
      if (checkCircleCollision(z.x, z.y, z.radius, this.player.x, this.player.y, this.player.radius)) {
        if (z.attackCooldown <= 0) {
          this.damagePlayer(z.damage, nx, ny);
          z.attackCooldown = 0.85;
        }
      }
    }

    this.dangerProximity = nearestDist < 68 ? Math.max(0, 1 - nearestDist / 68) : 0;
  }

  private detonateBoomer(z: ZombieEntity, radius: number, selfDetonate: boolean): void {
    const dx = this.player.x - z.x;
    const dy = this.player.y - z.y;
    const dist = Math.max(0.001, Math.hypot(dx, dy));
    this.trauma = Math.min(0.75, this.trauma + 0.36);
    this.spawnBurst(z.x, z.y, 28, '#a3e635', 185);
    this.spawnBurst(z.x, z.y, 14, '#ef4444', 145);
    if (dist <= radius) {
      this.damagePlayer(z.damage, dx / dist, dy / dist);
    }
    if (selfDetonate && !z.isDead) {
      z.isDead = true;
      z.hp = 0;
      z.koTimer = 0.2;
      soundEngine.playZombieDeath(false);
    }
  }

  private executeZombieAttack(z: ZombieEntity, nx: number, ny: number, dist: number): void {
    const type = z.telegraphType;
    z.telegraphType = 'none';
    const biomeIdx = Math.max(0, BIOME_CYCLE.indexOf(this.biomeId));
    const cdScale = Math.max(0.68, 1 - biomeIdx * 0.02);

    if (type === 'spit') {
      const aimX = z.telegraphX - z.x;
      const aimY = z.telegraphY - z.y;
      const baseAngle = Math.atan2(aimY, aimX);
      const count = z.kind === 'boss' ? 5 : biomeIdx >= 8 ? 2 : 1;
      const spreadStep = z.kind === 'boss' ? 0.24 : 0.16;
      for (let i = 0; i < count; i++) {
        const ang = baseAngle + (i - (count - 1) / 2) * spreadStep;
        this.spawnBullet(
          false,
          z.x,
          z.y - 4,
          Math.cos(ang) * 255,
          Math.sin(ang) * 255,
          z.kind === 'boss' ? Math.round(z.damage * 0.72) : z.damage,
          45,
          1,
          360,
          z.kind === 'boss' ? '#f97316' : '#a3e635',
          z.kind === 'boss' ? 5 : 4
        );
      }
      z.attackCooldown = (z.kind === 'boss' ? 1.55 : 1.7) * cdScale;
    } else if (type === 'lunge') {
      z.vx = z.chargeDirX * 290;
      z.vy = z.chargeDirY * 290;
      z.x += z.chargeDirX * 22;
      z.y = Math.max(
        -ARENA_HALF_HEIGHT + 20,
        Math.min(ARENA_HALF_HEIGHT - 20, z.y + z.chargeDirY * 22)
      );
      z.attackCooldown = 1.4 * cdScale;
      if (dist < 46) {
        this.damagePlayer(z.damage, nx, ny);
      }
    } else if (type === 'slam') {
      const slamRadius = z.kind === 'boss' ? 82 : 56;
      this.trauma = Math.min(0.85, this.trauma + (z.kind === 'boss' ? 0.48 : 0.28));
      this.spawnBurst(z.x, z.y, z.kind === 'boss' ? 28 : 16, '#ef4444', 165);
      if (dist <= slamRadius) {
        this.damagePlayer(z.damage + (z.kind === 'boss' ? 5 : 3), nx, ny);
      }
      z.attackCooldown = (z.kind === 'boss' ? 1.75 : 1.65) * cdScale;
    } else if (type === 'charge') {
      const surge = z.kind === 'boss' ? 48 : 34;
      z.vx = z.chargeDirX * (z.kind === 'boss' ? 345 : 290);
      z.vy = z.chargeDirY * (z.kind === 'boss' ? 345 : 290);
      z.x += z.chargeDirX * surge;
      z.y = Math.max(
        -ARENA_HALF_HEIGHT + 20,
        Math.min(ARENA_HALF_HEIGHT - 20, z.y + z.chargeDirY * surge)
      );
      this.trauma = Math.min(0.65, this.trauma + 0.25);
      this.spawnBurst(z.x, z.y, 14, z.kind === 'shielder' ? '#94a3b8' : '#f97316', 130);
      if (checkCircleCollision(z.x, z.y, z.radius + 10, this.player.x, this.player.y, this.player.radius)) {
        this.damagePlayer(z.damage, z.chargeDirX, z.chargeDirY);
      }
      z.attackCooldown = 1.8 * cdScale;
    } else if (type === 'explode') {
      this.detonateBoomer(z, 58, true);
    }
  }

  private damagePlayer(amount: number, knockX: number, knockY: number): void {
    if (this.player.invulnTimer > 0 || this.gameOverDelay > 0) return;

    let remaining = amount;
    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, Math.ceil(remaining * 0.65));
      this.player.armor -= absorbed;
      remaining -= absorbed;
    }

    this.player.hp = Math.max(0, this.player.hp - remaining);
    this.player.invulnTimer = 0.52;
    this.player.flashTimer = 0.14;
    this.player.x += knockX * 14;
    this.player.y = Math.max(
      -ARENA_HALF_HEIGHT + 24,
      Math.min(ARENA_HALF_HEIGHT - 24, this.player.y + knockY * 14)
    );
    this.resolveTreeCollisions(this.player);
    this.trauma = Math.min(0.92, this.trauma + 0.48);
    this.hitstopTimer = 0.045;
    this.spawnBurst(this.player.x, this.player.y, 14, '#ef4444', 135);
    soundEngine.playPlayerHurt();
    this.emitHud();

    if (this.player.hp <= 0) {
      this.gameOverDelay = 0.55;
      this.spawnBurst(this.player.x, this.player.y, 26, '#dc2626', 170);
    }
  }

  private updateBullets(dt: number): void {
    const comboBonus = getAdrenalineComboBonus(this.comboCount);
    for (const b of this.bullets) {
      if (!b.active) continue;
      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      b.x += stepX;
      b.y += stepY;
      b.traveled += Math.hypot(stepX, stepY);

      if (b.traveled >= b.maxRange || Math.abs(b.y) > ARENA_HALF_HEIGHT + 60) {
        b.active = false;
        continue;
      }

      if (!b.fromPlayer) {
        if (checkCircleCollision(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
          const len = Math.max(1, Math.hypot(b.vx, b.vy));
          this.damagePlayer(b.damage, b.vx / len, b.vy / len);
          b.active = false;
        }
        continue;
      }

      // Check player projectile vs zombies
      for (const z of this.zombies) {
        if (z.isDead || b.hitIds.has(z.id)) continue;
        if (checkCircleCollision(b.x, b.y, b.radius, z.x, z.y, z.radius + 2)) {
          const shieldBlocked =
            z.kind === 'shielder' && b.pierceLeft <= 1 && Math.sign(b.vx) !== z.facing;

          b.hitIds.add(z.id);
          b.pierceLeft -= 1;

          const len = Math.max(1, Math.hypot(b.vx, b.vy));
          const isCrit = !shieldBlocked && Math.random() < comboBonus.critChance;
          const baseDmg = shieldBlocked ? Math.max(1, Math.round(b.damage * 0.55)) : b.damage;
          const dmgDealt = isCrit ? Math.round(baseDmg * 1.65) : baseDmg;
          const kbFactor =
            z.kind === 'boss' ? 0.15 : z.kind === 'brute' || z.kind === 'shielder' ? 0.35 : 1.0;
          z.vx += (b.vx / len) * b.knockback * kbFactor;
          z.vy += (b.vy / len) * b.knockback * kbFactor;
          z.hp -= dmgDealt;
          z.flashTimer = isCrit ? 0.09 : 0.06;

          this.spawnBurst(
            b.x,
            b.y,
            isCrit ? 11 : 6,
            shieldBlocked ? '#94a3b8' : isCrit ? '#fbbf24' : '#991b1b',
            isCrit ? 135 : 95
          );
          this.addFloatingText(
            z.x,
            z.y - z.radius - 6,
            shieldBlocked ? `${dmgDealt} ЩИТ` : isCrit ? `КРИТ ${dmgDealt}!` : `${dmgDealt}`,
            shieldBlocked ? '#cbd5e1' : isCrit ? '#fbbf24' : '#fef3c7',
            isCrit ? 1.25 : 1
          );

          if (z.hp <= 0) {
            this.killZombie(z, b.vx / len, b.vy / len, isCrit);
          } else if (isCrit) {
            this.trauma = Math.min(0.4, this.trauma + 0.045);
            soundEngine.playCritHit();
          } else {
            soundEngine.playZombieHit();
          }

          if (b.pierceLeft <= 0) {
            b.active = false;
            break;
          }
        }
      }
    }
  }

  private killZombie(z: ZombieEntity, dirX: number, dirY: number, isCrit = false): void {
    z.isDead = true;
    z.hp = 0;
    z.koTimer = z.kind === 'boss' ? 0.55 : 0.28;
    z.vx = dirX * (z.kind === 'boss' ? 50 : 145);
    z.vy = dirY * (z.kind === 'boss' ? 50 : 145);

    if (z.kind === 'boomer') {
      const distToPlayer = Math.hypot(this.player.x - z.x, this.player.y - z.y);
      if (distToPlayer < 50) {
        this.detonateBoomer(z, 46, false);
      } else {
        this.spawnBurst(z.x, z.y, 18, '#84cc16', 150);
      }
    }

    this.kills += 1;
    if (this.kills > this.bestKills) {
      this.bestKills = this.kills;
    }

    // Adrenaline kill streak tracking
    this.comboCount += 1;
    this.comboTimer = 3.2;
    const comboBonus = getAdrenalineComboBonus(this.comboCount);
    if (comboBonus.tier > this.lastComboTier) {
      this.lastComboTier = comboBonus.tier;
      soundEngine.playComboUp(comboBonus.tier);
      this.addFloatingText(
        this.player.x,
        this.player.y - 30,
        comboBonus.label,
        comboBonus.tier >= 3 ? '#f43f5e' : comboBonus.tier === 2 ? '#fb923c' : '#fbbf24',
        1.25
      );
    }

    // Restore +5 HP per zombie kill whenever player HP has been spent
    const healRes = applyKillHeal(this.player.hp, this.player.maxHp, KILL_HEAL_HP);
    if (healRes.healed > 0) {
      this.player.hp = healRes.newHp;
      this.addFloatingText(
        this.player.x,
        this.player.y - 20,
        `+${Math.round(healRes.healed)} HP`,
        '#4ade80'
      );
    }

    this.grantPlayerXp(z.xpReward);

    if (z.kind === 'boss') {
      const trophiesEarned = calculateBossTrophyReward(this.biomeId, this.difficulty);
      this._at(trophiesEarned);
      this.roundTrophiesEarned += trophiesEarned;
      this.saveProfile();
      const mod10 = trophiesEarned % 10;
      const mod100 = trophiesEarned % 100;
      const trophyWord =
        mod10 === 1 && mod100 !== 11
          ? 'трофей'
          : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
            ? 'трофея'
            : 'трофеев';
      this.addFloatingText(
        z.x,
        z.y - 34,
        `+${trophiesEarned} ${trophyWord}`,
        '#fbbf24',
        1.35
      );
    }

    // Grant immediate base coins + magnetized coin drops whose sum exactly equals z.coinReward
    const directCoins = Math.floor(z.coinReward * 0.4);
    const dropCoins = Math.max(0, z.coinReward - directCoins);
    if (directCoins > 0) {
      this._ac(directCoins);
      this.totalCoinsEarned += directCoins;
      this.saveProfile();
    }

    if (dropCoins > 0) {
      const dropCount = Math.min(z.kind === 'boss' ? 8 : 2, dropCoins);
      const baseVal = Math.floor(dropCoins / dropCount);
      const remainder = dropCoins - baseVal * dropCount;
      for (let i = 0; i < dropCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 48 + Math.random() * 68;
        this.pickups.push({
          x: z.x,
          y: z.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          value: baseVal + (i < remainder ? 1 : 0),
          kind: 'coin',
          life: 24,
          magnetDelay: 0.2,
          bobOffset: Math.random() * 6,
        });
      }
    }

    if (Math.random() < 0.14 || z.kind === 'boss') {
      this.pickups.push({
        x: z.x + 8,
        y: z.y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        value: 25,
        kind: 'medkit',
        life: 26,
        magnetDelay: 0.35,
        bobOffset: Math.random() * 6,
      });
    }

    this.hitstopTimer = z.kind === 'boss' ? 0.085 : isCrit ? 0.036 : 0.025;
    this.trauma = Math.min(0.48, this.trauma + (z.kind === 'boss' ? 0.28 : isCrit ? 0.095 : 0.065));
    this.spawnBurst(z.x, z.y, z.kind === 'boss' ? 38 : isCrit ? 18 : 14, '#7f1d1d', z.kind === 'boss' ? 195 : 145);
    soundEngine.playZombieDeath(z.kind === 'boss');
    this.emitHud();
  }

  private updatePickups(dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }

      if (p.magnetDelay > 0) {
        p.magnetDelay = Math.max(0, p.magnetDelay - dt);
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.88;
      p.vy *= 0.88;

      const dx = this.player.x - p.x;
      const dy = this.player.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (p.kind === 'coin' && p.magnetDelay <= 0) {
        // Automatic full-map coin magnet toward the player
        const elapsed = Math.max(0, 24 - p.life - 0.2);
        const pullSpeed = Math.min(540, 270 + elapsed * 320);
        const safeDist = Math.max(1, dist);
        p.x += (dx / safeDist) * pullSpeed * dt;
        p.y += (dy / safeDist) * pullSpeed * dt;
      } else if (p.kind === 'medkit' && dist < 116) {
        const pull = 240 * (1 - dist / 116);
        p.x += (dx / Math.max(1, dist)) * pull * dt;
        p.y += (dy / Math.max(1, dist)) * pull * dt;
      }

      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < this.player.radius + 14) {
        if (p.kind === 'coin') {
          this._ac(p.value);
          this.totalCoinsEarned += p.value;
          this.saveProfile();
          this.addFloatingText(p.x, p.y - 10, `+${p.value}`, '#fbbf24');
          soundEngine.playCoinPickup();
        } else {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + p.value);
          this.addFloatingText(p.x, p.y - 10, `+${p.value} HP`, '#4ade80');
          soundEngine.playUpgrade();
        }
        this.pickups.splice(i, 1);
        this.emitHud();
      }
    }
  }

  private spawnShellCasing(weaponId: WeaponId, aimAngle: number): void {
    if (weaponId === 'flamethrower' || weaponId === 'saw_launcher' || weaponId === 'combat_crossbow') return;
    const c = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % MAX_CASINGS;
    const ejectAngle = aimAngle + (Math.cos(aimAngle) >= 0 ? -Math.PI * 0.58 : Math.PI * 0.58) + (Math.random() - 0.5) * 0.5;
    const spd = 42 + Math.random() * 44;
    c.active = true;
    c.x = this.player.x + Math.cos(aimAngle) * 4;
    c.y = this.player.y - 3;
    c.z = 5;
    c.vx = Math.cos(ejectAngle) * spd;
    c.vy = Math.sin(ejectAngle) * spd * 0.55;
    c.vz = 56 + Math.random() * 28;
    c.rot = Math.random() * Math.PI * 2;
    c.vrot = (Math.random() - 0.5) * 18;
    c.color =
      weaponId === 'shotgun' ||
      weaponId === 'double_barrel' ||
      weaponId === 'pump_shotgun' ||
      weaponId === 'auto_shotgun'
        ? '#ef4444'
        : weaponId === 'plasma_carbine' ||
            weaponId === 'cryo_cannon' ||
            weaponId === 'tesla_coil' ||
            weaponId === 'railgun' ||
            weaponId === 'gauss_cannon' ||
            weaponId === 'void_annihilator'
          ? '#38bdf8'
          : '#fbbf24';
    c.life = 1.65;
  }

  private updateCasings(dt: number): void {
    for (const c of this.casings) {
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        continue;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.94;
      c.vy *= 0.94;
      if (c.z > 0 || c.vz > 0) {
        c.vz -= 240 * dt;
        c.z += c.vz * dt;
        c.rot += c.vrot * dt;
        if (c.z <= 0) {
          c.z = 0;
          if (Math.abs(c.vz) > 22) {
            c.vz = -c.vz * 0.42;
            c.vx *= 0.65;
            c.vy *= 0.65;
          } else {
            c.vz = 0;
            c.vx = 0;
            c.vy = 0;
          }
        }
      }
    }
  }

  private spawnBurst(x: number, y: number, count: number, color: string, speed: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.75);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.size = 1.5 + Math.random() * 2;
      p.color = color;
      p.maxLife = 0.25 + Math.random() * 0.3;
      p.life = p.maxLife;
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1
  ): void {
    if (this.floatingTexts.length > 36) this.floatingTexts.shift();
    this.floatingTexts.push({
      x,
      y,
      vy: -28,
      text,
      color,
      life: scale > 1 ? 0.85 : 0.65,
      maxLife: scale > 1 ? 0.85 : 0.65,
      scale,
    });
  }

  private updateFloatingTexts(dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // --- Rendering ---

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.imageSmoothingEnabled = false;

    const biome = BIOMES[this.biomeId];
    ctx.fillStyle = biome.groundColors[0];
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const zoom = this.getZoom();
    const shakeMag = this.trauma * this.trauma * 6;
    const shakeX = (Math.random() * 2 - 1) * shakeMag;
    const shakeY = (Math.random() * 2 - 1) * shakeMag;
    const alignedCamX = Math.round(this.camX * zoom) / zoom;
    const alignedCamY = Math.round(this.camY * zoom) / zoom;

    ctx.save();
    ctx.translate(Math.round(this.viewW / 2 + shakeX), Math.round(this.viewH / 2 + shakeY));
    ctx.scale(zoom, zoom);
    ctx.translate(-alignedCamX, -alignedCamY);

    const halfViewW = this.viewW / (2 * zoom) + 64;
    const halfViewH = this.viewH / (2 * zoom) + 64;
    const minX = this.camX - halfViewW;
    const maxX = this.camX + halfViewW;
    const minY = this.camY - halfViewH;
    const maxY = this.camY + halfViewH;

    this.renderTerrain(ctx, minX, maxX, minY, maxY);
    this.renderCasings(ctx);
    this.renderPickups(ctx);
    this.renderTelegraphs(ctx);

    // Depth-sort trees, bushes/rocks, player, zombies, and title campfire by Y
    const drawables: Array<{ y: number; draw: () => void }> = [];

    const startCellX = Math.floor(minX / 52) - 1;
    const endCellX = Math.floor(maxX / 52) + 1;
    const startCellY = Math.floor(minY / 52) - 1;
    const endCellY = Math.floor(maxY / 52) + 1;
    for (let gx = startCellX; gx <= endCellX; gx++) {
      for (let gy = startCellY; gy <= endCellY; gy++) {
        const tree = this.getTreeAtCell(gx, gy);
        if (!tree) continue;
        drawables.push({
          y: tree.y,
          draw: () => {
            const spr = this.atlas.trees[this.biomeId][tree.variant];
            const sway = Math.sin(this.worldTime * 1.8 + tree.x * 0.05) * 0.9;
            ctx.drawImage(spr, Math.round(tree.x - 21 + sway), Math.round(tree.y - 48));
          },
        });
      }
    }

    const propX0 = Math.floor(minX / 44) - 1;
    const propX1 = Math.floor(maxX / 44) + 1;
    const propY0 = Math.floor(minY / 44) - 1;
    const propY1 = Math.floor(maxY / 44) + 1;
    for (let gx = propX0; gx <= propX1; gx++) {
      for (let gy = propY0; gy <= propY1; gy++) {
        const prop = this.getPropAtCell(gx, gy);
        if (!prop) continue;
        drawables.push({
          y: prop.y,
          draw: () => {
            const spr =
              prop.kind === 'rock'
                ? this.atlas.rocks[this.biomeId]
                : this.atlas.bushes[this.biomeId];
            ctx.drawImage(spr, Math.round(prop.x - spr.width / 2), Math.round(prop.y - spr.height + 3));
          },
        });
      }
    }

    if (this.screenState === 'title') {
      // Render atmospheric resting survivor (using selected skin!) + glowing campfire in open center-right vista
      const campX = this.camX + 22;
      const campY = getTrailCenterY(campX) + 8;
      drawables.push({
        y: campY,
        draw: () => this.renderTitleCampfire(ctx, campX, campY),
      });
      drawables.push({
        y: campY - 4,
        draw: () => {
          ctx.fillStyle = 'rgba(0,0,0,0.38)';
          ctx.fillRect(Math.round(campX - 27), Math.round(campY + 1), 14, 4);
          ctx.drawImage(this.atlas.playerSkins[this.activeSkinId][0], Math.round(campX - 31), Math.round(campY - 22));
        },
      });
      // Distant lurking zombie silhouettes along the misty forest edge
      for (let k = 0; k < 3; k++) {
        const zx = this.camX + 74 + k * 24;
        const zy = getTrailCenterY(zx) - 34 + (k % 2) * 58;
        drawables.push({
          y: zy,
          draw: () => {
            const frame = Math.floor(this.worldTime * 3 + k) % 2;
            ctx.drawImage(this.atlas.zombies.standard[frame], Math.round(zx - 9), Math.round(zy - 18));
          },
        });
      }
    } else {
      drawables.push({
        y: this.player.y,
        draw: () => this.renderPlayer(ctx),
      });

      for (const z of this.zombies) {
        drawables.push({
          y: z.y,
          draw: () => this.renderZombie(ctx, z),
        });
      }
    }

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    if (this.screenState === 'playing' && this.autoAimTargetId !== null) {
      this.renderAutoAimIndicator(ctx);
    }

    // Muzzle blast lighting flash in world space
    if (this.screenState === 'playing' && this.muzzleFlashTimer > 0) {
      const mx = this.player.x + Math.cos(this.player.aimAngle) * 14;
      const my = this.player.y - 4 + Math.sin(this.player.aimAngle) * 14;
      const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 46);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      grad.addColorStop(0.45, 'rgba(249, 115, 22, 0.16)');
      grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, 46, 0, Math.PI * 2);
      ctx.fill();
    }

    this.renderBullets(ctx);
    this.renderParticles(ctx);
    this.renderFloatingTexts(ctx);
    this.renderFireflies(ctx, minX, maxX, minY, maxY);

    ctx.restore();

    // Biome atmospheric fog tint + dynamic low-HP / close-danger adrenaline vignette
    ctx.fillStyle = biome.fogColor;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const hpLowRatio =
      this.player.hp <= this.player.maxHp * 0.42
        ? 1 - this.player.hp / Math.max(1, this.player.maxHp * 0.42)
        : 0;
    const dangerStrength = Math.max(hpLowRatio, this.dangerProximity * 0.72);
    if (this.screenState === 'playing' && dangerStrength > 0.05) {
      const pulse = (0.14 + Math.sin(this.worldTime * 7.5) * 0.06) + dangerStrength * 0.22;
      const grad = ctx.createRadialGradient(
        this.viewW / 2,
        this.viewH / 2,
        this.viewH * 0.26,
        this.viewW / 2,
        this.viewH / 2,
        this.viewW * 0.68
      );
      grad.addColorStop(0, 'rgba(180, 20, 20, 0)');
      grad.addColorStop(1, `rgba(185, 22, 22, ${Math.min(0.55, pulse).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    // Pixel Crosshair when playing with desktop mouse cursor (mapped into canvas-local space)
    if (this.screenState === 'playing' && !this.shopOpen && this.hasMousePos && this.aimMode === 'mouse') {
      const rect = this.canvas.getBoundingClientRect();
      const rawDx = this.mouseClientX - rect.left - rect.width / 2;
      const rawDy = this.mouseClientY - rect.top - rect.height / 2;
      const isRotated = this.canvas.parentElement?.dataset.rotated === 'true';
      const mx = this.viewW / 2 + (isRotated ? rawDy : rawDx);
      const my = this.viewH / 2 + (isRotated ? -rawDx : rawDy);
      this.renderCrosshair(ctx, mx, my);
    }

    ctx.restore();
  }

  private renderTerrain(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): void {
    const ts = WORLD_TILE_SIZE;
    const tx0 = Math.floor(minX / ts);
    const tx1 = Math.floor(maxX / ts);
    const ty0 = Math.floor(minY / ts);
    const ty1 = Math.floor(maxY / ts);
    const biomeTiles = this.atlas.tiles[this.biomeId];

    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const wx = tx * ts + ts * 0.5;
        const wy = ty * ts + ts * 0.5;
        const h = tileHash(tx, ty);
        const surf = getSurfaceAtWorldPos(wx, wy, this.biomeId);
        const variant = Math.floor(h * 6) % 6;
        const tileImg = biomeTiles[surf][variant];
        ctx.drawImage(tileImg, tx * ts, ty * ts);

        // Wooden bridge side-railings & posts
        if (surf === 'wood') {
          if (!isWoodenBridgeAt(wx, wy - ts)) {
            ctx.fillStyle = '#3b2413';
            ctx.fillRect(tx * ts, ty * ts, ts + 1, 4);
            ctx.fillStyle = '#785032';
            ctx.fillRect(tx * ts + 2, ty * ts + 1, ts - 4, 2);
          }
          if (!isWoodenBridgeAt(wx, wy + ts)) {
            ctx.fillStyle = '#3b2413';
            ctx.fillRect(tx * ts, (ty + 1) * ts - 4, ts + 1, 4);
            ctx.fillStyle = '#785032';
            ctx.fillRect(tx * ts + 2, (ty + 1) * ts - 3, ts - 4, 2);
          }
        }
      }
    }

    // Subtle dark forest border at top & bottom corridor limits
    ctx.fillStyle = 'rgba(4, 7, 6, 0.72)';
    if (minY < -ARENA_HALF_HEIGHT) {
      ctx.fillRect(minX, minY, maxX - minX, -ARENA_HALF_HEIGHT - minY);
    }
    if (maxY > ARENA_HALF_HEIGHT) {
      ctx.fillRect(minX, ARENA_HALF_HEIGHT, maxX - minX, maxY - ARENA_HALF_HEIGHT);
    }
  }

  private renderTitleCampfire(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const flicker = Math.sin(this.worldTime * 14) * 1.5;
    ctx.drawImage(this.atlas.campfireGlow, Math.round(x - 48 + flicker * 0.5), Math.round(y - 52));

    // Stone fire ring
    ctx.fillStyle = '#334155';
    ctx.fillRect(Math.round(x - 8), Math.round(y), 3, 3);
    ctx.fillRect(Math.round(x + 5), Math.round(y), 3, 3);

    // Logs
    ctx.fillStyle = '#451a03';
    ctx.fillRect(Math.round(x - 6), Math.round(y), 12, 3);
    ctx.fillRect(Math.round(x - 4), Math.round(y - 2), 8, 3);

    // Pixel flames + rising embers
    const f = Math.floor(this.worldTime * 10) % 2;
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(Math.round(x - 4), Math.round(y - 7 - f), 8, 6);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(Math.round(x - 2), Math.round(y - 9 + f), 4, 6);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 6), 2, 3);

    for (let e = 0; e < 3; e++) {
      const rise = ((this.worldTime * 22 + e * 9) % 24);
      const swayX = Math.sin(this.worldTime * 4 + e * 2) * 3;
      ctx.fillStyle = e % 2 === 0 ? '#fde047' : '#fb923c';
      ctx.fillRect(Math.round(x + swayX), Math.round(y - 10 - rise), 2, 2);
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    const px = Math.round(p.x);
    const py = Math.round(p.y);

    // Pre-baked survivor lantern aura around player
    ctx.drawImage(this.atlas.lanternGlow, px - 68, py - 72);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(px - 7, py + 7, 14, 4);

    if (p.invulnTimer > 0 && Math.floor(this.worldTime * 20) % 2 === 0 && p.flashTimer <= 0) {
      ctx.globalAlpha = 0.6;
    }

    const frameIdx = Math.floor(p.walkDist / 12) % 2;
    const sprite = p.flashTimer > 0 ? this.atlas.playerFlash : this.atlas.playerSkins[this.activeSkinId][frameIdx];
    const facingLeft = Math.cos(p.aimAngle) < 0;

    ctx.save();
    ctx.translate(px, py);
    if (facingLeft) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -11, -18);
    ctx.restore();

    // Aimed Weapon Sprite
    const weaponSpr = this.atlas.weapons[this.activeWeaponId];
    ctx.save();
    ctx.translate(px, py - 3);
    ctx.rotate(p.aimAngle);
    if (facingLeft) {
      ctx.scale(1, -1);
    }
    ctx.drawImage(weaponSpr, Math.round(-p.recoil + 2), -4);

    if (this.muzzleFlashTimer > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(16, -3, 5, 5);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(19, -2, 4, 3);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Tiny reload progress bar right above player (gaze-routed!)
    if (this.isReloading && this.reloadDuration > 0) {
      const pct = 1 - Math.max(0, this.reloadTimer / this.reloadDuration);
      ctx.fillStyle = '#090d0b';
      ctx.fillRect(px - 11, py - 24, 22, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px - 10, py - 23, Math.round(20 * pct), 2);
    }
  }

  private renderZombie(ctx: CanvasRenderingContext2D, z: ZombieEntity): void {
    const zx = Math.round(z.x);
    const zy = Math.round(z.y);

    if (z.isDead) {
      ctx.globalAlpha = Math.max(0, z.koTimer / (z.kind === 'boss' ? 0.55 : 0.28));
    }

    const shadowW = z.kind === 'boss' ? 28 : z.kind === 'brute' ? 16 : 12;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(zx - shadowW / 2, zy + z.radius - 2, shadowW, 4);

    const frameIdx = Math.floor(z.walkCycle) % 2;
    const spr =
      z.flashTimer > 0
        ? this.atlas.zombieFlash[z.kind]
        : this.atlas.zombies[z.kind][frameIdx];

    ctx.save();
    ctx.translate(zx, zy);
    if (z.facing < 0) ctx.scale(-1, 1);
    if (z.isDead) {
      ctx.rotate(0.6);
    }
    ctx.drawImage(spr, -Math.floor(spr.width / 2), -Math.floor(spr.height * 0.72));
    ctx.restore();

    // Small overhead HP bar for damaged non-boss zombies
    if (!z.isDead && z.kind !== 'boss' && z.hp < z.maxHp) {
      const w = z.kind === 'brute' ? 22 : 16;
      const pct = Math.max(0, z.hp / z.maxHp);
      ctx.fillStyle = '#090d0b';
      ctx.fillRect(zx - w / 2 - 1, zy - spr.height * 0.78 - 5, w + 2, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(zx - w / 2, zy - spr.height * 0.78 - 4, Math.round(w * pct), 2);
    }

    ctx.globalAlpha = 1;
  }

  private renderTelegraphs(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zombies) {
      if (z.isDead || z.telegraphTimer <= 0) continue;

      if (z.telegraphType === 'slam') {
        const radius = z.kind === 'boss' ? 76 : 52;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(z.telegraphX, z.telegraphY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (z.telegraphType === 'charge' || z.telegraphType === 'lunge') {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x + z.chargeDirX * 120, z.y + z.chargeDirY * 120);
        ctx.stroke();
      } else if (z.telegraphType === 'spit') {
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y - 4, 14, 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.telegraphType === 'explode') {
        const pulse = 0.25 + 0.18 * Math.sin(this.worldTime * 24);
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.95)';
        ctx.fillStyle = `rgba(132, 204, 22, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, 54, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private renderPickups(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pickups) {
      const bob = Math.sin(this.worldTime * 6 + p.bobOffset) * 2;
      const px = Math.round(p.x);
      const py = Math.round(p.y + bob);

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px - 3, Math.round(p.y + 4), 6, 2);

      if (p.kind === 'coin') {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(px - 4, py - 4, 8, 8);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px - 3, py - 3, 6, 6);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(px - 2, py - 2, 2, 2);
      } else {
        // Pixel medkit
        ctx.fillStyle = '#090d0b';
        ctx.fillRect(px - 5, py - 4, 10, 8);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(px - 4, py - 3, 8, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px - 1, py - 2, 2, 4);
        ctx.fillRect(px - 2, py - 1, 4, 2);
      }
    }
  }

  private renderBullets(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bullets) {
      if (!b.active) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(
        Math.round(b.x - b.radius),
        Math.round(b.y - b.radius),
        Math.ceil(b.radius * 2),
        Math.ceil(b.radius * 2)
      );
      if (b.fromPlayer) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
      }
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1;
  }

  private renderCasings(ctx: CanvasRenderingContext2D): void {
    for (const c of this.casings) {
      if (!c.active) continue;
      ctx.globalAlpha = Math.min(1, c.life * 1.4);
      ctx.save();
      ctx.translate(Math.round(c.x), Math.round(c.y - c.z));
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-1.5, -1, 3, 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      const pxSize = ft.scale && ft.scale > 1 ? 11 : 9;
      ctx.font = `700 ${pxSize}px "Tektur", "JetBrains Mono", sans-serif`;
      ctx.strokeStyle = '#070a09';
      ctx.lineWidth = 2.4;
      ctx.strokeText(ft.text, Math.round(ft.x), Math.round(ft.y));
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
    }
    ctx.globalAlpha = 1;
  }

  private renderFireflies(
    ctx: CanvasRenderingContext2D,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): void {
    const particleColorMap: Record<BiomeId, string> = {
      pine_forest: '#d9f99d',
      misty_swamp: '#99f6e4',
      birch_hollow: '#bef264',
      autumn_trail: '#fde047',
      foggy_moor: '#d8b4fe',
      winter_woods: '#e0f2fe',
      frozen_lake: '#7dd3fc',
      cursed_graveyard: '#c4b5fd',
      fungal_grove: '#2dd4bf',
      thorny_thicket: '#a3e635',
      obsidian_canyon: '#f0abfc',
      ash_ruins: '#fb923c',
      scorched_fort: '#fdba74',
      abyss_rift: '#93c5fd',
      plague_heart: '#bef264',
      blood_citadel: '#f87171',
    };
    ctx.fillStyle = particleColorMap[this.biomeId];
    const spanX = Math.max(120, maxX - minX + 100);
    const spanY = Math.max(120, maxY - minY + 60);
    for (let i = 0; i < 18; i++) {
      const rawX = i * 197 + this.worldTime * 14 * (i % 2 === 0 ? 1 : -0.6);
      const rawY = i * 131 + Math.sin(this.worldTime * 1.6 + i) * 28;
      const fx = minX + (((rawX % spanX) + spanX) % spanX);
      const fy = minY + (((rawY % spanY) + spanY) % spanY);
      const alpha = 0.25 + 0.55 * Math.abs(Math.sin(this.worldTime * 2.5 + i));
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  private renderAutoAimIndicator(ctx: CanvasRenderingContext2D): void {
    const target = this.zombies.find((z) => z.id === this.autoAimTargetId && !z.isDead);
    if (!target) return;

    // Crisp pixel corner lock-on brackets around the targeted close zombie
    ctx.save();
    const tx = Math.round(target.x);
    const ty = Math.round(target.y - target.radius * 0.35);
    const pad = Math.round(target.radius + 4);
    const arm = 4;
    const pulse = Math.sin(this.worldTime * 14) > 0 ? '#fbbf24' : '#f97316';
    ctx.fillStyle = pulse;

    // Top-left
    ctx.fillRect(tx - pad, ty - pad, arm, 1.5);
    ctx.fillRect(tx - pad, ty - pad, 1.5, arm);
    // Top-right
    ctx.fillRect(tx + pad - arm, ty - pad, arm, 1.5);
    ctx.fillRect(tx + pad - 1.5, ty - pad, 1.5, arm);
    // Bottom-left
    ctx.fillRect(tx - pad, ty + pad - 1.5, arm, 1.5);
    ctx.fillRect(tx - pad, ty + pad - arm, 1.5, arm);
    // Bottom-right
    ctx.fillRect(tx + pad - arm, ty + pad - 1.5, arm, 1.5);
    ctx.fillRect(tx + pad - 1.5, ty + pad - arm, 1.5, arm);
    ctx.restore();
  }

  private renderCrosshair(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
    const x = Math.round(mx);
    const y = Math.round(my);
    if (this.autoAimTargetId !== null) {
      ctx.globalAlpha = 0.35;
    }
    ctx.fillStyle = '#090d0b';
    ctx.fillRect(x - 10, y - 2, 7, 4);
    ctx.fillRect(x + 3, y - 2, 7, 4);
    ctx.fillRect(x - 2, y - 10, 4, 7);
    ctx.fillRect(x - 2, y + 3, 4, 7);

    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x - 9, y - 1, 5, 2);
    ctx.fillRect(x + 4, y - 1, 5, 2);
    ctx.fillRect(x - 1, y - 9, 2, 5);
    ctx.fillRect(x - 1, y + 4, 2, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.globalAlpha = 1;
  }

  private emitHud(force = false): void {
    const activeBoss = this.zombies.find((z) => z.kind === 'boss' && !z.isDead);
    const aliveZombies = this.zombies.filter((z) => !z.isDead).length;
    const unspawned = Math.max(0, this.currentWave.entries.length - this.nextSpawnIndex);
    const weaponDef = WEAPONS[this.activeWeaponId];
    const stats = getWeaponEffectiveStats(weaponDef, this.upgrades[this.activeWeaponId]);
    const hp = Math.round(this.player.hp);
    const armor = Math.round(this.player.armor);
    const cAmt = Math.round(this._gc());
    const tAmt = this._gt();
    const pLvl = this._gl();
    const pXp = Math.round(this._gx());
    const vLvl = this._gv();
    const aLvl = this._ga();
    const bossHp = activeBoss ? Math.max(0, Math.round(activeBoss.hp)) : 0;
    const bossMaxHp = activeBoss ? activeBoss.maxHp : 0;
    const waveRemaining = aliveZombies + unspawned;
    const banner = this.bannerTimer > 0 ? this.bannerText : '';
    const muted = soundEngine.isMuted();

    const musicVolume = soundEngine.getMusicVolume();
    const sfxVolume = soundEngine.getSfxVolume();
    const xpToNext = getXpToNextLevel(pLvl);
    const unlockedBiomes = getUnlockedBiomes(pLvl);
    const tutorialCombatStage = getTutorialCombatStage(
      this.tutMoved,
      this.tutShot,
      this.tutReloaded
    );
    const dailyStatus = evaluateDailyRewardStatus(this.dailyLastClaimDay, this.dailyStreak);
    const pushPermission = this.getPushPermission();

    const hudKey = [
      this.screenState,
      hp,
      armor,
      cAmt,
      this.kills,
      tAmt,
      this.roundTrophiesEarned,
      pLvl,
      pXp,
      xpToNext,
      this.roundXpEarned,
      this.tutorialStep,
      tutorialCombatStage,
      this.isTutorialMatch ? 1 : 0,
      this.waveNumber,
      this.totalWaves,
      this.biomeId,
      this.selectedBiomeId,
      unlockedBiomes.length,
      this.clearedBiomes.length,
      this.difficulty,
      this.player.surface,
      bossHp,
      bossMaxHp,
      waveRemaining,
      this.activeWeaponId,
      this.ownedWeapons.length,
      this.upgradesVersion,
      vLvl,
      aLvl,
      this.activeSkinId,
      this.ownedSkins.length,
      this.ammoMap[this.activeWeaponId],
      this.isReloading ? 1 : 0,
      banner,
      this.bannerSubtext,
      this.shopOpen ? 1 : 0,
      dailyStatus.effectiveStreak,
      this.dailyLastClaimDay ?? '',
      dailyStatus.canClaim ? 1 : 0,
      dailyStatus.nextDayIndex,
      this.dailyModalOpen ? 1 : 0,
      this.pushEnabled ? 1 : 0,
      pushPermission,
      this.activePushSms?.id ?? '',
      muted ? 1 : 0,
      Math.round(musicVolume * 100),
      Math.round(sfxVolume * 100),
    ].join('|');

    if (!force && hudKey === this.lastHudKey) return;
    this.lastHudKey = hudKey;

    this.onHudChange({
      screenState: this.screenState,
      hp,
      maxHp: this.player.maxHp,
      armor,
      maxArmor: this.player.maxArmor,
      coins: cAmt,
      totalCoinsEarned: Math.round(this.totalCoinsEarned),
      kills: this.kills,
      playerLevel: pLvl,
      xp: pXp,
      xpToNext,
      roundXpEarned: Math.round(this.roundXpEarned),
      didLevelUpInRound: this.didLevelUpInRound,
      newlyUnlockedBiomeName: this.newlyUnlockedBiomeName,
      isTutorialMatch: this.isTutorialMatch,
      tutorialStep: this.tutorialStep,
      tutorialCombatStage,
      waveNumber: this.waveNumber,
      totalWaves: this.totalWaves,
      biomeId: this.biomeId,
      biomeName: getBiomeDisplayName(this.biomeId),
      selectedBiomeId: this.selectedBiomeId,
      unlockedBiomes,
      clearedBiomes: [...this.clearedBiomes],
      difficulty: this.difficulty,
      currentSurface: this.player.surface,
      surfaceLabel: SURFACE_LABELS[this.player.surface],
      isBossWave: this.currentWave.isBossWave,
      bossName: BIOMES[this.biomeId].bossName ?? 'ТИТАН ЧАЩИ',
      bossHp,
      bossMaxHp,
      waveRemaining,
      waveTotal: this.currentWave.entries.length,
      activeWeaponId: this.activeWeaponId,
      ownedWeapons: [...this.ownedWeapons],
      upgrades: JSON.parse(JSON.stringify(this.upgrades)) as Record<WeaponId, WeaponUpgradeState>,
      activeSkinId: this.activeSkinId,
      ownedSkins: [...this.ownedSkins],
      vitalityLevel: vLvl,
      armorLevel: aLvl,
      ammoInMag: this.ammoMap[this.activeWeaponId],
      magSize: stats.magSize,
      isReloading: this.isReloading,
      reloadProgress:
        this.isReloading && this.reloadDuration > 0
          ? 1 - Math.max(0, this.reloadTimer / this.reloadDuration)
          : 1,
      bannerText: banner,
      bannerSubtext: this.bannerTimer > 0 ? this.bannerSubtext : '',
      bestKills: this.bestKills,
      trophies: tAmt,
      roundTrophiesEarned: this.roundTrophiesEarned,
      shopOpen: this.shopOpen,
      dailyStreak: dailyStatus.effectiveStreak,
      dailyLastClaimDay: this.dailyLastClaimDay,
      dailyCanClaim: dailyStatus.canClaim,
      dailyNextDayIndex: dailyStatus.nextDayIndex,
      dailyModalOpen: this.dailyModalOpen,
      pushEnabled: this.pushEnabled,
      pushPermission,
      activePushSms: this.activePushSms,
      muted,
      musicVolume,
      sfxVolume,
    });
  }
}
