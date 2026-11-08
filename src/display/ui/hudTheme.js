// Shared chrome and sizing for the viewport HUD (not modal panels).
export const HUD_GAP = '6px';
export const HUD_MARGIN = '8px';
export const HUD_COLUMNS = 'repeat(3, minmax(0, 1fr))';
export const HUD_PANEL_STYLE = Object.freeze({
  minWidth: '0',
  boxSizing: 'border-box',
  border: '1px solid rgba(214,178,91,0.78)',
  borderRadius: '12px',
  background: 'linear-gradient(180deg, rgba(28,29,30,0.97), rgba(12,12,13,0.97))',
  boxShadow: '0 3px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,240,180,0.10)',
});
