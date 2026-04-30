/**
 * Custom Keyboard Shortcuts
 *
 * Auto-discovers keyboard shortcuts in Codex (via aria-keyshortcuts,
 * <kbd> elements, and tooltip titles), then lets you remap or disable
 * any of them from a dedicated settings page.
 *
 * Architecture
 * ------------
 *   discovery   →  scans DOM for shortcuts; merges each find into a
 *                  Map<id, ShortcutDef>. ID is `<combo>|<label>` so the
 *                  same shortcut found from multiple sources dedupes.
 *   storage     →  per-shortcut overrides keyed by id:
 *                    "shortcut:<id>" = { combo: "Cmd+B" | null }
 *                  null = disabled, missing = use default.
 *   remap       →  capture-phase document keydown listener. If the
 *                  pressed combo matches a user-mapped trigger, we
 *                  synthesize the original combo's keydown event so
 *                  the app's existing handler fires.
 *   settings    →  registerPage with a searchable list; each row has a
 *                  "press to record" button and a disable toggle.
 *
 * Authoring notes
 * ---------------
 *   • Renderer-only.
 *   • Synthesized KeyboardEvents are flagged so we don't re-remap them.
 *   • App-menu accelerators (Electron native macOS menu) cannot be
 *     intercepted from the renderer; those are out of scope for v1.
 */

/** @type {import("@codex-plusplus/sdk").Tweak} */
module.exports = {
  start(api) {
    const state = {
      api,
      // id -> ShortcutDef { id, label, defaultCombo, sources:Set<string>, refs:Ref[] }
      // where Ref = { el, kind:"aria"|"kbd"|"title", apply(combo|null), restore() }
      shortcuts: new Map(),
      // id -> { combo: string|null }   (combo === null means disabled)
      overrides: new Map(),
      pageHandle: null,
      pageRoot: null,
      observers: [],
      keyHandler: null,
      recording: null,
    };
    this._state = state;

    seedKnownShortcuts(state);
    loadOverrides(state);
    installRemapEngine(state);
    startDiscovery(state);
    // Apply current overrides to anything seeded already (no-op for seeds
    // without DOM refs, but cheap and future-proof).
    applyAllOverridesToDom(state);

    if (typeof api.settings?.registerPage === "function") {
      state.pageHandle = api.settings.registerPage({
        id: "main",
        title: "Keyboard Shortcuts",
        description: "Remap or disable Codex's keyboard shortcuts.",
        iconSvg:
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">' +
          '<rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>' +
          '<path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M6 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
          "</svg>",
        render: (root) => renderPage(root, state),
      });
    } else {
      api.log.warn(
        "registerPage unavailable — Codex++ runtime is too old. UI not mounted; remap engine still active.",
      );
    }
  },

  stop() {
    const s = this._state;
    if (!s) return;
    if (s.keyHandler) {
      document.removeEventListener("keydown", s.keyHandler, true);
      s.keyHandler = null;
    }
    for (const o of s.observers) o.disconnect();
    s.observers = [];
    // Restore any DOM hints we mutated.
    for (const def of s.shortcuts.values()) {
      for (const ref of def.refs || []) {
        try {
          ref.restore();
        } catch {
          /* element may be detached; ignore */
        }
      }
    }
    s.pageHandle?.unregister();
    s.pageHandle = null;
    s.pageRoot = null;
  },
};

// ─────────────────────────────────────────────────────────── seed list ──

/**
 * Codex's main keybinds, hand-collected. Many of these aren't exposed in
 * the DOM (no aria-keyshortcuts, no <kbd>, no tooltip), so auto-discovery
 * misses them. Seeding them here gives users something to remap/disable
 * immediately, even before they hover the relevant UI.
 *
 * Editable: any of these can be overridden by tweaking the seed list.
 */
