/**
 * Builds the list of attribute keys an Active Effect can target, by walking the
 * system's data models (or template data for older systems).
 */

/**
 * @typedef {object} KeyEntry
 * @property {string} key      Full attribute key, e.g. "system.abilities.str.value".
 * @property {string} label    Readable path, e.g. "Abilities › Strength › Score".
 * @property {string} group    Top-level section, used for headers when browsing.
 * @property {string} [note]   Extra tag, e.g. which document types have the key.
 */

import { MODULE_ID } from "./constants.mjs";

const SEP = " › ";

/** Cache for targets that do not depend on a specific document. */
const cache = new Map();

/** Keys used by effects in this world, by target: { Actor: Map<key, count>, Item: ... }. */
let worldKeys = null;

/** Drop the caches (after effects change, or a system or module changes its config). */
export function clearCache() {
  cache.clear();
  worldKeys = null;
}

/**
 * Get the keys for the document an effect's changes apply to.
 * @param {ActiveEffect} effect
 * @returns {KeyEntry[]}
 */
export function getKeys(effect) {
  const target = resolveTarget(effect);
  if ( target.doc ) return build(effect, target);
  const id = `${target.documentName}:${target.types.join(",")}`;
  if ( !cache.has(id) ) cache.set(id, build(effect, target));
  return cache.get(id);
}

/**
 * Work out what document type(s) the effect will modify.
 * - Enchantments (dnd5e) modify items.
 * - Effects on an actor, or on an item owned by one, modify that actor.
 * - Anything else (sidebar items, compendium items) could land on any actor type;
 *   the system's first type (e.g. Player Character) is treated as the main one.
 */
function resolveTarget(effect) {
  if ( effect.type === "enchantment" ) {
    return { documentName: "Item", doc: null, types: documentTypes("Item") };
  }
  const parent = effect.parent;
  const actor = parent?.documentName === "Actor" ? parent : parent?.actor;
  if ( actor ) return { documentName: "Actor", doc: actor, types: [actor.type] };
  return { documentName: "Actor", doc: null, types: documentTypes("Actor") };
}

function documentTypes(documentName) {
  const types = game.documentTypes?.[documentName] ?? Object.keys(CONFIG[documentName]?.dataModels ?? {});
  return types.filter(t => t !== CONST.BASE_DOCUMENT_TYPE);
}

/** Localize a string if it's a key, otherwise return it unchanged. */
function loc(str) {
  return str ? game.i18n.localize(str) : "";
}

function systemConfig() {
  return CONFIG[game.system.id.toUpperCase()] ?? CONFIG[game.system.id] ?? {};
}

function typeLabel(documentName, type) {
  return loc(CONFIG[documentName]?.typeLabels?.[type]) || type;
}

/* -------------------------------------------- */

function build(effect, { documentName, doc, types }) {
  /** @type {Map<string, KeyEntry & {types: Set<string>}>} */
  const entries = new Map();
  const add = (key, labels, group, type) => {
    let entry = entries.get(key);
    if ( !entry ) {
      const clean = labels.filter((l, i) => l && l !== labels[i - 1]);
      entry = { key, label: clean.join(SEP), group: group || clean[0] || key, types: new Set() };
      entries.set(key, entry);
    }
    entry.types.add(type);
  };

  for ( const type of types ) {
    const model = CONFIG[documentName]?.dataModels?.[type];
    const data = (doc?.type === type) ? doc._source.system : initialData(documentName, type, model);
    const out = (key, labels) => add(key, labels, labels[0], type);
    walk(model?.schema ?? null, data, "system", [], out);

    // System flags offered on the actor's Special Traits (dnd5e and similar).
    if ( documentName === "Actor" ) {
      for ( const [k, cfg] of Object.entries(systemConfig().characterFlags ?? {}) ) {
        add(`flags.${game.system.id}.${k}`, [loc(cfg.name) || k], loc(cfg.section) || loc("EFFECTSELECT.Flags"), type);
      }
    }
  }

  // Enchantments commonly rename or re-skin the item.
  if ( documentName === "Item" ) {
    for ( const type of types ) {
      add("name", [loc("EFFECTSELECT.Name")], loc("EFFECTSELECT.Document"), type);
      add("img", [loc("EFFECTSELECT.Image")], loc("EFFECTSELECT.Document"), type);
    }
  }

  // Tag keys the primary type (e.g. Player Character) doesn't have, so NPC-only keys stand out.
  let list = Array.from(entries.values(), ({ types: has, ...entry }) => {
    if ( (types.length > 1) && !has.has(types[0]) ) {
      const names = Array.from(has, t => typeLabel(documentName, t)).join(", ");
      entry.note = game.i18n.format("EFFECTSELECT.OnlyFor", { types: names });
    }
    return entry;
  });

  // Let other modules add or adjust keys: push/splice into the array.
  Hooks.callAll("effectSelect.keys", list, { effect, documentName, types, document: doc });
  list = list.filter(e => e?.key);

  // Anything else effects in this world already use (module flags and the like).
  if ( game.settings.get(MODULE_ID, "worldKeys") ) {
    const known = new Set(list.map(e => e.key));
    const group = loc("EFFECTSELECT.UsedInWorld");
    for ( const [key, count] of scanWorld()[documentName] ?? [] ) {
      if ( known.has(key) ) continue;
      list.push({ key, label: usedKeyLabel(key), group, note: game.i18n.format("EFFECTSELECT.UsedCount", { count }) });
    }
  }
  return list.sort((a, b) => a.key.localeCompare(b.key));
}

