import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOME_CYCLE,
  BIOMES,
  DAILY_REWARDS,
  INACTIVITY_PUSH_THRESHOLD_MS,
  LOADING_TIPS,
  MAX_ARMOR_LEVEL,
  MAX_VITALITY_LEVEL,
  SKIN_ORDER,
  SKINS,
  WEAPONS,
  WEAPON_ORDER,
  createInitialUpgrades,
} from './constants';
import {
  computeLocalStageRect,
  computeSpotlightCutout,
  computeTooltipPlacement,
  resolveActiveTutorialStep,
} from './tutorialSteps';
import type { HudSnapshot } from './types';
import {
  AUTO_AIM_RANGE,
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
  diffCalendarDays,
  evaluateDailyRewardStatus,
  findAutoAimTarget,
  generateBiomeWaveComposition,
  getAdrenalineComboBonus,
  getArmorUpgradeCost,
  getBiomeBossHp,
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
  isViewportPortrait,
  pickRandomLoadingTip,
  transformRotatedPointerDelta,
} from './rules';

test('content registries contain 24 weapons, 16 character skins, and 16 stages', () => {
  assert.equal(WEAPON_ORDER.length, 24);
  assert.equal(Object.keys(WEAPONS).length, 24);
  assert.equal(Object.keys(createInitialUpgrades()).length, 24);
  assert.equal(SKIN_ORDER.length, 16);
  assert.equal(Object.keys(SKINS).length, 16);
  assert.equal(BIOME_CYCLE.length, 16);
  assert.equal(Object.keys(BIOMES).length, 16);
});

test('zombie HP, speed, damage, and boss HP strictly increase across every subsequent biome', () => {
  let prevHpMult = 0;
  let prevSpdMult = 0;
  let prevDmgMult = 0;
  for (const biomeId of BIOME_CYCLE) {
    const hpMult = getBiomeZombieHpMultiplier(biomeId, 1, false);
    const spdMult = getBiomeZombieSpeedMultiplier(biomeId, 1, false);
    const dmgMult = getBiomeZombieDamageMultiplier(biomeId, 1, false);
    assert.ok(hpMult > prevHpMult, `Expected HP ${biomeId} (${hpMult}) > ${prevHpMult}`);
    assert.ok(spdMult > prevSpdMult, `Expected Speed ${biomeId} (${spdMult}) > ${prevSpdMult}`);
    assert.ok(dmgMult > prevDmgMult, `Expected Damage ${biomeId} (${dmgMult}) > ${prevDmgMult}`);
    prevHpMult = hpMult;
    prevSpdMult = spdMult;
    prevDmgMult = dmgMult;
  }

  assert.ok(getBiomeZombieDamageMultiplier('pine_forest', 1, true) < 0.7);
  assert.ok(getBiomeZombieDamageMultiplier('blood_citadel', 7, false) <= 3.85);
  assert.ok(getBiomeBossHp('blood_citadel') > getBiomeBossHp('ash_ruins'));
  assert.ok(getBiomeBossHp('ash_ruins') > getBiomeBossHp('cursed_graveyard'));
  assert.ok(getBiomeBossHp('cursed_graveyard') > getBiomeBossHp('autumn_trail'));
});

test('beginner tutorial combat stage advances from move to shoot to reload_or_clear', () => {
  assert.equal(getTutorialCombatStage(false, false, false), 'move');
  assert.equal(getTutorialCombatStage(true, false, false), 'shoot');
  assert.equal(getTutorialCombatStage(true, true, false), 'reload_or_clear');
  assert.equal(getTutorialCombatStage(true, true, true), 'reload_or_clear');
});

test('adrenaline combo tiers scale crit chance, fire rate, and movement speed', () => {
  const t0 = getAdrenalineComboBonus(1);
  const t1 = getAdrenalineComboBonus(3);
  const t2 = getAdrenalineComboBonus(6);
  const t3 = getAdrenalineComboBonus(10);
  assert.equal(t0.tier, 0);
  assert.equal(t1.tier, 1);
  assert.equal(t2.tier, 2);
  assert.equal(t3.tier, 3);
  assert.ok(t3.critChance > t2.critChance && t2.critChance > t1.critChance);
  assert.ok(t3.fireRateBonus > t2.fireRateBonus && t2.fireRateBonus > t1.fireRateBonus);
  assert.ok(t3.speedBonus > t2.speedBonus && t2.speedBonus > t1.speedBonus);
});