const SEED_SHORTCUTS = [
  { combo: "Cmd+B", label: "Toggle sidebar" },
  { combo: "Cmd+Alt+B", label: "Toggle right panel" },
  { combo: "Cmd+K", label: "Command bar" },
  { combo: "Cmd+F", label: "Find in chat" },
  { combo: "Cmd+T", label: "New tab / browser" },
  { combo: "Cmd+Shift+M", label: "Open model picker" },
  { combo: "Ctrl+M", label: "Dictate" },
  { combo: "Cmd+J", label: "Toggle terminal" },
  { combo: "Cmd+Shift+E", label: "Toggle file tree" },
  { combo: "Cmd+N", label: "New chat" },
  { combo: "Cmd+W", label: "Close tab" },
  { combo: "Cmd+,", label: "Open settings" },
  { combo: "Cmd+/", label: "Toggle comment" },
  { combo: "Cmd+Enter", label: "Send message" },
];

function seedKnownShortcuts(state) {
  for (const s of SEED_SHORTCUTS) {
    ingest(state, { combo: s.combo, label: s.label, source: "seed" });
  }
}

// ─────────────────────────────────────────────── combo string utilities ──

const MOD_ALIASES = {
  "⌘": "Cmd",
  "Meta": "Cmd",
  "Cmd": "Cmd",
  "Command": "Cmd",
  "⌃": "Ctrl",
  "Ctrl": "Ctrl",
  "Control": "Ctrl",
  "⌥": "Alt",
  "Alt": "Alt",
  "Option": "Alt",
  "Opt": "Alt",
  "⇧": "Shift",
  "Shift": "Shift",
};

const MOD_ORDER = ["Cmd", "Ctrl", "Alt", "Shift"];

const KEY_DISPLAY = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↵",
  Escape: "Esc",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  " ": "Space",
};

const MOD_DISPLAY = { Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" };

/**
 * Normalize a combo expressed in any of the common forms (aria
 * "Meta+B", tooltip "⌘⇧M", text "Cmd+Shift+M") into the canonical
 * form `Cmd+Shift+M`. Returns null if the input is unparseable.
 */
function parseCombo(input) {
  if (!input || typeof input !== "string") return null;
  // Split on +/whitespace; also handle ⌘⇧M (no separator) by inserting
  // a + after each known modifier glyph.
  let s = input.trim();
  if (!s) return null;
  // Split between consecutive symbol-modifiers and the key.
  s = s.replace(/([⌘⌃⌥⇧])(?=[^+\s])/g, "$1+");
  const parts = s.split(/[+\s]+/).filter(Boolean);
  if (!parts.length) return null;

  const mods = new Set();
  let key = null;
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const aliased = MOD_ALIASES[t] || MOD_ALIASES[capitalize(t)];
    if (aliased) {
      mods.add(aliased);
      continue;
    }
    // Anything else is the key. Keep last wins (so "Cmd+B+C" → key=C).
    key = t;
  }
  if (!key) return null;

  // Normalize key casing: single letters → uppercase, named keys keep PascalCase.
  if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
  else key = capitalize(key);

  const ordered = MOD_ORDER.filter((m) => mods.has(m));
  return [...ordered, key].join("+");
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Build canonical combo string from a KeyboardEvent. */
function comboFromEvent(e) {
  const mods = new Set();
  if (e.metaKey) mods.add("Cmd");
  if (e.ctrlKey) mods.add("Ctrl");
  if (e.altKey) mods.add("Alt");
  if (e.shiftKey) mods.add("Shift");
  const key = keyFromEvent(e);
  if (!key) return null;
  const ordered = MOD_ORDER.filter((m) => mods.has(m));
  return [...ordered, key].join("+");
}

function keyFromEvent(e) {
  // `event.key` is layout/input-method dependent: on a Korean keyboard
  // state, physical Cmd+B can report "ㅠ". `event.code` stays "KeyB", so
  // prefer it for shortcut matching and recording.
  const physical = keyFromCode(e.code);
  if (physical) return physical;
  return normalizeEventKey(e.key);
}

function keyFromCode(code) {
  if (!code || typeof code !== "string") return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const numpadDigit = /^Numpad([0-9])$/.exec(code);
  if (numpadDigit) return numpadDigit[1];
  return null;
}

function normalizeEventKey(key) {
  if (!key) return null;
  if (["Meta", "Control", "Alt", "Shift", "OS"].includes(key)) return null;
  if (key === " ") return "Space";
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (key.length > 1) return capitalize(key);
  return key;
}

/** Pretty-print "Cmd+Shift+M" → "⌘⇧M" for display. */
function formatCombo(combo) {
  if (!combo) return "";
  const parts = combo.split("+");
  const out = [];
  for (const p of parts) {
    if (MOD_DISPLAY[p]) out.push(MOD_DISPLAY[p]);
    else out.push(KEY_DISPLAY[p] || p);
  }
  return out.join("");
}

// ───────────────────────────────────────────────────────────── discovery ──

/**
 * Run an initial scan and install a MutationObserver to keep the catalogue
 * fresh as Codex mounts/unmounts UI. Discovery is best-effort: missing
 * a shortcut is recoverable (user can add a manual entry later).
 */
function startDiscovery(state) {
  const scan = () => {
    const before = state.shortcuts.size;
    discoverFromAria(state);
    discoverFromKbd(state);
    discoverFromTitles(state);
    if (state.shortcuts.size !== before) {
      rerenderPage(state);
    }
  };
  scan();

  // Throttle to one scan per animation frame.
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  };
  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-keyshortcuts", "title"],
  });
  state.observers.push(obs);
}

