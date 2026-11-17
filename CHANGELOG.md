# Changelog

## 1.0.0
Rebuild of Effect Select for Foundry v14.
- Attribute Key fields get a searchable dropdown: type to filter by key or name, or click the caret to browse every key grouped by section.
- Keys come from the system's data models (any system), with names from field labels and system config (e.g. *Abilities › Strength › Score*).
- Targets the right document: the owning actor's own keys, every actor type for unowned items (with *Only …* tags), item keys for D&D 5e enchantments.
- D&D 5e: `flags.dnd5e.*` Special Traits flags; works in the dnd5e change dialog.
- Keyboard: arrows, Page Up/Down, Enter/Tab to pick, Esc to close. Hover the field for the key's name.
- *Used in this world* group: keys that world effects already use but the system doesn't define (e.g. other modules' flags), with a use count. Can be turned off.
- `effectSelect.keys` hook and `api` for other modules. Roll Messages for D&D 5e 2.1.0 uses it.