test('kill heal restores +5 HP when player HP is below max and caps at maxHp', () => {
  const damaged = applyKillHeal(72, 100);
  assert.equal(damaged.newHp, 77);
  assert.equal(damaged.healed, 5);

  const nearFull = applyKillHeal(98, 100);
  assert.equal(nearFull.newHp, 100);
  assert.equal(nearFull.healed, 2);

  const alreadyFull = applyKillHeal(100, 100);
  assert.equal(alreadyFull.newHp, 100);
  assert.equal(alreadyFull.healed, 0);
});

test('tutorial match spawns 1 wave with 3 standard zombies; standard matches run 7 waves with scaling biome rosters', () => {
  const tutWave = generateBiomeWaveComposition('pine_forest', 1, true);
  assert.equal(tutWave.totalWaves, 1);
  assert.equal(tutWave.entries.length, 3);
  assert.equal(tutWave.entries.every((e) => e.kind === 'standard'), true);

  const forestWave1 = generateBiomeWaveComposition('pine_forest', 1, false);
  assert.equal(forestWave1.totalWaves, 7);
  assert.equal(forestWave1.entries.length, 7);
  assert.equal(forestWave1.isBossWave, false);

  const swampWave = generateBiomeWaveComposition('misty_swamp', 3, false);
  assert.equal(swampWave.totalWaves, 7);
  assert.ok(swampWave.entries.length > forestWave1.entries.length);
  assert.ok(swampWave.entries.some((e) => e.kind === 'flanker' || e.kind === 'spitter'));

  const citadelFinal = generateBiomeWaveComposition('blood_citadel', 7, false);
  assert.equal(citadelFinal.isBossWave, true);
  assert.equal(citadelFinal.bossCount, 1);
  assert.equal(citadelFinal.standardCount, 7);
});

test('EXP and leveling curve progresses gradually across runs and unlocks harder biomes', () => {
  const req1 = getXpToNextLevel(1);
  const req2 = getXpToNextLevel(2);
  const req5 = getXpToNextLevel(5);
  assert.equal(req1, 240);
  assert.ok(req2 > req1 && req5 > req2);

  const tutXp = calculateRoundXpReward('pine_forest', 1, true);
  assert.equal(tutXp, 10);
  const afterTut = applyXpGain(1, 0, tutXp + 5);
  assert.equal(afterTut.newLevel, 1);

  const roundXp = calculateRoundXpReward('pine_forest', 1, false);
  assert.ok(tutXp < roundXp && roundXp <= 25);
  // Single Biome 1 match (~61 total XP) must not instantly level up from Lv1 -> Lv2
  const afterSingleMatch = applyXpGain(1, 0, roundXp + 40);
  assert.equal(afterSingleMatch.newLevel, 1);

  const afterMultiRuns = applyXpGain(1, 0, req1 + 10);
  assert.ok(afterMultiRuns.newLevel >= 2);
  assert.ok(getUnlockedBiomes(afterMultiRuns.newLevel).includes('misty_swamp'));
  assert.equal(getBiomeForLevel(1), 'pine_forest');
  assert.equal(getBiomeForLevel(22), 'blood_citadel');
});

test('boss trophies depend on both boss biome tier and difficulty', () => {
  const tAutumnNormal = calculateBossTrophyReward('autumn_trail', 'normal');
  const tGraveNormal = calculateBossTrophyReward('cursed_graveyard', 'normal');
  const tAshNormal = calculateBossTrophyReward('ash_ruins', 'normal');
  const tCitadelNormal = calculateBossTrophyReward('blood_citadel', 'normal');

  assert.equal(tAutumnNormal, 1);
  assert.ok(tGraveNormal > tAutumnNormal);
  assert.ok(tAshNormal > tGraveNormal);
  assert.ok(tCitadelNormal > tAshNormal);

  const tGraveHard = calculateBossTrophyReward('cursed_graveyard', 'hard');
  const tGraveNightmare = calculateBossTrophyReward('cursed_graveyard', 'nightmare');
  assert.ok(tGraveHard > tGraveNormal);
  assert.ok(tGraveNightmare > tGraveHard);
});