/* -------------------------------------------- */

/**
 * Count the change keys of every effect on world actors, their items, and sidebar items.
 * Enchantments are filed under Item, everything else under Actor.
 */
function scanWorld() {
  if ( worldKeys ) return worldKeys;
  const found = { Actor: new Map(), Item: new Map() };
  const visit = effect => {
    const target = (effect.type === "enchantment") ? found.Item : found.Actor;
    for ( const change of effect.system?.changes ?? effect.changes ?? [] ) {
      const key = change?.key?.trim();
      if ( key ) target.set(key, (target.get(key) ?? 0) + 1);
    }
  };
  for ( const actor of game.actors ?? [] ) {
    actor.effects.forEach(visit);
    actor.items.forEach(item => item.effects.forEach(visit));
  }
  for ( const item of game.items ?? [] ) item.effects.forEach(visit);
  worldKeys = found;
  return found;
}

/** "flags.roll-messages.save.dex" → "Roll Messages › Save › Dex". */
function usedKeyLabel(key) {
  const parts = key.split(".");
  const labels = [];
  if ( (parts[0] === "flags") && parts[1] ) {
    const pkg = (parts[1] === game.system.id) ? game.system : game.modules.get(parts[1]);
    labels.push(pkg?.title ?? parts[1]);
    parts.splice(0, 2);
  }
  else if ( parts[0] === "system" ) parts.shift();
  labels.push(...parts.map(humanize));
  return labels.join(SEP);
}

/** Default source data for a document type, so mapping fields have their initial keys. */
function initialData(documentName, type, model) {
  if ( model?.schema ) {
    try { return model.schema.getInitialValue({}); } catch {}
  }
  return foundry.utils.deepClone(game.model?.[documentName]?.[type] ?? {});
}

/* -------------------------------------------- */

/**
 * Walk a schema field and its data together, reporting each leaf key.
 * @param {DataField|null} field
 * @param {*} value
 * @param {string} path
 * @param {string[]} labels
 * @param {(key: string, labels: string[]) => void} out
 */
function walk(field, value, path, labels, out) {
  const { SchemaField, TypedObjectField, ArrayField, ObjectField } = foundry.data.fields;
  const isObject = foundry.utils.getType(value) === "Object";

  // Arrays and sets are changed as a whole (Add appends to them).
  if ( field instanceof ArrayField ) return out(path, labels);

  if ( field instanceof SchemaField ) {
    for ( const [k, child] of Object.entries(field.fields) ) {
      walk(child, value?.[k], `${path}.${k}`, [...labels, fieldLabel(child, k)], out);
    }
    return;
  }

  // Mapping fields: one branch per entry (abilities.str, skills.acr, ...), from the data
  // plus the field's initial keys, so empty mappings (dnd5e movement speeds) still list them.
  if ( field instanceof TypedObjectField ) {
    const initial = field.options?.initialKeys;
    const keys = new Set([
      ...(isObject ? Object.keys(value) : []),
      ...(Array.isArray(initial) ? initial : Object.keys(initial ?? {}))
    ]);
    for ( const k of keys ) {
      const v = value?.[k];
      walk(field.element, v, `${path}.${k}`, [...labels, entryLabel(field, k, v)], out);
    }
    return;
  }

  // Free-form objects (or template.json data with no schema): follow the data itself.
  if ( (!field || (field instanceof ObjectField)) && isObject && !foundry.utils.isEmpty(value) ) {
    for ( const [k, v] of Object.entries(value) ) {
      walk(null, v, `${path}.${k}`, [...labels, humanize(k)], out);
    }
    return;
  }

  if ( field || (value !== undefined) ) out(path, labels);
}

function fieldLabel(field, key) {
  const label = loc(field.label);
  return (label && (label !== key)) ? label : humanize(key);
}

/** "spellDC" → "Spell DC", "roll" → "Roll". */
function humanize(key) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

/** Name a mapping entry from the system config, e.g. abilities.str → "Strength". */
function entryLabel(field, key, value) {
  const initial = field.options?.initialKeys;
  const fromConfig = systemConfig()[field.name]?.[key] ?? (Array.isArray(initial) ? null : initial?.[key]);
  const label = (typeof fromConfig === "string") ? fromConfig : (fromConfig?.label ?? fromConfig?.name);
  return loc(label) || (typeof value?.label === "string" && value.label) || humanize(key);
}
