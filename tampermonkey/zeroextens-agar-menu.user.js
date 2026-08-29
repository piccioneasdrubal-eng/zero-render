/* eslint-disable */
// ==UserScript==
// @name         ZeroExtens Agar Menu
// @namespace    zeroextens
// @version      1.1
// @description  Menu di controllo bot per agar.io: trascinabile, avvia/ferma, numero e nome bot, split, feed, vshield, tasto rapido salva e autosave.
// @author       ZeroExtens
// @match        *://agar.io/*
// @match        *://www.agar.io/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function () {
  "use strict";

  // ── Protocollo XevBots (come window.gg / server.js) ──
  var NT = function (s) {
    var b = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) b.push(c);
      else if (c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
      else b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    b.push(0);
    return b;
  };
  var opStart = function (srv, name, amount) {
    return new Uint8Array([0].concat(NT(srv), NT(name), [amount & 255, amount >> 8]));
  };
  var opStop = function () { return new Uint8Array([1]); };
  var opSplit = function () { return new Uint8Array([4]); };
  var opFeed = function () { return new Uint8Array([3]); };
  var opVshield = function (on) { return new Uint8Array([2, 0, on ? 1 : 0]); };

  // ── Persistenza ──
  var LS_KEY = "zx_agar_menu";
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; } }
  function save() {
    var s = readForm();
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    flash("Impostazioni salvate");
    return s;
  }

  // ── Stato ──
  var ws = null;
  var state = { connected: false, vshield: false };

  // ── DOM ──
  var root = document.createElement("div");
  root.id = "zx-agar-menu";
  root.innerHTML =
    '<div id="zx-panel" style="position:fixed;top:14px;right:14px;z-index:999999;width:290px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf3;background:rgba(10,12,18,0.94);border:1px solid rgba(124,199,255,0.25);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);overflow:hidden">' +
    '  <div id="zx-head" title="Trascina il menu · clic per chiudere/aprire" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(124,199,255,0.08);cursor:grab;user-select:none">' +
    '    <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;letter-spacing:0.3px">' +
    '      <span id="zx-dot" style="width:9px;height:9px;border-radius:50%;background:#f85149;box-shadow:0 0 8px #f85149"></span>ZEROEXTENS · BOT MENU' +
    '    </div>' +
    '    <span id="zx-caret" style="font-size:12px;opacity:0.7">▲</span>' +
    '  </div>' +
    '  <div id="zx-body" style="padding:12px">' +
    '    <label style="display:block;font-size:10px;letter-spacing:0.6px;text-transform:uppercase;color:#8b949e;margin-bottom:4px">Server bot (Render) · solo modalità Server</label>' +
    '    <input id="zx-server" spellcheck="false" placeholder="https://zero-xxx.onrender.com" style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:7px 9px;color:#e6edf3;font-size:12px;outline:none">' +
    '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
    '      <div><label style="display:block;font-size:10px;text-transform:uppercase;color:#8b949e;margin-bottom:4px">Nome bot</label><input id="zx-name" value="XEVBOT1" style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:7px 9px;color:#e6edf3;font-size:12px;outline:none"></div>' +
    '      <div><label style="display:block;font-size:10px;text-transform:uppercase;color:#8b949e;margin-bottom:4px">Numero bot</label><input id="zx-amount" type="number" min="1" value="10" style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:7px 9px;color:#e6edf3;font-size:12px;outline:none"></div>' +
    '    </div>' +
    '    <label style="display:block;font-size:10px;letter-spacing:0.6px;text-transform:uppercase;color:#8b949e;margin:8px 0 4px">Server di gioco (opzionale · modalità Server)</label>' +
    '    <input id="zx-game" spellcheck="false" placeholder="wss://web-arenas-live-… (vuoto = decide il server)" style="width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:7px 9px;color:#e6edf3;font-size:12px;outline:none">' +
    '    <div style="display:flex;gap:8px;margin-top:12px">' +
    '      <button id="zx-start" style="flex:1.4;background:#238636;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700;font-size:12px;cursor:pointer">▶ Avvia</button>' +
    '      <button id="zx-stop" style="flex:1;background:#da3633;color:#fff;border:0;border-radius:8px;padding:9px;font-weight:700;font-size:12px;cursor:pointer">■ Ferma</button>' +
    '    </div>' +
    '    <div style="display:flex;gap:8px;margin-top:8px">' +
    '      <button id="zx-split" style="flex:1;background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:600;font-size:12px;cursor:pointer">Split</button>' +
    '      <button id="zx-feed" style="flex:1;background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:8px;font-weight:600;font-size:12px;cursor:pointer">Feed</button>' +
    '      <button id="zx-vshield" style="flex:1;background:#30363d;color:#e6edf3;border:1px solid #484f58;border-radius:8px;padding:8px;font-weight:600;font-size:12px;cursor:pointer">Vshield</button>' +
    '    </div>' +
    '    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:7px 9px">' +
    '      <select id="zx-mode" style="background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:6px 4px;font-size:11px;outline:none">' +
    '        <option value="server">Server</option><option value="script">Script di gioco</option>' +
    '      </select>' +
    '      <button id="zx-connect" style="flex-shrink:0;background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-weight:700;font-size:11px;cursor:pointer">Connetti</button>' +
    '      <span id="zx-state" style="flex:1;text-align:right;font-size:11px;color:#8b949e">offline</span>' +
    '    </div>' +
    '    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
    '      <label style="font-size:10px;color:#8b949e">Tasto salva:</label>' +
    '      <input id="zx-key" value="s" maxlength="1" style="width:30px;text-align:center;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:4px;color:#e6edf3;font-size:11px;outline:none">' +
    '      <label style="font-size:10px;color:#8b949e;display:flex;align-items:center;gap:4px"><input id="zx-ctrl" type="checkbox" checked style="accent-color:#1f6feb"> Ctrl</label>' +
    '      <label style="font-size:10px;color:#8b949e;display:flex;align-items:center;gap:4px;margin-left:auto"><input id="zx-auto" type="checkbox" checked style="accent-color:#1f6feb"> Autosave</label>' +
    '    </div>' +
    '    <div id="zx-msg" style="margin-top:8px;font-size:11px;color:#7ee787;min-height:14px"></div>' +
    '  </div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(root);

  var $ = function (id) { return document.getElementById(id); };
  var dot = $("zx-dot"), body = $("zx-body"), head = $("zx-head"), caret = $("zx-caret"),
      msg = $("zx-msg"), panel = $("zx-panel");
  var collapsed = false;

  // ── Drag del menu (trascina dalla barra; clic = apri/chiudi) ──
  var dragging = false, moved = false, sx = 0, sy = 0, sl = 0, st = 0;
  head.addEventListener("mousedown", function (e) {
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    var r = panel.getBoundingClientRect();
    sl = r.left; st = r.top;
    e.preventDefault();
  });
  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (moved) {
      panel.style.left = Math.max(0, sl + dx) + "px";
      panel.style.top = Math.max(0, st + dy) + "px";
      panel.style.right = "auto";
    }
  });
  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "block";
      caret.textContent = collapsed ? "▼" : "▲";
    } else if (readForm().auto) {
      var s = load();
      s.pos = { left: panel.style.left, top: panel.style.top };
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    }
  });

  function readForm() {
    return {
      server: $("zx-server").value.trim(),
      name: $("zx-name").value.trim(),
      amount: parseInt($("zx-amount").value, 10) || 10,
      game: $("zx-game").value.trim(),
      mode: $("zx-mode").value,
      vshield: state.vshield,
      key: ($("zx-key").value || "s").toLowerCase(),
      ctrl: $("zx-ctrl").checked,
      auto: $("zx-auto").checked
    };
  }
  function applyForm(s) {
    if (s.server !== undefined) $("zx-server").value = s.server;
    if (s.name !== undefined) $("zx-name").value = s.name;
    if (s.amount !== undefined) $("zx-amount").value = s.amount;
    if (s.game !== undefined) $("zx-game").value = s.game;
    if (s.mode !== undefined) $("zx-mode").value = s.mode;
    if (s.key !== undefined) $("zx-key").value = s.key;
    if (s.ctrl !== undefined) $("zx-ctrl").checked = !!s.ctrl;
    if (s.auto !== undefined) $("zx-auto").checked = !!s.auto;
    if (s.pos && s.pos.left) { panel.style.left = s.pos.left; panel.style.top = s.pos.top; panel.style.right = "auto"; }
  }
  var saved = load();
  applyForm(saved);
  state.vshield = !!saved.vshield;
  paintVshield();

  var flashTimer = null;
  function flash(txt, color) {
    msg.textContent = txt;
    msg.style.color = color || "#7ee787";
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { msg.textContent = ""; }, 2600);
  }
  function btnLabel() {
    if (state.connected) return $("zx-mode").value === "script" ? "Scollega" : "Disconnetti";
    return $("zx-mode").value === "script" ? "Collega" : "Connetti";
  }
  function setState(connected) {
    state.connected = connected;
    dot.style.background = connected ? "#3fb950" : "#f85149";
    dot.style.boxShadow = connected ? "0 0 8px #3fb950" : "0 0 8px #f85149";
    $("zx-state").textContent = connected ? "connesso" : "offline";
    $("zx-state").style.color = connected ? "#7ee787" : "#8b949e";
    $("zx-connect").textContent = btnLabel();
  }
  function paintVshield() {
    $("zx-vshield").style.background = state.vshield ? "#9e6a03" : "#30363d";
    $("zx-vshield").style.border = state.vshield ? "1px solid #d29922" : "1px solid #484f58";
    $("zx-vshield").textContent = state.vshield ? "Vshield ON" : "Vshield";
  }

  function scriptGG() { return window.gg; }
  function scriptConnected() {
    var g = scriptGG();
    return !!(g && g.ws && g.ws.readyState === 1);
  }

  function send(data) {
    if ($("zx-mode").value === "script") {
      if (!scriptConnected()) { flash("Script di gioco non collegato", "#f85149"); return false; }
      scriptGG().send(data);
      return true;
    }
    if (!ws || ws.readyState !== 1) { flash("Non sei connesso", "#f85149"); return false; }
    ws.send(data);
    return true;
  }

  function connect() {
    if ($("zx-mode").value === "script") {
      if (state.connected) { setState(false); flash("Scollegato dallo script (lo script resta attivo)"); return; }
      if (scriptConnected()) { setState(true); flash("Connesso tramite lo script di gioco"); if (readForm().auto) save(); return; }
      flash("Script di gioco non attivo: installa ZeroExtens Bots PRO", "#f85149");
      return;
    }
    if (ws && ws.readyState === 1) { ws.close(); return; }
    var base = $("zx-server").value.trim();
    if (!base) { flash("Inserisci l'URL del server bot", "#f85149"); return; }
    var url = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    try { ws = new WebSocket(url); } catch (e) { flash("URL non valido", "#f85149"); return; }
    ws.onopen = function () { setState(true); flash("Connesso: " + url); if (readForm().auto) save(); };
    ws.onmessage = function (ev) {
      if (typeof ev.data === "string") return;
      var buf = ev.data instanceof Blob ? null : new Uint8Array(ev.data);
      if (buf && buf[0] === 0) {
        var parts = new TextDecoder().decode(buf.subarray(1)).split("/");
        flash("Bot attivi: " + parts[0]);
      }
    };
    ws.onerror = function () { flash("Errore di rete / bloccato dal browser", "#f85149"); };
    ws.onclose = function () { setState(false); ws = null; };
  }

  $("zx-connect").addEventListener("click", connect);
  $("zx-start").addEventListener("click", function () {
    var s = readForm();
    if (send(opStart(s.game, s.name || "XEVBOT1", s.amount))) flash("Avvia inviato · " + s.amount + " bot");
  });
  $("zx-stop").addEventListener("click", function () { if (send(opStop())) flash("Ferma inviato"); });
  $("zx-split").addEventListener("click", function () { if (send(opSplit())) flash("Split inviato"); });
  $("zx-feed").addEventListener("click", function () { if (send(opFeed())) flash("Feed inviato"); });
  $("zx-vshield").addEventListener("click", function () {
    state.vshield = !state.vshield;
    paintVshield();
    if (send(opVshield(state.vshield))) flash(state.vshield ? "Vshield attivo" : "Vshield disattivato");
    if (readForm().auto) save();
  });

  // Autosave
  ["zx-server", "zx-name", "zx-amount", "zx-game", "zx-key"].forEach(function (id) {
    $(id).addEventListener("input", function () { if (readForm().auto) save(); });
  });
  ["zx-ctrl", "zx-auto", "zx-mode"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      if (id === "zx-mode") { $("zx-connect").textContent = btnLabel(); if (state.connected && $("zx-mode").value === "script" && !scriptConnected()) setState(false); }
      if (readForm().auto) save();
    });
  });

  // Tasto rapido per salvare
  document.addEventListener("keydown", function (e) {
    var s = readForm();
    if (e.key.toLowerCase() === s.key && (s.ctrl ? e.ctrlKey : true)) { save(); e.preventDefault(); }
  });

  // Aggiorna lo stato in base alla modalità
  setInterval(function () {
    var on = $("zx-mode").value === "script" ? scriptConnected() : !!(ws && ws.readyState === 1);
    if (on !== state.connected) setState(on);
  }, 1000);

  // Connessione automatica all'avvio
  if (saved.server && saved.mode !== "script") { setTimeout(connect, 600); }
  else if (saved.mode === "script" && scriptConnected()) { setTimeout(function () { setState(true); }, 800); }

  // Mantiene il menu in pagina (agar.io ricostruisce il DOM)
  function reattach() {
    if (root.isConnected) return;
    var host = document.body || document.documentElement;
    try { host.appendChild(root); } catch (e) {}
  }
  setInterval(reattach, 800);
  if (window.MutationObserver) {
    var mo = new MutationObserver(reattach);
    var t = document.body || document.documentElement;
    mo.observe(t, { childList: true, subtree: true });
  }
})();