test('higher-tier skins strictly increase price, HP, armor, speed, and damage at every tier', () => {
  for (let i = 1; i < SKIN_ORDER.length; i++) {
    const prevId = SKIN_ORDER[i - 1];
    const currId = SKIN_ORDER[i];
    const prevSkin = SKINS[prevId];
    const currSkin = SKINS[currId];
    assert.ok(currSkin.price > prevSkin.price, `${currId} price should exceed ${prevId}`);
    assert.ok(currSkin.bonusHp > prevSkin.bonusHp, `${currId} bonusHp should exceed ${prevId}`);
    assert.ok(currSkin.bonusArmor > prevSkin.bonusArmor, `${currId} bonusArmor should exceed ${prevId}`);
    assert.ok(currSkin.speedBonusPct > prevSkin.speedBonusPct, `${currId} speedBonusPct should exceed ${prevId}`);
    assert.ok(currSkin.damageBonusPct > prevSkin.damageBonusPct, `${currId} damageBonusPct should exceed ${prevId}`);

    const prevEff = getEffectivePlayerStats(prevId, 0, 0, 1);
    const currEff = getEffectivePlayerStats(currId, 0, 0, 1);
    assert.ok(currEff.maxHp > prevEff.maxHp);
    assert.ok(currEff.startArmor > prevEff.startArmor);
    assert.ok(currEff.moveSpeed > prevEff.moveSpeed);
    assert.ok(currEff.damageMult > prevEff.damageMult);
  }
});

test('surface detection returns wood on bridges, gravel/stone on trails, and biome-matched off-trail terrain', () => {
  const trailY = getTrailCenterY(240);
  assert.equal(getSurfaceAtWorldPos(240, trailY, 'pine_forest'), 'wood');

  const pineTrailY = getTrailCenterY(600);
  assert.equal(getSurfaceAtWorldPos(600, pineTrailY, 'pine_forest'), 'gravel');
  assert.equal(getSurfaceAtWorldPos(600, pineTrailY, 'ash_ruins'), 'stone');

  const offTrail = getSurfaceAtWorldPos(600, pineTrailY + 260, 'misty_swamp');
  assert.ok(['mud', 'grass', 'stone'].includes(offTrail));
});

test('weapon purchases and upgrades scale stats and enforce coin budgets', () => {
  const upgrades = createInitialUpgrades();
  const baseStats = getWeaponEffectiveStats(WEAPONS.rusty_pistol, upgrades.rusty_pistol);
  upgrades.rusty_pistol.damageLevel = 2;
  upgrades.rusty_pistol.fireRateLevel = 2;
  upgrades.rusty_pistol.magLevel = 2;
  const upgradedStats = getWeaponEffectiveStats(WEAPONS.rusty_pistol, upgrades.rusty_pistol);

  assert.ok(upgradedStats.damage > baseStats.damage);
  assert.ok(upgradedStats.fireRate > baseStats.fireRate);
  assert.ok(upgradedStats.magSize > baseStats.magSize);
  assert.ok(upgradedStats.reloadSec < baseStats.reloadSec);

  assert.equal(canPurchaseWeapon(100, ['rusty_pistol'], 'shotgun'), false);
  assert.equal(canPurchaseWeapon(WEAPONS.shotgun.price, ['rusty_pistol'], 'shotgun'), true);
  assert.equal(canPurchaseWeapon(500, ['rusty_pistol', 'shotgun'], 'shotgun'), false);

  const dmgCost = getUpgradeCost('rusty_pistol', 'damage', 2);
  assert.equal(canUpgradeWeapon(dmgCost - 1, ['rusty_pistol'], upgrades, 'rusty_pistol', 'damage'), false);
  assert.equal(canUpgradeWeapon(dmgCost, ['rusty_pistol'], upgrades, 'rusty_pistol', 'damage'), true);
});

