import { defineItem } from '../define.js';

defineItem('patient_thunder', {
  name: 'Patient Thunder',
  type: 'weapon',
  glyph: ')',
  color: '#9ed8ff',
  glow: '#5bbcff',
  scale: 0.8,
  weight: 2.0,
  value: 320,
  rarity: 'epic',
  material: 'steel',
  description: 'A storm-forged blade that grows louder in stillness.',
  tags: ['storm', 'electric'],
  bonuses: { attack: 2, accuracy: 1, damagePower: 1, electricOhms: 2 },
  damageDice: '1d7',
  damageType: 'slash',
  staminaCost: 9,
  maxSockets: 1,
  procPackages: ['patientThunder'],
  state: { patience: 0, maxPatience: 3 },
  presentations: {
    discharge: {
      sound: 'thunder_crack',
      vfx: [{ type: 'burst', color: '#9ed8ff', count: 8, speed: 1.8, life: 0.35 }],
      message: 'Patient Thunder discharges {patience} waiting turns of storm!',
      messageType: 'good',
    },
  },
});