/**
 * Add a single discovered shortcut, deduping by canonical id. If a `ref`
 * (DOM patcher) is supplied, it's appended to the def so we can update
 * its visible combo when the user changes the override later.
 */
function ingest(state, { combo, label, source, ref }) {
  const canon = parseCombo(combo);
  if (!canon) return null;
  const cleanLabel = (label || "").replace(/\s+/g, " ").trim();
  if (!cleanLabel) return null;
  const id = `${canon}|${cleanLabel.toLowerCase()}`;
  let def = state.shortcuts.get(id);
  if (!def) {
    def = {
      id,
      label: cleanLabel,
      defaultCombo: canon,
      sources: new Set(),
      refs: [],
    };
    state.shortcuts.set(id, def);
  }
  def.sources.add(source);
  if (ref) {
    // Avoid duplicate refs for the same element.
    if (!def.refs.some((r) => r.el === ref.el && r.kind === ref.kind)) {
      def.refs.push(ref);
      // If there's already an override, apply it to the new ref immediately
      // so a freshly-mounted DOM node shows the user's combo on first paint.
      const ov = state.overrides.get(id);
      if (ov) ref.apply(ov.combo);
    }
  }
  return def;
}

function discoverFromAria(state) {
  const nodes = document.querySelectorAll("[aria-keyshortcuts]");
  for (const n of nodes) {
    const raw = n.getAttribute("aria-keyshortcuts");
    if (!raw) continue;
    for (const part of raw.split(/\s+/)) {
      ingest(state, {
        combo: part,
        label: labelFor(n),
        source: "aria",
        ref: ariaRef(n, part),
      });
    }
  }
}

function discoverFromKbd(state) {
  const kbds = document.querySelectorAll("kbd");
  const seen = new WeakSet();
  for (const k of kbds) {
    if (seen.has(k)) continue;
    const parent = k.parentElement;
    if (!parent) continue;
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === "KBD",
    );
    for (const s of siblings) seen.add(s);
    const combo = siblings
      .map((s) => (s.textContent || "").trim())
      .filter(Boolean)
      .join("+");
    if (!combo) continue;
    ingest(state, {
      combo,
      label: labelFor(parent),
      source: "kbd",
      ref: kbdRef(siblings),
    });
  }
}

function discoverFromTitles(state) {
  const RE = /\(([^()]*?(?:[⌘⌃⌥⇧]|cmd|ctrl|alt|shift|opt|option)[^()]*?)\)/i;
  const nodes = document.querySelectorAll("[title]");
  for (const n of nodes) {
    const t = n.getAttribute("title");
    if (!t) continue;
    const m = t.match(RE);
    if (!m) continue;
    const inside = m[1].trim();
    const before = t.slice(0, m.index).replace(/[\s—–-]+$/, "").trim();
    if (!before) continue;
    ingest(state, {
      combo: inside,
      label: before,
      source: "title",
      ref: titleRef(n, t, m),
    });
  }
}

// ── DOM patchers ──────────────────────────────────────────────────────
// Each returns `{ el, kind, apply(combo|null), restore() }`. `apply(null)`
// renders a "disabled" hint (we just hide the kbd/strip the title clause
// so users aren't misled about a shortcut that no longer fires).

