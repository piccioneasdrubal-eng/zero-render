/* eslint-disable */
// ==UserScript==
// @name         ZeroExtens Panel Bridge
// @namespace    zeroextens
// @version      1.1
// @description  Collega il pannello web al tuo script ZeroExtens Bots PRO: rileva automaticamente la connessione dello script e inoltra i comandi del pannello, riportandone lo stato.
// @author       ZeroExtens
// @match        *://agar.io/*
// @match        *://www.agar.io/*
// @match        *://delt.io/*
// @match        *://*.delt.io/*
// @match        *://deltav4.gitlab.io/*
// @match        *://doublesplit.it/*
// @match        *://*.doublesplit.it/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function () {
  "use strict";

  function LOG(m) { console.log("%c[Bridge]", "color:#7cc7ff;font-weight:bold", m); }

  // Codifica UTF-8 con terminatore NUL (come window.gg / server.js)
  function encStr(s) {
    var b = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) b.push(c);
      else if (c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
      else b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    b.push(0);
    return b;
  }

  // ── Rilevamento automatico dello script ──────────────────────────────
  // Il tuo script può esporre la connessione con qualsiasi nome.
  // 1) window.gg (convenzione predefinita)  2) window.__ZXPanelBridge.setConnection
  // 3) eventuali globali elencate in CANDIDATES.
  var CANDIDATES = ["gg", "ZeroExtens", "zx", "xevbots", "zxBots"];

  function gg() {
    if (window.__ZXPanelConnection) return window.__ZXPanelConnection;
    for (var i = 0; i < CANDIDATES.length; i++) {
      var c = window[CANDIDATES[i]];
      if (c && c.send) return c;
    }
    return null;
  }

  function connectedObj() {
    var g = gg();
    if (!g) return null;
    // L'oggetto connessione può stare su g.ws o essere g stesso (se g è un WebSocket o simile)
    if (g.ws) return g.ws;
    if (typeof g.readyState !== "undefined") return g;
    return null;
  }

  function isConnected() {
    var ws = connectedObj();
    if (!ws) return false;
    // readyState 1 = OPEN. Se non esposto, assumiamo connesso se esiste window.gg.
    return typeof ws.readyState === "undefined" ? true : ws.readyState === 1;
  }

  // Invia un comando alla connessione dello script. Ritorna true se disponibile.
  function exec(kind, payload) {
    var g = gg();
    if (!g || !g.send || !isConnected()) return false;
    var p = payload || {};
    switch (kind) {
      case "start": {
        var srv = p.server || (g.server) || "";
        var nm = p.name || (g.bots && g.bots.name) || "XEVBOT1";
        var amt = parseInt(p.amount, 10) || (g.bots && g.bots.amount) || 10;
        var body = [0].concat(encStr(srv)).concat(encStr(nm)).concat([amt & 255, amt >> 8]);
        g.send(new Uint8Array(body).buffer);
        return true;
      }
      case "stop": g.send(new Uint8Array([1]).buffer); return true;
      case "split": g.send(new Uint8Array([4]).buffer); return true;
      case "eject": g.send(new Uint8Array([3]).buffer); return true;
      case "move": {
        var m = new ArrayBuffer(9), d = new DataView(m);
        d.setUint8(0, 5); d.setInt32(1, (p.x || 0) | 0, true); d.setInt32(5, (p.y || 0) | 0, true);
        g.send(m); return true;
      }
      case "ai": g.send(new Uint8Array([2, 1, p.on ? 1 : 0]).buffer); return true;
      case "vshield": g.send(new Uint8Array([2, 0, p.on ? 1 : 0]).buffer); return true;
    }
    return false;
  }

  // Riporta lo stato al pannello che ha aperto questa pagina
  function status(kind, extra) {
    var g = gg();
    var st = {
      type: "xev:status",
      ok: true,
      kind: kind,
      connected: isConnected(),
      started: !!(g && g.bots && g.bots.started),
      name: (g && g.bots && g.bots.name) || "",
      amount: (g && g.bots && g.bots.amount) || 0
    };
    if (extra) { for (var k in extra) st[k] = extra[k]; }
    var target = window.opener || window.parent;
    try { if (target && target.postMessage) target.postMessage(st, "*"); } catch (e) {}
  }

  // Ascolta i comandi inviati dal pannello
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "xev:cmd") return;
    if (d.kind === "ping") { status("ping"); return; }
    var ok = exec(d.kind, d.payload);
    status(ok ? d.kind : "error", ok ? undefined : { msg: "Connessione dello script non disponibile" });
  });

  // Espone un punto di aggancio per il tuo script: chiama
  //   window.__ZXPanelBridge.setConnection(oggettoConnessione)
  // per fargli dichiarare la propria connessione (utile se non usa window.gg).
  window.__ZXPanelBridge = {
    setConnection: function (obj) {
      window.__ZXPanelConnection = obj;
      LOG("Connessione registrata dal tuo script");
      status("hello");
    },
    send: exec,
    isConnected: isConnected
  };

  // Annuncia la presenza finché lo script non è pronto
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (gg()) {
      clearInterval(t);
      LOG("Script rilevato (" + (window.__ZXPanelConnection ? "connessione registrata" : "window.gg") + ")");
      status("hello");
    } else if (tries > 400) {
      clearInterval(t);
      LOG("Nessuno script rilevato. Avvia ZeroExtens Bots PRO nella pagina.");
    }
  }, 250);
})();
