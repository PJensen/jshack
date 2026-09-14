# Ratatoskr State Machine

Ratatoskr is a mythic messenger, not a resident town NPC. His
`norse:ratatoskr` encounter starts inactive and is activated by a relevant
starter quest completion. Once activated, he starts offstage, appears near the
player when the world has an omen to report, offers a compact interaction, then
vanishes several turns later. The encounter owns eligibility; this state
machine owns his roaming lifecycle.

```mermaid
stateDiagram-v2
  [*] --> Dormant

  Dormant --> Appearing: quest completed / timed omen
  Appearing --> Present: teleport near player
  Present --> Conversing: player interacts
  Conversing --> CoolingOff: dialog closes
  Present --> CoolingOff: future ignored-time trigger
  CoolingOff --> Vanishing: vanish turn expires
  Vanishing --> Dormant: puff + teleport away

  Dormant: no Position component
  Present: compact bubble dialog
  CoolingOff: vanishTurn is scheduled
```