function ariaRef(el, originalPart) {
  const original = el.getAttribute("aria-keyshortcuts") || "";
  return {
    el,
    kind: "aria",
    apply(combo) {
      if (combo === null) {
        // Remove this combo from the attribute. Aria allows multiple
        // space-separated combos so we only strip the matched piece.
        const next = original
          .split(/\s+/)
          .filter((p) => p !== originalPart)
          .join(" ");
        if (next) el.setAttribute("aria-keyshortcuts", next);
        else el.removeAttribute("aria-keyshortcuts");
      } else {
        const next = original
          .split(/\s+/)
          .map((p) => (p === originalPart ? toAriaCombo(combo) : p))
          .join(" ");
        el.setAttribute("aria-keyshortcuts", next);
      }
    },
    restore() {
      if (original) el.setAttribute("aria-keyshortcuts", original);
      else el.removeAttribute("aria-keyshortcuts");
    },
  };
}

/** "Cmd+Shift+B" → "Meta+Shift+B" (aria spec uses Meta/Control). */
function toAriaCombo(combo) {
  return combo
    .split("+")
    .map((p) => (p === "Cmd" ? "Meta" : p === "Ctrl" ? "Control" : p))
    .join("+");
}

function kbdRef(kbds) {
  const originals = kbds.map((k) => k.textContent || "");
  return {
    el: kbds[0],
    kind: "kbd",
    apply(combo) {
      if (combo === null) {
        // Hide the whole group.
        for (const k of kbds) {
          k.dataset.codexppHiddenDisplay = k.style.display || "";
          k.style.display = "none";
        }
        return;
      }
      // Otherwise replace each <kbd> in order with the combo's parts.
      const parts = combo.split("+");
      // Show all kbds first.
      for (const k of kbds) {
        if ("codexppHiddenDisplay" in k.dataset) {
          k.style.display = k.dataset.codexppHiddenDisplay;
          delete k.dataset.codexppHiddenDisplay;
        }
      }
      // We render up to `useCount` kbds. If the combo has more parts than
      // we have <kbd> slots, the *last* used slot squashes the remaining
      // parts together (e.g. 1 kbd + "Cmd+Shift+B" → "⌘⇧B"). Extra slots
      // beyond useCount get hidden.
      const useCount = Math.min(parts.length, kbds.length);
      for (let i = 0; i < kbds.length; i++) {
        if (i >= useCount) {
          kbds[i].dataset.codexppHiddenDisplay = kbds[i].style.display || "";
          kbds[i].style.display = "none";
          kbds[i].textContent = "";
          continue;
        }
        const isLast = i === useCount - 1;
        const slice = isLast ? parts.slice(i) : [parts[i]];
        kbds[i].textContent = slice.map(displayPart).join("");
      }
    },
    restore() {
      for (let i = 0; i < kbds.length; i++) {
        if ("codexppHiddenDisplay" in kbds[i].dataset) {
          kbds[i].style.display = kbds[i].dataset.codexppHiddenDisplay;
          delete kbds[i].dataset.codexppHiddenDisplay;
        }
        kbds[i].textContent = originals[i];
      }
    },
  };
}

function displayPart(p) {
  return MOD_DISPLAY[p] || KEY_DISPLAY[p] || p;
}

function titleRef(el, originalTitle, match) {
  const before = originalTitle.slice(0, match.index);
  const after = originalTitle.slice(match.index + match[0].length);
  return {
    el,
    kind: "title",
    apply(combo) {
      if (combo === null) {
        el.setAttribute("title", (before + after).replace(/\s+$/, "").trim());
      } else {
        el.setAttribute(
          "title",
          `${before.replace(/\s+$/, "")} (${formatCombo(combo)})${after}`,
        );
      }
    },
    restore() {
      el.setAttribute("title", originalTitle);
    },
  };
}

