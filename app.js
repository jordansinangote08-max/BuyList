(() => {
  "use strict";

  /* ───────── State ───────── */
  const STORAGE_KEY = "buylist:v1";

  // Money is stored in cents (integers) to avoid floating-point drift.
  const defaultState = () => ({ items: [], budget: null, currency: "PHP", currencySet: false });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      return {
        items: Array.isArray(data.items) ? data.items.filter(isValidItem) : [],
        budget: Number.isInteger(data.budget) ? data.budget : null,
        // Peso is the default unless a currency was explicitly picked.
        currency: data.currencySet === true && typeof data.currency === "string" ? data.currency : "PHP",
        currencySet: data.currencySet === true,
      };
    } catch {
      return defaultState();
    }
  }

  function isValidItem(i) {
    return i && typeof i.id === "string" && typeof i.name === "string" &&
      Number.isInteger(i.price) && Number.isInteger(i.qty);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }

  let state = load();

  /* ───────── Helpers ───────── */
  const $ = (id) => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  let formatter;
  function makeFormatter() {
    try {
      formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency });
    } catch {
      formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
    }
  }
  const fractionDigits = () => formatter.resolvedOptions().maximumFractionDigits;
  const money = (cents) => formatter.format(cents / 100);

  // Accepts "12", "12.5", "1,299.99", "12,50" → cents. Returns null for empty, NaN for invalid.
  function parseMoney(value) {
    let s = String(value ?? "").trim().replace(/[^\d.,-]/g, "");
    if (!s) return null;
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // comma is decimal separator if followed by 1–2 digits, else a thousands separator
      s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else {
      s = s.replace(/,/g, "");
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return Math.round(n * 100);
  }

  const centsToInput = (cents) => (cents == null ? "" : (cents / 100).toFixed(fractionDigits()));

  function parseQty(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 9999) : 1;
  }

  const lineTotal = (i) => i.price * i.qty;
  const listTotal = () => state.items.reduce((sum, i) => sum + lineTotal(i), 0);
  const unitCount = () => state.items.reduce((sum, i) => sum + i.qty, 0);

  const ICON = {
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  };

  /* ───────── Rendering ───────── */
  const listEl = $("list");
  const emptyEl = $("empty");

  function render() {
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const total = listTotal();
    const hasBudget = state.budget != null;
    const headline = $("headline");
    const label = $("headlineLabel");
    const meter = $("meter");
    const fill = $("meterFill");

    $("statTotal").textContent = money(total);
    $("statItems").textContent = String(unitCount());
    $("statBudget").textContent = hasBudget ? money(state.budget) : "—";
    $("budgetBtn").textContent = hasBudget ? "Edit budget" : "Set budget";

    if (!hasBudget) {
      label.textContent = "List total";
      headline.textContent = money(total);
      headline.classList.remove("is-over");
      meter.hidden = true;
      return;
    }

    const remaining = state.budget - total;
    const over = remaining < 0;
    label.textContent = over ? "Over budget by" : "Remaining";
    headline.textContent = money(Math.abs(remaining));
    headline.classList.toggle("is-over", over);

    const ratio = state.budget > 0 ? total / state.budget : (total > 0 ? 1 : 0);
    const pct = Math.min(ratio, 1);
    meter.hidden = false;
    meter.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    fill.style.transform = `scaleX(${pct})`;
    fill.classList.toggle("is-over", ratio > 1);
    fill.classList.toggle("is-warn", ratio > 0.85 && ratio <= 1);
  }

  function renderList() {
    emptyEl.hidden = state.items.length > 0;

    // Keyed reconciliation so existing rows aren't recreated (keeps focus + avoids re-animating).
    const existing = new Map([...listEl.children].filter((li) => !li.classList.contains("is-leaving")).map((li) => [li.dataset.id, li]));
    let prev = null;

    for (const item of state.items) {
      let li = existing.get(item.id);
      if (li) {
        existing.delete(item.id);
        updateRow(li, item);
      } else {
        li = createRow(item);
      }
      const expectedNext = prev ? prev.nextElementSibling : listEl.firstElementChild;
      if (li !== expectedNext) listEl.insertBefore(li, expectedNext);
      prev = li;
    }
    for (const li of existing.values()) li.remove();
  }

  function createRow(item) {
    const li = document.createElement("li");
    li.className = "card item";
    li.dataset.id = item.id;
    li.innerHTML = `
      <button class="item-info" type="button" data-action="edit">
        <span class="item-name"></span>
        <span class="item-meta"></span>
      </button>
      <div class="stepper" role="group">
        <button type="button" data-action="dec">${ICON.minus}</button>
        <output aria-live="polite"></output>
        <button type="button" data-action="inc">${ICON.plus}</button>
      </div>
      <span class="item-total"></span>
      <div class="item-actions">
        <button class="icon-btn" type="button" data-action="edit">${ICON.edit}</button>
        <button class="icon-btn danger" type="button" data-action="remove">${ICON.trash}</button>
      </div>`;
    updateRow(li, item);
    return li;
  }

  function updateRow(li, item) {
    const name = li.querySelector(".item-name");
    const meta = li.querySelector(".item-meta");
    name.textContent = item.name;
    if (item.price > 0) {
      meta.textContent = `${money(item.price)} each`;
      meta.classList.remove("no-price");
    } else {
      meta.textContent = "Tap to add a price";
      meta.classList.add("no-price");
    }
    li.querySelector(".stepper output").textContent = String(item.qty);
    li.querySelector(".item-total").textContent = money(lineTotal(item));

    const [dec, inc] = li.querySelectorAll(".stepper button");
    dec.disabled = item.qty <= 1;
    dec.setAttribute("aria-label", `Decrease quantity of ${item.name}`);
    inc.setAttribute("aria-label", `Increase quantity of ${item.name}`);
    li.querySelector(".stepper").setAttribute("aria-label", `Quantity of ${item.name}`);
    li.querySelector('.item-info').setAttribute("aria-label", `Edit ${item.name}`);
    li.querySelector('.icon-btn[data-action="edit"]').setAttribute("aria-label", `Edit ${item.name}`);
    li.querySelector('.icon-btn[data-action="remove"]').setAttribute("aria-label", `Remove ${item.name}`);
  }

  function commit() {
    save();
    render();
  }

  /* ───────── Add ───────── */
  const addForm = $("addForm");
  const addName = $("addName");
  const addPrice = $("addPrice");
  const addQty = $("addQty");

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = addName.value.trim();
    if (!name) { addName.focus(); return; }

    const price = parseMoney(addPrice.value);
    if (Number.isNaN(price)) {
      addPrice.setAttribute("aria-invalid", "true");
      addPrice.focus();
      return;
    }

    state.items.unshift({ id: uid(), name, price: price ?? 0, qty: parseQty(addQty.value) });
    commit();

    addForm.reset();
    addQty.value = "1";
    addPrice.removeAttribute("aria-invalid");
    addName.focus({ preventScroll: true });
  });

  addPrice.addEventListener("input", () => addPrice.removeAttribute("aria-invalid"));
  // Enter in name → jump to price (on phones "next" key)
  addName.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && addName.value.trim() && !addPrice.value) {
      e.preventDefault();
      addPrice.focus();
    }
  });

  /* ───────── List actions (delegated) ───────── */
  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const li = btn.closest(".item");
    const item = state.items.find((i) => i.id === li.dataset.id);
    if (!item) return;

    switch (btn.dataset.action) {
      case "inc":
        item.qty = Math.min(item.qty + 1, 9999);
        commit();
        break;
      case "dec":
        if (item.qty > 1) { item.qty -= 1; commit(); }
        break;
      case "edit":
        openEdit(item.id);
        break;
      case "remove":
        removeItem(item.id);
        break;
    }
  });

  function removeItem(id) {
    const index = state.items.findIndex((i) => i.id === id);
    if (index < 0) return;
    const [removed] = state.items.splice(index, 1);
    save();

    const li = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const finish = () => render();
    if (li && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      li.classList.add("is-leaving");
      renderSummary();
      setTimeout(() => { li.remove(); finish(); }, 150);
    } else {
      if (li) li.remove();
      finish();
    }

    showToast(`Removed “${removed.name}”`, () => {
      state.items.splice(Math.min(index, state.items.length), 0, removed);
      commit();
    });
  }

  /* ───────── Dialog helpers ───────── */
  function openDialog(dlg) {
    dlg.classList.remove("is-closing");
    dlg.showModal();
  }

  function closeDialog(dlg) {
    if (!dlg.open || dlg.classList.contains("is-closing")) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    dlg.classList.add("is-closing");
    setTimeout(() => {
      dlg.close();
      dlg.classList.remove("is-closing");
    }, reduce ? 0 : 200);
  }

  document.querySelectorAll("dialog").forEach((dlg) => {
    // Esc → animated close
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(dlg); });
    // Click on backdrop closes
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDialog(dlg); });
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeDialog(dlg)));
  });

  /* ───────── Edit ───────── */
  const editDialog = $("editDialog");
  const editName = $("editName");
  const editPrice = $("editPrice");
  const editQty = $("editQty");
  const editPreview = $("editPreview");
  let editingId = null;

  function openEdit(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    editingId = id;
    editName.value = item.name;
    editPrice.value = item.price ? centsToInput(item.price) : "";
    editQty.value = String(item.qty);
    editPrice.removeAttribute("aria-invalid");
    updatePreview();
    openDialog(editDialog);
    // Focus price if missing (most common reason to edit), else name
    (item.price ? editName : editPrice).focus();
  }

  function updatePreview() {
    const p = parseMoney(editPrice.value);
    const q = parseQty(editQty.value);
    const unit = Number.isNaN(p) || p == null ? 0 : p;
    editPreview.innerHTML = `<span>${q} × ${money(unit)}</span><b>${money(unit * q)}</b>`;
  }
  editPrice.addEventListener("input", () => { editPrice.removeAttribute("aria-invalid"); updatePreview(); });
  editQty.addEventListener("input", updatePreview);

  $("editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const item = state.items.find((i) => i.id === editingId);
    if (!item) return closeDialog(editDialog);

    const name = editName.value.trim();
    if (!name) { editName.focus(); return; }
    const price = parseMoney(editPrice.value);
    if (Number.isNaN(price)) { editPrice.setAttribute("aria-invalid", "true"); editPrice.focus(); return; }

    item.name = name;
    item.price = price ?? 0;
    item.qty = parseQty(editQty.value);
    commit();
    closeDialog(editDialog);
  });

  $("editDelete").addEventListener("click", () => {
    const id = editingId;
    closeDialog(editDialog);
    removeItem(id);
  });

  /* ───────── Budget ───────── */
  const budgetDialog = $("budgetDialog");
  const budgetInput = $("budgetInput");
  const currencySelect = $("currencySelect");

  $("budgetBtn").addEventListener("click", () => {
    budgetInput.value = centsToInput(state.budget);
    budgetInput.removeAttribute("aria-invalid");
    currencySelect.value = state.currency;
    openDialog(budgetDialog);
    budgetInput.focus();
  });

  budgetInput.addEventListener("input", () => budgetInput.removeAttribute("aria-invalid"));

  $("budgetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = parseMoney(budgetInput.value);
    if (Number.isNaN(value)) { budgetInput.setAttribute("aria-invalid", "true"); budgetInput.focus(); return; }
    state.budget = value;
    if (currencySelect.value !== state.currency) state.currencySet = true;
    state.currency = currencySelect.value;
    makeFormatter();
    listEl.replaceChildren(); // currency may have changed → rebuild rows
    commit();
    closeDialog(budgetDialog);
  });

  $("budgetClear").addEventListener("click", () => {
    state.budget = null;
    commit();
    closeDialog(budgetDialog);
  });

  /* ───────── Reset ───────── */
  const resetDialog = $("resetDialog");

  $("resetBtn").addEventListener("click", () => {
    const n = state.items.length;
    if (n === 0) {
      showToast("Your list is already empty");
      return;
    }
    $("resetCount").textContent = n === 1 ? "1 item" : `all ${n} items`;
    openDialog(resetDialog);
  });

  $("resetConfirm").addEventListener("click", () => {
    state.items = [];
    hideToast();
    commit();
    closeDialog(resetDialog);
    showToast("Shopping list cleared");
  });

  /* ───────── Toast ───────── */
  const toast = $("toast");
  const toastText = $("toastText");
  const toastAction = $("toastAction");
  let toastTimer = null;
  let toastUndo = null;

  function showToast(message, onUndo) {
    toastText.textContent = message;
    toastUndo = onUndo || null;
    toastAction.hidden = !onUndo;
    toast.classList.add("is-visible");
    startToastTimer();
  }

  function startToastTimer() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastUndo ? 5000 : 2500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.classList.remove("is-visible");
    toastUndo = null;
  }

  toastAction.addEventListener("click", () => {
    const fn = toastUndo;
    hideToast();
    if (fn) fn();
  });

  // Pause the toast while hovered or while the tab is hidden.
  toast.addEventListener("pointerenter", () => clearTimeout(toastTimer));
  toast.addEventListener("pointerleave", () => { if (toast.classList.contains("is-visible")) startToastTimer(); });
  document.addEventListener("visibilitychange", () => {
    if (!toast.classList.contains("is-visible")) return;
    if (document.hidden) clearTimeout(toastTimer); else startToastTimer();
  });

  /* ───────── Sync across tabs ───────── */
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = load();
    makeFormatter();
    listEl.replaceChildren();
    render();
  });

  /* ───────── Init ───────── */
  makeFormatter();
  document.documentElement.classList.add("is-booting");
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("is-booting")));
})();
