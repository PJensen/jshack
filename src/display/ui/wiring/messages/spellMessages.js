/**
 * Spell casting, channeling, and ability message wiring.
 * Lines ~377-918 from the original installMessageWiring.
 */
import { ResurrectionCast } from "../../../events/ResurrectionCast.js";

export function installSpellMessages(ctx) {
  const { world, log, nameOfEntity, bracketizeName, getSpell, compGet, richSpell, NamedIdentity, playerEntity, Status } = ctx;

  function _playerHas(statusType) {
    const pe = playerEntity(world);
    if (!pe?.id || !Status) return false;
    const st = compGet(pe.id, Status);
    return Array.isArray(st?.statuses) && st.statuses.some((s) => s.type === statusType && (Number(s.duration || 0) | 0) > 0);
  }

  /** Build a rich spell label. Returns { text, html } or falls back to plain bracket. */
  function _spell(spellId) {
    const s = getSpell ? getSpell(String(spellId || '')) : null;
    if (s?.name) return richSpell(spellId);
    const fallback = `[${String(spellId || 'Spell')}]`;
    return { text: fallback, html: fallback };
  }

  /** Log a message that may include rich spell HTML. */
  function _log(text, html, type) {
    if (html && html !== text) log({ text, html, type });
    else log(text, type);
  }

  world.on('castSpell', ({ actor, spellId, targetId }) => {
    const who = nameOfEntity(actor);
    const tgt = nameOfEntity(targetId || actor);
    const sp = _spell(spellId);
    if (who === 'You' && tgt === 'You') _log(`You invoke ${sp.text}.`, `You invoke ${sp.html}.`, 'system');
    else if (who === 'You') _log(`You hurl ${sp.text} at ${tgt}.`, `You hurl ${sp.html} at ${tgt}.`, 'system');
    else if (tgt === 'You') _log(`${who} hurls ${sp.text} at you!`, `${who} hurls ${sp.html} at you!`, 'danger');
    else _log(`${who} casts ${sp.text} on ${tgt}.`, `${who} casts ${sp.html} on ${tgt}.`, 'system');
  });

  world.on('spirit:spellBoost', () => {
    log('The spirit wisp flares \u2014 it feeds its essence into your spell!', 'deity');
  });

  world.on('spell:not-known', ({ actor, spellId }) => {
    const who = nameOfEntity(actor);
    if (who === 'You') {
      log(`You trace the gestures for ${spellId ? `[${spellId}]` : 'a spell'}, but nothing happens. You don't know this magic.`, 'system');
      return;
    }
    log(`${who} fumbles through unfamiliar incantations. Nothing happens.`, 'system');
  });

  world.on('spell:unknown', ({ actor, spellId }) => {
    const who = nameOfEntity(actor);
    if (who === 'You') {
      log(`The words feel wrong in your mouth. This isn't a real spell.`, 'system');
      return;
    }
    log(`${who} mutters gibberish and waves their hands. Nothing happens.`, 'system');
  });

  world.on('spell:no-target', ({ actor, range }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log(range <= 1 ? 'You lash out \u2014 nothing within arm\u2019s reach.' : 'You scan for a target. Nothing in range.', 'system');
  });

  world.on('spell:oom', ({ actor, spellId, need, have, costKind }) => {
    const who = nameOfEntity(actor);
    const resource = String(costKind || 'mana');
    const label = resource === 'stamina' ? 'stamina' : resource === 'life' ? 'life force' : 'mana';
    if (who === 'You') {
      const sp = _spell(spellId);
      _log(`You reach for ${sp.text} \u2014 your ${label} gutters like a dying candle. Not enough. (need ${need}, have ${have})`,
           `You reach for ${sp.html} \u2014 your ${label} gutters like a dying candle. Not enough. (need ${need}, have ${have})`, 'system');
      return;
    }
    if (spellId) {
      const sp = _spell(spellId);
      _log(`${who} begins ${sp.text} but falters \u2014 drained of ${label}.`,
           `${who} begins ${sp.html} but falters \u2014 drained of ${label}.`, 'system');
      return;
    }
    log(`${who} reaches for magic and comes up empty.`, 'system');
  });

  world.on('spell:on-cooldown', ({ actor, spellId }) => {
    if (nameOfEntity(actor) !== 'You') return;
    const sp = _spell(spellId);
    _log(`The power for ${sp.text} hasn't gathered yet. Give it time.`,
         `The power for ${sp.html} hasn't gathered yet. Give it time.`, 'system');
  });

  world.on('spell:lifetap', ({ actor, hpSpent, manaGained }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log(`You open a vein and let your blood burn into mana. (-${hpSpent} HP, +${manaGained} MP)`, 'combat');
  });

  world.on('spell:fizzle', ({ actor, spellId, confused, reason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    const sp = _spell(spellId);
    if (confused) { _log(`Your thoughts scatter \u2014 ${sp.text} unravels in your hands.`, `Your thoughts scatter \u2014 ${sp.html} unravels in your hands.`, 'system'); return; }
    if (reason === 'silenced') { _log(`Your lips move but no sound comes. ${sp.text} dies on your tongue.`, `Your lips move but no sound comes. ${sp.html} dies on your tongue.`, 'system'); return; }
    if (reason === 'asleep') { _log(`You mumble ${sp.text} in your sleep... the magic slips away.`, `You mumble ${sp.html} in your sleep... the magic slips away.`, 'system'); return; }
    if (reason === 'stunned') { _log(`Your head rings. ${sp.text} fizzles before you can focus.`, `Your head rings. ${sp.html} fizzles before you can focus.`, 'system'); return; }
    if (reason === 'mindlocked') { _log(`Something grips your mind like a vice. ${sp.text} won't come.`, `Something grips your mind like a vice. ${sp.html} won't come.`, 'system'); return; }
    _log(`${sp.text} fizzles. The magic dissipates.`, `${sp.html} fizzles. The magic dissipates.`, 'system');
  });

  world.on(ResurrectionCast, (event) => {
    if (nameOfEntity(event.actor) !== 'You') return;
    if (event.fizzle) {
      const reason = event.reason === 'no_corpse'
          ? 'There is no suitable corpse there.'
          : event.reason === 'no_los'
            ? 'You cannot see the corpse clearly enough.'
            : event.reason === 'out_of_range'
              ? 'That corpse is beyond your reach.'
            : 'The resurrection fails.';
      log(reason, 'system');
      return;
    }
    log(`The corpse rises as a temporary undead servant (${event.durationTurns} turns).`, 'legendary');
  });

  world.on('spell:miscast', ({ actor, fromSpellId, toSpellId, confused }) => {
    if (nameOfEntity(actor) !== 'You') return;
    const fr = _spell(fromSpellId);
    const to = _spell(toSpellId);
    if (confused) { _log(`Your confusion twists ${fr.text} into ${to.text} \u2014 that's not what you meant!`, `Your confusion twists ${fr.html} into ${to.html} \u2014 that's not what you meant!`, 'danger'); return; }
    _log(`The magic warps \u2014 ${fr.text} becomes ${to.text}!`, `The magic warps \u2014 ${fr.html} becomes ${to.html}!`, 'danger');
  });

  // === Channeling events ===
  world.on('channeling:start', ({ actor, spellId }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (String(spellId || '').toLowerCase() === 'fishing') return;
    const sp = _spell(spellId);
    if (_playerHas('confused')) { _log(`You sway on your feet and fumble into ${sp.text}... was this the right spell?`, `You sway on your feet and fumble into ${sp.html}... was this the right spell?`, 'system'); return; }
    if (_playerHas('stunned')) { _log(`Your head throbs. Through the ringing, you force ${sp.text} to take shape...`, `Your head throbs. Through the ringing, you force ${sp.html} to take shape...`, 'system'); return; }
    if (_playerHas('blinded')) { _log(`Blind, you steady yourself and begin channeling ${sp.text} from memory...`, `Blind, you steady yourself and begin channeling ${sp.html} from memory...`, 'system'); return; }
    if (_playerHas('burning')) { _log(`Flames lick your skin \u2014 you grit your teeth and force ${sp.text} to gather...`, `Flames lick your skin \u2014 you grit your teeth and force ${sp.html} to gather...`, 'system'); return; }
    if (_playerHas('poisoned')) { _log(`Your stomach heaves. You choke down bile and begin channeling ${sp.text}...`, `Your stomach heaves. You choke down bile and begin channeling ${sp.html}...`, 'system'); return; }
    _log(`You plant your feet and begin channeling ${sp.text}...`, `You plant your feet and begin channeling ${sp.html}...`, 'system');
  });

  world.on('channeling:tick', ({ actor, spellId, mode, turnsRemaining, turnsTotal }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (mode === 'sustain') return;
    if (String(spellId || '').toLowerCase() === 'fishing') {
      const elapsed = Math.max(0, (turnsTotal || 0) - (turnsRemaining || 0));
      if (elapsed <= 1) log(`The bobber drifts... (${elapsed}/${turnsTotal || '?'})`, 'system');
      else if (turnsRemaining > 1) log(`The line twitches in the water. (${elapsed}/${turnsTotal || '?'})`, 'system');
      else log(`Something bites. Hold steady. (${elapsed}/${turnsTotal || '?'})`, 'system');
      return;
    }
    const elapsed = Math.max(0, (turnsTotal || 0) - (turnsRemaining || 0));
    const pct = turnsTotal ? Math.round((elapsed / turnsTotal) * 100) : 0;
    const confused = _playerHas('confused');
    if (pct < 30) log(confused ? `Power gathers... you think. (${elapsed}/${turnsTotal || '?'})` : `Power gathers... (${elapsed}/${turnsTotal || '?'})`, 'system');
    else if (pct < 70) log(confused ? `The air hums \u2014 or is that your head? (${elapsed}/${turnsTotal || '?'})` : `The air hums with building energy. (${elapsed}/${turnsTotal || '?'})`, 'system');
    else log(confused ? `The spell writhes in your grip \u2014 almost... almost! (${elapsed}/${turnsTotal || '?'})` : `Almost there \u2014 the spell strains to release! (${elapsed}/${turnsTotal || '?'})`, 'system');
  });

  world.on('channeling:cancelled', ({ actor, spellId, reason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (String(spellId || '').toLowerCase() === 'fishing') {
      if (reason === 'caster_moved') log('You move and the line goes slack.', 'system');
      else log('You stop fishing.', 'system');
      return;
    }
    if (reason === 'dead') { log('The channel dies with you.', 'combat'); }
    else if (reason === 'oom') { log('Your mana runs dry \u2014 the channel collapses in a shower of sparks.', 'system'); }
    else if (reason === 'silenced') { log('Silence falls over you. The channel shatters.', 'system'); }
    else if (reason === 'asleep') { log('You slump forward. The channel dissolves.', 'system'); }
    else if (reason === 'stunned') { log('A blow breaks your concentration \u2014 the channel snaps.', 'system'); }
    else if (reason === 'mindlocked') { log('Your mind seizes. The gathered energy scatters.', 'system'); }
    else if (reason === 'mana_full') { log('Mana floods back into you \u2014 you\u2019re full to the brim.', 'heal'); }
    else { log('Your concentration breaks. The channeled energy disperses.', 'system'); }
  });

  world.on('intent:blocked', ({ actor, reason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'stunned') { log('Your body won\u2019t obey. All you can do is wait for the ringing to stop.', 'system'); return; }
    if (reason === 'rooted') { log('Thorny vines dig into your boots \u2014 you\u2019re going nowhere!', 'system'); return; }
    log('You strain against invisible bonds. Nothing happens.', 'system');
  });

  world.on('spell:smite', ({ actor, fizzle }) => {
    if (!fizzle) return;
    if (nameOfEntity(actor) !== 'You') return;
    log('You call down holy wrath \u2014 but there\u2019s nothing to smite.', 'system');
  });

  world.on('spell:flash_heal', ({ actor, reason, amount }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'full_health' || Number(amount || 0) <= 0) {
      log('Healing light washes over you and finds nothing to mend.', 'system');
    }
  });

  world.on('spell:heal', ({ actor, reason, amount }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'full_health' || Number(amount || 0) <= 0) {
      log('The healing spell finds you whole. The magic fades, unused.', 'system');
    }
  });

  world.on('spell:learned', ({ actor, spellId }) => {
    const sp = _spell(spellId);
    _log(`The knowledge burns itself into your mind \u2014 you learn ${sp.text}!`,
         `The knowledge burns itself into your mind \u2014 you learn ${sp.html}!`, 'system');
  });

  world.on('spell:already-known', ({ actor, spellId }) => {
    const sp = _spell(spellId);
    _log(`You already know ${sp.text}. The text offers nothing new.`,
         `You already know ${sp.html}. The text offers nothing new.`, 'system');
  });

  world.on('spell:learn-denied', ({ actor, reason, need, have, spellId }) => {
    const sp = _spell(spellId);
    if (reason === 'intelligence') {
      _log(`The symbols for ${sp.text} swim before your eyes. Too complex. (need ${need} INT, have ${have})`,
           `The symbols for ${sp.html} swim before your eyes. Too complex. (need ${need} INT, have ${have})`, 'system');
    } else if (reason === 'unknown-spell') {
      log('The pages are covered in notation you\u2019ve never seen. Inscrutable.', 'system');
    } else {
      _log(`You can't learn ${sp.text}.`, `You can't learn ${sp.html}.`, 'system');
    }
  });

  world.on('spell:blink', ({ actor, randomized, randomReason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (randomized) {
      const why = randomReason === 'confused' ? 'confused' : 'hallucinating';
      log(`Reality tears open \u2014 but your ${why} mind picks the wrong spot!`, 'danger');
      return;
    }
    log('Space folds. You step through \u2014 and arrive.', 'system');
  });

  world.on('spell:blink:failed', ({ actor, reason, range }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'no_target') { log('Blink where? You need to pick a spot.', 'system'); return; }
    if (reason === 'out_of_range') { log(`Too far \u2014 blink only reaches ${Number(range || 10) | 0} tiles.`, 'system'); return; }
    if (reason === 'no_safe_landing') { log('Space folds... then snaps back. Something\u2019s in the way.', 'system'); return; }
    log('The blink misfires. You stay put.', 'system');
  });

  world.on('spell:phase_strike', ({ actor, hits, randomized, randomReason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (randomized) {
      const why = randomReason === 'confused' ? 'confused' : 'hallucinating';
      log(`You phase \u2014 but your ${why} mind drags you off-course!`, 'danger');
      return;
    }
    const hitCount = Array.isArray(hits) ? hits.length : 0;
    if (hitCount > 0) {
      log(`You flicker through ${hitCount === 1 ? 'one enemy' : hitCount + ' enemies'} \u2014 your blade draws blood from each!`, 'combat');
    } else {
      log('You phase to your mark. The air crackles where you were.', 'system');
    }
  });

  world.on('spell:phase_strike:failed', ({ actor, reason, range }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'no_target') { log('Phase Strike needs a destination.', 'system'); return; }
    if (reason === 'out_of_range') { log(`Too far for Phase Strike (${Number(range || 10) | 0} tile range).`, 'system'); return; }
    if (reason === 'no_safe_landing') { log('Phase Strike collapses \u2014 no room to materialize.', 'system'); return; }
    log('Phase Strike fizzles.', 'system');
  });

  world.on('spell:blind', ({ actor, targetId, fizzle, reason }) => {
    const who = nameOfEntity(actor);
    const tgt = nameOfEntity(targetId);
    if (fizzle) {
      if (who === 'You') {
        if (reason === 'no_los') log('You reach for their sight \u2014 but can\u2019t see them yourself.', 'system');
        else if (reason === 'out_of_range') log('Too far. The darkness won\u2019t stretch that far.', 'system');
        else log('You conjure darkness, but it finds no eyes to fill.', 'system');
      }
      return;
    }
    if (who === 'You') {
      log(`Inky darkness pours into ${tgt}'s eyes. They can't see.`, 'combat');
      const tni = compGet(Number(targetId || 0), NamedIdentity);
      if (String(tni?.identity || '') === 'floating_eye') {
        log("The Floating Eye's gaze dims \u2014 its power over you is broken!", 'combat');
      }
    } else if (tgt === 'You') {
      log(`${who} speaks a word of darkness \u2014 your vision goes black!`, 'danger');
    } else {
      log(`${who} strikes ${tgt} blind.`, 'combat');
    }
  });

  world.on('spell:rampage', ({ actor }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log('Red creeps into the edges of your vision. Blood rage takes hold.', 'combat');
  });

  world.on('spell:verdant_ward', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Living bark spirals up your arms. Sap seals the cracks. You are warded.', 'system');
  });

  world.on('spell:harmony_ward', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('A balanced ward settles over your skin \u2014 equal parts force and faith.', 'system');
  });

  world.on('spell:shadow_veil', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Your edges blur. Your shadow thins to nothing. You are invisible.', 'system');
  });

  world.on('spell:earthshatter', ({ actor, enhanced }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (enhanced) {
      log('You drive your fist into the stone \u2014 the floor splits and magma wells up from below!', 'danger');
    } else {
      log('You slam the ground \u2014 cracks race outward!', 'system');
    }
  });

  world.on('spell:entangle', ({ actor, targetId }) => {
    const who = nameOfEntity(actor);
    const whom = nameOfEntity(targetId);
    if (who === 'You') {
      log(`Thorny vines erupt from the floor and coil around ${whom} \u2014 held fast!`, 'combat');
    } else if (whom === 'You') {
      log(`Roots burst from the stone beneath you! ${who}'s vines pin you in place!`, 'danger');
    }
  });

  world.on('spell:thorn_burst', ({ actor, impacts }) => {
    const who = nameOfEntity(actor);
    const hitCount = Array.isArray(impacts) ? impacts.length : 0;
    if (who === 'You') {
      log(`Razor thorns erupt from your skin${hitCount > 1 ? ` \u2014 ${hitCount} enemies shredded!` : hitCount === 1 ? ' \u2014 one enemy shredded!' : '!'}`, 'combat');
    } else {
      log(`${who} bristles with thorns \u2014 they explode outward!`, 'danger');
    }
  });

  // Generator messages
  world.on('spell:savage_strike', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('A savage hit! The impact jolts stamina back into your limbs.', 'combat');
  });

  world.on('spell:natures_touch', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('Green energy pulses from the wound \u2014 nature replenishes you.', 'system');
  });

  world.on('spell:cheap_shot', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('A dirty hit below the belt \u2014 mana trickles back.', 'combat');
  });

  world.on('spell:arcane_bolt', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('Arcane energy rebounds from the impact and siphons back into you.', 'system');
  });

  world.on('spell:leech_spores', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('Parasitic spores latch onto the wound and drink deep \u2014 you feel the stolen vitality.', 'combat');
  });

  world.on('spell:holy_strike', ({ actor, hit }) => {
    if (nameOfEntity(actor) !== 'You' || !hit) return;
    log('Holy light flows from the wound back into you. Faith renewed.', 'system');
  });

  // Buff / Rotation ability messages
  world.on('spell:iron_flesh', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Your skin hardens to grey iron. You feel heavy \u2014 and invincible.', 'system');
  });

  world.on('spell:ignite_weapons', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Flames crawl up your blade and settle into a hungry edge.', 'combat');
  });

  world.on('spell:barkskin', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Bark creeps over your arms. Thorns push through the seams. You are armoured in living wood.', 'system');
  });

  world.on('spell:quicken', ({ actor }) => {
    if (nameOfEntity(actor) === 'You') log('Adrenaline hits like a freight train \u2014 the world slows to a crawl around you.', 'system');
  });

  world.on('spell:mark_of_death', ({ actor, targetId }) => {
    const who = nameOfEntity(actor);
    const whom = nameOfEntity(targetId);
    if (who === 'You') {
      log(`A black sigil sears itself into ${whom}'s flesh \u2014 every wound will cut twice as deep.`, 'combat');
    } else if (whom === 'You') {
      log(`${who} brands you with a mark of death! Pain amplified!`, 'danger');
    }
  });

  world.on('spell:primal_roar', ({ actor, affected }) => {
    if (nameOfEntity(actor) === 'You') {
      if (affected > 0) {
        log(`You roar from the gut \u2014 the sound hits like a wall. ${affected} ${affected > 1 ? 'enemies stagger' : 'enemy staggers'} back!`, 'combat');
      } else {
        log('You let out a primal roar. Savage fury floods through you!', 'system');
      }
    }
  });

  // Warden ability messages
  world.on('spell:war_cry', ({ actor, affected }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (affected > 0) {
      log(`Your war cry splits the air \u2014 ${affected} ${affected === 1 ? 'enemy flinches' : 'enemies flinch'}!`, 'combat');
    } else {
      log('You bellow into the dark. Only echoes answer.', 'system');
    }
  });

  world.on('spell:cleave', ({ actor, hits }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (hits && hits.length > 0) {
      log(`Your weapon arcs through ${hits.length} ${hits.length === 1 ? 'body' : 'bodies'} in a single stroke!`, 'combat');
    } else {
      log('Your weapon sweeps through empty air.', 'system');
    }
  });

  world.on('spell:bloodthirst', ({ actor }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log('Hunger stirs in your veins. Every wound you deal will feed you.', 'combat');
  });

  world.on('proc:bloodthirst', ({ actor, healed }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log(`Warm strength flows back from the wound. (+${healed} HP)`, 'heal');
  });

  // Cleric ability messages
  world.on('spell:purify', ({ actor, removed }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (removed > 0) {
      log(`Holy light scours through you \u2014 ${removed} ${removed === 1 ? 'affliction burns' : 'afflictions burn'} away!`, 'heal');
    } else {
      log('You invoke purification. The light finds you clean.', 'system');
    }
  });

  world.on('spell:divine_shield', ({ actor }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log('A shell of golden light crystallizes around you. Nothing is getting through.', 'system');
  });

  world.on('spell:consecrate', ({ actor }) => {
    if (nameOfEntity(actor) !== 'You') return;
    log('Holy fire erupts from the ground at your feet \u2014 the stone itself glows white-hot.', 'system');
  });

  // Outlaw ability messages
  world.on('spell:smoke_bomb', ({ actor, affected }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (affected > 0) {
      log(`Smoke billows out \u2014 you vanish! ${affected} ${affected === 1 ? 'enemy loses' : 'enemies lose'} track of you.`, 'combat');
    } else {
      log('You pop a smoke bomb. Nobody around to fool.', 'system');
    }
  });

  world.on('spell:poison_blade', ({ actor, fizzle, weaponName, charges }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (fizzle) { log('You reach for a weapon to coat \u2014 your hands are empty.', 'system'); }
    else { log(`You drag venom along your ${weaponName}'s edge. It glistens. (${charges} charges)`, 'combat'); }
  });

  world.on('spell:scorch', ({ actor, fizzle, missed, critical }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (fizzle) { log('You snap your fingers. No spark, no target. Nothing.', 'system'); return; }
    if (missed) { log('Your scorch streaks wide \u2014 heat shimmer on stone.', 'system'); return; }
    if (critical) { log('Your scorch catches them dead-on \u2014 flesh sizzles!', 'combat'); return; }
    log('Your scorch connects. Smoke rises.', 'combat');
  });

  world.on('spell:plague_swarm', ({ actor, fizzle, missed }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (fizzle) { log('Insects buzz around your hands and disperse. No host to feed on.', 'system'); return; }
    if (missed) { log('The swarm veers wide \u2014 the insects scatter!', 'system'); return; }
    log('You unleash a plague swarm! Chitinous bodies pour from your hands!', 'combat');
  });

  world.on('spell:plague_swarm:jump', () => {
    log('The swarm abandons the husk and leaps to fresh meat!', 'combat');
  });

  world.on('spell:fireball', ({ actor, fizzle, missed }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (fizzle) { log('You shape the flame but there\u2019s nothing to throw it at.', 'system'); return; }
    if (missed) { log('Your fireball goes wide \u2014 it detonates against stone!', 'system'); return; }
    log('You compress fire between your palms and hurl it!', 'combat');
  });

  world.on('spell:meteor', ({ actor, randomized, randomReason }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (randomized) {
      const why = randomReason === 'confused' ? 'confused' : 'hallucinating';
      log(`You call the meteor down \u2014 your ${why} mind pulls it off-target!`, 'danger');
    }
  });

  world.on('spell:meteor:failed', ({ actor, reason, range }) => {
    if (nameOfEntity(actor) !== 'You') return;
    if (reason === 'no_target') { log('You reach skyward \u2014 but where should the meteor fall?', 'system'); return; }
    if (reason === 'out_of_range') { log(`Too far to call a meteor. (${Number(range || 12) | 0} tile range)`, 'system'); return; }
    if (reason === 'blocked_los') { log('You can\u2019t see the target \u2014 the meteor has nowhere to aim.', 'system'); return; }
    log('The sky stays empty. The meteor doesn\u2019t come.', 'system');
  });

  function installStormFailureMessage(eventName, spellName) {
    world.on(eventName, ({ actor, reason, range }) => {
      if (nameOfEntity(actor) !== 'You') return;
      if (reason === 'no_target') { log(`You reach for ${spellName} \u2014 but where should it strike?`, 'system'); return; }
      if (reason === 'out_of_range') { log(`Too far for ${spellName}. (${Number(range || 10) | 0} tile range)`, 'system'); return; }
      if (reason === 'blocked_los') { log(`You can't see the target. ${spellName} needs line of sight.`, 'system'); return; }
      log(`${spellName} fizzles. The magic scatters.`, 'system');
    });
  }

  installStormFailureMessage('spell:blizzard:failed', 'Blizzard');
  installStormFailureMessage('spell:firestorm:failed', 'Firestorm');
}
