import { MODULE_ID } from "./constants.mjs";

const LIMIT = 300;

/**
 * Attaches a searchable key list to a text input. One dropdown element is shared
 * by every picker and lives on <body> so scrolling windows don't clip it.
 */
export default class KeyPicker {
  /**
   * @param {HTMLInputElement} input
   * @param {() => import("./keys.mjs").KeyEntry[]} getKeys  Called lazily on first open.
   */
  constructor(input, getKeys) {
    this.input = input;
    this.#getKeys = getKeys;
    input.dataset.effectSelect = "";
    input.autocomplete = "off";
    input.spellcheck = false;

    // Wrap the input so the browse button sits inside the field.
    const wrap = document.createElement("div");
    wrap.className = "effect-select";
    input.replaceWith(wrap);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "effect-select-toggle";
    button.tabIndex = -1;
    button.ariaLabel = game.i18n.localize("EFFECTSELECT.Browse");
    button.innerHTML = '<i class="fa-solid fa-caret-down" inert></i>';
    wrap.append(input, button);
    this.wrap = wrap;

    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      if ( KeyPicker.#owner === this ) return this.close();
      input.focus();
      this.open({ browse: true });
    });
    // Only real typing opens the list (not the events select() sends after a pick).
    input.addEventListener("input", event => event.isTrusted && this.open());
    input.addEventListener("focus", () => {
      if ( !input.value && game.settings.get(MODULE_ID, "openOnFocus") ) this.open({ browse: true });
    });
    input.addEventListener("blur", () => this.close());
    input.addEventListener("keydown", this.#onKeyDown.bind(this));
    input.addEventListener("change", () => this.#updateTooltip());
    this.#updateTooltip();
  }

  /* -------------------------------------------- */

  #getKeys;
  #keys;
  #shown = [];
  #active = -1;

  get keys() {
    this.#keys ??= this.#getKeys();
    return this.#keys;
  }

  /** @type {KeyPicker|null} */
  static #owner = null;

  /** @type {HTMLElement} */
  static #element;

  static get element() {
    if ( this.#element ) return this.#element;
    const el = this.#element = document.createElement("div");
    el.id = "effect-select-list";
    el.className = "effect-select-list";
    el.hidden = true;
    el.setAttribute("role", "listbox");
    // Keep focus in the input while clicking the list.
    el.addEventListener("pointerdown", event => event.preventDefault());
    el.addEventListener("click", event => {
      const li = event.target.closest("[data-index]");
      if ( li ) this.#owner?.select(Number(li.dataset.index));
    });
    document.body.append(el);
    window.addEventListener("scroll", () => this.#owner?.position(), { capture: true, passive: true });
    window.addEventListener("resize", () => this.#owner?.position(), { passive: true });
    return el;
  }

  /** Close the shared list if its input has been re-rendered away. */
  static prune() {
    if ( this.#owner && !this.#owner.input.isConnected ) this.#owner.close();
  }

  /* -------------------------------------------- */

  /**
   * Show the list filtered by the input's text.
   * @param {object} [options]
   * @param {boolean} [options.browse]  Show every key, grouped, ignoring the typed text.
   */
  open({ browse=false }={}) {
    if ( this.input.disabled || this.input.readOnly ) return;
    KeyPicker.#owner = this;
    const query = browse ? "" : this.input.value.trim();
    this.#shown = filter(this.keys, query);
    this.#active = query ? 0 : this.#shown.findIndex(e => e.key === this.input.value);
    this.#render(query);
    this.position();
    this.wrap.classList.add("open");
  }

  close() {
    if ( KeyPicker.#owner !== this ) return;
    KeyPicker.#owner = null;
    KeyPicker.element.hidden = true;
    this.wrap.classList.remove("open");
    this.input.removeAttribute("aria-activedescendant");
  }

  get isOpen() {
    return KeyPicker.#owner === this;
  }

  /** Put the chosen key in the field and tell the form it changed. */
  select(index) {
    const entry = this.#shown[index];
    if ( !entry ) return;
    this.input.value = entry.key;
    this.close();
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* -------------------------------------------- */

  /** Place the list under the field, or above it when there's no room. */
  position() {
    const el = KeyPicker.element;
    if ( !this.input.isConnected ) return this.close();
    const rect = this.wrap.getBoundingClientRect();
    const width = Math.max(rect.width, 360);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const flip = (below < 200) && (above > below);
    const maxHeight = Math.min(320, flip ? above : below);
    Object.assign(el.style, {
      left: `${Math.max(8, left)}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      top: flip ? "" : `${rect.bottom + 2}px`,
      bottom: flip ? `${window.innerHeight - rect.top + 2}px` : ""
    });
  }

  #render(query) {
    const el = KeyPicker.element;
    const terms = tokens(query);
    const html = [];
    const shown = this.#shown.slice(0, LIMIT);
    let group;
    shown.forEach((entry, i) => {
      if ( !query && (entry.group !== group) ) {
        group = entry.group;
        html.push(`<div class="effect-select-group">${escape(group)}</div>`);
      }
      const note = entry.note ? `<span class="note">${escape(entry.note)}</span>` : "";
      html.push(`<div class="effect-select-option${i === this.#active ? " active" : ""}" role="option"
        id="effect-select-${i}" data-index="${i}">
        <span class="key">${mark(entry.key, terms)}</span>
        <span class="label">${mark(entry.label, terms)}${note}</span>
      </div>`);
    });
    if ( !shown.length ) html.push(`<div class="effect-select-empty">${game.i18n.localize("EFFECTSELECT.NoMatch")}</div>`);
    else if ( this.#shown.length > LIMIT ) {
      const count = this.#shown.length - LIMIT;
      html.push(`<div class="effect-select-empty">${game.i18n.format("EFFECTSELECT.More", { count })}</div>`);
    }
    el.innerHTML = html.join("");
    el.hidden = false;
    el.scrollTop = 0;
    this.#scrollToActive();
  }

  #setActive(index) {
    const el = KeyPicker.element;
    const count = Math.min(this.#shown.length, LIMIT);
    if ( !count ) return;
    this.#active = (index + count) % count;
    el.querySelector(".active")?.classList.remove("active");
    el.querySelector(`[data-index="${this.#active}"]`)?.classList.add("active");
    this.#scrollToActive();
  }

  #scrollToActive() {
    const li = KeyPicker.element.querySelector(".active");
    if ( !li ) return this.input.removeAttribute("aria-activedescendant");
    li.scrollIntoView({ block: "nearest" });
    this.input.setAttribute("aria-activedescendant", li.id);
  }

  /* -------------------------------------------- */

  #onKeyDown(event) {
    const open = this.isOpen;
    switch ( event.key ) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if ( !open ) return this.open({ browse: !this.input.value });
        return this.#setActive(this.#active + (event.key === "ArrowDown" ? 1 : -1));
      }
      case "PageDown":
      case "PageUp":
        if ( !open ) return;
        event.preventDefault();
        return this.#setActive(Math.max(0, this.#active) + (event.key === "PageDown" ? 10 : -10));
      case "Enter":
        if ( !open || (this.#active < 0) ) return;
        event.preventDefault();
        event.stopPropagation();
        return this.select(this.#active);
      case "Tab":
        // Accept the highlighted suggestion, then let focus move on as normal.
        if ( open && (this.#active >= 0) && this.input.value ) this.select(this.#active);
        return;
      case "Escape":
        if ( !open ) return;
        event.preventDefault();
        event.stopPropagation();
        return this.close();
    }
  }

  #updateTooltip() {
    if ( !game.settings.get(MODULE_ID, "showLabels") ) return;
    const value = this.input.value;
    const entry = value ? this.keys.find(e => e.key === value) : null;
    if ( entry?.label ) this.input.dataset.tooltip = entry.label;
    else delete this.input.dataset.tooltip;
  }
}

/* -------------------------------------------- */
/*  Matching                                    */
/* -------------------------------------------- */

function tokens(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Every term must appear in the key or label. Ranked: key starts with the query,
 * then a key segment starts with a term, then key contains it, then label only.
 */
function filter(keys, query) {
  if ( !query ) return [...keys].sort((a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key));
  const terms = tokens(query);
  const q = query.toLowerCase();
  const scored = [];
  for ( const entry of keys ) {
    const key = entry.key.toLowerCase();
    const label = entry.label.toLowerCase();
    let score = 0;
    let ok = true;
    for ( const term of terms ) {
      if ( key.startsWith(term) ) score += 4;
      else if ( key.includes(`.${term}`) ) score += 3;
      else if ( key.includes(term) ) score += 2;
      else if ( label.includes(term) ) score += 1;
      else { ok = false; break; }
    }
    if ( !ok ) continue;
    if ( key.startsWith(q) ) score += 10;
    if ( key === q ) score += 10;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.entry.key.length - b.entry.key.length)
    || a.entry.key.localeCompare(b.entry.key));
  return scored.map(s => s.entry);
}

function escape(str) {
  return foundry.utils.escapeHTML(String(str ?? ""));
}

/** Escape text and wrap matched terms in <mark>. */
function mark(text, terms) {
  if ( !terms.length ) return escape(text);
  const lower = text.toLowerCase();
  const hits = new Array(text.length).fill(false);
  for ( const term of terms ) {
    let i = lower.indexOf(term);
    while ( i !== -1 ) {
      hits.fill(true, i, i + term.length);
      i = lower.indexOf(term, i + term.length);
    }
  }
  let out = "";
  let open = false;
  for ( let i = 0; i < text.length; i++ ) {
    if ( hits[i] !== open ) {
      out += open ? "</mark>" : "<mark>";
      open = hits[i];
    }
    out += escape(text[i]);
  }
  return open ? `${out}</mark>` : out;
}
