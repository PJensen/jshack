/**
 * Combat, damage, healing, death, ranged, shield, procs, and special strike wiring.
 */
import { defineMessage, renderMessage } from "./messageRegistry.js";
import {
  MELEE_VERBS, SPELL_VERBS, CRIT_MELEE, MISS_VERBS, FLAVOR_ADVERBS,
  IMPACT_BY_WEAPON,
  DEATH_BY_ATTACK, DEATH_BY_ELEMENT, DEATH_BY_GORE, DEATH_BY_SIZE, DEATH_CRIT, DEATH_FALLBACK,
  v, toPastVerb, adverbForFlavor, impactLabel, pick, pickImpact,
} from "./messageTemplates.js";

// === Monster ability windups / casts ===
defineMessage("monster:ability:windup", {
  target: ({ actorName, abilityLabel }) => ({
    text: `${actorName} rears back - ${abilityLabel.toLowerCase()} incoming!`,
    type: "danger",
  }),
  witness: ({ actorName, abilityLabel }) => ({
    text: `${actorName} prepares ${abilityLabel.toLowerCase()}.`,
    type: "combat",
  }),
});

defineMessage("monster:ability:cast", {
  target: ({ actorName, abilityLabel }) => ({
    text: `${actorName} unleashes ${abilityLabel.toLowerCase()} on you!`,
    type: "danger",
  }),
  witness: ({ actorName, abilityLabel }) => ({
    text: `${actorName} unleashes ${abilityLabel.toLowerCase()}.`,
    type: "combat",
  }),
});

// === Melee ability handlers ===
defineMessage("spell:boar_charge", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} slams into you like a battering ram! The ground shakes.`, type: "danger" };
    if (missed) return { text: `${actorName} thunders past — the wind alone knocks you back!`, type: "danger" };
    return { text: `${actorName} lowers its head and charges straight at you!`, type: "danger" };
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} tramples ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:boar_bite", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} clamps down on your arm — you feel bone grind!`, type: "danger" };
    if (missed) return { text: `${actorName} snaps its jaws shut on empty air.`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} sinks its teeth into ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:rat_gnaw", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} gnaws through your boot leather — blood wells up!`, type: "danger" };
    if (missed) return { text: `${actorName} lunges for your ankle and misses.`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} gnaws into ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:goblin_dirty_trick", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} hurls dirt in your eyes! You can't see!`, type: "danger" };
    if (missed) return { text: `${actorName} tries to throw dirt in your eyes, but you flinch away.`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} blinds ${targetName} with a fistful of dirt.`, type: "combat" } : null,
});

defineMessage("spell:snake_fang", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} buries its fangs in your flesh — venom burns through your veins!`, type: "danger" };
    if (missed) return { text: `${actorName} strikes — fangs flash past your skin, barely missing.`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} sinks venomous fangs into ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:spider_lunge", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} launches itself at your face! Legs everywhere!`, type: "danger" };
    if (missed) return { text: `${actorName} pounces — you twist aside just in time.`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} pounces on ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:shield_bash", {
  target: ({ actorName, hit, missed }) => {
    if (hit) return { text: `${actorName} drives a shield into your chest — your ribs creak!`, type: "danger" };
    if (missed) return { text: `${actorName} swings a shield at your head — you duck!`, type: "combat" };
    return null;
  },
  witness: ({ actorName, targetName, hit }) =>
    hit ? { text: `${actorName} smashes a shield into ${targetName}.`, type: "combat" } : null,
});

defineMessage("spell:acid_spit", {
  target: ({ actorName, hit }) => ({
    text: hit
      ? `${actorName} rears back and spits — acid sizzles across your skin!`
      : `${actorName} spits acid that spatters at your feet, hissing on the stone!`,
    type: "danger",
  }),
  witness: ({ actorName, targetName }) => ({
    text: `${actorName} hawks a glob of acid at ${targetName}.`,
    type: "combat",
  }),
});

