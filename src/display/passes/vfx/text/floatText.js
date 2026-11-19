// src/display/passes/vfx/text/floatText.js
// Floating text manager (display-only). Draws in world space under camera transform.
// Two presets: 'damage' (punchy, WoW-like) and 'gold' (boring linear up).

/** @typedef {{
 *  x:number,y:number,x0:number,y0:number,text:string,color:string,
 *  life:number, ttl:number,
 *  vx:number, vy:number,
 *  scaleStart:number, scaleEnd:number,
 *  batch:boolean, value:number|null, sign:number, justSpawned:boolean,
 *  flavor:'damage'|'gold'|'heal'|'status'|'banner'|'custom', crit?:boolean,
 *  delay:number
 * }} FTItem */
/** @typedef {{
 *  flavor?: 'damage'|'gold'|'heal'|'status'|'banner'|'custom',
 *  color?: string,
 *  life?: number,
 *  scaleBase?: number,
 *  dmg?: number,
 *  scaleStart?: number,
 *  scaleEnd?: number,
 *  crit?: boolean,
 *  delay?: number
 * }} FTOptions */

export class FloatText {
  constructor(opts={}){
    /** @type {FTItem[]} */
    this.fct = [];
    this._now = 0;
    this._last = 0;
    // Defaults per flavor
    this.defaults = {
      damage: { life: 0.9, color: '#ffd966', scaleBase: 1.0 },
      gold:   { life: 0.8, color: '#c37f09', scaleBase: 1.0 },
      heal:   { life: 0.9, color: '#7BFF7B', scaleBase: 1.0 },
      status: { life: 0.7, color: '#c0c8d0', scaleBase: 1.0 },
      banner: { life: 1.4, color: '#ffffff', scaleBase: 1.0 },
    };
  }

  /** Add floating text in world coords (tile units)
   *  @param {number} x
   *  @param {number} y
   *  @param {string|number} text
   *  @param {FTOptions} [opts]
   */
  add(x, y, text, opts={}){
    const flavor = (/** @type {FTOptions} */(opts).flavor || 'custom');
    const base = /** @type {any} */(this.defaults)[flavor] || { life: 0.9, color: '#ffffff', scaleBase: 1.0 };
    const life = Number(opts.life || base.life || 0.9);

    // Damage preset: punchy pop, non-linear easing, drift
  const isDamage = flavor === 'damage';
  const isGold = flavor === 'gold';
  const isHeal = flavor === 'heal';
  const isStatus = flavor === 'status';
  const isBanner = flavor === 'banner';

  const crit = !!(opts.crit);
    const scaleBase = (opts.scaleBase || base.scaleBase || 1.0) * (crit ? 1.3 : 1.0);
  const dmg = Number((opts.dmg) || 0);
    const magScale = dmg ? Math.min(2.2, 0.9 + Math.abs(dmg) / 12) : 1;
    const scaleStart = Number(opts.scaleStart || (isDamage ? (scaleBase * magScale) : (scaleBase * 1.0)));
    const scaleEnd = Number(opts.scaleEnd || (isDamage ? (0.75 * scaleBase) : (0.9 * scaleBase)));

    // Batching of numeric values at same tile and same sign within a 150ms window
    const isNumber = /^[-+]?\d+$/.test(String(text));
    if (isNumber){
      const sign = String(text).trim().startsWith('-') ? -1 : 1;
      const existing = this.fct.find(p=>p.batch && p.x0===x && p.y0===y && p.sign===sign && (p.justSpawned || (p.life - p.ttl) < 0.15));
      if (existing){
        const val = parseInt(String(text),10) | 0;
        existing.value = (existing.value || 0) + val;
        existing.text = (sign>0?'+':'') + String(existing.value);
        // Recompute scaling with new magnitude — re-pop effect
        const ndmg = Math.abs(existing.value|0);
        const nMagScale = Math.min(2.2, 0.9 + ndmg / 12);
        existing.scaleStart = Math.max(existing.scaleStart, scaleBase * nMagScale);
        // Re-pop: reset lifetime so the combined number gets a fresh punch
        existing.ttl = existing.life;
        return existing;
      }
    }

    // Velocities (world units/sec)
    let vx = 0, vy = 0;
    if (isDamage){
      // Crits: big pop with wide spread. Normal: punchy burst with hard brake.
      if (crit) {
        vy = -1.1 - Math.random() * 0.5;
        vx = (Math.random() * 0.9 - 0.45);
      } else {
        vy = -0.8 - Math.random() * 0.3;
        vx = (Math.random() * 0.5 - 0.25);
      }
    } else if (isGold) {
      vy = -0.6;
      vx = 0;
    } else if (isHeal) {
      vy = -0.55;
      vx = 0;
    } else if (isStatus || isBanner) {
      vy = -0.5;
      vx = 0;
    } else {
      vy = -0.5; vx = 0;
    }

    /** @type {FTItem} */
    const rec = {
      x, y, x0:x, y0:y, text: String(text),
  color: String((opts.color) || base.color || '#ffffff'),
      life, ttl: life,
      vy, vx,
      scaleStart, scaleEnd,
      batch: isNumber,
      value: isNumber ? (parseInt(String(text),10)|0) : null,
      sign: isNumber ? (String(text).trim().startsWith('-')?-1:1) : 0,
      justSpawned: true,
      flavor: (isDamage?'damage':(isGold?'gold':(isHeal?'heal':(isStatus?'status':(isBanner?'banner':'custom'))))),
      crit,
      delay: Math.max(0, Number(opts.delay || 0)),
    };
    // Delayed entries must not batch with immediate ones
    if (rec.delay > 0) rec.justSpawned = false;
    this.fct.push(rec);
    return rec;
  }