test('circle collision detects overlap accurately', () => {
  assert.equal(checkCircleCollision(0, 0, 10, 15, 0, 10), true);
  assert.equal(checkCircleCollision(0, 0, 10, 25, 0, 10), false);
});

test('skin purchases enforce coin budget and ownership', () => {
  assert.equal(canPurchaseSkin(100, ['ranger'], 'crimson_hunter'), false);
  assert.equal(canPurchaseSkin(SKINS.crimson_hunter.price, ['ranger'], 'crimson_hunter'), true);
  assert.equal(canPurchaseSkin(300, ['ranger', 'crimson_hunter'], 'crimson_hunter'), false);
});

test('close-range auto-aim targets nearest living zombie within range and ignores distant/dead zombies', () => {
  const farOnly = [
    { id: 1, x: 350, y: 0, radius: 10, isDead: false },
    { id: 2, x: 25, y: 0, radius: 10, isDead: true },
  ];
  assert.equal(findAutoAimTarget(0, 0, farOnly), null);

  const mixed = [
    { id: 10, x: AUTO_AIM_RANGE + 60, y: 0, radius: 10, isDead: false },
    { id: 11, x: 70, y: 0, radius: 10, isDead: false },
    { id: 12, x: -55, y: -4, radius: 10, isDead: false },
  ];
  const lock = findAutoAimTarget(0, 0, mixed);
  assert.ok(lock);
  assert.equal(lock.id, 12);
  assert.ok(Math.abs(Math.abs(lock.angle) - Math.PI) < 0.01);
});

test('shop prices and upgrade costs scale progressively so endgame items require long-term progression', () => {
  for (let i = 1; i < WEAPON_ORDER.length; i++) {
    const prev = WEAPONS[WEAPON_ORDER[i - 1]].price;
    const curr = WEAPONS[WEAPON_ORDER[i]].price;
    assert.ok(curr > prev, `Expected weapon ${WEAPON_ORDER[i]} price (${curr}) > ${prev}`);
  }
  for (let i = 1; i < SKIN_ORDER.length; i++) {
    const prev = SKINS[SKIN_ORDER[i - 1]].price;
    const curr = SKINS[SKIN_ORDER[i]].price;
    assert.ok(curr > prev, `Expected skin ${SKIN_ORDER[i]} price (${curr}) > ${prev}`);
  }

  // Starter tutorial match grants ~46 coins; pistol Lv0 damage upgrade must stay affordable (35 coins)
  assert.equal(getUpgradeCost('rusty_pistol', 'damage', 0), 35);

  // Typical Biome 1 run (~235 coins) lets player buy sawed_carbine (220) or save for shotgun (480), never mid/endgame guns
  assert.equal(WEAPONS.sawed_carbine.price, 220);
  assert.equal(WEAPONS.shotgun.price, 480);
  assert.equal(WEAPONS.void_annihilator.price, 125000);
  assert.ok(WEAPONS.gauss_cannon.price >= 95000 && WEAPONS.gauss_cannon.price <= 110000);
  assert.ok(SKINS.crimson_hunter.price >= 300 && SKINS.crimson_hunter.price <= 450);
  assert.equal(SKINS.void_reaper.price, 90000);

  assert.equal(MAX_VITALITY_LEVEL, 50);
  assert.equal(MAX_ARMOR_LEVEL, 50);

  for (let lvl = 0; lvl < MAX_VITALITY_LEVEL - 1; lvl++) {
    assert.ok(
      getVitalityUpgradeCost(lvl + 1) > getVitalityUpgradeCost(lvl),
      `Vitality cost at level ${lvl + 1} should exceed level ${lvl}`
    );
    assert.ok(
      getArmorUpgradeCost(lvl + 1) > getArmorUpgradeCost(lvl),
      `Armor cost at level ${lvl + 1} should exceed level ${lvl}`
    );
  }

  assert.equal(getVitalityUpgradeCost(0), 140);
  assert.equal(getArmorUpgradeCost(0), 180);
  assert.ok(getVitalityUpgradeCost(49) < 80000);
  assert.ok(getArmorUpgradeCost(49) < 100000);
  assert.equal(canUpgradeVitality(9999999, 49), true);
  assert.equal(canUpgradeVitality(9999999, 50), false);
  assert.equal(canUpgradeArmor(9999999, 49), true);
  assert.equal(canUpgradeArmor(9999999, 50), false);
  assert.ok(getUpgradeCost('shotgun', 'damage', 0) > getUpgradeCost('rusty_pistol', 'damage', 0));
});