function applyAllOverridesToDom(state) {
  for (const [id, override] of state.overrides) {
    const def = state.shortcuts.get(id);
    if (!def) continue;
    for (const ref of def.refs) {
      try {
        ref.apply(override.combo);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Best-effort label extraction. Prefers aria-label / title (without the
 * paren shortcut clause), falls back to inner text.
 */
function labelFor(el) {
  const aria = el.getAttribute && el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const title = el.getAttribute && el.getAttribute("title");
  if (title && title.trim()) {
    return title.replace(/\s*\([^()]*\)\s*$/, "").trim();
  }
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (txt && txt.length <= 80) return txt;
  return "";
}

// ─────────────────────────────────────────────────────── overrides store ──

function loadOverrides(state) {
  const all = state.api.storage.all?.() || {};
  for (const k of Object.keys(all)) {
    if (!k.startsWith("shortcut:")) continue;
    const id = k.slice("shortcut:".length);
    state.overrides.set(id, all[k]);
  }
}

function setOverride(state, id, override) {
  if (override == null) {
    state.overrides.delete(id);
    state.api.storage.delete?.(`shortcut:${id}`);
  } else {
    state.overrides.set(id, override);
    state.api.storage.set(`shortcut:${id}`, override);
  }
  // Push the new effective combo into every DOM ref so tooltips, <kbd>
  // text, and aria-keyshortcuts reflect the user's choice without waiting
  // for the next discovery scan.
  const def = state.shortcuts.get(id);
  if (!def) return;
  const combo =
    override == null
      ? def.defaultCombo // reset to default
      : override.combo; // remap (string) or disable (null)
  for (const ref of def.refs) {
    try {
      ref.apply(combo);
    } catch {
      /* element may have been unmounted; ignore */
    }
  }
}

function effectiveCombo(state, def) {
  const o = state.overrides.get(def.id);
  if (!o) return def.defaultCombo;
  return o.combo; // null = disabled
}

// ──────────────────────────────────────────────────────────── remap engine ──

/**
 * Capture-phase keydown handler. Two behaviours:
 *   (a) If the pressed combo matches the *trigger* of a user override
 *       whose target is null  → swallow the event (disable).
 *   (b) If the pressed combo matches the trigger of an override whose
 *       target is some other combo → swallow the event and dispatch a
 *       synthesized keydown for the original combo.
 *
 * "Trigger" depends on direction:
 *   - For a remap A→B (default A, user picked B), the trigger is B and
 *     we synthesize A.
 *   - For a disable A→null, the trigger is A.
 *
 * We also need to swallow the *original* default combo when it has been
 * remapped to something else, so the app's listener doesn't fire twice.
 */
function installRemapEngine(state) {
  const SYNTHETIC = "__codexppSynthetic";

  const handler = (e) => {
    if (state.recording) return; // recorder owns input
    if (e[SYNTHETIC]) return;
    const pressed = comboFromEvent(e);
    if (!pressed) return;

    // Build per-press lookup. We may have many shortcuts, but only a
    // handful of overrides. Iterate overrides only.
    for (const [id, override] of state.overrides) {
      const def = state.shortcuts.get(id);
      // It's possible we have an override for a shortcut not yet
      // discovered (page just loaded). In that case `def` is null and
      // we can't honour disable/remap until discovery catches up.
      if (!def) continue;
      const target = override.combo; // null = disabled
      const orig = def.defaultCombo;

      // Disable: pressed === orig and target === null.
      if (target === null && pressed === orig) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Remap: pressed === target → fire orig.
      if (target && pressed === target) {
        e.preventDefault();
        e.stopImmediatePropagation();
        dispatchSynthetic(orig, e.target);
        return;
      }

      // Suppress the original combo when it's been remapped away.
      if (target && pressed === orig && target !== orig) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
  };

  document.addEventListener("keydown", handler, true);
  state.keyHandler = handler;

  function dispatchSynthetic(combo, target) {
    const parts = combo.split("+");
    const mods = new Set(parts.slice(0, -1));
    const key = parts[parts.length - 1];
    const init = {
      key: key.length === 1 ? key.toLowerCase() : key,
      code: keyToCode(key),
      bubbles: true,
      cancelable: true,
      composed: true,
      metaKey: mods.has("Cmd"),
      ctrlKey: mods.has("Ctrl"),
      altKey: mods.has("Alt"),
      shiftKey: mods.has("Shift"),
    };
    const ev = new KeyboardEvent("keydown", init);
    Object.defineProperty(ev, SYNTHETIC, { value: true });
    (target || document.activeElement || document.body).dispatchEvent(ev);
  }
}

/** Best-effort KeyboardEvent.code from a logical key. */
function keyToCode(key) {
  if (/^[A-Z]$/.test(key)) return `Key${key}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  const map = {
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    Enter: "Enter",
    Escape: "Escape",
    Tab: "Tab",
    Space: "Space",
    Backspace: "Backspace",
    Delete: "Delete",
  };
  return map[key] || key;
}

// ──────────────────────────────────────────────────────── settings page ──

function rerenderPage(state) {
  if (!state.pageRoot) return;
  // Fast path: if the page is already rendered, just refresh the list,
  // preserving the search input's focus + caret + scroll position.
  const root = state.pageRoot;
  if (typeof root._renderList === "function" && root._searchInput) {
    root._renderList(root._searchInput.value);
    return;
  }
  root.replaceChildren();
  renderPage(root, state);
}

function renderPage(root, state) {
  state.pageRoot = root;

  const header = el("section", "flex flex-col gap-1");
  header.appendChild(sectionTitle("Shortcuts"));
  const desc = el("div", "text-token-text-secondary text-sm");
  desc.textContent =
    "Auto-discovered from Codex's UI. Click a row to remap; use the toggle to disable.";
  header.appendChild(desc);
  root.appendChild(header);

  const search = el("div", "flex flex-col gap-2 mt-2");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Filter shortcuts…";
  searchInput.className =
    "border-token-border bg-token-foreground/5 h-token-button-composer " +
    "rounded-md border px-3 text-sm text-token-text-primary " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border";
  search.appendChild(searchInput);
  root.appendChild(search);

  const list = el("section", "flex flex-col gap-2 mt-2");
  root.appendChild(list);

  const renderList = (filter) => {
    list.replaceChildren();
    const items = Array.from(state.shortcuts.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const f = (filter || "").trim().toLowerCase();
    const matches = items.filter(
      (def) =>
        !f ||
        def.label.toLowerCase().includes(f) ||
        def.defaultCombo.toLowerCase().includes(f) ||
        formatCombo(def.defaultCombo).toLowerCase().includes(f),
    );

    if (matches.length === 0) {
      const empty = el(
        "div",
        "text-token-text-secondary text-sm py-6 text-center",
      );
      empty.textContent =
        state.shortcuts.size === 0
          ? "No shortcuts discovered yet. Open Codex's menus / hover its toolbar to populate this list."
          : "No matches.";
      list.appendChild(empty);
      return;
    }

    const card = roundedCard();
    for (const def of matches) card.appendChild(shortcutRow(state, def));
    list.appendChild(card);
  };

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  renderList("");

  // Stash the renderer so discovery can refresh the visible list.
  state.pageRoot._renderList = renderList;
  state.pageRoot._searchInput = searchInput;
}

function shortcutRow(state, def) {
  const row = el("div", "flex items-center justify-between gap-4 p-3");
  const left = el("div", "flex min-w-0 flex-col gap-1");
  const label = el("div", "min-w-0 text-sm text-token-text-primary truncate");
  label.textContent = def.label;
  left.appendChild(label);

  const sub = el(
    "div",
    "text-token-text-secondary text-xs flex items-center gap-2",
  );
  const defaultPill = el(
    "span",
    "rounded-md border border-token-border px-1.5 py-0.5 text-token-text-secondary tabular-nums",
  );
  defaultPill.textContent = formatCombo(def.defaultCombo);
  defaultPill.title = `Default: ${def.defaultCombo}`;
  sub.appendChild(defaultPill);
  const sourceTag = el("span", "opacity-60");
  sourceTag.textContent = `via ${[...def.sources].join(", ")}`;
  sub.appendChild(sourceTag);
  left.appendChild(sub);
  row.appendChild(left);

  const right = el("div", "flex items-center gap-2");

  const recorderBtn = makeRecorderButton(state, def);
  right.appendChild(recorderBtn);

  const override = state.overrides.get(def.id);
  if (override) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className =
      "rounded-full px-2 py-0.5 text-xs bg-token-charts-red/10 " +
      "text-token-charts-red hover:bg-token-charts-red/20 cursor-interaction";
    reset.textContent = "Reset";
    reset.title = "Restore the default shortcut";
    reset.addEventListener("click", () => {
      setOverride(state, def.id, null);
      rerenderPage(state);
    });
    right.appendChild(reset);
  }

  // Disable toggle.
  const disabled = override?.combo === null;
  const sw = switchControl(!disabled, (next) => {
    if (next) {
      // Re-enable: clear override (uses default).
      setOverride(state, def.id, null);
    } else {
      setOverride(state, def.id, { combo: null });
    }
    rerenderPage(state);
  });
  sw.title = disabled ? "Enable shortcut" : "Disable shortcut";
  right.appendChild(sw);

  row.appendChild(right);
  return row;
}

function makeRecorderButton(state, def) {
  const btn = document.createElement("button");
  btn.type = "button";
  const override = state.overrides.get(def.id);
  const current =
    override && override.combo
      ? override.combo
      : override && override.combo === null
        ? null
        : def.defaultCombo;

  const paint = () => {
    const isOverride =
      override && override.combo && override.combo !== def.defaultCombo;
    btn.className =
      "h-token-button-composer rounded-md border px-3 text-sm cursor-interaction " +
      "tabular-nums inline-flex items-center gap-1 " +
      (isOverride
        ? "border-token-charts-blue text-token-charts-blue bg-token-charts-blue/10"
        : "border-token-border text-token-text-primary bg-token-foreground/5 " +
          "hover:bg-token-foreground/10");
    btn.textContent = current === null ? "Disabled" : formatCombo(current);
    if (current === null) btn.style.opacity = "0.6";
    else btn.style.opacity = "";
  };
  paint();

  btn.addEventListener("click", async () => {
    btn.textContent = "Press a key…";
    btn.classList.add("animate-pulse");
    try {
      const combo = await recordCombo(state);
      if (combo) {
        if (combo === def.defaultCombo) {
          // No change — clear override (use default).
          setOverride(state, def.id, null);
        } else {
          setOverride(state, def.id, { combo });
        }
        rerenderPage(state);
      } else {
        // Cancelled.
        rerenderPage(state);
      }
    } finally {
      btn.classList.remove("animate-pulse");
    }
  });

  return btn;
}

/**
 * Capture the next non-modifier keypress as a combo. Esc cancels.
 * Suppresses the remap engine while active so we don't trigger anything.
 */
function recordCombo(state) {
  return new Promise((resolve) => {
    state.recording = { resolve };
    const onKey = (e) => {
      // Wait for a non-modifier keypress.
      const combo = comboFromEvent(e);
      if (!combo) return; // pure modifier press
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener("keydown", onKey, true);
      state.recording = null;
      if (e.key === "Escape") resolve(null);
      else resolve(combo);
    };
    window.addEventListener("keydown", onKey, true);
  });
}

// ───────────────────────────────────────────────────────────── UI helpers ──

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function sectionTitle(text) {
  const titleRow = el(
    "div",
    "flex h-toolbar items-center justify-between gap-2 px-0 py-0",
  );
  const inner = el("div", "flex min-w-0 flex-1 flex-col gap-1");
  const t = el("div", "text-base font-medium text-token-text-primary");
  t.textContent = text;
  inner.appendChild(t);
  titleRow.appendChild(inner);
  return titleRow;
}

function roundedCard() {
  const card = el(
    "div",
    "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border",
  );
  card.style.backgroundColor =
    "var(--color-background-panel, var(--color-token-bg-fog))";
  return card;
}

/** Codex-native toggle (lifted verbatim from tweaks/AGENTS.md §4). */
function switchControl(initial, onChange) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className =
    "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] " +
    "shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);
  const apply = (on) => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className =
      "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 " +
      "focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className =
      "relative inline-flex shrink-0 items-center rounded-full transition-colors " +
      "duration-200 ease-out h-5 w-8 " +
      (on ? "bg-token-charts-blue" : "bg-token-foreground/20");
    pill.dataset.state = on ? "checked" : "unchecked";
    knob.dataset.state = on ? "checked" : "unchecked";
    knob.style.transform = on ? "translateX(14px)" : "translateX(2px)";
  };
  apply(initial);
  btn.appendChild(pill);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = btn.getAttribute("aria-checked") !== "true";
    apply(next);
    btn.disabled = true;
    try {
      await onChange?.(next);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}
