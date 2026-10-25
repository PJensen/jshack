// Target selection is presentation; confirmed activations enter the rules dispatcher.
import { NamedIdentity } from '../../rules/components/NamedIdentity.js';
import { getCatalogItem } from '../../rules/data/itemCatalog.js';
import { makeRulesDispatcher } from '../input/rulesDispatch.js';

export function createContentAbilityController({ world, targeting, playerEntity, scanVisibleEnemies }) {
  return function requestItemAbility(itemId, requestedAbilityId = '') {
    const identity = world.get(itemId, NamedIdentity)?.identity || '';
    const def = getCatalogItem(identity);
    const abilityId = requestedAbilityId || (def?._contentDefaultAbility ? Object.keys(def._contentAbilities || {})[0] : '');
    if (!abilityId) return false;
    const spec = def?._contentAbilities?.[abilityId];
    if (!spec) return false;
    const player = playerEntity();
    if (!player) return true;
    const dispatch = makeRulesDispatcher(world, () => player.id);
    const activate = (targetId) => dispatch({ type: 'rules.useItem', payload: { itemId, abilityId, targetId } });
    if (spec.targeting === 'none') {
      activate(player.id);
      return true;
    }
    if (spec.targeting === 'enemy') {
      const enemies = scanVisibleEnemies(world, player.pos.x | 0, player.pos.y | 0, spec.range, { playerId: player.id });
      if (!enemies.length) {
        world.emit('message', { text: 'No visible enemies in range.', type: 'system' });
        return true;
      }
      targeting.openEnemyTargeting({
        spellId: `__content_${identity}_${abilityId}__`,
        spellName: `${world.get(itemId, NamedIdentity)?.name || identity} — ${spec.name}`,
        range: spec.range,
        enemies,
        onConfirm: activate,
      });
      return true;
    }
    // Ally selection has no UI surface yet; headless rules callers can supply it.
    return true;
  };
}