// === Proc messages ===
defineMessage("proc:bleeding", {
  target: ({ actorName }) => ({ text: `Blood — yours — hits the floor. ${actorName} opened a wound.`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `You open a vein. ${targetName} starts to bleed.`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName} opens a wound on ${targetName}.`, type: "combat" }),
});

defineMessage("proc:hemorrhage", {
  target: () => ({ text: `The wound tears wider — blood pours freely!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `${targetName}'s wound rips open. Blood everywhere.`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName} tears ${targetName}'s wound wider.`, type: "combat" }),
});

defineMessage("proc:paralyzed", {
  target: () => ({ text: `Your muscles lock up — you can't move!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `Your blow locks ${targetName}'s joints solid!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s strike paralyzes ${targetName}!`, type: "combat" }),
});

defineMessage("proc:rot_grub:burrow", {
  target: () => ({ text: `Something wriggles under your skin — a rot grub! You are bleeding badly!`, type: "danger" }),
  witness:({ targetName }) => ({ text: `A rot grub burrows into ${targetName}!`, type: "combat" }),
});

defineMessage("proc:blinded", {
  target: () => ({ text: `The coating sears your eyes — everything goes dark!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `Blinding liquid coats ${targetName}'s eyes!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s coated weapon blinds ${targetName}!`, type: "combat" }),
});

defineMessage("proc:confused", {
  target: () => ({ text: `Your thoughts scatter — which way was forward?`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `The coating muddles ${targetName}'s mind!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s strike leaves ${targetName} reeling in confusion!`, type: "combat" }),
});

defineMessage("proc:hallucinating", {
  target: () => ({ text: `Oh wow, the ceiling is made of bees! Wait—`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `${targetName} stumbles, eyes wide and glassy!`, type: "combat" }),
  witness:({ targetName }) => ({ text: `${targetName} starts seeing things that aren’t there!`, type: "combat" }),
});

defineMessage("proc:weakened", {
  target: () => ({ text: `Strength drains from your limbs!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `The coating saps ${targetName}'s strength!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s coated weapon weakens ${targetName}!`, type: "combat" }),
});

defineMessage("proc:acid_splash", {
  target: () => ({ text: `Acid eats into your flesh!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `Acid sizzles across ${targetName}'s skin!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s acid-coated weapon burns ${targetName}!`, type: "combat" }),
});

defineMessage("proc:ignited", {
  target: () => ({ text: `Your attacker’s oiled blade sets you ablaze!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `The oil-slicked blade ignites ${targetName}!`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `${actorName}'s oiled weapon sets ${targetName} alight!`, type: "combat" }),
});

defineMessage("proc:serpentBound:spectralSnakes", {
  target: () => ({ text: `Spectral serpents coil and bite at your legs!`, type: "danger" }),
  actor:  ({ targetName }) => ({ text: `Spectral serpents surge from your breeches and lash ${targetName}.`, type: "combat" }),
  witness:({ actorName, targetName }) => ({ text: `Spectral serpents whirl around ${actorName} and strike ${targetName}.`, type: "combat" }),
});

export function installCombatMessages(ctx) {
  const { world, log, nameOfEntity, bracketizeName, compGet, compHas, playerEntity,
          canSeeAt, normalizeStatusEvent, Equipment, ItemInfo, NamedIdentity, Pet, Owner, Player, Position, Status, ActiveEffects } = ctx;
  const PROSE_STATE = Symbol.for("jshack:combatMessages:proseState");

  // === Monster ability messages ===
  world.on('monster:ability:windup', ({ actor, targetId, abilityName }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("monster:ability:windup", {
      actorName: nameOfEntity(actor),
      targetName: nameOfEntity(targetId),
      abilityLabel: String(abilityName || "ability"),
    });
  });

  world.on('monster:ability:cast', ({ actor, targetId, abilityName }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("monster:ability:cast", {
      actorName: nameOfEntity(actor),
      targetName: nameOfEntity(targetId),
      abilityLabel: String(abilityName || "ability"),
    });
  });

  world.on('monster:firebreath', ({ actor, target, tiles }) => {
    if (!_playerCanSee([actor, target])) return;
    const who = nameOfEntity(actor);
    const len = Array.isArray(tiles) ? tiles.length : 0;
    const tgt = nameOfEntity(target);
    if (tgt === 'You') {
      log(`${who} opens its jaws — a torrent of fire roars toward you!`, 'danger');
    } else if (len > 3) {
      log(`${who} rears back and bathes the corridor in dragonfire!`, 'combat');
    } else {
      log(`${who} spews a gout of flame!`, 'combat');
    }
  });

  world.on('spell:death_volley', ({ actor, hits }) => {
    if (!_playerCanSee([actor])) return;
    const who = nameOfEntity(actor);
    const hitYou = Array.isArray(hits) && hits.some((hit) => nameOfEntity(hit?.id) === 'You');
    if (hitYou) { log(`${who}'s volley rains arrows across your position!`, 'danger'); return; }
    const count = Array.isArray(hits) ? hits.length : 0;
    if (count > 0) log(`${who}'s volley peppers ${count} target${count === 1 ? '' : 's'}.`, 'combat');
  });

  world.on('spell:boar_charge', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:boar_charge", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('spell:boar_bite', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:boar_bite", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('spell:rat_gnaw', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:rat_gnaw", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('spell:goblin_dirty_trick', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:goblin_dirty_trick", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('spell:snake_fang', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:snake_fang", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('spell:spider_lunge', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:spider_lunge", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  world.on('proc:bleeding', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:bleeding', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });

  world.on('proc:hemorrhage', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:hemorrhage', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });

  world.on('proc:paralyzed', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:paralyzed', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });

  world.on('spell:wolf_howl', ({ actor, alertedIds }) => {
    if (!_playerCanSee([actor])) return;
    const who = nameOfEntity(actor);
    const count = Array.isArray(alertedIds) ? alertedIds.length : 0;
    if (count > 0) { log(`${who} throws back its head and howls — ${count} more ${count === 1 ? 'answers' : 'answer'} from the dark!`, 'danger'); return; }
    log(`${who} howls. The sound echoes and dies.`, 'combat');
  });

  world.on('spell:shield_bash', ({ actor, targetId, hit, missed }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:shield_bash", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit, missed });
  });

  // Shield / dodge / parry combat messages
  world.on('shield:guarded', ({ id, source, stacks, broken }) => {
    if (!_playerCanSee([id, source])) return;
    const who = nameOfEntity(id);
    const attacker = nameOfEntity(source);
    if (who === 'You') {
      log(broken
        ? `Your shield catches the blow — and shatters!`
        : `Your shield catches ${attacker}'s blow. (${stacks} guard left)`, broken ? 'danger' : 'combat');
    } else {
      log(broken
        ? `${who}'s shield splinters under your attack!`
        : `${who} catches your blow on a shield.`, 'combat');
    }
  });

  world.on('combat:posture', ({ id, stance, previous, hasShield }) => {
    const who = nameOfEntity(id);
    if (who !== 'You') return;
    if (stance === 'guarded' && hasShield) log('You raise your shield.', 'combat');
    else if (previous === 'guarded' && hasShield) log('You lower your shield.', 'combat');
  });

  world.on('combat:dodge', ({ defender, attacker }) => {
    if (!_playerCanSee([defender, attacker])) return;
    const who = nameOfEntity(defender);
    const atk = nameOfEntity(attacker);
    if (who === 'You') log(`You twist aside — ${atk}'s attack sails past!`, 'combat');
    else log(`${who} sidesteps your attack!`, 'combat');
  });

  world.on('combat:parry', ({ defender, attacker, weaponName }) => {
    if (!_playerCanSee([defender, attacker])) return;
    const who = nameOfEntity(defender);
    const atk = nameOfEntity(attacker);
    const wName = String(weaponName || 'weapon');
    if (who === 'You') log(`Steel meets steel — you deflect ${atk}'s strike with your ${wName}!`, 'combat');
    else log(`${who} deflects your attack with a ringing parry!`, 'combat');
  });

  world.on('spell:acid_spit', ({ actor, targetId, hit }) => {
    if (!_playerCanSee([actor, targetId])) return;
    _logRendered("spell:acid_spit", { actorName: nameOfEntity(actor), targetName: nameOfEntity(targetId), hit });
  });

  world.on('monster:death:fire_puff', ({ at }) => {
    if (!at || !canSeeAt(at.x, at.y)) return;
    log('The creature bursts — a flash of heat, then nothing but ash.', 'combat');
  });

  world.on('monster:death:gas_spore', ({ at }) => {
    if (!at || !canSeeAt(at.x, at.y)) return;
    log('The gas spore ruptures with a wet pop — toxic clouds billow outward!', 'danger');
  });

  world.on('proc:rot_grub:burrow', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:rot_grub:burrow', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });

  // === Core combat events ===
  world.on('attack:insufficient-stamina', ({ attacker, defender, weaponId, need, have }) => {
    const weaponInfo = compGet(weaponId, ItemInfo);
    const weaponName = weaponInfo ?
      (compGet(weaponId, NamedIdentity)?.name || weaponInfo.description || weaponInfo.type)
      : 'fists';
    log(`Not enough stamina to attack with ${weaponName} (need ${need}, have ${Math.floor(have)}).`, 'combat');
  });

  // ── Helpers ──
  function _logRendered(eventKey, data) {
    const rendered = renderMessage(eventKey, data);
    if (!rendered) return;
    log(rendered.text, rendered.type);
  }

  /** True if the player is involved OR the event is visible to the player. */
  function _playerCanSee(ids, at) {
    const pe = playerEntity(world);
    const pid = Number(pe?.id || 0) | 0;
    for (const id of ids) {
      if (Number(id || 0) === pid) return true;
    }
    if (at && canSeeAt(at.x, at.y)) return true;
    for (const id of ids) {
      const p = compGet(Number(id || 0), Position);
      if (p && canSeeAt(p.x, p.y)) return true;
    }
    return false;
  }

  // ── Rarity colors for weapon names in combat log ──
  const _rarityColors = {
    common: '#ffffff', uncommon: '#1eff00', rare: '#55aaff',
    magic: '#55aaff', epic: '#c47bff', legendary: '#ff9f3b',
  };
  function _weaponHtml(wid) {
    const wname = compGet(wid, NamedIdentity)?.name;
    if (!wname) return '';
    const info = compGet(wid, ItemInfo);
    const rn = String(info?.rarityName || 'common').toLowerCase();
    const color = _rarityColors[rn] || '#ffffff';
    return ` with <b style="color:${color}" data-entity-id="${wid}" data-tip="item">[${wname}]</b>`;
  }

  function _getProseState() {
    if (!world[PROSE_STATE]) {
      world[PROSE_STATE] = { recentByContext: new Map() };
    }
    return world[PROSE_STATE];
  }

  function _rememberLine(contextKey, line) {
    const key = String(contextKey || '');
    if (!key || !line) return;
    const state = _getProseState();
    const recent = state.recentByContext.get(key) || [];
    const next = recent.filter((msg) => msg !== line);
    next.push(line);
    while (next.length > 4) next.shift();
    state.recentByContext.set(key, next);
  }

  function _pickLineAvoidRecent(pool, seed, contextKey) {
    if (!Array.isArray(pool) || pool.length === 0) return '';
    const key = String(contextKey || '');
    const state = _getProseState();
    const recent = state.recentByContext.get(key) || [];
    let chosen = '';
    for (let shift = 0; shift < Math.max(1, pool.length); shift++) {
      const candidate = pickImpact(pool, seed + shift);
      if (!recent.includes(candidate)) {
        chosen = candidate;
        break;
      }
      if (!chosen) chosen = candidate;
    }
    _rememberLine(key, chosen);
    return chosen;
  }

  function _impactSentence(amount, maxHp, isCrit, weaponClass, step, contextKey = '') {
    const level = impactLabel(amount, maxHp, isCrit);
    const wc = String(weaponClass || '').toLowerCase();
    const bank = IMPACT_BY_WEAPON[wc] || IMPACT_BY_WEAPON.weapon;
    const pool = bank[level] || IMPACT_BY_WEAPON.weapon[level] || IMPACT_BY_WEAPON.weapon.solid;
    const seed = (step | 0) + (Number(amount || 0) | 0) + (Number(maxHp || 0) | 0);
    if (!Array.isArray(pool) || pool.length === 0) return '';
    const key = `${String(contextKey || '')}:impact`;
    const state = _getProseState();
    const recent = state.recentByContext.get(key) || [];

    let chosen = '';
    for (let shift = 0; shift < Math.max(1, pool.length); shift++) {
      const line = pickImpact(pool, seed + shift);
      const candidate = isCrit ? `${line} Critical!` : line;
      if (!recent.includes(candidate)) {
        chosen = candidate;
        break;
      }
      if (!chosen) chosen = candidate;
    }

    _rememberLine(key, chosen);
    return chosen;
  }

  function _hasBleedingStatus(entityId) {
    const st = compGet(Number(entityId || 0), Status);
    const statuses = Array.isArray(st?.statuses) ? st.statuses : [];
    for (let i = 0; i < statuses.length; i++) {
      const type = String(statuses[i]?.type || '').toLowerCase();
      if (type === 'bleeding' || type === 'bleed') return true;
    }
    const fx = compGet(Number(entityId || 0), ActiveEffects);
    const effects = Array.isArray(fx?.effects) ? fx.effects : [];
    for (let i = 0; i < effects.length; i++) {
      const key = String(effects[i]?.key || '').toLowerCase();
      const turnsLeft = Number(effects[i]?.turnsLeft || 0);
      if ((key === 'bleeding' || key === 'bleed') && turnsLeft > 0) return true;
    }
    return false;
  }

  function _woundSentence(defName, hpAfter, maxHp, isBleeding, step, contextKey = '') {
    const max = Math.max(0, Number(maxHp || 0));
    const after = Math.max(0, Number(hpAfter || 0));
    if (!(max > 0)) return '';
    const be = defName === 'You' ? 'are' : 'is';
    if (after <= 0) return `${defName} ${be} finished.`;
    const ratio = after / max;
    if (ratio > 0.85) return `${defName} ${be} barely scratched.`;
    if (ratio > 0.65) return `${defName} ${be} hurt.`;
    if (ratio > 0.4) {
      const key = `${String(contextKey || '')}:wound:mid`;
      const pool = isBleeding
        ? [`${defName} ${be} wounded and bleeding.`, `${defName} ${be} bleeding from a deep cut.`]
        : [`${defName} ${be} wounded.`, `${defName} ${be} clearly wounded.`];
      const line = _pickLineAvoidRecent(pool, (step | 0) + after + max, key);
      return line;
    }
    if (ratio > 0.2) {
      const key = `${String(contextKey || '')}:wound:low`;
      const pool = isBleeding
        ? [`${defName} ${be} staggering, bleeding out.`, `${defName} ${be} reeling and losing blood.`]
        : [`${defName} ${be} staggering.`, `${defName} ${be} reeling.`];
      const line = _pickLineAvoidRecent(pool, (step | 0) + after + max + 7, key);
      return line;
    }
    if (ratio > 0.08) return `${defName} ${be} barely standing.`;
    return `${defName} ${be} hanging on by a thread.`;
  }

  function _combatDetailText(defName, amount, maxHp, hpAfter, isCrit, weaponClass, step, isBleeding, contextKey) {
    const max = Math.max(0, Number(maxHp || 0));
    if (!(max > 0)) return '';
    const impactTxt = _impactSentence(amount, max, isCrit, weaponClass, step, contextKey);
    const woundTxt = _woundSentence(defName, hpAfter, max, !!isBleeding, step, contextKey);
    if (!impactTxt && !woundTxt) return '';
    if (!impactTxt) return ` ${woundTxt}`;
    if (!woundTxt) return ` ${impactTxt}`;
    return ` ${impactTxt} ${woundTxt}`;
  }

  world.on('damaged', ({ target, amount, critical, crit, source, offhand, cause, type, impactProfile, at, hpAfter, maxHp }) => {
    if (!_playerCanSee([target, source], at)) return;

    const defName = nameOfEntity(target);
    const isCrit = !!(critical || crit);
    const targetBleeding = _hasBleedingStatus(target);
    const handTxt = offhand ? ' (off-hand)' : '';
    const critTxt = isCrit ? ' — CRIT!' : '';
    const causeKey = String(cause || '').toLowerCase();
    const usingRanged = causeKey === 'ranged';
    const isMelee = causeKey === 'melee' || causeKey === 'retaliation' || !!impactProfile;
    const isWeaponHit = isMelee || usingRanged;
    const dt = String(type || '').toLowerCase();
    const attackKind = impactProfile?.attackKind || '';
    const proseCtxKey = `${Number(source || 0) | 0}:${Number(target || 0) | 0}:${causeKey}:${String(impactProfile?.weaponClass || '')}:${dt}`;

    if (Number(source || 0)) {
      const atkName = nameOfEntity(source);

      if (!isWeaponHit) {
        const detailTxt = _combatDetailText(defName, amount, maxHp, hpAfter, isCrit, 'spell', world.step || 0, targetBleeding, proseCtxKey);
        const pair = SPELL_VERBS[dt] || ['hit', 'hits'];
        log(`${atkName} ${v(atkName, pair[0], pair[1])} ${defName} for ${amount}${critTxt}.${detailTxt}`, 'combat');
        return;
      }

      // Melee / ranged — resolve weapon
      let weaponPlain = '';
      let weaponRich = '';
      let weaponFlavor = '';
      const eq = compGet(Number(source || 0), Equipment);
      const wid = offhand
        ? Number(eq?.offhand || 0)
        : (usingRanged ? Number(eq?.ranged || 0) : Number(eq?.weapon || 0));
      if (wid) {
        const wInfo = compGet(wid, ItemInfo);
        weaponFlavor = String(wInfo?.combatFlavor || '').trim();
        weaponRich = _weaponHtml(wid);
        const wname = compGet(wid, NamedIdentity)?.name;
        if (wname) {
          weaponPlain = ` with ${bracketizeName(wname)}`;
        }
      } else if (!offhand && compHas(Number(source || 0), Player)) {
        weaponPlain = ' with bare fists';
        weaponRich = ' with bare fists';
      }
      const pair = (isCrit && CRIT_MELEE[attackKind])
        || MELEE_VERBS[attackKind]
        || ['hit', 'hits'];
      const verb = v(atkName, pair[0], pair[1]);
      const flavorAdverb = adverbForFlavor(weaponFlavor);
      const actionVerb = flavorAdverb ? `${flavorAdverb} ${toPastVerb(verb)}` : verb;
      const detailTxt = _combatDetailText(
        defName,
        amount,
        maxHp,
        hpAfter,
        isCrit,
        String(impactProfile?.weaponClass || (usingRanged ? 'bow' : 'weapon')),
        world.step || 0,
        targetBleeding,
        proseCtxKey,
      );
      const text = `${atkName} ${actionVerb} ${defName}${weaponPlain} for ${amount}${critTxt}${handTxt}.${detailTxt}`;
      const html = weaponRich
        ? `${atkName} ${actionVerb} ${defName}${weaponRich} for ${amount}${critTxt}${handTxt}.${detailTxt}`
        : undefined;
      log({ text, html, type: 'combat' });
    } else {
      const detailTxt = _combatDetailText(defName, amount, maxHp, hpAfter, isCrit, String(impactProfile?.weaponClass || ''), world.step || 0, targetBleeding, proseCtxKey);
      log(`${defName} ${v(defName, 'take', 'takes')} ${amount} damage${critTxt}${handTxt}.${detailTxt}`, 'combat');
    }
  });

  world.on('healed', ({ id, amount }) => {
    if (!_playerCanSee([id])) return;
    const who = nameOfEntity(id);
    log(`${who} ${v(who, 'heal', 'heals')} ${amount}.`, 'system');
  });

  // ── Context-aware death messages ──
  world.on('died', (ev) => {
    const { id, killer, critical, damageType, goreType, sizeClass, impactProfile } = ev;
    if (!_playerCanSee([id, killer])) return;

    const who = nameOfEntity(id);
    const pe = playerEntity(world);
    const playerId = Number(pe?.id || 0) | 0;
    const deadId = Number(id || 0) | 0;
    const killerId = Number(killer || 0) | 0;
    const step = world.step || 0;

    if (compHas(deadId, Pet)) {
      const owner = compGet(deadId, Owner);
      const ownerId = Number(owner?.ownerId || 0) | 0;
      if (playerId > 0 && ownerId === playerId && killerId === playerId) {
        log(`You kill ${who}. The act is unforgivable.`, 'deity');
        return;
      }
    }

    const attackKind = impactProfile?.attackKind || '';
    const dt = String(damageType || '');
    const gore = String(goreType || 'blood');
    const size = String(sizeClass || 'M');

    // 1. Crit kills — most dramatic
    if (critical) {
      const pool = DEATH_CRIT[attackKind] || DEATH_CRIT[dt];
      if (pool) { log(pick(pool, step)(who), 'combat'); return; }
    }
    // 2. Elemental kills
    if (DEATH_BY_ELEMENT[dt]) {
      log(pick(DEATH_BY_ELEMENT[dt], step)(who), 'combat'); return;
    }
    // 3. Size-specific flavor for small/large
    if (DEATH_BY_SIZE[size] && step % 3 === 0) {
      log(pick(DEATH_BY_SIZE[size], step)(who), 'combat'); return;
    }
    // 4. Attack-kind flavor (melee weapon shape)
    if (DEATH_BY_ATTACK[attackKind]) {
      log(pick(DEATH_BY_ATTACK[attackKind], step)(who), 'combat'); return;
    }
    // 5. Gore-type flavor (non-blood creatures)
    if (gore !== 'blood' && DEATH_BY_GORE[gore]) {
      log(pick(DEATH_BY_GORE[gore], step)(who), 'combat'); return;
    }
    // 6. Fallback
    log(pick(DEATH_FALLBACK, step)(who), 'combat');
  });

  function _getAttackKindFor(srcId) {
    const eq = compGet(Number(srcId || 0), Equipment);
    const wid = Number(eq?.weapon || 0);
    if (!wid) return '';
    const info = compGet(wid, ItemInfo);
    const dt = String(info?.damageType || '').toLowerCase();
    if (dt === 'pierce') return 'stab';
    if (dt === 'slash') return 'slash';
    if (dt === 'blunt') return 'blunt';
    return '';
  }

  world.on('status', (payload) => {
    const { id, kind, source, at } = normalizeStatusEvent(payload);
    if (!_playerCanSee([id, source], at)) return;

    const style = (String(kind || '')).toLowerCase();
    const tgt = nameOfEntity(id);
    const srcId = Number(source || 0);
    const src = srcId ? nameOfEntity(source) : null;
    if (style === 'miss' && src) {
      const ak = _getAttackKindFor(srcId);
      const pair = MISS_VERBS[ak];
      if (pair) {
        log(`${src} ${v(src, pair[0], pair[1])} ${tgt} and ${v(src, 'miss', 'misses')}.`, 'combat');
      } else {
        log(`${src} ${v(src, 'miss', 'misses')} ${tgt}.`, 'combat');
      }
    }
    if (style === 'immune' && src) {
      log(`${src} ${v(src, 'attack', 'attacks')} ${tgt}. It does nothing.`, 'combat');
    }
  });

  // === Ranged combat events ===
  world.on('ranged:no-ammo', ({ attacker }) => {
    const who = nameOfEntity(attacker);
    log(who === 'You' ? 'You have no arrows.' : `${who} is out of ammo.`, 'combat');
  });

  world.on('ranged:blocked', ({ attacker, target }) => {
    const who = nameOfEntity(attacker);
    log(who === 'You' ? 'Your shot is blocked.' : `${who}'s shot is blocked.`, 'combat');
  });

  world.on('ranged:out-of-range', ({ attacker, target }) => {
    const who = nameOfEntity(attacker);
    const tgt = nameOfEntity(target);
    log(who === 'You' ? `${tgt} is out of range.` : `${who}'s target is out of range.`, 'combat');
  });

  // === Battle fury / lichdom ===
  world.on('battle_fury:heal', ({ id, amount }) => {
    const pe = playerEntity(world);
    if (!pe || id !== pe.id) return;
    log(`Warchief fury surges — you recover ${amount} HP!`, 'system');
  });
  world.on('primal_roar:heal', ({ id, amount }) => {
    const pe = playerEntity(world);
    if (!pe || id !== pe.id) return;
    log(`Your roar feeds the hunt — you recover ${amount} HP!`, 'system');
  });

  world.on('lichdom_echo:saved', ({ id }) => {
    const pe = playerEntity(world);
    if (!pe || id !== pe.id) return;
    log('The phylactery pulse shatters — death is cheated!', 'legendary');
  });

  // === Wild Interactions: blessed/holy combat ===
  world.on('combat:holy_strike', () => {
    log('Your blade blazes with holy light — the undead recoils!', 'system');
  });
  world.on('combat:blessed_strike', ({ creatureType }) => {
    const label = creatureType === 'undead' ? 'undead' : 'demon';
    log(`Your blessed weapon sears the ${label}!`, 'system');
  });
  world.on('combat:banish', () => {
    log('Your blessed weapon banishes the demon back to the abyss!', 'danger');
  });
  world.on('combat:sunblind', () => {
    log("The Sunsword's radiance burns away all sight!", 'system');
  });
  world.on('combat:shatter', ({ damageType, mult }) => {
    if (damageType === 'blunt') log('The frozen enemy shatters under the blow!', 'system');
    else log('Your weapon pierces through the brittle ice!', 'system');
  });
  world.on('combat:torch_ignite', () => {
    log('Your torch sets the enemy ablaze!', 'system');
  });
  world.on('spell:heal:undead', () => {
    log('Healing energy sears through the undead!', 'system');
  });
  world.on('spell:lightning:backlash', ({ damage }) => {
    log(`The current surges through the water beneath you! (-${damage} HP)`, 'danger');
  });
  world.on('potion:blessed_bonus', () => {
    log('The blessed potion surges with amplified power!', 'system');
  });
  world.on('scroll:wasted_blind', () => {
    log("You fumble blindly at the scroll — the words blur and fade to nothing!", 'warning');
  });
  world.on('proc:blessed_resist_rust', ({ itemName }) => {
    log(`The blessing on your ${bracketizeName(String(itemName || 'equipment'))} flares, repelling the corrosion!`, 'system');
  });
  world.on('combat:holy_smite', ({ attacker, damage }) => {
    const pe = playerEntity(world);
    if (!pe || Number(attacker || 0) !== pe.id) return;
    log(`Your blessed blade erupts in holy light! (+${damage} holy)`, 'legendary');
  });
  world.on('holy_water:undead', ({ target }) => {
    const tname = nameOfEntity(target) || 'undead';
    log(`The holy water scalds ${tname}!`, 'system');
  });
  world.on('hunger:choke', () => {
    log('You wolf down the food so fast you choke! You are stunned!', 'warning');
  });
  world.on('combat:target-flying', () => {
    log('Out of reach!', 'info');
  });

  // === Weapon coating proc messages ===
  world.on('proc:blinded', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:blinded', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:confused', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:confused', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:hallucinating', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:hallucinating', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:weakened', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:weakened', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:acid_splash', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:acid_splash', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:ignited', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:ignited', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
  world.on('proc:serpentBound:spectralSnakes', ({ actor, target }) => {
    if (!_playerCanSee([actor, target])) return;
    _logRendered('proc:serpentBound:spectralSnakes', { actorName: nameOfEntity(actor), targetName: nameOfEntity(target) });
  });
}