test('loading tips picker provides diverse tips and never repeats the immediately previous tip', () => {
  assert.ok(LOADING_TIPS.length >= 8);
  assert.ok(LOADING_TIPS.some((t) => /биом/i.test(t) && /сильнее/i.test(t)));
  assert.ok(LOADING_TIPS.some((t) => /босс/i.test(t) && /HP/i.test(t)));

  for (let prev = 0; prev < LOADING_TIPS.length; prev++) {
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const picked = pickRandomLoadingTip(prev, () => r);
      assert.notEqual(picked.index, prev, `Expected next tip after ${prev} not to repeat`);
      assert.equal(picked.text, LOADING_TIPS[picked.index]);
    }
  }
});

test('portrait auto-rotation detection and 90deg pointer delta transform map axes accurately', () => {
  assert.equal(isViewportPortrait(390, 844), true);
  assert.equal(isViewportPortrait(1280, 720), false);

  assert.deepEqual(transformRotatedPointerDelta(12, -8, false), { x: 12, y: -8 });
  // Screen down (+dy) -> rotated stage right (+x); screen left (-dx) -> rotated stage down (+y)
  assert.deepEqual(transformRotatedPointerDelta(-15, 24, true), { x: 24, y: 15 });
});

test('tutorial spotlight state machine selects steps accurately and disables completely on done', () => {
  const baseHud = {
    screenState: 'title',
    shopOpen: false,
    tutorialStep: 'menu_intro',
  } as unknown as HudSnapshot;

  assert.equal(resolveActiveTutorialStep(baseHud)?.id, 'menu_start_first_battle');

  const victoryStep = resolveActiveTutorialStep({
    ...baseHud,
    screenState: 'victory',
    tutorialStep: 'go_to_shop',
  });
  assert.equal(victoryStep?.id, 'victory_open_shop');

  const shopUpgradeStep = resolveActiveTutorialStep({
    ...baseHud,
    screenState: 'title',
    shopOpen: true,
    tutorialStep: 'upgrade_pistol',
  });
  assert.equal(shopUpgradeStep?.id, 'shop_upgrade_pistol');

  const finishStep = resolveActiveTutorialStep({
    ...baseHud,
    screenState: 'title',
    shopOpen: true,
    tutorialStep: 'final_tips',
  });
  assert.equal(finishStep?.id, 'shop_finish_tutorial');

  const doneStep = resolveActiveTutorialStep({
    ...baseHud,
    screenState: 'title',
    shopOpen: true,
    tutorialStep: 'done',
  });
  assert.equal(doneStep, null);
});