  /** Convenience helpers */
  /** @param {number} x @param {number} y @param {number} amount @param {FTOptions} [opts] */
  addDamage(x,y,amount, opts={}){
    const text = '-' + Math.max(0, Math.floor(Math.abs(amount)||0));
    return this.add(x,y,text,{...opts, flavor:'damage', dmg: Math.abs(amount)||0, color: ((opts && opts.color) || '#ffd966')});
  }
  /** @param {number} x @param {number} y @param {number} count @param {FTOptions} [opts] */
  addGold(x,y,count, opts={}){
    const text = '+' + Math.max(0, Math.floor(Math.abs(count)||0)) + 'g';
    return this.add(x,y,text,{...opts, flavor:'gold', color: ((opts && opts.color) || '#f0a830')});
  }
  /** @param {number} x @param {number} y @param {number} amount @param {FTOptions} [opts] */
  addHeal(x,y,amount, opts={}){
    const text = '+' + Math.max(0, Math.floor(Math.abs(amount)||0)) + (opts.crit ? '!' : '');
    // proportional to damage — no longer oversized
    const o = /** @type {FTOptions} */({ flavor:'heal', color: ((opts && opts.color) || '#7BFF7B'), scaleStart: 0.78, scaleEnd: 0.65 });
    return this.add(x,y,text, /** @type {FTOptions} */({ ...opts, ...o }));
  }
  /** Add a status/miss/immune style text
   *  @param {number} x @param {number} y @param {string} text
   *  @param {{ style?: 'miss'|'immune'|'status', color?:string } & FTOptions} [opts]
   */
  addStatus(x,y,text, opts={}){
    const style = /** @type any */(opts).style || 'status';
    let color = (opts && opts.color) || undefined;
    if (!color) {
      if (style === 'miss') color = '#c0c8d0';
      else if (style === 'immune') color = '#76e9ff';
      else color = '#c47bff'; // generic status
    }
    const base = /** @type {FTOptions} */({ flavor:'status', color, scaleStart: 1.02, scaleEnd: 0.98, life: 0.8 });
    return this.add(x,y,String(text||''), /** @type {FTOptions} */({ ...base, ...opts, flavor: 'status', color: (opts && opts.color) || color }));
  }
  /** Add large banner-style text for major events.
   *  @param {number} x @param {number} y @param {string} text
   *  @param {FTOptions} [opts]
   */
  addBanner(x, y, text, opts = {}){
    const base = /** @type {FTOptions} */({ flavor: 'banner', color: ((opts && opts.color) || '#ffe27a'), scaleStart: 1.4, scaleEnd: 1.0, life: 1.6 });
    return this.add(x, y, String(text || ''), /** @type {FTOptions} */({ ...base, ...opts, flavor: 'banner', color: (opts && opts.color) || base.color }));
  }

  /** @param {number} dt */
  step(dt){
    this._last = this._now;
    this._now += Math.max(0, Number(dt)||0);
    if (!this.fct.length) return;
    for (const p of this.fct){
      // Delayed entries count down before becoming active
      if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; }
      p.ttl -= dt;
      p.justSpawned = false;
      // motion
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // drag for damage flavor — punch up then brake hard
      if (p.flavor === 'damage'){
        p.vx *= 0.92; p.vy *= 0.94;
      }
    }
    for (let i=this.fct.length-1;i>=0;i--){ const it = this.fct[i]; if (!it || it.ttl <= 0) this.fct.splice(i,1); }
  }

  // Render under camera transform in world units. Uses current ctx transform scale for sizing.
  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx){
    if (!this.fct.length) return;
    // We render in world units (camera already applied). Font size should be specified in world units.
    // Canvas font uses CSS px pre-transform; with camera scale applied, 1px of font == 1 world unit on screen.
    // Therefore we choose a small fontPx in CSS to achieve ~0.8 world-units height (no extra tilePx factor!).
    const m = (typeof ctx.getTransform === 'function') ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
    const worldFontPx = 0.9; // ~0.9 world units tall
    const smallFontPx = 0.32; // smaller for non-damage text
    for (const p of this.fct){
      if (p.delay > 0) continue; // still waiting
      const t = Math.max(0, Math.min(1, 1 - p.ttl / Math.max(1e-6, p.life)));
      // Non-linear punch for damage, linear for gold
  /** @param {number} u */
  const easeOutBack = (u)=>{ const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(u-1,3) + c1*Math.pow(u-1,2); };
      let ease = t;
      if (p.flavor === 'damage') ease = easeOutBack(t);
      else if (p.flavor === 'heal' || p.flavor === 'status' || p.flavor === 'banner') {
        // gentle quad ease
        ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
      }
      const scale = p.scaleStart + (p.scaleEnd - p.scaleStart) * ease;
      const alpha = (p.flavor==='damage') ? (1 - t) : (1 - t*0.9);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);
      // Keep text upright and roughly tile-sized
      const fontPx = (p.flavor === 'damage' || p.flavor === 'gold' || p.flavor === 'heal' || p.flavor === 'banner') ? worldFontPx : smallFontPx;
      ctx.font = `${fontPx}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
      // subtle drop shadow for contrast
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 1.25;
      ctx.fillStyle = p.color || '#ffffff';
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
}

export function makeFloatText(){ return new FloatText(); }
