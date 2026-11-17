# Effect Select

Adds a searchable dropdown to the **Attribute Key** field of Active Effect changes. Start typing and it suggests matching keys from the game system's own data, each with a readable name.

## Using it
- **Type to search**: matches the key *or* its name, and every word must match. `str save` finds `system.abilities.str.bonuses.save`; `walk` finds `system.attributes.movement.walk`.
- **Browse**: click the caret in the field (or press ↓ in an empty field) to see every key, grouped by section.
- **Keyboard**: ↑/↓ and Page Up/Down move, **Enter** or **Tab** picks the highlighted key, **Esc** closes.
- Hover the field to see the readable name of the key it holds.
- Any key you type is still saved, even if it isn't in the list.

## Where the keys come from
Keys are read from the system's data models, so the list always matches the installed system version.
- **Effect on an actor, or on an item an actor owns**: that actor's keys, including its own entries (e.g. extra tools or custom skills).
- **Effect on an unowned item**: keys for every actor type. Keys a Player Character doesn't have are tagged (e.g. *Only Non-Player Character*).
- **Enchantments (D&D 5e)**: item keys for every item type, plus `name` and `img`.
- **System flags** (D&D 5e Special Traits such as Elven Accuracy): `flags.dnd5e.*` with their names.
- **Modules that support Effect Select** add their own keys with names (e.g. Roll Messages for D&D 5e: `flags.roll-messages.save.dex`).
- **Used in this world**: any other key that effects on world actors and items already use, such as another module's flags, is listed in its own group with how often it's used. Turn this off in the settings if you don't want it.

Works in the core Active Effect sheet and in D&D 5e's change dialog (the pen button on a change). Change types that already have a fixed key list (D&D 5e roll changes) keep their own dropdown.

## Settings (per player)
- **Open list on focus**: show the list when you click into an empty field.
- **Show labels in the field**: hover tooltip with the key's name.
- **List keys used in this world**: include the *Used in this world* group.

## For module authors
Add or adjust keys with the `effectSelect.keys` hook:

```js
Hooks.on("effectSelect.keys", (keys, { effect, documentName, types }) => {
  if ( documentName === "Actor" ) keys.push({
    key: "flags.my-module.bonus", label: "My Module › Bonus", group: "My Module"
  });
});
```

`game.modules.get("effect-select").api` exposes `getKeys(effect)`, `clearCache()` and `KeyPicker`.