test('spotlight cutout and tooltip placement map normal & rotated rects cleanly inside stage bounds', () => {
  const normalLocal = computeLocalStageRect(
    { left: 100, top: 200, right: 300, bottom: 250, width: 200, height: 50 },
    { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 },
    false
  );
  assert.deepEqual(normalLocal, { x: 100, y: 200, width: 200, height: 50 });

  const rotatedLocal = computeLocalStageRect(
    { left: 320, top: 50, right: 370, bottom: 250, width: 50, height: 200 },
    { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
    true
  );
  assert.deepEqual(rotatedLocal, { x: 50, y: 20, width: 200, height: 50 });

  const cutout = computeSpotlightCutout(normalLocal, 1280, 720, 8);
  assert.deepEqual(cutout, { x: 92, y: 192, width: 216, height: 66 });

  const tip = computeTooltipPlacement(cutout, 1280, 720, 280, 120, 'right');
  assert.equal(tip.arrowSide, 'left');
  assert.ok(tip.left >= cutout.x + cutout.width);
  assert.ok(tip.left + 280 <= 1280);

  const pausedByDaily = resolveActiveTutorialStep({
    screenState: 'title',
    shopOpen: false,
    dailyModalOpen: true,
    tutorialStep: 'menu_intro',
  } as unknown as HudSnapshot);
  assert.equal(pausedByDaily, null);
});

test('daily reward streak tracks first visit, same-day lock, consecutive days, missed reset, and Day 7 rollover', () => {
  assert.equal(DAILY_REWARDS.length, 7);
  assert.equal(DAILY_REWARDS[6].trophies, 1);

  assert.equal(getLocalDayKey(new Date(2026, 10, 14, 15, 30)), '2026-11-14');
  assert.equal(diffCalendarDays('2026-11-10', '2026-11-11'), 1);
  assert.equal(diffCalendarDays('2026-11-10', '2026-11-13'), 3);

  const first = evaluateDailyRewardStatus(null, 0, '2026-11-14');
  assert.deepEqual(first, {
    canClaim: true,
    nextDayIndex: 0,
    effectiveStreak: 0,
    streakBroken: false,
  });

  const sameDay = evaluateDailyRewardStatus('2026-11-14', 1, '2026-11-14');
  assert.equal(sameDay.canClaim, false);
  assert.equal(sameDay.effectiveStreak, 1);

  const nextDay = evaluateDailyRewardStatus('2026-11-14', 1, '2026-11-15');
  assert.equal(nextDay.canClaim, true);
  assert.equal(nextDay.nextDayIndex, 1);
  assert.equal(nextDay.streakBroken, false);

  const missedDay = evaluateDailyRewardStatus('2026-11-14', 4, '2026-11-16');
  assert.equal(missedDay.canClaim, true);
  assert.equal(missedDay.nextDayIndex, 0);
  assert.equal(missedDay.effectiveStreak, 0);
  assert.equal(missedDay.streakBroken, true);

  const afterDay7 = evaluateDailyRewardStatus('2026-11-14', 7, '2026-11-15');
  assert.equal(afterDay7.canClaim, true);
  assert.equal(afterDay7.nextDayIndex, 0);
});

test('inactivity push-SMS triggers after 24h threshold and formats comeback message cleanly', () => {
  const now = 1_700_000_000_000;
  assert.equal(computeDaysInactive(null, now), 0);
  assert.equal(computeDaysInactive(now - INACTIVITY_PUSH_THRESHOLD_MS + 1000, now), 0);
  assert.equal(computeDaysInactive(now - INACTIVITY_PUSH_THRESHOLD_MS, now), 1);
  assert.equal(computeDaysInactive(now - INACTIVITY_PUSH_THRESHOLD_MS * 3 - 5000, now), 3);

  assert.equal(buildInactivityPushSms(0, true, 'Хвойный лес'), null);

  const sms1 = buildInactivityPushSms(1, true, 'Хвойный лес');
  assert.ok(sms1);
  assert.equal(sms1.title, 'Тёмная Чаща');
  assert.match(sms1.body, /1 день/);
  assert.match(sms1.body, /Ежедневная награда/);

  const sms3 = buildInactivityPushSms(3, false, 'Болотная топь');
  assert.ok(sms3);
  assert.equal(sms3.title, 'Тёмная Чаща');
  assert.match(sms3.body, /3 дня/);
  assert.match(sms3.body, /Болотная топь/);
});

test('latest purchased weapon helper always selects the most recently bought weapon', () => {
  assert.equal(getLatestPurchasedWeapon([]), 'rusty_pistol');
  assert.equal(getLatestPurchasedWeapon(['rusty_pistol']), 'rusty_pistol');
  assert.equal(getLatestPurchasedWeapon(['rusty_pistol', 'shotgun']), 'shotgun');
  assert.equal(
    getLatestPurchasedWeapon(['rusty_pistol', 'shotgun', 'gauss_cannon']),
    'gauss_cannon'
  );
});



