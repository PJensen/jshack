// src/content/index.js
// Public API for the content authoring DSL.
//
// Content authors import from here:
//   import { defineItem, defineMonster, defineInteractable } from '../content/index.js';
//
// Engine startup calls installContent() once after all content is loaded:
//   import { installContent } from '../content/index.js';

export { defineItem, defineMonster, defineEncounter, defineInteractable } from './define.js';
export { installContent } from './install.js';
export { installContentVfxWiring } from './vfxWiring.js';
export { ScriptCtx, compileHook } from './scriptCtx.js';
export { clearContentRegistry } from './registry.js';
