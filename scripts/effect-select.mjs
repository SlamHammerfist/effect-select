import { MODULE_ID, KEY_INPUT } from "./constants.mjs";
import { getKeys, clearCache } from "./keys.mjs";
import KeyPicker from "./picker.mjs";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "openOnFocus", {
    name: "EFFECTSELECT.Settings.OpenOnFocus.Name",
    hint: "EFFECTSELECT.Settings.OpenOnFocus.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "showLabels", {
    name: "EFFECTSELECT.Settings.ShowLabels.Name",
    hint: "EFFECTSELECT.Settings.ShowLabels.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, "worldKeys", {
    name: "EFFECTSELECT.Settings.WorldKeys.Name",
    hint: "EFFECTSELECT.Settings.WorldKeys.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => clearCache()
  });

  game.modules.get(MODULE_ID).api = { getKeys, clearCache, KeyPicker };
});

// Modules that register config late (e.g. new flags) get picked up.
Hooks.once("ready", clearCache);

// Keys used in the world change whenever effects (or documents holding them) do.
for ( const hook of [
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
  "createItem", "deleteItem", "createActor", "deleteActor"
] ) Hooks.on(hook, () => clearCache());

/**
 * Any ApplicationV2 editing an Active Effect: the core sheet, the dnd5e sheet's
 * change dialog, and system or module sheets built on either.
 */
Hooks.on("renderApplicationV2", (app, element) => {
  KeyPicker.prune();
  const effect = app.document ?? app.options?.document;
  if ( effect?.documentName !== "ActiveEffect" ) return;

  for ( const input of element.querySelectorAll("input") ) {
    if ( !KEY_INPUT.test(input.name) || ("effectSelect" in input.dataset) ) continue;
    if ( !["text", "search", ""].includes(input.getAttribute("type") ?? "") ) continue;
    if ( input.disabled || input.readOnly ) continue;
    new KeyPicker(input, () => getKeys(effect));
  }
});
