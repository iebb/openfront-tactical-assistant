// ==UserScript==
// @name         OpenFront Tactical Assistant
// @namespace    https://github.com/local/openfront-script
// @version      0.9.2
// @description  OpenFront 战术助手 — 出生/扩张/农场/自动进攻/防御/武器/联盟全自动，中文界面。
// @license      MIT
// @match        https://openfront.io/*
// @match        https://beta.openfront.io/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// @inject-into  auto
// @downloadURL https://update.greasyfork.org/scripts/581664/OpenFront%20Tactical%20Assistant.user.js
// @updateURL https://update.greasyfork.org/scripts/581664/OpenFront%20Tactical%20Assistant.meta.js
// ==/UserScript==
(() => {
  // ofat:virtual:page-bundle
  var PAGE_BUNDLE_SOURCE = `(() => {
  // src/meta.js
  var APP = Object.freeze({
    name: "OpenFront Tactical Assistant",
    shortName: "OF Tactical",
    version: "0.9.2",
    modified: "2026-06-17",
    storageKey: "ofat.settings.v1",
    pagePayloadKey: "__OFAT_PAGE_PAYLOAD__",
    messageSource: "openfront-tactical-assistant"
  });
  var USERSCRIPT_META = Object.freeze({
    name: [APP.name],
    namespace: ["https://github.com/local/openfront-script"],
    version: [APP.version],
    description: ["Modular OpenFront advisor toolkit with spawn, threat, expansion, alliance, and optional assist features."],
    license: ["MIT"],
    match: ["https://openfront.io/*", "https://beta.openfront.io/*"],
    grant: ["GM_setValue", "GM_getValue", "GM_registerMenuCommand", "unsafeWindow"],
    "run-at": ["document-start"],
    "inject-into": ["auto"]
  });
  var DEFAULT_SETTINGS = Object.freeze({
    settingsSchemaVersion: 13,
    showAdvisorPanel: true,
    showHeatmap: true,
    hideAds: true,
    autopilot: false,
    autoSpawn: false,
    autoAlliance: false,
    autoFarm: false,
    autoFarmHumanTargets: true,
    autoEco: false,
    autoDefense: false,
    autoDefenseCounterAttack: true,
    autoDefenseBuildPosts: true,
    autoDefenseBuildSam: true,
    autoDefenseIncomingRatio: 0.35,
    autoBoat: false,
    autoWeapons: false,
    autoWeaponsEarlyNuke: false,
    autoTeamSupport: true,
    autoTeamSupportGold: false,
    autoSosQuickChat: true,
    smartAttack: false,
    showAttackBadges: true,
    showRatioBar: true,
    showTroopRatios: true,
    showWeaknessIndicator: true,
    showDangerIndicator: true,
    showThreatIcons: true,
    showTroopEconomy: true,
    roundLogging: true,
    roundLogAutoDownload: false,
    roundLogSnapshotIntervalMs: 5e3,
    roundLogKeepPlayerNames: true,
    networkLogging: true,
    autoSpawnDelayMs: 2e3,
    autoFarmWindowMs: 24e4,
    autoFarmReserveRatio: 0.55,
    autoFarmCooldownMs: 2500,
    autoFarmDynamicReserve: true,
    autoFarmBaseReserveRatio: 0.3,
    autoFarmMinReserveRatio: 0.2,
    autoFarmMaxReserveRatio: 0.65,
    autoExpand: true,
    autoAttack: false,
    autoAttackIncludeMark: false,
    autoAttackCooldownMs: 3000,
    autoAttackAggression: 2,
    autoNukeStrike: false
  });

  // src/shared/event-bus.js
  function createEventBus() {
    const listeners = /* @__PURE__ */ new Map();
    return {
      on(type, listener) {
        if (!listeners.has(type)) listeners.set(type, /* @__PURE__ */ new Set());
        listeners.get(type).add(listener);
        return () => listeners.get(type)?.delete(listener);
      },
      emit(type, payload) {
        const set = listeners.get(type);
        if (!set) return;
        set.forEach((listener) => {
          try {
            listener(payload);
          } catch (error) {
            console.error("[OF Tactical] Event listener failed", type, error);
          }
        });
      }
    };
  }

  // src/shared/logger.js
  function createLogger(app) {
    const prefix = \`[\${app.shortName}]\`;
    return {
      info(message, ...args) {
        console.log(\`\${prefix} \${message}\`, ...args);
      },
      warn(message, ...args) {
        console.warn(\`\${prefix} \${message}\`, ...args);
      },
      error(message, ...args) {
        console.error(\`\${prefix} \${message}\`, ...args);
      },
      banner() {
        console.log(\`%c\${prefix} v\${app.version} loaded\`, "color:#4fc3f7;font-weight:bold");
      }
    };
  }

  // src/settings/settings-store.js
  function createSettingsStore(defaults, initialValues = {}) {
    const values = Object.assign({}, defaults, initialValues);
    const listeners = /* @__PURE__ */ new Set();
    function has(key) {
      return Object.prototype.hasOwnProperty.call(defaults, key);
    }
    return {
      values,
      has,
      get(key) {
        return has(key) ? values[key] : void 0;
      },
      set(key, value, meta = {}) {
        if (!has(key)) return false;
        if (values[key] === value) return true;
        values[key] = value;
        listeners.forEach((listener) => listener({ key, value, meta }));
        return true;
      },
      update(nextValues, meta = {}) {
        Object.keys(nextValues || {}).forEach((key) => this.set(key, nextValues[key], meta));
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      snapshot() {
        return Object.assign({}, values);
      }
    };
  }

  // src/page/page-settings.js
  function createPageSettingsStore(app, defaults, initialSettings) {
    const store = createSettingsStore(defaults, loadLocalSettings(app, initialSettings));
    store.onChange(({ key, value, meta }) => {
      saveLocalSettings(app, store.snapshot());
      if (!meta.skipUserscriptSync) {
        window.postMessage({ source: app.messageSource, type: "setting-changed", key, value }, "*");
      }
    });
    window.addEventListener("message", (event) => {
      const data = event && event.data;
      if (!data || data.source !== app.messageSource || data.type !== "set-setting") return;
      store.set(data.key, data.value, { skipUserscriptSync: true });
    });
    return store;
  }
  function loadLocalSettings(app, initialSettings) {
    try {
      const raw = localStorage.getItem(app.storageKey);
      if (!raw) return initialSettings;
      const settings = Object.assign({}, initialSettings, JSON.parse(raw));
      return applyLocalSettingsMigrations(app, initialSettings, settings);
    } catch (_) {
      return initialSettings;
    }
  }
  function applyLocalSettingsMigrations(app, initialSettings, settings) {
    const targetSchema = Number(initialSettings.settingsSchemaVersion) || 0;
    const currentSchema = Number(settings.settingsSchemaVersion) || 0;
    if (!targetSchema || currentSchema >= targetSchema) return settings;
    const migrated = Object.assign({}, settings, {
      roundLogAutoDownload: false,
      settingsSchemaVersion: targetSchema
    });
    saveLocalSettings(app, migrated);
    return migrated;
  }
  function saveLocalSettings(app, settings) {
    try {
      localStorage.setItem(app.storageKey, JSON.stringify(settings));
    } catch (_) {
    }
  }

  // src/shared/dom.js
  function appendWhenReady(node, parentSelector = "head") {
    const target = parentSelector === "body" ? document.body : document.head || document.documentElement;
    if (target) {
      target.appendChild(node);
      return;
    }
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const parent = parentSelector === "body" ? document.body : document.head;
        parent.appendChild(node);
      },
      { once: true }
    );
  }
  function removeElementById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
  function preventFocusSteal(container) {
    if (!container || container._ofatNoFocusSteal) return;
    container._ofatNoFocusSteal = true;
    container.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target && target.closest && target.closest("button")) event.preventDefault();
    });
  }
  function createStyle(id, css) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    appendWhenReady(style);
    return style;
  }
  function makeDraggable(el, options = {}) {
    const buttonSelector = options.ignoreSelector || "button";
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    el.addEventListener("mousedown", (event) => {
      if (event.target && event.target.closest && event.target.closest(buttonSelector)) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
    });
    document.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      el.style.left = \`\${Math.max(0, event.clientX - offsetX)}px\`;
      el.style.top = \`\${Math.max(0, event.clientY - offsetY)}px\`;
      el.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  // src/page/hide-ads.js
  var AD_DOMAINS = [
    "googlesyndication.com",
    "doubleclick.net",
    "doubleverify.com",
    "googleadservices.com",
    "googletag",
    "adservice.google",
    "pagead2.googlesyndication",
    "tpc.googlesyndication",
    "securepubads.g.doubleclick",
    "pubads.g.doubleclick",
    "vpaid.doubleverify",
    "vtrk.dv.tech",
    "innovid.com",
    "ads.pubmatic.com",
    "secure.adnxs.com",
    "ib.adnxs.com",
    "rubiconproject.com",
    "openx.net",
    "advertising.com",
    "amazon-adsystem.com",
    "adsafeprotected.com",
    "moatads.com",
    "chartboost.com",
    "criteo.com",
    "bidswitch.net",
    "playwire.com",
    "intergient.com"
  ];
  var AD_SELECTORS = [
    "[id*='standard_iab']",
    "[class*='bottom_rail']",
    "[class*='bottom-rail']",
    ".pw-oop",
    ".pw-tag",
    "[id^='pw-']",
    "[data-pw-desk]",
    "[data-pw-mobi]",
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='doubleverify']",
    "iframe[src*='googleadservices']",
    "iframe[src*='adsafeprotected']",
    "iframe[src*='amazon-adsystem']",
    "iframe[src*='innovid']",
    "iframe[src*='adnxs']",
    "iframe[src*='rubiconproject']",
    "iframe[src*='openx']",
    "iframe[src*='criteo']",
    "iframe[src*='bidswitch']",
    "iframe[src*='moatads']",
    "iframe[title='Advertisement']",
    "iframe[title='advertisement']",
    "ins.adsbygoogle",
    "[id*='google_ads']",
    "[id*='div-gpt-ad']",
    "[data-ad]"
  ];
  var installed = false;
  function hideAds() {
    if (installed) return;
    installed = true;
    neutralizeRamp();
    installNetworkBlocking();
    installDomBlocking();
  }
  function neutralizeRamp() {
    try {
      window.adsEnabled = false;
      window.ramp = {
        que: [],
        spaAddAds() {
        },
        spaAds() {
        },
        destroyUnits() {
        }
      };
    } catch (_) {
    }
    createStyle(
      "ofat-ad-block-style",
      \`\${AD_SELECTORS.join(",")}{display:none!important;visibility:hidden!important;height:0!important;width:0!important;pointer-events:none!important;}\`
    );
  }
  function isAdUrl(url) {
    if (!url) return false;
    try {
      const str = String(url).toLowerCase();
      return AD_DOMAINS.some((domain) => str.includes(domain));
    } catch (_) {
      return false;
    }
  }
  function installNetworkBlocking() {
    try {
      const origFetch = window.fetch;
      if (typeof origFetch === "function" && !origFetch.__ofatAdBlock) {
        const patched = function patchedFetch(input, init) {
          const url = input && typeof input === "object" ? input.url : input;
          if (isAdUrl(url)) return Promise.reject(new TypeError("blocked ad request"));
          return origFetch.apply(this, arguments);
        };
        patched.__ofatAdBlock = true;
        window.fetch = patched;
      }
    } catch (_) {
    }
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      if (origOpen && !origOpen.__ofatAdBlock) {
        const patchedOpen = function patchedXhrOpen(method, url) {
          if (isAdUrl(url)) this.__ofatAdBlocked = true;
          return origOpen.apply(this, arguments);
        };
        patchedOpen.__ofatAdBlock = true;
        XMLHttpRequest.prototype.open = patchedOpen;
        XMLHttpRequest.prototype.send = function patchedXhrSend() {
          if (this.__ofatAdBlocked) return void 0;
          return origSend.apply(this, arguments);
        };
      }
    } catch (_) {
    }
  }
  function installDomBlocking() {
    const nuke = (root) => {
      if (!root || typeof root.querySelectorAll !== "function") return;
      AD_SELECTORS.forEach((selector) => {
        try {
          root.querySelectorAll(selector).forEach((el) => el.remove());
        } catch (_) {
        }
      });
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const src = String(node.src || node.href || "").toLowerCase();
          if (isAdUrl(src) || node.tagName === "IFRAME" && /advert/i.test(node.title || "")) {
            try {
              node.remove();
            } catch (_) {
            }
            continue;
          }
          nuke(node);
        }
      }
    });
    const start = () => {
      nuke(document);
      try {
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch (_) {
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  // src/page/openfront/map-assets.js
  function installMapAssetHook({ bus, logger }) {
    const origFetch = window.fetch;
    if (typeof origFetch !== "function") return;
    let pendingManifest = null;
    let pendingTerrainBin = null;
    let pendingTerrainIs4x = null;
    let mapLoaded = false;
    window.fetch = function patchedFetch() {
      const args = arguments;
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url || "";
      if (/\\/maps\\//.test(url) && /\\/manifest(\\.[a-f0-9]+)?\\.json(\\?|$)/.test(url)) {
        return origFetch.apply(this, args).then((response) => {
          response.clone().json().then((manifest) => {
            pendingManifest = manifest;
            tryAssembleMap();
          }).catch(() => {
          });
          return response;
        });
      }
      if (/\\/maps\\//.test(url) && /\\/map(4x)?(\\.[a-f0-9]+)?\\.bin(\\?|$)/.test(url)) {
        const is4x = /\\/map4x(\\.[a-f0-9]+)?\\.bin/.test(url);
        return origFetch.apply(this, args).then((response) => {
          response.clone().arrayBuffer().then((buffer) => {
            pendingTerrainBin = new Uint8Array(buffer);
            pendingTerrainIs4x = is4x;
            tryAssembleMap();
          }).catch(() => {
          });
          return response;
        });
      }
      return origFetch.apply(this, args);
    };
    function tryAssembleMap() {
      if (!pendingManifest || !pendingTerrainBin || mapLoaded) return;
      const metaKey = pendingTerrainIs4x ? "map4x" : "map";
      const meta = pendingManifest[metaKey];
      if (!meta) return;
      const width = meta.width;
      const height = meta.height;
      const terrain = pendingTerrainBin;
      if (terrain.length !== width * height) return;
      let nations = pendingManifest.nations || [];
      if (pendingTerrainIs4x) {
        nations = nations.map((nation) => ({
          name: nation.name,
          flag: nation.flag,
          coordinates: [Math.floor(nation.coordinates[0] / 2), Math.floor(nation.coordinates[1] / 2)]
        }));
      }
      mapLoaded = true;
      logger.info(\`Map \${width}x\${height}, \${nations.length} nations\`);
      bus.emit("mapLoaded", { terrain, width, height, nations });
    }
  }

  // src/page/openfront/network-hooks.js
  function installNetworkHooks({ bus, getSmartAttackModifier, logger }) {
    const OrigWS = window.WebSocket;
    const WorkerCtor = window.Worker;
    if (!OrigWS || !OrigWS.prototype) return { OrigWS: null, origWsSend: null };
    const origWsSend = OrigWS.prototype.send;
    installWebSocketHooks(OrigWS, origWsSend, bus, getSmartAttackModifier, logger);
    installWorkerHooks(WorkerCtor, bus);
    return { OrigWS, origWsSend };
  }
  function installWebSocketHooks(OrigWS, origWsSend, bus, getSmartAttackModifier, logger) {
    const origWsAddEL = OrigWS.prototype.addEventListener;
    let wsMessageCount = 0;
    function interceptWsMessage(data) {
      try {
        const message = typeof data === "string" ? JSON.parse(data) : null;
        if (!message || !message.type) return;
        wsMessageCount += 1;
        if (wsMessageCount === 1) logger.info(\`First websocket message: \${message.type}\`);
        bus.emit("wsMessage", message);
      } catch (_) {
      }
    }
    window.WebSocket = function PatchedWebSocket() {
      const args = Array.prototype.slice.call(arguments);
      const ws = new (Function.prototype.bind.apply(OrigWS, [null].concat(args)))();
      const wsUrl = String(args[0] || "");
      origWsAddEL.call(ws, "message", (event) => interceptWsMessage(event.data));
      if (wsUrl.indexOf("/lobbies") === -1 && wsUrl.indexOf("/matchmaking") === -1) {
        bus.emit("socketReady", ws);
        const sendForThisSocket = ws.send.bind(ws);
        ws.send = function patchedSend(data) {
          const modifier = getSmartAttackModifier();
          return sendForThisSocket(modifier ? modifier(data) : data);
        };
        ws.addEventListener("close", () => bus.emit("socketClosed", ws));
      }
      return ws;
    };
    window.WebSocket.prototype = OrigWS.prototype;
    window.WebSocket.CONNECTING = OrigWS.CONNECTING;
    window.WebSocket.OPEN = OrigWS.OPEN;
    window.WebSocket.CLOSING = OrigWS.CLOSING;
    window.WebSocket.CLOSED = OrigWS.CLOSED;
  }
  function installWorkerHooks(WorkerCtor, bus) {
    if (!WorkerCtor || !WorkerCtor.prototype) return;
    const origWorkerAddEL = WorkerCtor.prototype.addEventListener;
    const origWorkerOnmsgDesc = Object.getOwnPropertyDescriptor(WorkerCtor.prototype, "onmessage");
    function interceptWorkerMessage(data) {
      if (!data || data.type !== "game_update_batch" || !data.gameUpdates) return;
      bus.emit("workerGameUpdateBatch", data);
    }
    WorkerCtor.prototype.addEventListener = function patchedWorkerAddEventListener(type, listener) {
      if (type === "message" && typeof listener === "function") {
        const wrapped = function wrappedWorkerMessage(event) {
          interceptWorkerMessage(event.data);
          return listener.apply(this, arguments);
        };
        return origWorkerAddEL.call(this, type, wrapped);
      }
      return origWorkerAddEL.apply(this, arguments);
    };
    if (origWorkerOnmsgDesc && origWorkerOnmsgDesc.set) {
      Object.defineProperty(WorkerCtor.prototype, "onmessage", {
        get: origWorkerOnmsgDesc.get,
        set(fn) {
          if (typeof fn !== "function") {
            origWorkerOnmsgDesc.set.call(this, fn);
            return;
          }
          const wrapped = function wrappedWorkerOnMessage(event) {
            interceptWorkerMessage(event.data);
            return fn.apply(this, arguments);
          };
          origWorkerOnmsgDesc.set.call(this, wrapped);
        },
        configurable: true,
        enumerable: true
      });
    }
  }

  // src/page/openfront/game-state.js
  var GUT_PLAYER = 2;
  function createGameState() {
    const state = {
      myClientID: null,
      myPlayerID: null,
      mySmallID: null,
      currentTick: 0,
      currentTurn: 0,
      gameStarted: false,
      roundStartedAtMs: 0,
      gameSocket: null,
      playerSpawns: /* @__PURE__ */ new Map(),
      playerStates: /* @__PURE__ */ new Map()
    };
    return {
      state,
      handleWsMessage(message, mapData) {
        if (message.type === "start") {
          if (message.myClientID) state.myClientID = message.myClientID;
          state.gameStarted = true;
          state.roundStartedAtMs = performance.now();
          state.currentTurn = 0;
          if (message.turns) message.turns.forEach((turn) => handleTurn(state, turn, mapData));
        } else if (message.type === "turn" && message.turn) {
          handleTurn(state, message.turn, mapData);
        } else if (message.type === "lobby_info" && message.myClientID) {
          state.myClientID = message.myClientID;
        }
      },
      handleWorkerBatch(batch) {
        for (let gi = 0; gi < batch.gameUpdates.length; gi += 1) {
          const gameUpdate = batch.gameUpdates[gi];
          state.currentTick = gameUpdate.tick || state.currentTick;
          if (!gameUpdate.updates) continue;
          const playerUpdates = gameUpdate.updates[GUT_PLAYER];
          if (!playerUpdates) continue;
          for (let pi = 0; pi < playerUpdates.length; pi += 1) {
            const update = playerUpdates[pi];
            if (!update.id) continue;
            const previous = state.playerStates.get(update.id) || { id: update.id };
            const merged = Object.assign({}, previous, update);
            state.playerStates.set(update.id, merged);
            if (merged.clientID && merged.clientID === state.myClientID) {
              state.myPlayerID = merged.id;
              state.mySmallID = merged.smallID;
            }
          }
        }
      },
      resetSocket(socket) {
        if (state.gameSocket !== socket) return;
        state.gameStarted = false;
        state.gameSocket = null;
        state.myPlayerID = null;
        state.mySmallID = null;
        state.currentTick = 0;
        state.currentTurn = 0;
        state.roundStartedAtMs = 0;
        state.playerStates.clear();
      },
      setSocket(socket) {
        state.gameSocket = socket;
      },
      getMyState() {
        return state.myPlayerID ? state.playerStates.get(state.myPlayerID) : null;
      }
    };
  }
  function handleTurn(state, turn, mapData) {
    const turnNumber = Number(turn?.turnNumber ?? turn?.turn ?? turn?.number ?? turn?.id);
    if (Number.isFinite(turnNumber)) state.currentTurn = Math.max(state.currentTurn, turnNumber);
    else state.currentTurn += 1;
    extractSpawnIntents(state, turn, mapData);
  }
  function extractSpawnIntents(state, turn, mapData) {
    if (!turn || !turn.intents || !mapData || !mapData.width) return;
    for (let i = 0; i < turn.intents.length; i += 1) {
      const intent = turn.intents[i];
      if (intent.type !== "spawn" || !intent.clientID || intent.clientID === state.myClientID) continue;
      const x = intent.tile % mapData.width;
      const y = Math.floor(intent.tile / mapData.width);
      state.playerSpawns.set(intent.clientID, { x, y });
    }
  }

  // src/page/openfront/game-view-adapter.js
  var GAME_VIEW_SELECTORS = ["leader-board", "player-info-overlay", "control-panel", "spawn-timer"];
  var GAME_VIEW_PROPS = ["game", "g"];
  var cachedGameView = null;
  var cachedGameViewSource = null;
  var capturedGameView = null;
  var captureInstalled = false;
  function installGameViewCapture() {
    if (captureInstalled) return;
    captureInstalled = true;
    try {
      const HtmlProto = typeof HTMLElement !== "undefined" ? HTMLElement.prototype : null;
      GAME_VIEW_PROPS.forEach((prop) => patchGameProperty(HtmlProto, prop));
      if (window.customElements && typeof window.customElements.define === "function" && !window.customElements.__ofatGameCapture) {
        const nativeDefine = window.customElements.define.bind(window.customElements);
        window.customElements.define = function patchedDefine(name, ctor, options) {
          try {
            if (ctor && ctor.prototype) GAME_VIEW_PROPS.forEach((prop) => patchGameProperty(ctor.prototype, prop));
          } catch (_) {
          }
          return nativeDefine(name, ctor, options);
        };
        Object.defineProperty(window.customElements, "__ofatGameCapture", { configurable: true, value: true });
      }
    } catch (_) {
    }
  }
  function patchGameProperty(proto, prop) {
    const patchedKey = \`__ofat_\${prop}_patched\`;
    if (!proto || Object.prototype.hasOwnProperty.call(proto, patchedKey)) return;
    let desc = null;
    let cursor = proto;
    while (cursor && cursor !== Object.prototype) {
      desc = Object.getOwnPropertyDescriptor(cursor, prop);
      if (desc) break;
      cursor = Object.getPrototypeOf(cursor);
    }
    const storageKey = Symbol(\`ofat_\${prop}\`);
    try {
      Object.defineProperty(proto, prop, {
        configurable: true,
        get() {
          if (desc && typeof desc.get === "function") return desc.get.call(this);
          return this[storageKey];
        },
        set(value) {
          if (looksLikeGameView(value)) capturedGameView = value;
          if (desc && typeof desc.set === "function") desc.set.call(this, value);
          else this[storageKey] = value;
        }
      });
      Object.defineProperty(proto, patchedKey, { configurable: true, value: true });
    } catch (_) {
    }
  }
  function looksLikeGameView(value) {
    return !!value && typeof value === "object" && typeof value.myPlayer === "function" && (typeof value.units === "function" || typeof value.unitStates === "function" || typeof value.players === "function" || typeof value.playerViews === "function");
  }
  function getGameView() {
    if (isValidGameView(cachedGameView)) return cachedGameView;
    cachedGameView = null;
    cachedGameViewSource = null;
    if (isValidGameView(capturedGameView)) {
      cachedGameView = capturedGameView;
      cachedGameViewSource = "captured";
      return capturedGameView;
    }
    try {
      for (let i = 0; i < GAME_VIEW_SELECTORS.length; i += 1) {
        const selector = GAME_VIEW_SELECTORS[i];
        const element = document.querySelector(selector);
        const candidate = element && element.game;
        if (!isValidGameView(candidate)) continue;
        cachedGameView = candidate;
        cachedGameViewSource = selector;
        return candidate;
      }
    } catch (_) {
    }
    return null;
  }
  function getGameViewDiscovery() {
    const gameView = getGameView();
    if (!gameView) return null;
    return {
      source: cachedGameViewSource || "unknown",
      hasConfig: typeof gameView.config === "function",
      hasMyPlayer: typeof gameView.myPlayer === "function",
      hasPlayerViews: typeof gameView.playerViews === "function",
      hasOwner: typeof gameView.owner === "function",
      hasNeighbors: typeof gameView.neighbors === "function"
    };
  }
  function resetGameViewCache() {
    cachedGameView = null;
    cachedGameViewSource = null;
    capturedGameView = null;
  }
  function getMyTroopRatio() {
    try {
      const gameView = getGameView();
      if (!gameView || typeof gameView.myPlayer !== "function" || typeof gameView.config !== "function") return null;
      const me = gameView.myPlayer();
      if (!me || typeof me.troops !== "function") return null;
      const config = gameView.config();
      if (!config || typeof config.maxTroops !== "function") return null;
      const troops = me.troops();
      const maxTroops = config.maxTroops(me);
      if (!Number.isFinite(troops) || !Number.isFinite(maxTroops) || maxTroops <= 0) return null;
      return { troops, maxTroops, ratio: troops / maxTroops };
    } catch (_) {
      return null;
    }
  }
  function isValidGameView(candidate) {
    if (!candidate) return false;
    return typeof candidate.myPlayer === "function" && typeof candidate.config === "function" && (typeof candidate.owner === "function" || typeof candidate.playerViews === "function" || typeof candidate.neighbors === "function");
  }
  function createNeighbourFetcher() {
    let inFlight = null;
    let cachedNeighbourIDs = null;
    let cachedHasOpenFrontier = false;
    return {
      get cachedNeighbourIDs() {
        return cachedNeighbourIDs;
      },
      // true, wenn an meine Grenze unbeanspruchtes Land / TerraNullius ("Wildnis") grenzt.
      get cachedHasOpenFrontier() {
        return cachedHasOpenFrontier;
      },
      refresh() {
        if (inFlight) return inFlight;
        const gameView = getGameView();
        if (!gameView || typeof gameView.myPlayer !== "function") return Promise.resolve(null);
        const me = gameView.myPlayer();
        if (!me || typeof me.borderTiles !== "function") return Promise.resolve(null);
        inFlight = me.borderTiles().then((info) => {
          const neighbourIDs = /* @__PURE__ */ new Set();
          let hasOpenFrontier = false;
          const myID = typeof me.id === "function" ? me.id() : null;
          const borders = info && info.borderTiles;
          if (borders && typeof borders.forEach === "function") {
            borders.forEach((borderTile) => {
              const adjacent = gameView.neighbors ? gameView.neighbors(borderTile) : [];
              for (let i = 0; i < adjacent.length; i += 1) {
                const tile = adjacent[i];
                if (gameView.hasOwner && !gameView.hasOwner(tile)) {
                  hasOpenFrontier = true;
                  continue;
                }
                const owner = gameView.owner ? gameView.owner(tile) : null;
                if (!owner) {
                  hasOpenFrontier = true;
                  continue;
                }
                const ownerIsPlayer = typeof owner.isPlayer === "function" ? owner.isPlayer() : false;
                if (!ownerIsPlayer) {
                  hasOpenFrontier = true;
                  continue;
                }
                const ownerID = typeof owner.id === "function" ? owner.id() : null;
                if (!ownerID || ownerID === myID) continue;
                neighbourIDs.add(ownerID);
              }
            });
          }
          cachedNeighbourIDs = neighbourIDs;
          cachedHasOpenFrontier = hasOpenFrontier;
          return neighbourIDs;
        }).catch(() => null).then((result) => {
          inFlight = null;
          return result;
        });
        return inFlight;
      }
    };
  }

  // src/page/openfront/openfront-mechanics.js
  var TICK_MS = 100;
  var GOLD_RESERVE = 25e3;
  var BASE_STRUCTURE_COST = 125e3;
  var MAX_ECO_STRUCTURE_COST = 1e6;
  var UNIT_FALLBACKS = Object.freeze({
    City: { durationMs: 2e3 },
    Port: { durationMs: 5e3 },
    Factory: { durationMs: 2e3 },
    "Defense Post": { durationMs: 5e3 },
    "Missile Silo": { cost: 1e6, durationMs: 1e4 },
    "SAM Launcher": { durationMs: 3e4 }
  });
  var SPAWN_TURNS_NORMAL = 300;
  var SPAWN_TURNS_RANDOM = 150;
  var SPAWN_TURNS_SINGLEPLAYER = 100;
  function getStructureCost(unit, { gameView = null, player = null, pendingCounts = {}, observedCounts = {} } = {}) {
    const runtime = readRuntimeUnitCost(unit, gameView, player);
    if (runtime != null) return { cost: runtime, source: "runtime", reserveGold: GOLD_RESERVE };
    const cost = fallbackStructureCost(unit, player, pendingCounts, observedCounts);
    return { cost, source: "official_fallback", reserveGold: GOLD_RESERVE };
  }
  function getConstructionDurationMs(unit, { gameView = null } = {}) {
    try {
      const info = readUnitInfo(unit, gameView);
      const raw = info && (info.constructionDuration ?? info.buildTime ?? info.duration);
      const value = toFiniteNumber(typeof raw === "function" ? raw() : raw);
      if (value != null && value > 0) return { durationMs: Math.max(500, value * TICK_MS), source: "runtime" };
    } catch (_) {
    }
    return { durationMs: UNIT_FALLBACKS[unit]?.durationMs || 5e3, source: "official_fallback" };
  }
  function getSpawnPhaseInfo({ gameView = null, state = null, teamMode = false } = {}) {
    const runtimeTurns = readRuntimeSpawnPhaseTurns(gameView);
    const totalTurns = runtimeTurns || fallbackSpawnPhaseTurns(gameView);
    const source = runtimeTurns ? "runtime" : "official_fallback";
    const currentTurn = Number(state?.currentTurn) || 0;
    const elapsedTurns = Math.max(0, currentTurn);
    const remainingTurns = Math.max(0, totalTurns - elapsedTurns);
    const totalMs = totalTurns * TICK_MS;
    const elapsedMs = state?.roundStartedAtMs ? performance.now() - state.roundStartedAtMs : elapsedTurns * TICK_MS;
    const waitCapMs = teamMode ? Math.min(1e4, totalMs * 0.4) : 0;
    return {
      totalTurns,
      currentTurn,
      elapsedTurns,
      remainingTurns,
      totalMs,
      elapsedMs,
      remainingMs: remainingTurns * TICK_MS,
      waitCapMs,
      source
    };
  }
  function estimateOfficialCaptureCost({ target, effectiveTargetTroops = 0, mapData = null, sampleTiles = [] } = {}) {
    const targetTiles = Math.max(1, toFiniteNumber(target?.tilesOwned) || 1);
    const density = Math.max(0, effectiveTargetTroops / targetTiles);
    const terrain = estimateTerrainCost(mapData, sampleTiles);
    const type = String(target?.playerType || "").toUpperCase();
    const botModifier = type === "BOT" ? 0.7 : 1;
    const defensePostMultiplier = estimateDefensePostMultiplier(target);
    const tileCost = Math.ceil((density + terrain.magnitude) * botModifier * defensePostMultiplier);
    const captureCostEstimate = Math.ceil(tileCost * targetTiles);
    const estimatedCaptureTurns = Math.max(1, Math.ceil(targetTiles / Math.max(1, terrain.speed)));
    return {
      source: "official_fallback",
      captureCostEstimate,
      tileCost,
      terrainClass: terrain.kind,
      terrainMagnitude: terrain.magnitude,
      terrainSpeed: terrain.speed,
      defensePostMultiplier,
      estimatedCaptureTurns
    };
  }
  function toFiniteNumber(value) {
    try {
      if (typeof value === "bigint") {
        const number2 = Number(value);
        return Number.isFinite(number2) ? number2 : null;
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    } catch (_) {
      return null;
    }
  }
  function countPlayerUnits(player, unit) {
    try {
      if (player && typeof player.units === "function") {
        const units = player.units(unit);
        if (Array.isArray(units)) return units.length;
        if (units && typeof units.length === "number") return units.length;
      }
    } catch (_) {
    }
    return 0;
  }
  function readRuntimeUnitCost(unit, gameView, player) {
    try {
      const info = readUnitInfo(unit, gameView);
      if (!info) return null;
      const raw = typeof info.cost === "function" ? tryCallCost(info.cost, gameView, player) : info.cost;
      const value = toFiniteNumber(raw);
      return value != null && value > 0 ? Math.ceil(value) : null;
    } catch (_) {
      return null;
    }
  }
  function tryCallCost(costFn, gameView, player) {
    const candidates = [
      () => costFn(gameView, player),
      () => costFn(player),
      () => costFn(gameView),
      () => costFn()
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const value = candidates[i]();
        if (value != null) return value;
      } catch (_) {
      }
    }
    return null;
  }
  function readUnitInfo(unit, gameView) {
    try {
      const config = gameView && typeof gameView.config === "function" ? gameView.config() : null;
      if (!config) return null;
      if (typeof config.unitInfo === "function") return config.unitInfo(unit);
      if (typeof config.structureInfo === "function") return config.structureInfo(unit);
    } catch (_) {
    }
    return null;
  }
  function fallbackStructureCost(unit, player, pendingCounts, observedCounts) {
    const pending = pendingCounts || {};
    const observed = observedCounts || {};
    if (unit === "City") {
      const count = Math.max(countPlayerUnits(player, "City"), observed.City || 0) + (pending.City || 0);
      return Math.min(MAX_ECO_STRUCTURE_COST, Math.pow(2, count) * BASE_STRUCTURE_COST);
    }
    if (unit === "Port" || unit === "Factory") {
      const actualShared = countPlayerUnits(player, "Port") + countPlayerUnits(player, "Factory");
      const observedShared = (observed.Port || 0) + (observed.Factory || 0);
      const count = Math.max(actualShared, observedShared) + (pending.Port || 0) + (pending.Factory || 0);
      return Math.min(MAX_ECO_STRUCTURE_COST, Math.pow(2, count) * BASE_STRUCTURE_COST);
    }
    if (unit === "Defense Post") {
      const count = Math.max(countPlayerUnits(player, "Defense Post"), observed["Defense Post"] || 0) + (pending["Defense Post"] || 0);
      return Math.min(25e4, (count + 1) * 5e4);
    }
    if (unit === "SAM Launcher") {
      const count = Math.max(countPlayerUnits(player, "SAM Launcher"), observed["SAM Launcher"] || 0) + (pending["SAM Launcher"] || 0);
      return Math.min(3e6, (count + 1) * 15e5);
    }
    return UNIT_FALLBACKS[unit]?.cost || BASE_STRUCTURE_COST;
  }
  function readRuntimeSpawnPhaseTurns(gameView) {
    try {
      const config = gameView && typeof gameView.config === "function" ? gameView.config() : null;
      if (config && typeof config.numSpawnPhaseTurns === "function") {
        const value = toFiniteNumber(config.numSpawnPhaseTurns());
        if (value != null && value > 0) return Math.round(value);
      }
    } catch (_) {
    }
    return null;
  }
  function fallbackSpawnPhaseTurns(gameView) {
    try {
      const config = gameView && typeof gameView.config === "function" ? gameView.config() : null;
      const gameConfig = config && typeof config.gameConfig === "function" ? config.gameConfig() : null;
      const mode = String(gameConfig?.gameMode || "").toLowerCase();
      if (mode.includes("single")) return SPAWN_TURNS_SINGLEPLAYER;
      if (gameConfig?.randomSpawn || mode.includes("random")) return SPAWN_TURNS_RANDOM;
    } catch (_) {
    }
    return SPAWN_TURNS_NORMAL;
  }
  function estimateTerrainCost(mapData, sampleTiles) {
    const tiles = Array.isArray(sampleTiles) ? sampleTiles.slice(0, 64) : [];
    let magnitude = 0;
    let count = 0;
    tiles.forEach((tile) => {
      const byte = mapData?.terrain ? mapData.terrain[Number(tile)] : null;
      if (byte == null) return;
      const mag = byte & 31;
      if (mag < 10) magnitude += 80;
      else if (mag < 20) magnitude += 100;
      else magnitude += 120;
      count += 1;
    });
    const avg = count > 0 ? magnitude / count : 100;
    if (avg <= 85) return { kind: "plains", magnitude: 80, speed: 16.5 };
    if (avg <= 105) return { kind: "highland", magnitude: 100, speed: 20 };
    return { kind: "mountain", magnitude: 120, speed: 25 };
  }
  function estimateDefensePostMultiplier(target) {
    try {
      const count = countPlayerUnits(target, "Defense Post");
      return count > 0 ? 1.4 : 1;
    } catch (_) {
      return 1;
    }
  }

  // src/page/openfront/team-detection.js
  function createTeamDetection({ gameState, logger, roundLogger }) {
    let isTeamMode = false;
    let myTeammateIDs = /* @__PURE__ */ new Set();
    let lobby = null;
    let lobbyObserver = null;
    let lobbyCaptured = false;
    let announced = false;
    const api = {
      get isTeamMode() {
        return isTeamMode;
      },
      get myTeamName() {
        return lobby?.myTeamName || (isTeamMode ? "Team" : null);
      },
      get myTeamColor() {
        return lobby?.myTeamColor || null;
      },
      observeLobby() {
        armLobbyObserver();
      },
      syncFromGameView() {
        const gv = getGameView();
        const mode = readGameMode(gv);
        if (mode != null) isTeamMode = mode === "Team";
        else if (lobby) isTeamMode = isTeamMode || lobby.isTeamMode;
        if (!isTeamMode) {
          if (myTeammateIDs.size) myTeammateIDs = /* @__PURE__ */ new Set();
          maybeAnnounce();
          return;
        }
        const next = /* @__PURE__ */ new Set();
        try {
          const me = gv && typeof gv.myPlayer === "function" ? gv.myPlayer() : null;
          const views = gv && typeof gv.playerViews === "function" ? gv.playerViews() : [];
          if (me && Array.isArray(views)) {
            views.forEach((pv) => {
              try {
                if (typeof pv.isOnSameTeam === "function" && pv.isOnSameTeam(me)) {
                  const id = typeof pv.id === "function" ? pv.id() : null;
                  if (id != null) next.add(id);
                }
              } catch (_) {
              }
            });
          }
        } catch (_) {
        }
        myTeammateIDs = next;
        maybeAnnounce();
      },
      isMyTeammate(playerID) {
        if (!isTeamMode || playerID == null) return false;
        if (myTeammateIDs.has(playerID)) return true;
        if (myTeammateIDs.size === 0 && lobby && lobby.myTeamName) {
          const player = gameState.state.playerStates.get(playerID);
          const name = normName(player?.name);
          if (name && lobby.playerNameToTeam[name] === lobby.myTeamName) return true;
        }
        return false;
      },
      getMyTeamMembers() {
        const members = [];
        const seenNames = /* @__PURE__ */ new Set();
        myTeammateIDs.forEach((id) => {
          const player = gameState.state.playerStates.get(id);
          const name = normName(player?.name) || String(id);
          seenNames.add(name);
          members.push({ id, name });
        });
        if (lobby) {
          lobby.myTeamPlayers.forEach((name) => {
            if (!seenNames.has(name)) members.push({ id: null, name });
          });
        }
        return members;
      },
      memberCount() {
        if (myTeammateIDs.size) return myTeammateIDs.size;
        return lobby ? lobby.myTeamPlayers.length : 0;
      },
      // clientIDs meiner Teammitglieder. Br\xFCcke f\xFCr Spawn-Daten (per clientID verschl\xFCsselt),
      // damit das Spawn-Scoring Team- von Gegner-Spawns trennen kann.
      myTeammateClientIDs() {
        const clients = /* @__PURE__ */ new Set();
        if (!isTeamMode) return clients;
        gameState.state.playerStates.forEach((player) => {
          if (!player || player.clientID == null) return;
          if (api.isMyTeammate(player.id)) clients.add(player.clientID);
        });
        return clients;
      },
      teamSummary() {
        return {
          isTeamMode,
          myTeamName: api.myTeamName,
          myTeamColor: api.myTeamColor,
          memberCount: api.memberCount()
        };
      },
      reset() {
        myTeammateIDs = /* @__PURE__ */ new Set();
        lobby = null;
        lobbyCaptured = false;
        isTeamMode = false;
        announced = false;
        if (lobbyObserver) {
          lobbyObserver.disconnect();
          lobbyObserver = null;
        }
        armLobbyObserver();
      }
    };
    return api;
    function maybeAnnounce() {
      if (announced || !isTeamMode) return;
      const count = myTeammateIDs.size || (lobby ? lobby.myTeamPlayers.length : 0);
      if (count <= 0) return;
      announced = true;
      roundLogger?.record("team_detected", {
        source: myTeammateIDs.size ? "gameview" : "lobby",
        myTeamName: lobby?.myTeamName || null,
        myTeamColor: lobby?.myTeamColor || null,
        memberCount: count
      });
    }
    function armLobbyObserver() {
      if (lobbyObserver || lobbyCaptured) return;
      if (tryCaptureLobby()) return;
      try {
        lobbyObserver = new MutationObserver(() => {
          if (tryCaptureLobby() && lobbyObserver) {
            lobbyObserver.disconnect();
            lobbyObserver = null;
          }
        });
        const root = document.body || document.documentElement;
        if (root) lobbyObserver.observe(root, { childList: true, subtree: true });
      } catch (_) {
      }
    }
    function tryCaptureLobby() {
      if (lobbyCaptured) return true;
      let root = null;
      try {
        root = document.querySelector("lobby-player-view");
      } catch (_) {
      }
      if (!root) return false;
      const parsed = parseLobbyTeams(root);
      if (!parsed) return false;
      lobby = parsed;
      lobbyCaptured = true;
      if (parsed.isTeamMode) isTeamMode = true;
      logger?.info?.(\`Team lobby parsed: my team \${parsed.myTeamName || "?"} (\${parsed.myTeamPlayers.length} players)\`);
      return true;
    }
  }
  function readGameMode(gv) {
    try {
      if (!gv || typeof gv.config !== "function") return null;
      const config = gv.config();
      if (!config || typeof config.gameConfig !== "function") return null;
      const gameConfig = config.gameConfig();
      return gameConfig ? gameConfig.gameMode : null;
    } catch (_) {
      return null;
    }
  }
  function parseLobbyTeams(root) {
    const teamNameToPlayers = {};
    const teamColorMap = {};
    const playerNameToTeam = {};
    let myTeamName = null;
    let myTeamColor = null;
    let dots = [];
    try {
      dots = Array.from(root.querySelectorAll("span[style*='--bg']"));
    } catch (_) {
      return null;
    }
    dots.forEach((dot) => {
      const header = dot.parentElement;
      const card = header ? header.parentElement : null;
      if (!header || !card) return;
      const nameSpan = header.querySelector("span.truncate");
      const teamName = nameSpan ? nameSpan.textContent.trim() : "";
      if (!teamName) return;
      const styleAttr = dot.getAttribute("style") || "";
      const colorMatch = styleAttr.match(/--bg:\\s*([^;]+)/);
      const color = colorMatch ? colorMatch[1].trim() : null;
      teamColorMap[teamName] = color;
      let isMine = isHighlighted(card.className);
      const players = [];
      let memberSpans = [];
      try {
        memberSpans = Array.from(card.querySelectorAll("span.truncate.text-white"));
      } catch (_) {
      }
      memberSpans.forEach((span) => {
        const pname = span.textContent.trim();
        if (!pname) return;
        players.push(pname);
        playerNameToTeam[pname] = teamName;
        const row = span.parentElement;
        if (row && isHighlighted(row.className)) isMine = true;
      });
      teamNameToPlayers[teamName] = players;
      if (isMine) {
        myTeamName = teamName;
        myTeamColor = color;
      }
    });
    const teamCount = Object.keys(teamNameToPlayers).length;
    if (teamCount === 0) return null;
    return {
      isTeamMode: teamCount > 0,
      myTeamName,
      myTeamColor,
      myTeamPlayers: myTeamName ? teamNameToPlayers[myTeamName] || [] : [],
      playerNameToTeam,
      teamNameToPlayers,
      teamColorMap
    };
  }
  function isHighlighted(className) {
    const cls = String(className || "");
    return cls.includes("bg-malibu-blue") || cls.includes("border-sky-");
  }
  function normName(name) {
    return String(name == null ? "" : name).trim();
  }

  // src/page/advisor/spawn-scoring.js
  var ANALYSIS_RADIUS = 30;
  var NATION_ATTRACT_RADIUS = 120;
  var PLAYER_REPEL_RADIUS = 150;
  var GRID_STEP = 16;
  var TOP_N = 5;
  var W_LAND = 0.25;
  var W_PLAINS = 0.2;
  var W_NATION = 0.25;
  var W_PLAYER_DIST = 0.25;
  var W_EDGE = 0.05;
  var W_TEAM = 0.2;
  var TEAM_ATTRACT_RADIUS = 110;
  var TEAM_MIN_GAP = ANALYSIS_RADIUS;
  var TEAM_IDEAL_MAX = 90;
  var TEAM_OVERLAP_MAX_SCORE = 0.4;
  var TEAM_NEAR_TAG_THRESHOLD = 0.6;
  var IS_LAND_BIT = 7;
  var MAGNITUDE_MASK = 31;
  function isLandByte(byte) {
    return (byte & 1 << IS_LAND_BIT) !== 0;
  }
  function isPlainsByte(byte) {
    return isLandByte(byte) && (byte & MAGNITUDE_MASK) < 10;
  }
  function precomputeStaticScores(mapData) {
    const { terrain, width, height, nations } = mapData;
    const candidates = [];
    const radius = ANALYSIS_RADIUS;
    const radius2 = radius * radius;
    for (let cy = radius; cy < height - radius; cy += GRID_STEP) {
      for (let cx = radius; cx < width - radius; cx += GRID_STEP) {
        if (!isLandByte(terrain[cy * width + cx])) continue;
        let landCount = 0;
        let plainsCount = 0;
        let totalChecked = 0;
        for (let dy = -radius; dy <= radius; dy += 2) {
          for (let dx = -radius; dx <= radius; dx += 2) {
            if (dx * dx + dy * dy > radius2) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            totalChecked += 1;
            const byte = terrain[ny * width + nx];
            if (isLandByte(byte)) {
              landCount += 1;
              if (isPlainsByte(byte)) plainsCount += 1;
            }
          }
        }
        const landDensity = totalChecked > 0 ? landCount / totalChecked : 0;
        const plainsRatio = landCount > 0 ? plainsCount / landCount : 0;
        const nationScore = computeNationScore(cx, cy, nations);
        const edgeX = Math.min(cx, width - cx) / (width / 2);
        const edgeY = Math.min(cy, height - cy) / (height / 2);
        const edgeScore = Math.min(edgeX, edgeY);
        const staticScore = landDensity * W_LAND + plainsRatio * W_PLAINS + nationScore * W_NATION + edgeScore * W_EDGE;
        candidates.push({ x: cx, y: cy, staticScore, landDensity, plainsRatio, nationScore, edgeScore });
      }
    }
    candidates.sort((a, b) => b.staticScore - a.staticScore);
    return candidates;
  }
  function rankSpawnCandidates(staticCandidates, playerSpawns, options = {}) {
    const teammateClientIDs = options.teammateClientIDs;
    const teamMode = !!(teammateClientIDs && teammateClientIDs.size > 0);
    const enemySpawns = [];
    const teamSpawns = [];
    playerSpawns.forEach((pos, clientID) => {
      if (teamMode && teammateClientIDs.has(clientID)) teamSpawns.push(pos);
      else enemySpawns.push(pos);
    });
    const repelR2 = PLAYER_REPEL_RADIUS * PLAYER_REPEL_RADIUS;
    const scored = [];
    for (let i = 0; i < staticCandidates.length; i += 1) {
      const candidate = staticCandidates[i];
      let playerDistScore = 1;
      if (enemySpawns.length > 0) {
        const minD2 = nearestDist2(candidate, enemySpawns);
        if (minD2 < repelR2) playerDistScore = minD2 / repelR2;
      }
      let teamAttractScore = 0;
      if (teamSpawns.length > 0) {
        teamAttractScore = teamAttract(Math.sqrt(nearestDist2(candidate, teamSpawns)));
      }
      const score = teamMode ? candidate.staticScore + playerDistScore * W_PLAYER_DIST + teamAttractScore * W_TEAM : candidate.staticScore + playerDistScore * W_PLAYER_DIST;
      scored.push({
        x: candidate.x,
        y: candidate.y,
        score,
        landDensity: candidate.landDensity,
        plainsRatio: candidate.plainsRatio,
        nationScore: candidate.nationScore,
        edgeScore: candidate.edgeScore,
        playerDistScore,
        teamAttractScore
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return { scores: scored, topSpots: pickDiverseTopSpots(scored) };
  }
  function nearestDist2(candidate, spawns) {
    let minD2 = Infinity;
    for (let j = 0; j < spawns.length; j += 1) {
      const dx = candidate.x - spawns[j].x;
      const dy = candidate.y - spawns[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
    return minD2;
  }
  function teamAttract(dist) {
    if (dist >= TEAM_ATTRACT_RADIUS) return 0;
    if (dist <= TEAM_MIN_GAP) return dist / TEAM_MIN_GAP * TEAM_OVERLAP_MAX_SCORE;
    if (dist <= TEAM_IDEAL_MAX) return 1;
    return (TEAM_ATTRACT_RADIUS - dist) / (TEAM_ATTRACT_RADIUS - TEAM_IDEAL_MAX);
  }
  function describeSpawnSpot(spot) {
    const tags = [];
    if (spot.landDensity >= 0.82) tags.push("solid land");
    if (spot.plainsRatio >= 0.65) tags.push("green growth");
    if (spot.nationScore >= 0.65) tags.push("nation farm");
    if (spot.playerDistScore >= 0.85) tags.push("low crowd");
    if (spot.teamAttractScore >= TEAM_NEAR_TAG_THRESHOLD) tags.push("near team");
    if (spot.edgeScore < 0.35) tags.push("edge risk");
    return tags.length ? tags.join(", ") : "balanced";
  }
  function computeNationScore(cx, cy, nations) {
    if (!nations.length) return 0;
    let minD2 = Infinity;
    for (let i = 0; i < nations.length; i += 1) {
      const dx = cx - nations[i].coordinates[0];
      const dy = cy - nations[i].coordinates[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
    return Math.max(0, 1 - Math.sqrt(minD2) / NATION_ATTRACT_RADIUS);
  }
  function pickDiverseTopSpots(scored) {
    const topSpots = [];
    const minD2 = ANALYSIS_RADIUS * 2 * (ANALYSIS_RADIUS * 2);
    for (let i = 0; i < scored.length && topSpots.length < TOP_N; i += 1) {
      const spot = scored[i];
      let tooClose = false;
      for (let j = 0; j < topSpots.length; j += 1) {
        const dx = topSpots[j].x - spot.x;
        const dy = topSpots[j].y - spot.y;
        if (dx * dx + dy * dy < minD2) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) topSpots.push(spot);
    }
    return topSpots;
  }

  // src/page/openfront/player-metrics.js
  function troopsInCombat(player) {
    return (player?.outgoingAttacks || []).reduce(
      (sum, attack) => sum + (attack && !attack.retreating ? Number(attack.troops || 0) : 0),
      0
    );
  }
  function incomingAttackTroops(gameState, myState) {
    const mySmallID = myState?.smallID != null ? myState.smallID : gameState.state.mySmallID;
    return incomingAttackTroopsForSmallID(gameState, mySmallID, myState?.id);
  }
  function incomingAttackTroopsForSmallID(gameState, targetSmallID, ownPlayerID = null) {
    if (targetSmallID == null) return 0;
    let sum = 0;
    gameState.state.playerStates.forEach((player) => {
      if (!player || ownPlayerID != null && player.id === ownPlayerID) return;
      (player.outgoingAttacks || []).forEach((attack) => {
        if (attack && !attack.retreating && attack.targetID === targetSmallID) sum += Number(attack.troops || 0);
      });
    });
    return sum;
  }
  function incomingAttackers(gameState, myState) {
    const mySmallID = myState?.smallID != null ? myState.smallID : gameState.state.mySmallID;
    if (mySmallID == null) return [];
    const ownPlayerID = myState?.id;
    const attackers = [];
    gameState.state.playerStates.forEach((player) => {
      if (!player || ownPlayerID != null && player.id === ownPlayerID) return;
      let troops = 0;
      (player.outgoingAttacks || []).forEach((attack) => {
        if (attack && !attack.retreating && attack.targetID === mySmallID) troops += Number(attack.troops || 0);
      });
      if (troops > 0) {
        attackers.push({ id: player.id, smallID: player.smallID, name: player.name || player.id, troops });
      }
    });
    return attackers.sort((a, b) => b.troops - a.troops);
  }

  // src/page/advisor/threat-model.js
  var ATOM_COST = 75e4;
  var HYDROGEN_COST = 5e6;
  var NUKE_SOON_SEC = 120;
  function evaluateThreats(gameState, teamDetection, nukeBuilders = null, goldIntel = null) {
    const myState = gameState.getMyState();
    const threats = /* @__PURE__ */ new Map();
    if (!myState || !myState.troops) return threats;
    gameState.state.playerStates.forEach((player) => {
      if (!player || !player.isAlive || player.id === myState.id) return;
      if (teamDetection?.isMyTeammate(player.id)) return;
      const troopsRatio = (player.troops || 0) / Math.max(1, myState.troops || 0);
      const tilesRatio = (player.tilesOwned || 0) / Math.max(1, myState.tilesOwned || 1);
      const outgoing = troopsInCombat(player);
      const activeAttackPressure = outgoing / Math.max(1, player.troops || 1);
      const nukePotential = player.gold >= HYDROGEN_COST ? 2 : player.gold >= ATOM_COST ? 1 : 0;
      const buildingNuke = !!(nukeBuilders && nukeBuilders.has(player.id));
      const nukeEtaSec = nukePotential === 0 && goldIntel ? goldIntel.timeToAfford(player.id, ATOM_COST, player.gold) : null;
      const nukeSoon = nukeEtaSec != null && nukeEtaSec > 0 && nukeEtaSec <= NUKE_SOON_SEC;
      let score = troopsRatio * 0.45 + tilesRatio * 0.25 + activeAttackPressure * 0.15 + nukePotential * 0.25;
      if (buildingNuke) score += 0.55;
      if (nukeSoon) score += 0.2;
      threats.set(player.id, {
        id: player.id,
        name: player.name || player.id,
        score,
        level: classifyThreat(score),
        troopsRatio,
        tilesRatio,
        nukePotential,
        buildingNuke,
        nukeSoon,
        nukeEtaSec: nukeEtaSec != null ? Math.round(nukeEtaSec) : null
      });
    });
    return threats;
  }
  function classifyThreat(score) {
    if (score >= 1.65) return "Critical";
    if (score >= 1.1) return "Dangerous";
    if (score >= 0.65) return "Neutral";
    return "Weak";
  }

  // src/shared/units.js
  var UNIT = Object.freeze({
    CITY: "City",
    DEFENSE_POST: "Defense Post",
    PORT: "Port",
    SAM_LAUNCHER: "SAM Launcher",
    MISSILE_SILO: "Missile Silo",
    FACTORY: "Factory",
    WARSHIP: "Warship",
    ATOM_BOMB: "Atom Bomb",
    HYDROGEN_BOMB: "Hydrogen Bomb",
    MIRV: "MIRV"
  });
  var WEAPONS_BY_POWER = Object.freeze([UNIT.MIRV, UNIT.HYDROGEN_BOMB, UNIT.ATOM_BOMB]);

  // src/page/openfront/unit-intel.js
  var MISSILE_SILO = UNIT.MISSILE_SILO;
  var SAM_LAUNCHER = UNIT.SAM_LAUNCHER;
  function scanUnitsByType(gameView, unitType, myState, teamDetection) {
    const out = [];
    if (!gameView) return out;
    const seen = /* @__PURE__ */ new Set();
    const myID = myState?.id;
    const mySmallID = myState?.smallID;
    const collect = (unit) => {
      if (!unit) return;
      const id = typeof unit.id === "function" ? unit.id() : null;
      if (id != null && seen.has(id)) return;
      if (id != null) seen.add(id);
      const underConstruction = typeof unit.isUnderConstruction === "function" ? !!unit.isUnderConstruction() : false;
      const owner = typeof unit.owner === "function" ? safeCall(() => unit.owner()) : null;
      const ownerID = owner ? typeof owner.id === "function" ? safeCall(() => owner.id()) : owner.id : null;
      const isMine = ownerID != null && (ownerID === myID || ownerID === mySmallID);
      const isAlly = !isMine && ownerID != null && !!teamDetection?.isMyTeammate?.(ownerID);
      const tile = safeCall(() => typeof unit.tile === "function" ? unit.tile() : null);
      out.push({
        ownerID,
        ownerName: owner ? safeName(owner) : "Unknown",
        isMine,
        isAlly,
        underConstruction,
        tile: tile != null ? tile : null,
        coords: tileCoords(gameView, tile)
      });
    };
    try {
      if (typeof gameView.unitStates === "function" && typeof gameView.unit === "function") {
        for (const state of gameView.unitStates().values()) {
          if (state && state.unitType === unitType) collect(gameView.unit(state.id));
        }
      }
      if (typeof gameView.units === "function") {
        const units = gameView.units(unitType);
        if (units && typeof units.forEach === "function") units.forEach(collect);
      }
    } catch (_) {
    }
    return out;
  }
  function scanMissileSilos(gameView, myState, teamDetection) {
    return scanUnitsByType(gameView, MISSILE_SILO, myState, teamDetection);
  }
  function enemySamSitesUnderConstruction(gameView, myState, teamDetection) {
    return scanUnitsByType(gameView, SAM_LAUNCHER, myState, teamDetection).filter(
      (sam) => !sam.isMine && !sam.isAlly && sam.underConstruction && sam.ownerID != null && sam.tile != null
    );
  }
  function enemyNukeBuilders(siloIntel) {
    const owners = /* @__PURE__ */ new Set();
    (siloIntel || []).forEach((silo) => {
      if (!silo.isMine && !silo.isAlly && silo.underConstruction && silo.ownerID != null) owners.add(silo.ownerID);
    });
    return owners;
  }
  function tileCoords(gameView, tile) {
    try {
      if (tile == null || typeof gameView.x !== "function" || typeof gameView.y !== "function") return null;
      return { x: gameView.x(tile), y: gameView.y(tile) };
    } catch (_) {
      return null;
    }
  }
  function safeName(player) {
    try {
      if (typeof player.displayName === "function") return player.displayName();
      if (typeof player.name === "function") return player.name();
    } catch (_) {
    }
    return "Unknown";
  }
  function safeCall(fn) {
    try {
      return fn();
    } catch (_) {
      return null;
    }
  }

  // src/shared/number.js
  function finiteOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  // src/page/openfront/gold-intel.js
  var WINDOW_MS = 6e4;
  function createGoldIntel() {
    const history = /* @__PURE__ */ new Map();
    return {
      sample(gameState) {
        const now = Date.now();
        gameState.state.playerStates.forEach((player) => {
          if (!player || player.id == null || !player.isAlive) return;
          const gold = finiteOrZero(typeof player.gold === "bigint" ? Number(player.gold) : player.gold);
          const arr = history.get(player.id) || [];
          arr.push({ t: now, gold });
          while (arr.length > 1 && now - arr[0].t > WINDOW_MS) arr.shift();
          history.set(player.id, arr);
        });
      },
      // Gold pro Sekunde \xFCber das Fenster; null wenn zu wenig Daten.
      mps(id) {
        const arr = history.get(id);
        if (!arr || arr.length < 2) return null;
        const first = arr[0];
        const last = arr[arr.length - 1];
        const dt = Math.max((last.t - first.t) / 1e3, 1e-3);
        return (last.gold - first.gold) / dt;
      },
      // Sekunden, bis der Spieler \`cost\` erreicht; 0 wenn schon leistbar, null wenn nicht absehbar.
      timeToAfford(id, cost, currentGold) {
        const gold = finiteOrZero(currentGold);
        if (gold >= cost) return 0;
        const rate = this.mps(id);
        if (rate == null || rate <= 0) return null;
        return (cost - gold) / rate;
      },
      reset() {
        history.clear();
      }
    };
  }

  // src/page/advisor/expansion-advisor.js
  function evaluateExpansionState(troopInfo, myState, troopEconomy) {
    if (!troopInfo) return { level: "unknown", label: "Expansion: unknown" };
    const outgoingTroops = troopsInCombat(myState || {});
    if (troopInfo.ratio < 0.25 && outgoingTroops > troopInfo.troops * 0.65) {
      return { level: "stop", label: "Expansion: stop" };
    }
    const level = troopEconomy ? levelFromState(troopEconomy.state) : levelFromRatio(troopInfo.ratio);
    return { level, label: \`Expansion: \${level}\` };
  }
  function levelFromState(state) {
    if (state === "CRITICAL") return "recover";
    if (state === "PUSH" || state === "CAP_WASTE") return "aggressive";
    return "normal";
  }
  function levelFromRatio(ratio) {
    if (ratio < 0.18) return "recover";
    if (ratio > 0.65) return "aggressive";
    return "normal";
  }

  // src/page/advisor/attack-advisor.js
  var CLAIM_PATTERN = /\\bclaim\\b/i;
  var HUMAN_TARGET_ENTER = 0.5;
  var HUMAN_TARGET_EXIT = 0.62;
  var HUMAN_FARM_ENTER = 0.28;
  var HUMAN_FARM_EXIT = 0.36;
  var HUMAN_DANGER_ENTER = 1.25;
  var HUMAN_DANGER_EXIT = 1.05;
  var STATUS_MIN_DWELL_TICKS = 25;
  var CAPTURE_TILE_COST = 40;
  var CAPTURE_ARMY_WEIGHT = 1.05;
  var CAPTURE_MARGIN_SAFE = 1.15;
  var CAPTURE_MARGIN_NORMAL = 1.08;
  var TWO_WAVE_MIN_SHARE = 0.58;
  var TARGET_CAPTURE_TURNS = 2;
  var CAPTURE_OVERDRAFT_RESERVE_RATIO = 0.1;
  var FARM_OVERDRAFT_STRENGTH_RATIO = 0.55;
  var HUMAN_OVERDRAFT_STRENGTH_RATIO = 0.28;
  function createAttackAdvisor({ settings, teamDetection }) {
    const statusMemory = /* @__PURE__ */ new Map();
    return {
      reset() {
        statusMemory.clear();
      },
      evaluate({ gameState, neighbourFetcher, troopInfo, expansion, troopEconomy, mapData = null }) {
        const myState = gameState.getMyState();
        const neighbours = neighbourFetcher.cachedNeighbourIDs;
        if (!myState || !myState.isAlive || !neighbours) return [];
        const myTroops = finiteOrZero(troopInfo?.troops || myState.troops);
        const maxTroops = finiteOrZero(troopInfo?.maxTroops);
        if (myTroops <= 0 || maxTroops <= 0) return [];
        const reserveRatio = Number.isFinite(troopEconomy?.recommendedReserve) ? troopEconomy.recommendedReserve : computeReserveRatio({ gameState, neighbours, myState, myTroops, settings });
        const reserveMaxSend = Math.max(0, Math.floor(myTroops - maxTroops * reserveRatio));
        const safePush = !!troopEconomy?.safePush;
        const tick = Number(gameState.state.currentTick) || 0;
        const seen = /* @__PURE__ */ new Set();
        const results = [];
        neighbours.forEach((playerID) => {
          if (playerID === myState.id) return;
          if (teamDetection?.isMyTeammate(playerID)) return;
          const target = gameState.state.playerStates.get(playerID);
          if (!target || !target.isAlive) return;
          seen.add(playerID);
          const targetTroops = finiteOrZero(target.troops);
          const targetTiles = finiteOrZero(target.tilesOwned);
          const effectiveTargetTroops = Math.max(0, targetTroops - troopsInCombat(target));
          const strengthRatio = effectiveTargetTroops / Math.max(1, myTroops);
          const isHuman = isHumanTarget(target);
          const maxSend = computeTargetMaxSend({
            myTroops,
            maxTroops,
            reserveMaxSend,
            safePush,
            strengthRatio,
            isHuman,
            targetTiles,
            expansion
          });
          const sizing = computeAttackSizing({
            myTroops,
            targetTroops: effectiveTargetTroops,
            targetTiles,
            safePush,
            maxSend,
            kind: isHuman ? "human" : "farm"
          });
          const officialSizing = estimateOfficialCaptureCost({
            target,
            effectiveTargetTroops,
            mapData
          });
          const desiredTroops = sizing.desiredTroops;
          const suggestedTroops = Math.min(desiredTroops, maxSend);
          const reserveAfterRatio = (myTroops - suggestedTroops) / maxTroops;
          let status;
          if (isHuman) {
            const committed = statusMemory.get(playerID)?.status || null;
            const desired = classifyHumanTarget({
              committed,
              allied: isAllied(myState, target) || !!teamDetection?.isMyTeammate(target.id),
              autoFarmHumanTargets: !!settings.get("autoFarmHumanTargets"),
              safePush,
              strengthRatio,
              desiredTroops,
              maxSend,
              targetTiles,
              estimatedCaptureTurns: sizing.estimatedCaptureTurns
            });
            status = stabilizeStatus(statusMemory, playerID, committed, desired, tick);
          } else {
            status = classifyFarmTarget({
              expansion,
              strengthRatio,
              desiredTroops,
              maxSend,
              targetTiles,
              target,
              safePush,
              estimatedCaptureTurns: sizing.estimatedCaptureTurns
            });
          }
          const suggestedPercent = myTroops > 0 ? Math.max(1, Math.round(suggestedTroops / myTroops * 100)) : 0;
          results.push({
            id: target.id,
            name: target.name || target.displayName || target.id,
            playerType: target.playerType || "",
            isHuman,
            status,
            label: getLabel(status, suggestedPercent),
            reason: getReason(status, expansion, strengthRatio, desiredTroops, maxSend, sizing, isHuman),
            score: scoreTarget(status, strengthRatio, targetTiles),
            targetTroops,
            targetTiles,
            effectiveTargetTroops,
            strengthRatio,
            suggestedTroops,
            suggestedPercent,
            reserveAfterRatio,
            appliedReserveRatio: reserveRatio,
            reserveMaxSend,
            captureMaxSend: maxSend,
            usedCaptureOverdraft: maxSend > reserveMaxSend,
            captureCostEstimate: sizing.captureCostEstimate,
            captureLandCostEstimate: sizing.landCostEstimate,
            captureTileCost: sizing.tileCost,
            estimatedCaptureTurns: sizing.estimatedCaptureTurns,
            sizingMode: sizing.mode,
            officialCaptureCostEstimate: officialSizing.captureCostEstimate,
            officialCaptureTileCost: officialSizing.tileCost,
            officialCaptureTurns: officialSizing.estimatedCaptureTurns,
            officialCaptureSource: officialSizing.source,
            officialTerrainClass: officialSizing.terrainClass
          });
        });
        statusMemory.forEach((_, id) => {
          if (!seen.has(id)) statusMemory.delete(id);
        });
        return results.sort((a, b) => b.score - a.score).slice(0, 12);
      }
    };
  }
  function computeReserveRatio({ gameState, neighbours, myState, myTroops, settings }) {
    const fixed = clampRatio(Number(settings.get("autoFarmReserveRatio")), 0.55);
    if (!settings.get("autoFarmDynamicReserve")) return fixed;
    const base = clampRatio(Number(settings.get("autoFarmBaseReserveRatio")), 0.3);
    const min = clampRatio(Number(settings.get("autoFarmMinReserveRatio")), 0.2);
    const max = clampRatio(Number(settings.get("autoFarmMaxReserveRatio")), 0.65);
    if (myTroops <= 0) return clamp(min, max, base);
    let reserve = base;
    let humanEffective = 0;
    let strongestAi = 0;
    (neighbours || []).forEach((id) => {
      if (id === myState.id) return;
      const player = gameState.state.playerStates.get(id);
      if (!player || !player.isAlive) return;
      const effective = Math.max(0, finiteOrZero(player.troops) - troopsInCombat(player));
      if (String(player.playerType || "").toUpperCase() === "HUMAN") humanEffective += effective;
      else if (effective > strongestAi) strongestAi = effective;
    });
    reserve += Math.min(0.3, humanEffective / myTroops * 0.3);
    const incoming = incomingAttackTroops(gameState, myState);
    reserve += Math.min(0.25, incoming / myTroops * 0.5);
    if (strongestAi / myTroops > 0.6) reserve += 0.05;
    return clamp(min, max, reserve);
  }
  function stabilizeStatus(statusMemory, id, committed, desired, tick) {
    if (committed === null || desired === "danger" || desired === "hold") {
      statusMemory.set(id, { status: desired, candidate: desired, candidateSince: tick });
      return desired;
    }
    const mem = statusMemory.get(id) || { status: committed, candidate: committed, candidateSince: tick };
    if (desired === committed) {
      statusMemory.set(id, { status: committed, candidate: committed, candidateSince: tick });
      return committed;
    }
    if (mem.candidate !== desired) {
      statusMemory.set(id, { status: committed, candidate: desired, candidateSince: tick });
      return committed;
    }
    if (tick - mem.candidateSince >= STATUS_MIN_DWELL_TICKS) {
      statusMemory.set(id, { status: desired, candidate: desired, candidateSince: tick });
      return desired;
    }
    return committed;
  }
  function isAllowedFarmTarget(player) {
    const type = String(player.playerType || "").toUpperCase();
    const name = \`\${player.name || ""} \${player.displayName || ""}\`;
    if (type === "HUMAN") return false;
    if (type === "BOT" || type === "NATION") return true;
    return CLAIM_PATTERN.test(name);
  }
  function isHumanTarget(player) {
    return String(player.playerType || "").toUpperCase() === "HUMAN";
  }
  function computeTargetMaxSend({ myTroops, maxTroops, reserveMaxSend, safePush, strengthRatio, isHuman, targetTiles, expansion }) {
    if (!safePush || targetTiles <= 0 || expansion && expansion.level === "stop") return reserveMaxSend;
    const threshold = isHuman ? HUMAN_OVERDRAFT_STRENGTH_RATIO : FARM_OVERDRAFT_STRENGTH_RATIO;
    if (strengthRatio > threshold) return reserveMaxSend;
    const overdraftMaxSend = Math.max(0, Math.floor(myTroops - maxTroops * CAPTURE_OVERDRAFT_RESERVE_RATIO));
    return Math.max(reserveMaxSend, overdraftMaxSend);
  }
  function computeAttackSizing({ myTroops, targetTroops, targetTiles, safePush = false, maxSend = 0, kind = "farm" }) {
    const isHuman = kind === "human";
    const legacyMultiplier = isHuman ? 1.35 : 1.25;
    const floorRatio = isHuman ? 0.08 : 0.04;
    const ceilingRatio = isHuman ? safePush ? 0.62 : 0.36 : safePush ? 0.72 : 0.42;
    const targetBased = Math.ceil(Math.max(1, targetTroops) * legacyMultiplier);
    const floor = Math.ceil(myTroops * floorRatio);
    const ceiling = Math.ceil(myTroops * ceilingRatio);
    const tileCost = CAPTURE_TILE_COST;
    const landCostEstimate = Math.ceil(Math.max(0, targetTiles) * tileCost);
    const captureCostEstimate = Math.ceil(Math.max(1, targetTroops) * CAPTURE_ARMY_WEIGHT + landCostEstimate);
    const margin = safePush ? CAPTURE_MARGIN_SAFE : CAPTURE_MARGIN_NORMAL;
    const oneWave = Math.ceil(captureCostEstimate * margin);
    const twoWave = Math.ceil(oneWave * TWO_WAVE_MIN_SHARE);
    let consolidation = oneWave;
    let mode = "one_wave";
    if (oneWave > maxSend) {
      consolidation = maxSend >= twoWave ? maxSend : twoWave;
      mode = maxSend >= twoWave ? "two_wave_push" : "needs_reserve";
    }
    const rawDesired = Math.max(targetBased, floor, consolidation);
    const desiredTroops = Math.max(1, Math.min(rawDesired, ceiling));
    const estimatedCaptureTurns = desiredTroops > 0 ? Math.ceil(oneWave / desiredTroops) : null;
    if (desiredTroops < rawDesired && mode !== "needs_reserve") mode = "ceiling_limited";
    return {
      desiredTroops,
      captureCostEstimate,
      landCostEstimate,
      tileCost,
      oneWave,
      twoWave,
      estimatedCaptureTurns,
      mode
    };
  }
  function classifyFarmTarget({ expansion, strengthRatio, desiredTroops, maxSend, targetTiles, target, safePush, estimatedCaptureTurns }) {
    if (!isAllowedFarmTarget(target)) return "hold";
    if (expansion && (expansion.level === "recover" || expansion.level === "stop")) return "mark";
    if (targetTiles <= 0 || strengthRatio >= 0.75) return "hold";
    const farmThreshold = safePush ? 0.6 : 0.45;
    if (desiredTroops <= maxSend && strengthRatio <= farmThreshold && estimatedCaptureTurns <= TARGET_CAPTURE_TURNS) return "farm";
    if (strengthRatio <= 0.65 || targetTiles >= 250) return "mark";
    return "hold";
  }
  function classifyHumanTarget({
    committed,
    allied,
    autoFarmHumanTargets,
    safePush,
    strengthRatio,
    desiredTroops,
    maxSend,
    targetTiles,
    estimatedCaptureTurns
  }) {
    if (allied) return "hold";
    if (committed === "danger") {
      if (!(targetTiles > 0 && strengthRatio < HUMAN_DANGER_EXIT)) return "danger";
    } else if (targetTiles <= 0 || strengthRatio >= HUMAN_DANGER_ENTER) {
      return "danger";
    }
    const canAutoFarm = autoFarmHumanTargets && safePush && desiredTroops <= maxSend && estimatedCaptureTurns <= TARGET_CAPTURE_TURNS && targetTiles > 0;
    if (committed === "farm") {
      if (canAutoFarm && strengthRatio <= HUMAN_FARM_EXIT) return "farm";
    } else if (canAutoFarm && strengthRatio <= HUMAN_FARM_ENTER) {
      return "farm";
    }
    if (committed === "target") {
      if (strengthRatio <= HUMAN_TARGET_EXIT && desiredTroops <= maxSend) return "target";
      return "wait";
    }
    if (strengthRatio <= HUMAN_TARGET_ENTER && desiredTroops <= maxSend) return "target";
    return "wait";
  }
  function getReason(status, expansion, strengthRatio, desiredTroops, maxSend, sizing, isHuman) {
    if (expansion && (expansion.level === "recover" || expansion.level === "stop")) return "reserve";
    if (status === "farm") return isHuman ? "weak_adjacent_human_capture" : "weak_adjacent_ai_capture";
    if (status === "target") return "weak_adjacent_human";
    if (desiredTroops > maxSend) return "reserve_limit";
    if (sizing?.estimatedCaptureTurns > TARGET_CAPTURE_TURNS) return "capture_too_slow";
    if (strengthRatio >= 0.75 || status === "danger") return "too_strong";
    return "watch";
  }
  function scoreTarget(status, strengthRatio, targetTiles) {
    const statusBonus = status === "farm" ? 2 : status === "target" ? 1.6 : status === "mark" ? 1 : status === "wait" ? 0.4 : 0;
    const tileScore = Math.min(1, targetTiles / 2e3);
    const weaknessScore = Math.max(0, 1 - strengthRatio);
    return statusBonus + tileScore * 0.4 + weaknessScore * 0.6;
  }
  function getLabel(status, suggestedPercent) {
    if (status === "farm") return \`FARM \${suggestedPercent}%\`;
    if (status === "target") return \`TARGET \${suggestedPercent}%\`;
    if (status === "mark") return "MARK";
    if (status === "wait") return "WAIT";
    if (status === "danger") return "DANGER";
    return "HOLD";
  }
  function isAllied(myState, target) {
    const alliances = Array.isArray(myState.alliances) ? myState.alliances : [];
    return alliances.some((alliance) => alliance && alliance.other === target.id);
  }
  function clamp(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }
  function clampRatio(value, fallback) {
    return Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
  }

  // src/page/advisor/troop-economy.js
  var PEAK_RATIO = 0.42;
  var STATES = [
    { state: "CRITICAL", max: 0.18, floor: 0.42, hint: "kritisch - nur sichere Kleinstaktionen" },
    { state: "RECOVER", max: 0.3, floor: 0.36, hint: "regenerieren - fruehe Expansion moeglich" },
    { state: "GROWTH_PEAK", max: 0.5, floor: 0.34, hint: "Wachstumsband - Druck halten" },
    { state: "READY", max: 0.65, floor: 0.34, hint: "bereit - aktiv expandieren/farmen" },
    { state: "PUSH", max: 0.82, floor: 0.3, hint: "Push-Fenster - Truppen einsetzen" },
    { state: "CAP_WASTE", max: 1.01, floor: 0.25, hint: "zu nah am Cap - Truppen einsetzen" }
  ];
  var PUSH_TARGET_RATIO = 0.45;
  var PUSH_SIM_TICK_CAP = 6e3;
  var SAFE_PUSH_THRESHOLD = 0.78;
  var AGGRESSIVE_RESERVE_DROP = 0.16;
  function evaluateTroopEconomy({ troopInfo, myState, gameState, neighbours, settings, teamDetection, threats }) {
    const maxTroops = finiteOrZero(troopInfo?.maxTroops);
    const currentTroops = finiteOrZero(troopInfo?.troops ?? myState?.troops);
    if (maxTroops <= 0 || currentTroops < 0) return null;
    const currentRatio = clamp01(currentTroops / maxTroops);
    const troopIncreaseRate = growthRate(currentTroops, maxTroops);
    const estimatedPeakIncreaseRate = growthRate(PEAK_RATIO * maxTroops, maxTroops);
    const growthEfficiency = estimatedPeakIncreaseRate > 0 ? clamp01(troopIncreaseRate / estimatedPeakIncreaseRate) : 0;
    const band = STATES.find((entry) => currentRatio < entry.max) || STATES[STATES.length - 1];
    const state = band.state;
    const stateFloor = band.floor;
    const incoming = incomingAttackTroops(gameState, myState);
    let humanNeighbourEffective = 0;
    (neighbours || []).forEach((id) => {
      if (!myState || id === myState.id) return;
      if (teamDetection?.isMyTeammate(id)) return;
      const player = gameState.state.playerStates.get(id);
      if (!player || !player.isAlive) return;
      if (String(player.playerType || "").toUpperCase() !== "HUMAN") return;
      humanNeighbourEffective += Math.max(0, finiteOrZero(player.troops) - troopsInCombat(player));
    });
    const combatSafety = clamp01(1 - (incoming + humanNeighbourEffective) / Math.max(1, maxTroops));
    const safePush = incoming === 0 && combatSafety >= SAFE_PUSH_THRESHOLD;
    const combatReserve = computeReserveRatio({ gameState, neighbours, myState: myState || {}, myTroops: currentTroops, settings });
    let recommendedReserve;
    if (!settings.get("autoFarmDynamicReserve")) {
      recommendedReserve = combatReserve;
    } else {
      const min = clampRatio2(Number(settings.get("autoFarmMinReserveRatio")), 0.2);
      const baseMax = clampRatio2(Number(settings.get("autoFarmMaxReserveRatio")), 0.65);
      const max = teamDetection?.isTeamMode ? Math.max(baseMax, 0.7) : baseMax;
      recommendedReserve = safePush ? clamp2(min, max, Math.min(stateFloor, combatReserve - AGGRESSIVE_RESERVE_DROP)) : clamp2(min, max, Math.max(stateFloor, combatReserve));
    }
    const safeSpendableTroops = Math.max(0, currentTroops - maxTroops * recommendedReserve);
    return {
      currentTroops,
      maxTroops,
      currentRatio,
      troopIncreaseRate,
      growthEfficiency,
      combatSafety,
      safePush,
      recommendedReserve,
      safeSpendableTroops,
      state,
      stateFloor,
      hint: band.hint,
      timeToPushSec: estimateTimeToPushSec(currentTroops, maxTroops),
      hasThreat: Array.isArray(threats) && threats.some((t) => t && (t.level === "Dangerous" || t.level === "Critical"))
    };
  }
  function growthRate(currentTroops, maxTroops) {
    const current = finiteOrZero(currentTroops);
    const max = finiteOrZero(maxTroops);
    if (max <= 0 || current >= max) return 0;
    return (10 + Math.pow(Math.max(0, current), 0.73) / 4) * (1 - current / max);
  }
  function estimateTimeToPushSec(currentTroops, maxTroops) {
    const target = PUSH_TARGET_RATIO * maxTroops;
    if (currentTroops >= target) return null;
    let troops = currentTroops;
    let ticks = 0;
    while (troops < target && ticks < PUSH_SIM_TICK_CAP) {
      const rate = growthRate(troops, maxTroops);
      if (rate <= 0) break;
      troops += rate;
      ticks += 1;
    }
    if (troops < target) return null;
    return Math.round(ticks / 10);
  }
  function clamp2(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }
  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }
  function clampRatio2(value, fallback) {
    return Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
  }

  // src/page/automation/farm-window.js
  function isInsideFarmWindow(state, settings) {
    const startedAt = Number(state.roundStartedAtMs) || 0;
    const windowMs = Number(settings.get("autoFarmWindowMs")) || 24e4;
    return startedAt > 0 && performance.now() - startedAt <= windowMs;
  }

  // src/page/automation/auto-expand.js
  var BACKOFF_AFTER_STAGNANT = 4;
  var BACKOFF_COOLDOWN_MS = 2e4;
  var MIN_SURPLUS_RATIO = 0.01;
  var EARLY_MIN_SURPLUS_RATIO = 2e-3;
  var FAST_EXPAND_COOLDOWN_MS = 900;
  var NORMAL_EXPAND_COOLDOWN_MS = 1500;
  var EARLY_WAVE_RATIO = 0.12;
  var NORMAL_WAVE_RATIO = 0.18;
  var PUSH_WAVE_RATIO = 0.28;
  function createAutoExpand({ gameState, neighbourFetcher, OrigWS, origWsSend, settings, logger, roundLogger, getTroopEconomy }) {
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let lastTilesOwned = -1;
    let stagnantAttempts = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        lastSentAt = 0;
        lastSkipAt = 0;
        lastTilesOwned = -1;
        stagnantAttempts = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      run(troopInfo, options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoExpand")) return setStatus("idle", "disabled", false);
        if (!OrigWS) return setStatus("idle", "websocket_unavailable", false);
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready", false);
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable", false);
        if (!isInsideFarmWindow(state, settings)) return setStatus("idle", "outside_window", false);
        if (!neighbourFetcher.cachedHasOpenFrontier) {
          logSkip("no_frontier");
          return setStatus("blocked", "no_frontier", true);
        }
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive", false);
        const myTroops = finiteOrZero(troopInfo?.troops || myState.troops);
        const maxTroops = finiteOrZero(troopInfo?.maxTroops);
        if (myTroops <= 0 || maxTroops <= 0) return setStatus("idle", "no_troops", false);
        const economy = getTroopEconomy?.();
        const reserveRatio = Number.isFinite(economy?.recommendedReserve) ? economy.recommendedReserve : computeReserveRatio({
          gameState,
          neighbours: neighbourFetcher.cachedNeighbourIDs,
          myState,
          myTroops,
          settings
        });
        const maxSend = Math.floor(myTroops - maxTroops * reserveRatio);
        const currentRatio = myTroops / maxTroops;
        const minSurplusRatio = currentRatio < 0.25 ? EARLY_MIN_SURPLUS_RATIO : MIN_SURPLUS_RATIO;
        if (maxSend <= Math.floor(maxTroops * minSurplusRatio)) {
          logSkip("reserve_limit", { reserveRatio, maxSend, currentRatio, minSurplusRatio });
          return setStatus("blocked", "reserve_limit", true, { reserveRatio, maxSend });
        }
        const tilesOwned = finiteOrZero(myState.tilesOwned);
        const waveRatio = chooseWaveRatio(economy, currentRatio);
        const cooldownMs = stagnantAttempts >= BACKOFF_AFTER_STAGNANT ? BACKOFF_COOLDOWN_MS : chooseCooldownMs(economy);
        const now = performance.now();
        if (now - lastSentAt < cooldownMs) {
          return setStatus("cooldown", "cooldown", true, { cooldownMs: Math.round(cooldownMs - (now - lastSentAt)) });
        }
        if (lastTilesOwned >= 0) {
          if (tilesOwned > lastTilesOwned) stagnantAttempts = 0;
          else stagnantAttempts += 1;
        }
        const troops = Math.max(1, Math.min(maxSend, Math.floor(maxTroops * waveRatio)));
        origWsSend.call(
          state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "attack", targetID: null, troops } })
        );
        lastSentAt = now;
        lastTilesOwned = tilesOwned;
        logger.info(\`Auto-expand wilderness: \${troops} troops\`);
        roundLogger?.record("auto_expand_sent", {
          troops,
          reserveRatio,
          maxSend,
          waveRatio,
          currentRatio,
          minSurplusRatio,
          tilesOwned,
          stagnantAttempts
        });
        setStatus("sent", \`sent_\${troops}\`, true, { troops, reserveRatio, waveRatio });
        return true;
      }
    };
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_expand_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, result, extra = {}) {
      status = { state, reason, ...extra };
      return result;
    }
  }
  function chooseCooldownMs(economy) {
    if (economy?.safePush) return FAST_EXPAND_COOLDOWN_MS;
    return NORMAL_EXPAND_COOLDOWN_MS;
  }
  function chooseWaveRatio(economy, currentRatio) {
    if (economy?.state === "CAP_WASTE" || economy?.state === "PUSH") return PUSH_WAVE_RATIO;
    if (economy?.safePush && currentRatio >= 0.3) return NORMAL_WAVE_RATIO;
    return EARLY_WAVE_RATIO;
  }

  // src/page/advisor/buy-advisor.js
  function recommendBuys({ gameState, troopInfo, threats, farmRecommendations, troopEconomy }) {
    const myState = gameState.getMyState();
    if (!myState || !myState.isAlive) return [];
    const gold = finiteOrZero(myState.gold);
    const dangerousThreat = (threats || []).find((threat) => threat.level === "Dangerous" || threat.level === "Critical");
    const nukeThreat = (threats || []).find((threat) => threat.nukePotential > 0 || threat.buildingNuke || threat.nukeSoon);
    const farmAvailable = (farmRecommendations || []).some((target) => target.status === "farm");
    const ratio = Number(troopInfo?.ratio || 0);
    const ecoState = troopEconomy?.state || null;
    const lowEco = ecoState === "CRITICAL" || ecoState === "RECOVER";
    const recommendations = [];
    const gameView = getGameView();
    const myPlayer = safeMyPlayer(gameView);
    const cityCount = countPlayerUnits(myPlayer, "City");
    const factoryCount = countPlayerUnits(myPlayer, "Factory");
    const cityCost = getStructureCost("City", { gameView, player: myPlayer });
    const portCost = getStructureCost("Port", { gameView, player: myPlayer });
    const factoryCost = getStructureCost("Factory", { gameView, player: myPlayer });
    const defenseCost = getStructureCost("Defense Post", { gameView, player: myPlayer });
    const samCost = getStructureCost("SAM Launcher", { gameView, player: myPlayer });
    const siloCost = getStructureCost("Missile Silo", { gameView, player: myPlayer });
    if (nukeThreat && gold >= samCost.cost) {
      recommendations.push(unverified("SAM Launcher", \`Nuke-Gefahr: \${nukeThreat.name}\`, samCost));
    }
    if (dangerousThreat && gold >= defenseCost.cost) {
      recommendations.push(unverified("Defense Post", \`Frontdruck: \${dangerousThreat.name}\`, defenseCost));
    }
    if (ecoState === "CAP_WASTE" && gold >= cityCost.cost) {
      recommendations.push(verifiedEco("City", "Cap-Waste: Gold jetzt in Eco investieren", cityCost));
    }
    if (gold >= cityCost.cost && ratio >= 0.35 && ecoState !== "CAP_WASTE") {
      recommendations.push(verifiedEco("City", farmAvailable ? "Eco nach Farm-Fenster stabilisieren" : "sicherer Economy-Kauf", cityCost));
    }
    if (cityCount >= 1 && factoryCount < 2 && gold >= factoryCost.cost && ratio >= 0.35 && !lowEco) {
      recommendations.push(verifiedEco("Factory", "sichere Land-Eco ausbauen", factoryCost));
    }
    if (gold >= portCost.cost) {
      recommendations.push(verifiedEco("Port", "nur bei guter Wasserroute", portCost));
    }
    if (gold >= siloCost.cost && !dangerousThreat && !lowEco) {
      recommendations.push(unverified("Missile Silo", "nur bei stabiler Eco und sicherer Flanke", siloCost));
    }
    return recommendations.slice(0, 3);
  }
  function verifiedEco(label, reason, costModel) {
    return {
      label,
      reason,
      actionAvailable: true,
      actionKey: label.toLowerCase().replace(/\\s+/g, "_"),
      estimatedCost: costModel?.cost || null,
      costSource: costModel?.source || null
    };
  }
  function unverified(label, reason, costModel) {
    return {
      label,
      reason,
      actionAvailable: false,
      actionKey: label.toLowerCase().replace(/\\s+/g, "_"),
      estimatedCost: costModel?.cost || null,
      costSource: costModel?.source || null
    };
  }
  function safeMyPlayer(gameView) {
    try {
      return gameView && typeof gameView.myPlayer === "function" ? gameView.myPlayer() : null;
    } catch (_) {
      return null;
    }
  }

  // src/page/automation/auto-spawn.js
  var SPAWN_COMMIT_MARGIN_TURNS = 20;
  var RESEND_COOLDOWN_MS = 1500;
  var SPAWN_IMPROVE_FACTOR = 1.03;
  function createAutoSpawn({ gameState, mapDataRef, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection }) {
    let lastAutoSpawnTile = -1;
    let lastSentScore = 0;
    let lastResendAt = 0;
    let hasSentThisRound = false;
    let lastPhaseLogAt = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        lastAutoSpawnTile = -1;
        lastSentScore = 0;
        lastResendAt = 0;
        hasSentThisRound = false;
        lastPhaseLogAt = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      send(spot) {
        const mapData = mapDataRef.current;
        const state = gameState.state;
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!mapData || !state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !origWsSend) {
          return setStatus("idle", "not_ready");
        }
        const delayMs = Number(settings.get("autoSpawnDelayMs")) || 0;
        const waitedMs = state.roundStartedAtMs ? performance.now() - state.roundStartedAtMs : 0;
        if (state.roundStartedAtMs && waitedMs < delayMs) {
          return setStatus("waiting", "delay", { waitMs: Math.round(delayMs - waitedMs) });
        }
        const phase = getSpawnPhaseInfo({ gameView: getGameView(), state, teamMode: !!teamDetection?.isTeamMode });
        logSpawnPhase(phase);
        const tileRef = spot.y * mapData.width + spot.x;
        const score = Number(spot.score) || 0;
        const inSpawnPhase = phase.remainingTurns > SPAWN_COMMIT_MARGIN_TURNS;
        const now = performance.now();
        if (hasSentThisRound) {
          if (!inSpawnPhase) return setStatus("sent", "committed", { tile: lastAutoSpawnTile });
          if (tileRef === lastAutoSpawnTile) return setStatus("sent", "best", { tile: tileRef });
          if (now - lastResendAt < RESEND_COOLDOWN_MS) return setStatus("sent", "resend_cooldown", { tile: lastAutoSpawnTile });
          if (score <= lastSentScore * SPAWN_IMPROVE_FACTOR) return setStatus("sent", "no_improvement", { tile: lastAutoSpawnTile });
        }
        const isResend = hasSentThisRound;
        lastAutoSpawnTile = tileRef;
        lastSentScore = score;
        lastResendAt = now;
        hasSentThisRound = true;
        origWsSend.call(state.gameSocket, JSON.stringify({ type: "intent", intent: { type: "spawn", tile: tileRef } }));
        logger.info(\`Auto-spawn \${isResend ? "re-correct" : "sent"}: (\${spot.x},\${spot.y}) tile=\${tileRef} score=\${score.toFixed(3)}\`);
        roundLogger?.record("auto_spawn_sent", {
          x: spot.x,
          y: spot.y,
          tile: tileRef,
          score,
          resend: isResend,
          waitedMs: Math.round(waitedMs),
          spawnRemainingTurns: phase.remainingTurns,
          spawnPhaseTurns: phase.totalTurns,
          spawnPhaseSource: phase.source
        });
        return setStatus("sent", isResend ? "re_corrected" : "sent", { tile: tileRef });
      }
    };
    function logSpawnPhase(phase) {
      const now = performance.now();
      if (now - lastPhaseLogAt < 5e3) return;
      lastPhaseLogAt = now;
      roundLogger?.record("spawn_phase_state", {
        currentTurn: phase.currentTurn,
        totalTurns: phase.totalTurns,
        remainingTurns: phase.remainingTurns,
        waitCapMs: Math.round(phase.waitCapMs),
        source: phase.source
      });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
    }
  }

  // src/page/automation/auto-farm.js
  var AGGRESSIVE_FARM_COOLDOWN_MS = 800;
  function createAutoFarm({ gameState, OrigWS, origWsSend, settings, logger, roundLogger, getTroopEconomy }) {
    const targetCooldowns = /* @__PURE__ */ new Map();
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        targetCooldowns.clear();
        lastSentAt = 0;
        lastSkipAt = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      run(recommendations, expansion, options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoFarm")) return setStatus("idle", "disabled");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        if (!isInsideFarmWindow(state, settings)) return setStatus("idle", "outside_window");
        const now = performance.now();
        const safePush = !!getTroopEconomy?.()?.safePush;
        const target = (recommendations || []).find((candidate) => candidate.status === "farm" && candidate.suggestedTroops > 0);
        if (!target) return setStatus("blocked", "no_target");
        if (expansion && expansion.level === "stop") {
          logSkip("stop", { targetID: target.id, targetName: target.name || target.id });
          return setStatus("blocked", "stop");
        }
        if (expansion && expansion.level === "recover" && !safePush) {
          logSkip("recover", { targetID: target.id, targetName: target.name || target.id });
          return setStatus("blocked", "recover");
        }
        const baseCooldown = Number(settings.get("autoFarmCooldownMs")) || 2500;
        const cooldownMs = safePush ? Math.min(baseCooldown, AGGRESSIVE_FARM_COOLDOWN_MS) : baseCooldown;
        if (now - lastSentAt < cooldownMs) {
          return setStatus("cooldown", "cooldown", { cooldownMs: Math.round(cooldownMs - (now - lastSentAt)) });
        }
        const lastTargetSentAt = targetCooldowns.get(target.id) || 0;
        const perTargetFactor = safePush ? 1.4 : 2.4;
        if (now - lastTargetSentAt < cooldownMs * perTargetFactor) {
          return setStatus("cooldown", "target_cooldown", { targetName: target.name || target.id });
        }
        const troops = Math.max(1, Math.floor(target.suggestedTroops));
        origWsSend.call(
          state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "attack", targetID: target.id, troops } })
        );
        lastSentAt = now;
        targetCooldowns.set(target.id, now);
        logger.info(\`Auto-farm attack \${target.name || target.id}: \${troops} troops\`);
        roundLogger?.record("auto_farm_attack_sent", {
          targetID: target.id,
          targetName: target.name || target.id,
          isHuman: !!target.isHuman,
          troops,
          suggestedPercent: target.suggestedPercent,
          reserveAfterRatio: target.reserveAfterRatio,
          appliedReserveRatio: target.appliedReserveRatio,
          reserveMaxSend: target.reserveMaxSend,
          captureMaxSend: target.captureMaxSend,
          usedCaptureOverdraft: !!target.usedCaptureOverdraft,
          targetTroops: target.targetTroops,
          effectiveTargetTroops: target.effectiveTargetTroops,
          targetTiles: target.targetTiles,
          captureCostEstimate: target.captureCostEstimate,
          officialCaptureCostEstimate: target.officialCaptureCostEstimate,
          officialCaptureTurns: target.officialCaptureTurns,
          officialCaptureSource: target.officialCaptureSource,
          estimatedCaptureTurns: target.estimatedCaptureTurns,
          sizingMode: target.sizingMode
        });
        setStatus("sent", \`sent_\${target.name || target.id}\`, { targetName: target.name || target.id, troops });
      }
    };
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt <= 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_farm_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
    }
  }

  // src/page/automation/auto-attack.js
  //
  // Aggression levels (1-5) map to real combat formula thresholds from the OpenFront source:
  //   strengthRatio = effectiveTargetTroops / myTroops
  //   At ratio 0.40 (2.5×) conquest speed reaches its cap — below is the safe zone.
  //   At ratio 0.95 (≈equal forces) losses scale to maximum — high risk.
  //   Defense Posts (×5 attacker loss) are partially screened by captureMaxSend budget check.
  var AGGRESSION_PROFILES = [
    // level 1 — 稳健: only attack overwhelmingly weak targets, require full economy health
    { label: "稳健", maxRatio: 0.35, maxTurns: 2, requireSafePush: true,  cooldownMult: 1.5, perTargetMult: 4.0 },
    // level 2 — 均衡: standard 2.5× threshold, require safePush
    { label: "均衡", maxRatio: 0.45, maxTurns: 3, requireSafePush: true,  cooldownMult: 1.0, perTargetMult: 3.0 },
    // level 3 — 进取: 1.67× threshold, tolerate non-critical economy
    { label: "进取", maxRatio: 0.62, maxTurns: 4, requireSafePush: false, cooldownMult: 0.8, perTargetMult: 2.5 },
    // level 4 — 强攻: 1.33× threshold, ignore economy state, fast tempo
    { label: "强攻", maxRatio: 0.78, maxTurns: 5, requireSafePush: false, cooldownMult: 0.55, perTargetMult: 2.0 },
    // level 5 — 全力: near-equal forces allowed, maximum attack rate — high risk
    { label: "全力", maxRatio: 0.95, maxTurns: 8, requireSafePush: false, cooldownMult: 0.35, perTargetMult: 1.5 },
  ];
  function getAggressionProfile(settings) {
    const level = Math.max(1, Math.min(5, Number(settings.get("autoAttackAggression")) || 2));
    return AGGRESSION_PROFILES[level - 1];
  }
  function getAggressionLabel(settings) {
    return getAggressionProfile(settings).label;
  }

  function createAutoAttack({ gameState, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection, getTroopEconomy }) {
    const targetCooldowns = /* @__PURE__ */ new Map();
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        targetCooldowns.clear();
        lastSentAt = 0;
        lastSkipAt = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      run(recommendations, expansion, options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoAttack")) return setStatus("idle", "disabled");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive");

        const profile = getAggressionProfile(settings);
        const economy = getTroopEconomy?.();

        // Economy gate: at low aggression levels require safe push health
        if (profile.requireSafePush && !economy?.safePush) {
          logSkip("economy_not_ready");
          return setStatus("blocked", "economy");
        }
        // At any level never attack when economy is in critical collapse
        if (economy?.state === "CRITICAL" || economy?.state === "RECOVER") {
          if (profile.maxRatio < 0.70) {
            logSkip("economy_critical");
            return setStatus("blocked", "economy_critical");
          }
        }
        // Respect hard stop from expansion advisor (troops dangerously low)
        if (profile.maxRatio < 0.70 && expansion && expansion.level === "stop") {
          logSkip("expansion_stop");
          return setStatus("blocked", "stop");
        }

        // Build candidate list: "target" (human) or "farm" (AI/nation), sorted weakest-first
        const candidates = (recommendations || [])
          .filter((c) => {
            if (!c || c.suggestedTroops <= 0) return false;
            if (teamDetection?.isMyTeammate?.(c.id)) return false;
            if (c.status !== "target" && c.status !== "farm") return false;
            // Aggression-level ratio gate
            if ((c.strengthRatio || 1) > profile.maxRatio) return false;
            // Budget gate: if we can't send enough troops, defense posts likely make it too costly
            if (c.suggestedTroops > c.captureMaxSend) return false;
            // Capture speed gate: avoid drawn-out multi-wave fights unless very aggressive
            if ((c.estimatedCaptureTurns || 99) > profile.maxTurns) return false;
            return true;
          })
          .sort((a, b) => (a.strengthRatio || 1) - (b.strengthRatio || 1));

        if (!candidates.length) {
          logSkip("no_qualified_target");
          return setStatus("blocked", "no_target");
        }

        const now = performance.now();
        const baseCooldown = Number(settings.get("autoAttackCooldownMs")) || 3e3;
        // CAP_WASTE = troops at/over cap, spend them fast regardless of aggression
        const wasteMult = economy?.state === "CAP_WASTE" ? 0.4 : 1;
        const cooldownMs = Math.max(600, baseCooldown * profile.cooldownMult * wasteMult);
        const perTargetCooldownMs = cooldownMs * profile.perTargetMult;

        if (now - lastSentAt < cooldownMs) {
          return setStatus("cooldown", "cooldown", { cooldownMs: Math.round(cooldownMs - (now - lastSentAt)) });
        }

        // Pick the best non-cooled-down candidate
        const target = candidates.find((c) => (now - (targetCooldowns.get(c.id) || 0)) >= perTargetCooldownMs)
          || candidates[0]; // fallback: pick best even if on cooldown (will rotate next tick)

        if (now - (targetCooldowns.get(target.id) || 0) < perTargetCooldownMs) {
          return setStatus("cooldown", "target_cooldown", { targetName: target.name || target.id });
        }

        return sendAttack(target, now, profile);
      }
    };
    function sendAttack(target, now, profile) {
      const troops = Math.max(1, Math.floor(target.suggestedTroops));
      origWsSend.call(
        gameState.state.gameSocket,
        JSON.stringify({ type: "intent", intent: { type: "attack", targetID: target.id, troops } })
      );
      lastSentAt = now;
      targetCooldowns.set(target.id, now);
      logger.info(\`Auto-attack [Lv\${getAggressionProfile(settings).label}] \${target.name || target.id}: \${troops} (ratio \${(target.strengthRatio || 0).toFixed(2)})\`);
      roundLogger?.record("auto_attack_sent", {
        targetID: target.id,
        targetName: target.name || target.id,
        isHuman: !!target.isHuman,
        status: target.status,
        troops,
        suggestedPercent: target.suggestedPercent,
        strengthRatio: target.strengthRatio,
        estimatedCaptureTurns: target.estimatedCaptureTurns,
        aggressionLabel: profile.label
      });
      return setStatus("sent", \`\${target.name || target.id}\`, { targetName: target.name || target.id, troops, strengthRatio: target.strengthRatio });
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt <= 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_attack_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
      return status;
    }
  }

  // src/page/automation/auto-eco.js
  var ECO_BUILD_COOLDOWN_MS = 6500;
  var EARLY_ECO_BUILD_COOLDOWN_MS = 1e3;
  var EARLY_ECO_FREE_RESERVE_BUILDS = 10;
  var CITY_UNIT = "City";
  var PORT_UNIT = "Port";
  var FACTORY_UNIT = "Factory";
  var MAX_AUTO_CITIES = 5;
  var MAX_AUTO_PORTS = 2;
  var MAX_AUTO_FACTORIES = 3;
  function createAutoEco({ gameState, mapDataRef, OrigWS, origWsSend, settings, logger, roundLogger, getTroopEconomy }) {
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let lastCostLogAt = 0;
    let lastKnownEcoBuildCount = 0;
    let runtimeProbed = false;
    let inFlight = false;
    let status = { state: "idle", reason: "not_started" };
    const pendingBuilds = /* @__PURE__ */ new Map();
    const observedBuildCounts = /* @__PURE__ */ new Map();
    const blockedTilesByUnit = /* @__PURE__ */ new Map();
    return {
      reset() {
        lastSentAt = 0;
        lastSkipAt = 0;
        lastCostLogAt = 0;
        lastKnownEcoBuildCount = 0;
        runtimeProbed = false;
        inFlight = false;
        pendingBuilds.clear();
        observedBuildCounts.clear();
        blockedTilesByUnit.clear();
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      observeIntent(intent) {
        if (!intent || intent.type !== "build_unit" || !intent.unit) return;
        observeBuildIntent(intent.unit, intent.tile);
      },
      run({ buyRecommendations = [] } = {}, options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoEco")) return setStatus("idle", "disabled", false);
        if (!OrigWS) return setStatus("idle", "websocket_unavailable", false);
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready", false);
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable", false);
        if (inFlight) return setStatus("cooldown", "tile_scan", true);
        expirePendingBuilds();
        const now = performance.now();
        const cooldownMs = lastKnownEcoBuildCount < EARLY_ECO_FREE_RESERVE_BUILDS ? EARLY_ECO_BUILD_COOLDOWN_MS : ECO_BUILD_COOLDOWN_MS;
        if (now - lastSentAt < cooldownMs) {
          return setStatus("cooldown", "cooldown", true, { cooldownMs: Math.round(cooldownMs - (now - lastSentAt)) });
        }
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive", false);
        const gold = finiteOrZero(myState.gold);
        if (gold < 5e4) {
          logSkip("gold", { gold, minCost: 5e4 });
          return setStatus("blocked", "gold", true, { gold, minCost: 5e4 });
        }
        const economy = getTroopEconomy?.();
        if (isEcoUnsafe(economy)) {
          logSkip("unsafe", { combatSafety: economy?.combatSafety, currentRatio: economy?.currentRatio });
          return setStatus("blocked", "unsafe", true, { combatSafety: economy?.combatSafety, currentRatio: economy?.currentRatio });
        }
        inFlight = true;
        chooseBuild({ myState, gold, buyRecommendations }).then((choice) => {
          inFlight = false;
          if (!choice) return;
          if (gold < choice.estimatedCost + choice.reserveGold) {
            logSkip("gold_cost_model", { gold, estimatedCost: choice.estimatedCost, reserveGold: choice.reserveGold, unit: choice.unit });
            setStatus("blocked", "gold_cost_model", true, { gold, estimatedCost: choice.estimatedCost, reserveGold: choice.reserveGold, unit: choice.unit });
            return;
          }
          sendBuild(choice);
        }).catch((error) => {
          inFlight = false;
          logSkip("tile_scan_failed", { message: String(error?.message || error || "") });
          setStatus("blocked", "tile_scan_failed");
        });
        return true;
      }
    };
    async function chooseBuild({ myState, gold, buyRecommendations }) {
      const gameView = getGameView();
      if (!gameView || typeof gameView.myPlayer !== "function") {
        logSkip("game_view");
        setStatus("blocked", "game_view");
        return null;
      }
      const myPlayer = gameView.myPlayer();
      maybeLogRuntimeProbe(gameView, myPlayer);
      const observed = observedCountsByUnit();
      const unitCounts = {
        city: Math.max(countPlayerUnits(myPlayer, CITY_UNIT), observed.City || 0),
        port: Math.max(countPlayerUnits(myPlayer, PORT_UNIT), observed.Port || 0),
        factory: Math.max(countPlayerUnits(myPlayer, FACTORY_UNIT), observed.Factory || 0)
      };
      const adjustedCounts = {
        city: unitCounts.city + pendingCount(CITY_UNIT),
        port: unitCounts.port + pendingCount(PORT_UNIT),
        factory: unitCounts.factory + pendingCount(FACTORY_UNIT)
      };
      lastKnownEcoBuildCount = totalEcoBuildCount(adjustedCounts);
      const candidates = await collectOwnedTileCandidates(gameView, myPlayer, myState, mapDataRef.current);
      if (!candidates.length) {
        logSkip("no_owned_tiles");
        setStatus("blocked", "no_owned_tiles");
        return null;
      }
      maybeLogCostModel(gold);
      if (adjustedCounts.city <= 0) {
        const tile = chooseCityTile(candidates, isTileBlockedForUnit);
        if (tile != null) return withCost({ unit: CITY_UNIT, tile, unitCounts, adjustedCounts });
        logPendingBlocked(CITY_UNIT);
      }
      if (adjustedCounts.city >= 1 && adjustedCounts.factory < MAX_AUTO_FACTORIES && adjustedCounts.factory <= adjustedCounts.port) {
        const tile = chooseFactoryTile(candidates, isTileBlockedForUnit);
        if (tile != null) return withCost({ unit: FACTORY_UNIT, tile, unitCounts, adjustedCounts });
        logPendingBlocked(FACTORY_UNIT);
      }
      if (adjustedCounts.port < MAX_AUTO_PORTS) {
        const tile = choosePortTile(candidates, isTileBlockedForUnit);
        if (tile != null) return withCost({ unit: PORT_UNIT, tile, unitCounts, adjustedCounts });
        logPendingBlocked(PORT_UNIT);
      }
      if (adjustedCounts.factory < MAX_AUTO_FACTORIES && adjustedCounts.city >= 1) {
        const tile = chooseFactoryTile(candidates, isTileBlockedForUnit);
        if (tile != null) return withCost({ unit: FACTORY_UNIT, tile, unitCounts, adjustedCounts });
        logPendingBlocked(FACTORY_UNIT);
      }
      if (adjustedCounts.city < MAX_AUTO_CITIES && adjustedCounts.city <= adjustedCounts.port + adjustedCounts.factory + 1) {
        const tile = chooseCityTile(candidates, isTileBlockedForUnit);
        if (tile != null) return withCost({ unit: CITY_UNIT, tile, unitCounts, adjustedCounts });
        logPendingBlocked(CITY_UNIT);
      }
      logSkip("no_recommended_unit", { cityCount: adjustedCounts.city, portCount: adjustedCounts.port, factoryCount: adjustedCounts.factory });
      setStatus("blocked", "no_recommended_unit", false, {
        cityCount: adjustedCounts.city,
        portCount: adjustedCounts.port,
        factoryCount: adjustedCounts.factory
      });
      return null;
    }
    function withCost(choice) {
      const gameView = getGameView();
      const myPlayer = safeMyPlayer2(gameView);
      const model = getStructureCost(choice.unit, {
        gameView,
        player: myPlayer,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      const ecoBuildCount = totalEcoBuildCount(choice.adjustedCounts);
      const reserveGold = ecoBuildCount < EARLY_ECO_FREE_RESERVE_BUILDS ? 0 : model.reserveGold;
      return { ...choice, estimatedCost: model.cost, costSource: model.source, reserveGold, reserveWaived: reserveGold === 0 && model.reserveGold > 0 };
    }
    function sendBuild(choice) {
      const state = gameState.state;
      origWsSend.call(
        state.gameSocket,
        JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: choice.unit, tile: choice.tile } })
      );
      lastSentAt = performance.now();
      addPendingBuild(choice.unit, choice.tile);
      lastKnownEcoBuildCount = totalEcoBuildCount(choice.adjustedCounts) + 1;
      logger.info(\`Auto-eco build \${choice.unit} at \${choice.tile}\`);
      roundLogger?.record("auto_eco_sent", {
        unit: choice.unit,
        tile: choice.tile,
        estimatedCost: choice.estimatedCost,
        costSource: choice.costSource,
        cityCount: choice.unitCounts.city,
        portCount: choice.unitCounts.port,
        factoryCount: choice.unitCounts.factory,
        adjustedCityCount: choice.adjustedCounts.city,
        adjustedPortCount: choice.adjustedCounts.port,
        adjustedFactoryCount: choice.adjustedCounts.factory,
        reserveGold: choice.reserveGold,
        reserveWaived: !!choice.reserveWaived
      });
      setStatus("sent", \`built_\${choice.unit}\`, true, { unit: choice.unit, tile: choice.tile, estimatedCost: choice.estimatedCost, costSource: choice.costSource });
    }
    function observeBuildIntent(unit, tile) {
      const key = buildKey(unit, tile);
      const normalized = normalizeUnitKey(unit);
      if (pendingBuilds.has(key)) pendingBuilds.delete(key);
      observedBuildCounts.set(normalized, (observedBuildCounts.get(normalized) || 0) + 1);
      if (normalized === "city" || normalized === "port" || normalized === "factory") {
        lastKnownEcoBuildCount = Math.max(lastKnownEcoBuildCount, observedEcoBuildCount());
      }
      blockTile(unit, tile);
    }
    function addPendingBuild(unit, tile) {
      const duration = getConstructionDurationMs(unit, { gameView: getGameView() });
      pendingBuilds.set(buildKey(unit, tile), { unit, tile, sentAt: performance.now(), ttlMs: duration.durationMs + 1500 });
      blockTile(unit, tile);
    }
    function expirePendingBuilds() {
      const now = performance.now();
      pendingBuilds.forEach((entry, key) => {
        if (now - entry.sentAt > (entry.ttlMs || 12e3)) pendingBuilds.delete(key);
      });
    }
    function pendingCount(unit) {
      let count = 0;
      const normalized = normalizeUnitKey(unit);
      pendingBuilds.forEach((entry) => {
        if (normalizeUnitKey(entry.unit) === normalized) count += 1;
      });
      return count;
    }
    function maybeLogRuntimeProbe(gameView, myPlayer) {
      if (runtimeProbed) return;
      runtimeProbed = true;
      const probe = { configType: typeof gameView?.config };
      try {
        const config = typeof gameView.config === "function" ? gameView.config() : null;
        probe.hasConfig = !!config;
        if (config) {
          probe.configKeys = listMethods(config).slice(0, 40);
          probe.hasUnitInfo = typeof config.unitInfo === "function";
          probe.hasStructureInfo = typeof config.structureInfo === "function";
          if (typeof config.unitInfo === "function") {
            const info = tryCall(() => config.unitInfo(CITY_UNIT));
            probe.unitInfoCityKeys = info && typeof info === "object" ? Object.keys(info).slice(0, 20) : String(info);
            if (info && info.cost != null) {
              probe.cityCostType = typeof info.cost;
              probe.cityCostCall = String(tryCall(() => typeof info.cost === "function" ? info.cost(myPlayer) : info.cost));
            }
          }
        }
      } catch (error) {
        probe.error = String(error?.message || error || "");
      }
      roundLogger?.record("auto_eco_runtime_probe", probe);
    }
    function maybeLogCostModel(gold) {
      const now = performance.now();
      if (now - lastCostLogAt < 1e4) return;
      lastCostLogAt = now;
      const gameView = getGameView();
      const myPlayer = safeMyPlayer2(gameView);
      const city = getStructureCost(CITY_UNIT, {
        gameView,
        player: myPlayer,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      const port = getStructureCost(PORT_UNIT, {
        gameView,
        player: myPlayer,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      const factory = getStructureCost(FACTORY_UNIT, {
        gameView,
        player: myPlayer,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      roundLogger?.record("auto_eco_cost_model", {
        gold,
        cityCost: city.cost,
        cityCostSource: city.source,
        portCost: port.cost,
        portCostSource: port.source,
        factoryCost: factory.cost,
        factoryCostSource: factory.source,
        pendingCount: pendingBuilds.size,
        observedBuildCounts: Object.fromEntries(observedBuildCounts)
      });
      roundLogger?.record("eco_cost_model", {
        gold,
        cityCost: city.cost,
        cityCostSource: city.source,
        portCost: port.cost,
        portCostSource: port.source,
        factoryCost: factory.cost,
        factoryCostSource: factory.source,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
    }
    function logPendingBlocked(unit) {
      const blockedCount = blockedTilesByUnit.get(normalizeUnitKey(unit))?.size || 0;
      if (blockedCount <= 0) return;
      roundLogger?.record("auto_eco_pending_blocked", { unit, blockedCount, pendingCount: pendingCount(unit) });
    }
    function isTileBlockedForUnit(unit, tile) {
      const blocked = blockedTilesByUnit.get(normalizeUnitKey(unit));
      return !!blocked && blocked.has(Number(tile));
    }
    function blockTile(unit, tile) {
      if (!Number.isFinite(Number(tile))) return;
      const normalized = normalizeUnitKey(unit);
      if (!blockedTilesByUnit.has(normalized)) blockedTilesByUnit.set(normalized, /* @__PURE__ */ new Set());
      blockedTilesByUnit.get(normalized).add(Number(tile));
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt <= 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_eco_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, result, extra = {}) {
      status = { state, reason, ...extra };
      return result;
    }
    function pendingCountsByUnit() {
      const out = {};
      pendingBuilds.forEach((entry) => {
        out[entry.unit] = (out[entry.unit] || 0) + 1;
      });
      return out;
    }
    function observedCountsByUnit() {
      const out = {};
      observedBuildCounts.forEach((count, key) => {
        if (key === "city") out.City = count;
        else if (key === "port") out.Port = count;
        else if (key === "factory") out.Factory = count;
        else if (key === "defense post") out["Defense Post"] = count;
        else if (key === "sam launcher") out["SAM Launcher"] = count;
        else out[key] = count;
      });
      return out;
    }
    function observedEcoBuildCount() {
      return (observedBuildCounts.get("city") || 0) + (observedBuildCounts.get("port") || 0) + (observedBuildCounts.get("factory") || 0);
    }
  }
  async function collectOwnedTileCandidates(gameView, myPlayer, myState, mapData) {
    if (!myPlayer || typeof myPlayer.borderTiles !== "function") return [];
    const info = await myPlayer.borderTiles();
    const borders = info && info.borderTiles;
    if (!borders || typeof borders.forEach !== "function") return [];
    const seen = /* @__PURE__ */ new Set();
    borders.forEach((tile) => addOwnedCandidate(tile, seen, gameView, myState, mapData));
    Array.from(seen).forEach((tile) => {
      getNeighbors(gameView, tile, mapData).forEach((nearby) => addOwnedCandidate(nearby, seen, gameView, myState, mapData));
    });
    return Array.from(seen).map((tile) => scoreTile(tile, gameView, myState, mapData));
  }
  function addOwnedCandidate(tile, seen, gameView, myState, mapData) {
    if (!Number.isFinite(Number(tile))) return;
    const num = Number(tile);
    if (seen.has(num)) return;
    if (mapData?.terrain && !isLandByte(mapData.terrain[num])) return;
    if (!isOwnedByMe(gameView, num, myState)) return;
    seen.add(num);
  }
  function chooseCityTile(candidates, isBlocked) {
    const best = candidates.filter((candidate) => candidate.isLand && candidate.ownNeighbors >= 3 && !isBlocked(CITY_UNIT, candidate.tile)).sort((a, b) => b.cityScore - a.cityScore)[0];
    return best ? best.tile : null;
  }
  function choosePortTile(candidates, isBlocked) {
    const best = candidates.filter((candidate) => candidate.isLand && candidate.waterNeighbors > 0 && candidate.ownNeighbors >= 2 && !isBlocked(PORT_UNIT, candidate.tile)).sort((a, b) => b.portScore - a.portScore)[0];
    return best ? best.tile : null;
  }
  function chooseFactoryTile(candidates, isBlocked) {
    const best = candidates.filter((candidate) => candidate.isLand && candidate.ownNeighbors >= 3 && !isBlocked(FACTORY_UNIT, candidate.tile)).sort((a, b) => b.factoryScore - a.factoryScore)[0];
    return best ? best.tile : null;
  }
  function scoreTile(tile, gameView, myState, mapData) {
    const neighbors = getNeighbors(gameView, tile, mapData);
    let ownNeighbors = 0;
    let landNeighbors = 0;
    let waterNeighbors = 0;
    neighbors.forEach((nearby) => {
      if (mapData?.terrain && isLandByte(mapData.terrain[nearby])) landNeighbors += 1;
      else waterNeighbors += 1;
      if (isOwnedByMe(gameView, nearby, myState)) ownNeighbors += 1;
    });
    return {
      tile,
      isLand: !mapData?.terrain || isLandByte(mapData.terrain[tile]),
      ownNeighbors,
      landNeighbors,
      waterNeighbors,
      cityScore: ownNeighbors * 8 + landNeighbors * 2 - waterNeighbors * 5,
      portScore: waterNeighbors * 8 + ownNeighbors * 3 + landNeighbors,
      factoryScore: ownNeighbors * 9 + landNeighbors * 3 - waterNeighbors * 3
    };
  }
  function getNeighbors(gameView, tile, mapData) {
    try {
      if (gameView && typeof gameView.neighbors === "function") {
        const neighbours = gameView.neighbors(tile);
        if (Array.isArray(neighbours)) return neighbours.filter((value) => Number.isFinite(Number(value))).map(Number);
      }
    } catch (_) {
    }
    if (!mapData?.width || !mapData?.height) return [];
    const width = mapData.width;
    const height = mapData.height;
    const x = tile % width;
    const y = Math.floor(tile / width);
    const out = [];
    if (x > 0) out.push(tile - 1);
    if (x < width - 1) out.push(tile + 1);
    if (y > 0) out.push(tile - width);
    if (y < height - 1) out.push(tile + width);
    return out;
  }
  function isOwnedByMe(gameView, tile, myState) {
    try {
      if (!gameView || typeof gameView.owner !== "function") return false;
      const owner = gameView.owner(tile);
      if (!owner) return false;
      const ownerID = typeof owner.id === "function" ? owner.id() : owner.id;
      return ownerID === myState.id || ownerID === myState.smallID;
    } catch (_) {
      return false;
    }
  }
  function isEcoUnsafe(economy) {
    const currentRatio = Number(economy?.currentRatio);
    if (economy?.hasThreat && Number(economy.combatSafety) < 0.6 && Number.isFinite(currentRatio) && currentRatio < 0.18) return true;
    return !!(economy?.hasThreat && Number(economy.combatSafety) < 0.25 && Number(economy.currentRatio) < 0.45);
  }
  function safeMyPlayer2(gameView) {
    try {
      return gameView && typeof gameView.myPlayer === "function" ? gameView.myPlayer() : null;
    } catch (_) {
    }
    return null;
  }
  function normalizeUnitKey(unit) {
    return String(unit || "").trim().toLowerCase() || "unknown";
  }
  function listMethods(obj) {
    const out = [];
    try {
      let cursor = obj;
      while (cursor && cursor !== Object.prototype) {
        Object.getOwnPropertyNames(cursor).forEach((name) => {
          if (name !== "constructor" && !out.includes(name)) out.push(name);
        });
        cursor = Object.getPrototypeOf(cursor);
      }
    } catch (_) {
    }
    return out;
  }
  function tryCall(fn) {
    try {
      return fn();
    } catch (_) {
      return null;
    }
  }
  function buildKey(unit, tile) {
    return \`\${normalizeUnitKey(unit)}:\${Number(tile)}\`;
  }
  function totalEcoBuildCount(counts) {
    return Math.max(0, Number(counts?.city) || 0) + Math.max(0, Number(counts?.port) || 0) + Math.max(0, Number(counts?.factory) || 0);
  }

  // src/page/automation/auto-defense.js
  var DEFENSE_POST_UNIT = UNIT.DEFENSE_POST;
  var SAM_UNIT = UNIT.SAM_LAUNCHER;
  var INCOMING_FLOOR = 8e3;
  var COUNTER_FRACTION = 0.6;
  var AUTO_DEFENSE_MIN_COUNTER = 1e3;
  var MIN_COMBAT_SAFETY = 0.25;
  var BUILD_COOLDOWN_MS = 8e3;
  var COUNTER_COOLDOWN_MS = 2500;
  var PER_ATTACKER_COUNTER_FACTOR = 2.4;
  var MAX_AUTO_DEFENSE_POSTS = 4;
  var MAX_AUTO_SAM = 2;
  var MASSIVE_HUMAN_NEIGHBOUR_RATIO = 2;
  var DEFENSE_SETBACK_MIN_STEPS = 4;
  var DEFENSE_SETBACK_MAX_STEPS = 8;
  var DEFENSE_MIN_ENEMY_DISTANCE = 3;
  var DEFENSE_MIN_OWN_NEIGHBORS = 3;
  var PENDING_BUILD_FALLBACK_TTL_MS = 12e3;
  var SKIP_LOG_INTERVAL_MS = 5e3;
  function createAutoDefense({ gameState, mapDataRef, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection, getTroopEconomy }) {
    const attackerCooldowns = /* @__PURE__ */ new Map();
    const pendingBuilds = /* @__PURE__ */ new Map();
    const observedBuildCounts = /* @__PURE__ */ new Map();
    const observedBuildKeys = /* @__PURE__ */ new Set();
    let lastBuildSentAt = 0;
    let lastCounterSentAt = 0;
    let lastSkipAt = 0;
    let buildInFlight = false;
    let status = { state: "idle", reason: "not_started", emergency: false };
    return {
      reset() {
        attackerCooldowns.clear();
        pendingBuilds.clear();
        observedBuildCounts.clear();
        observedBuildKeys.clear();
        lastBuildSentAt = 0;
        lastCounterSentAt = 0;
        lastSkipAt = 0;
        buildInFlight = false;
        status = { state: "idle", reason: "reset", emergency: false };
      },
      getStatus() {
        return status;
      },
      observeIntent(intent) {
        if (!intent || intent.type !== "build_unit" || !isDefenseBuildUnit(intent.unit)) return;
        observeBuildIntent(intent.unit, intent.tile);
      },
      run(options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoDefense")) return setStatus("idle", "disabled", { emergency: false });
        if (!OrigWS) return setStatus("idle", "websocket_unavailable", { emergency: false });
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready", { emergency: false });
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable", { emergency: false });
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive", { emergency: false });
        const myTroops = finiteOrZero(myState.troops);
        const incoming = incomingAttackTroops(gameState, myState);
        const pressureFloor = Math.max(INCOMING_FLOOR, myTroops * (Number(settings.get("autoDefenseIncomingRatio")) || 0.35));
        const underAttack = incoming > pressureFloor;
        const nukeThreat = !!options.nukeThreat;
        const attackers = incoming > 0 ? incomingAttackers(gameState, myState) : [];
        const seriousThreat = isSeriousThreat({
          myState,
          attackers,
          threats: options.threats,
          neighbourIDs: options.neighbourIDs
        });
        const serious = seriousThreat.serious;
        if (!serious && !nukeThreat) {
          return setStatus("idle", "no_pressure", { emergency: false, incoming });
        }
        const economy = getTroopEconomy?.();
        let lastAction = null;
        if (serious && underAttack && settings.get("autoDefenseCounterAttack")) {
          const counter = maybeCounterAttack({ myState, economy, attackers });
          if (counter) lastAction = counter;
        }
        maybeBuildDefenses({ myState, nukeThreat, buildPost: serious });
        return setStatus(serious ? "emergency" : "alert", serious ? "under_attack" : "nuke_threat", {
          emergency: serious,
          incoming,
          nukeThreat,
          attackerCount: attackers.length,
          topAttacker: attackers[0]?.name || null,
          seriousReason: seriousThreat.reason || null,
          seriousThreat: seriousThreat.name || null,
          effectiveTroopsRatio: seriousThreat.effectiveTroopsRatio || null,
          lastAction: lastAction || status.lastAction || null
        });
      }
    };
    function isSeriousThreat({ myState, attackers, threats, neighbourIDs }) {
      const humanAttacker = (attackers || []).find((attacker) => {
        const player = gameState.state.playerStates.get(attacker.id);
        if (!player || String(player.playerType || "").toUpperCase() !== "HUMAN") return false;
        if (isAllied2(myState, player)) return false;
        if (teamDetection?.isMyTeammate(player.id)) return false;
        return true;
      });
      if (humanAttacker) return { serious: true, reason: "active_human_attacker", id: humanAttacker.id, name: humanAttacker.name || humanAttacker.id };
      const myRecallableTroops = Math.max(1, finiteOrZero(myState.troops) + troopsInCombat(myState));
      const massiveNeighbour = (threats || []).find((threat) => {
        if (!threat || threat.id == null) return false;
        if (!neighbourIDs || !neighbourIDs.has(threat.id)) return false;
        const player = gameState.state.playerStates.get(threat.id);
        if (!isHostileHuman(myState, player, teamDetection)) return false;
        const effectiveEnemyTroops = Math.max(0, finiteOrZero(player.troops) - troopsInCombat(player));
        return effectiveEnemyTroops / myRecallableTroops >= MASSIVE_HUMAN_NEIGHBOUR_RATIO;
      });
      if (massiveNeighbour) {
        const player = gameState.state.playerStates.get(massiveNeighbour.id);
        const effectiveEnemyTroops = Math.max(0, finiteOrZero(player?.troops) - troopsInCombat(player));
        return {
          serious: true,
          reason: "massive_human_neighbour",
          id: massiveNeighbour.id,
          name: massiveNeighbour.name || massiveNeighbour.id,
          effectiveTroopsRatio: effectiveEnemyTroops / myRecallableTroops
        };
      }
      return { serious: false, reason: null };
    }
    function maybeCounterAttack({ myState, economy, attackers }) {
      if (!attackers.length) return null;
      const now = performance.now();
      if (now - lastCounterSentAt < COUNTER_COOLDOWN_MS) return null;
      const combatSafety = Number(economy?.combatSafety);
      if (Number.isFinite(combatSafety) && combatSafety < MIN_COMBAT_SAFETY) {
        logSkip("counter_unsafe", { combatSafety });
        return null;
      }
      const safeSpendable = finiteOrZero(economy?.safeSpendableTroops);
      if (safeSpendable <= AUTO_DEFENSE_MIN_COUNTER) {
        logSkip("counter_no_troops", { safeSpendable });
        return null;
      }
      for (let i = 0; i < attackers.length; i += 1) {
        const attacker = attackers[i];
        const gate = validateCounter(attacker, myState);
        if (!gate.ok) {
          logSkip("counter_blocked", { reason: gate.reason, attacker: attacker.name });
          continue;
        }
        const lastForAttacker = attackerCooldowns.get(attacker.id) || 0;
        if (now - lastForAttacker < COUNTER_COOLDOWN_MS * PER_ATTACKER_COUNTER_FACTOR) continue;
        const troops = Math.max(1, Math.floor(Math.min(safeSpendable * COUNTER_FRACTION, safeSpendable)));
        origWsSend.call(
          gameState.state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "attack", targetID: attacker.id, troops } })
        );
        lastCounterSentAt = now;
        attackerCooldowns.set(attacker.id, now);
        logger.info(\`Auto-defense counter \${attacker.name}: \${troops} troops\`);
        roundLogger?.record("auto_defense_counter_sent", {
          targetID: attacker.id,
          targetName: attacker.name,
          attackerTroops: attacker.troops,
          troops,
          safeSpendable: Math.floor(safeSpendable),
          combatSafety
        });
        return \`counter \${attacker.name}\`;
      }
      return null;
    }
    function maybeBuildDefenses({ myState, nukeThreat, buildPost }) {
      if (buildInFlight) return;
      const now = performance.now();
      if (now - lastBuildSentAt < BUILD_COOLDOWN_MS) return;
      expirePendingBuilds();
      const gameView = getGameView();
      if (!gameView || typeof gameView.myPlayer !== "function") {
        logSkip("build_no_game_view");
        return;
      }
      const myPlayer = safeMyPlayer3(gameView);
      if (!myPlayer) {
        logSkip("build_no_player");
        return;
      }
      const wantSam = settings.get("autoDefenseBuildSam") && nukeThreat && canBuild(gameView, myPlayer, myState, SAM_UNIT, MAX_AUTO_SAM);
      const wantPost = buildPost && settings.get("autoDefenseBuildPosts") && canBuild(gameView, myPlayer, myState, DEFENSE_POST_UNIT, MAX_AUTO_DEFENSE_POSTS);
      const plan = wantSam ? { unit: SAM_UNIT, chooseTile: chooseCentralTile } : wantPost ? { unit: DEFENSE_POST_UNIT, chooseTile: chooseFrontierTile } : null;
      if (!plan) return;
      buildInFlight = true;
      plan.chooseTile(gameView, myPlayer, myState, mapDataRef.current).then((tile) => {
        buildInFlight = false;
        if (tile == null) {
          logSkip("build_no_tile", { unit: plan.unit });
          return;
        }
        sendBuild(plan.unit, tile);
      }).catch((error) => {
        buildInFlight = false;
        logSkip("build_tile_scan_failed", { message: String(error?.message || error || "") });
      });
    }
    function canBuild(gameView, myPlayer, myState, unit, cap) {
      const runtimeCount = countPlayerUnits(myPlayer, unit);
      const observedCount = observedCountOf(unit);
      const pendingCount = pendingCountOf(unit);
      const existing = Math.max(runtimeCount, observedCount) + pendingCount;
      if (existing >= cap) {
        logSkip("build_max", { unit, existing, runtimeCount, observedCount, pendingCount });
        return false;
      }
      const cost = getStructureCost(unit, {
        gameView,
        player: myPlayer,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      const gold = finiteOrZero(myState.gold);
      if (gold < cost.cost + cost.reserveGold) {
        logSkip("build_gold", { unit, gold, estimatedCost: cost.cost });
        return false;
      }
      return true;
    }
    function sendBuild(unit, tile) {
      const gameView = getGameView();
      const cost = getStructureCost(unit, {
        gameView,
        player: safeMyPlayer3(gameView),
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
      origWsSend.call(
        gameState.state.gameSocket,
        JSON.stringify({ type: "intent", intent: { type: "build_unit", unit, tile } })
      );
      lastBuildSentAt = performance.now();
      addPendingBuild(unit, tile);
      logger.info(\`Auto-defense build \${unit} at \${tile}\`);
      roundLogger?.record("auto_defense_build_sent", {
        unit,
        tile,
        estimatedCost: cost.cost,
        costSource: cost.source,
        pendingCounts: pendingCountsByUnit(),
        observedCounts: observedCountsByUnit()
      });
    }
    function validateCounter(attacker, myState) {
      const player = gameState.state.playerStates.get(attacker.id);
      if (!player || !player.isAlive) return { ok: false, reason: "target_not_alive" };
      if (String(player.playerType || "").toUpperCase() !== "HUMAN") return { ok: false, reason: "target_not_human" };
      if (isAllied2(myState, player)) return { ok: false, reason: "target_allied" };
      if (teamDetection?.isMyTeammate(player.id)) return { ok: false, reason: "target_team" };
      return { ok: true };
    }
    function addPendingBuild(unit, tile) {
      const duration = getConstructionDurationMs(unit, { gameView: getGameView() });
      pendingBuilds.set(Number(tile), { unit, sentAt: performance.now(), ttlMs: duration.durationMs + 1500 });
    }
    function observeBuildIntent(unit, tile) {
      const key = buildKey2(unit, tile);
      if (observedBuildKeys.has(key)) return;
      observedBuildKeys.add(key);
      if (Number.isFinite(Number(tile))) pendingBuilds.delete(Number(tile));
      observedBuildCounts.set(unit, observedCountOf(unit) + 1);
    }
    function expirePendingBuilds() {
      const now = performance.now();
      pendingBuilds.forEach((entry, tile) => {
        if (now - entry.sentAt > (entry.ttlMs || PENDING_BUILD_FALLBACK_TTL_MS)) pendingBuilds.delete(tile);
      });
    }
    function pendingCountOf(unit) {
      let count = 0;
      pendingBuilds.forEach((entry) => {
        if (entry.unit === unit) count += 1;
      });
      return count;
    }
    function observedCountOf(unit) {
      return observedBuildCounts.get(unit) || 0;
    }
    function pendingCountsByUnit() {
      const out = {};
      pendingBuilds.forEach((entry) => {
        out[entry.unit] = (out[entry.unit] || 0) + 1;
      });
      return out;
    }
    function observedCountsByUnit() {
      return Object.fromEntries(observedBuildCounts);
    }
    function isPendingTile(tile) {
      return pendingBuilds.has(Number(tile));
    }
    function chooseFrontierTile(gameView, myPlayer, myState, mapData) {
      return scanBorderTiles(
        gameView,
        myPlayer,
        myState,
        mapData,
        (tile) => countEnemyNeighbors(gameView, tile, myState, mapData, teamDetection, gameState),
        1
      ).then((frontier) => frontier == null ? null : chooseSafeDefenseTile(gameView, frontier, myState, mapData));
    }
    function chooseSafeDefenseTile(gameView, frontier, myState, mapData) {
      const candidates = collectSetbackCandidates(gameView, frontier, myState, mapData);
      const preferred = candidates.filter((candidate) => candidate.safe);
      const pool = preferred.length ? preferred : candidates.filter((candidate) => candidate.relaxed);
      const best = pool.sort((a, b) => b.score - a.score)[0];
      return best ? best.tile : null;
    }
    function collectSetbackCandidates(gameView, frontier, myState, mapData) {
      const out = [];
      const visited = /* @__PURE__ */ new Set([Number(frontier)]);
      const queue = [{ tile: Number(frontier), distance: 0 }];
      for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i];
        if (current.distance >= DEFENSE_SETBACK_MAX_STEPS) continue;
        getNeighbors2(gameView, current.tile, mapData).forEach((nearby) => {
          const tile = Number(nearby);
          if (!Number.isFinite(tile) || visited.has(tile)) return;
          visited.add(tile);
          if (mapData?.terrain && !isLandByte(mapData.terrain[tile])) return;
          if (!isOwnedByMe2(gameView, tile, myState)) return;
          const distance = current.distance + 1;
          queue.push({ tile, distance });
          if (isPendingTile(tile)) return;
          const enemyNeighbors = countEnemyNeighbors(gameView, tile, myState, mapData, teamDetection, gameState);
          if (enemyNeighbors > 0 || distance < 3) return;
          const ownNeighbors = countOwnNeighbors(gameView, tile, myState, mapData);
          const enemyDistance = nearestEnemyDistance(gameView, tile, myState, mapData, teamDetection, gameState, DEFENSE_SETBACK_MAX_STEPS);
          const safe = distance >= DEFENSE_SETBACK_MIN_STEPS && ownNeighbors >= DEFENSE_MIN_OWN_NEIGHBORS && enemyDistance >= DEFENSE_MIN_ENEMY_DISTANCE;
          const relaxed = ownNeighbors >= 2 && enemyDistance >= 2;
          if (!safe && !relaxed) return;
          out.push({
            tile,
            distance,
            ownNeighbors,
            enemyDistance,
            safe,
            relaxed,
            score: enemyDistance * 24 + ownNeighbors * 10 - Math.abs(distance - 5) * 6
          });
        });
      }
      return out;
    }
    function chooseCentralTile(gameView, myPlayer, myState, mapData) {
      return scanBorderTiles(gameView, myPlayer, myState, mapData, (tile) => countOwnNeighbors(gameView, tile, myState, mapData), 0);
    }
    function scanBorderTiles(gameView, myPlayer, myState, mapData, scoreFn, minScore) {
      return Promise.resolve().then(() => typeof myPlayer.borderTiles === "function" ? myPlayer.borderTiles() : null).then((info) => {
        const borders = info && info.borderTiles;
        if (!borders || typeof borders.forEach !== "function") return null;
        let best = null;
        let bestScore = minScore - 1;
        borders.forEach((tile) => {
          const num = Number(tile);
          if (!Number.isFinite(num) || isPendingTile(num)) return;
          if (mapData?.terrain && !isLandByte(mapData.terrain[num])) return;
          if (!isOwnedByMe2(gameView, num, myState)) return;
          const value = scoreFn(num);
          if (value > bestScore) {
            bestScore = value;
            best = num;
          }
        });
        return bestScore >= minScore ? best : null;
      });
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < SKIP_LOG_INTERVAL_MS) return;
      lastSkipAt = now;
      roundLogger?.record("auto_defense_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
      return status;
    }
  }
  function countEnemyNeighbors(gameView, tile, myState, mapData, teamDetection, gameState) {
    let count = 0;
    getNeighbors2(gameView, tile, mapData).forEach((nearby) => {
      if (mapData?.terrain && !isLandByte(mapData.terrain[nearby])) return;
      if (isEnemyOwned(gameView, nearby, myState, teamDetection, gameState)) count += 1;
    });
    return count;
  }
  function countOwnNeighbors(gameView, tile, myState, mapData) {
    let count = 0;
    getNeighbors2(gameView, tile, mapData).forEach((nearby) => {
      if (mapData?.terrain && !isLandByte(mapData.terrain[nearby])) return;
      if (isOwnedByMe2(gameView, nearby, myState)) count += 1;
    });
    return count;
  }
  function nearestEnemyDistance(gameView, startTile, myState, mapData, teamDetection, gameState, maxDistance) {
    const start = Number(startTile);
    if (!Number.isFinite(start)) return maxDistance + 1;
    const visited = /* @__PURE__ */ new Set([start]);
    const queue = [{ tile: start, distance: 0 }];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      if (current.distance >= maxDistance) continue;
      const nextDistance = current.distance + 1;
      const neighbours = getNeighbors2(gameView, current.tile, mapData);
      for (let n = 0; n < neighbours.length; n += 1) {
        const nearby = Number(neighbours[n]);
        if (!Number.isFinite(nearby) || visited.has(nearby)) continue;
        visited.add(nearby);
        if (mapData?.terrain && !isLandByte(mapData.terrain[nearby])) continue;
        if (isEnemyOwned(gameView, nearby, myState, teamDetection, gameState)) return nextDistance;
        queue.push({ tile: nearby, distance: nextDistance });
      }
    }
    return maxDistance + 1;
  }
  function isEnemyOwned(gameView, tile, myState, teamDetection, gameState) {
    try {
      if (!gameView || typeof gameView.owner !== "function") return false;
      const owner = gameView.owner(tile);
      if (!owner) return false;
      const isPlayer = typeof owner.isPlayer === "function" ? owner.isPlayer() : true;
      if (!isPlayer) return false;
      const ownerID = typeof owner.id === "function" ? owner.id() : owner.id;
      if (ownerID == null) return false;
      if (ownerID === myState.id || ownerID === myState.smallID) return false;
      const player = resolvePlayerByOwnerID(gameState, ownerID);
      return isHostileHuman(myState, player, teamDetection);
    } catch (_) {
      return false;
    }
  }
  function isOwnedByMe2(gameView, tile, myState) {
    try {
      if (!gameView || typeof gameView.owner !== "function") return false;
      const owner = gameView.owner(tile);
      if (!owner) return false;
      const ownerID = typeof owner.id === "function" ? owner.id() : owner.id;
      return ownerID === myState.id || ownerID === myState.smallID;
    } catch (_) {
      return false;
    }
  }
  function getNeighbors2(gameView, tile, mapData) {
    try {
      if (gameView && typeof gameView.neighbors === "function") {
        const neighbours = gameView.neighbors(tile);
        if (Array.isArray(neighbours)) return neighbours.filter((value) => Number.isFinite(Number(value))).map(Number);
      }
    } catch (_) {
    }
    if (!mapData?.width || !mapData?.height) return [];
    const width = mapData.width;
    const height = mapData.height;
    const x = tile % width;
    const y = Math.floor(tile / width);
    const out = [];
    if (x > 0) out.push(tile - 1);
    if (x < width - 1) out.push(tile + 1);
    if (y > 0) out.push(tile - width);
    if (y < height - 1) out.push(tile + width);
    return out;
  }
  function isAllied2(myState, target) {
    const alliances = Array.isArray(myState.alliances) ? myState.alliances : [];
    return alliances.some((alliance) => alliance && alliance.other === target.id);
  }
  function isHostileHuman(myState, player, teamDetection) {
    if (!player || !player.isAlive) return false;
    if (String(player.playerType || "").toUpperCase() !== "HUMAN") return false;
    if (isAllied2(myState, player)) return false;
    if (teamDetection?.isMyTeammate(player.id)) return false;
    return true;
  }
  function resolvePlayerByOwnerID(gameState, ownerID) {
    if (!gameState || ownerID == null) return null;
    const direct = gameState.state.playerStates.get(ownerID);
    if (direct) return direct;
    let found = null;
    gameState.state.playerStates.forEach((player) => {
      if (!found && player && player.smallID === ownerID) found = player;
    });
    return found;
  }
  function safeMyPlayer3(gameView) {
    try {
      return gameView && typeof gameView.myPlayer === "function" ? gameView.myPlayer() : null;
    } catch (_) {
    }
    return null;
  }
  function isDefenseBuildUnit(unit) {
    return unit === DEFENSE_POST_UNIT || unit === SAM_UNIT;
  }
  function buildKey2(unit, tile) {
    return \`\${String(unit || "").trim().toLowerCase()}:\${Number(tile)}\`;
  }

  // src/page/automation/auto-boat.js
  var BOAT_COOLDOWN_MS = 4e3;
  var BOAT_WAVE_RATIO = 0.15;
  var MIN_BOAT_TROOPS = 1;
  var MIN_SURPLUS = 500;
  var BFS_TILE_CAP = 6e3;
  var MAX_BOAT_DISTANCE = 90;
  function createAutoBoat({ gameState, mapDataRef, OrigWS, origWsSend, settings, logger, roundLogger, getTroopEconomy }) {
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let inFlight = false;
    let lastDst = -1;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        lastSentAt = 0;
        lastSkipAt = 0;
        inFlight = false;
        lastDst = -1;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      run(options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoBoat")) return setStatus("idle", "disabled");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        if (!isInsideFarmWindow(state, settings)) return setStatus("idle", "outside_window");
        if (inFlight) return setStatus("cooldown", "tile_scan");
        const now = performance.now();
        if (now - lastSentAt < BOAT_COOLDOWN_MS) {
          return setStatus("cooldown", "cooldown", { cooldownMs: Math.round(BOAT_COOLDOWN_MS - (now - lastSentAt)) });
        }
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive");
        const economy = getTroopEconomy?.();
        const safeSpendable = finiteOrZero(economy?.safeSpendableTroops);
        const maxTroops = finiteOrZero(economy?.maxTroops);
        if (safeSpendable <= MIN_SURPLUS || maxTroops <= 0) {
          logSkip("reserve_limit", { safeSpendable });
          return setStatus("blocked", "reserve_limit", { safeSpendable });
        }
        const troops = Math.max(MIN_BOAT_TROOPS, Math.floor(Math.min(safeSpendable, maxTroops * BOAT_WAVE_RATIO)));
        const gameView = getGameView();
        if (!gameView || typeof gameView.myPlayer !== "function") {
          logSkip("no_game_view");
          return setStatus("blocked", "no_game_view");
        }
        const myPlayer = safeMyPlayer4(gameView);
        if (!myPlayer) {
          logSkip("no_player");
          return setStatus("blocked", "no_player");
        }
        inFlight = true;
        chooseBoatDst(gameView, myPlayer, mapDataRef.current).then((dst) => {
          inFlight = false;
          if (dst == null) {
            logSkip("no_water_target");
            setStatus("blocked", "no_water_target");
            return;
          }
          origWsSend.call(
            gameState.state.gameSocket,
            JSON.stringify({ type: "intent", intent: { type: "boat", troops, dst } })
          );
          lastSentAt = performance.now();
          lastDst = dst;
          logger.info(\`Auto-boat expand: \${troops} troops -> tile \${dst}\`);
          roundLogger?.record("auto_boat_sent", { dst, troops, safeSpendable: Math.floor(safeSpendable) });
          setStatus("sent", \`sent_\${troops}\`, { dst, troops });
        }).catch((error) => {
          inFlight = false;
          logSkip("tile_scan_failed", { message: String(error?.message || error || "") });
          setStatus("blocked", "tile_scan_failed");
        });
        return setStatus("scanning", "scanning");
      }
    };
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_boat_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
      return status;
    }
  }
  function chooseBoatDst(gameView, myPlayer, mapData) {
    return Promise.resolve().then(() => typeof myPlayer.borderTiles === "function" ? myPlayer.borderTiles() : null).then((info) => {
      const borders = info && info.borderTiles;
      if (!borders || typeof borders.forEach !== "function") return null;
      const width = mapData?.width;
      const height = mapData?.height;
      const terrain = mapData?.terrain;
      if (!width || !height || !terrain) return null;
      const visited = /* @__PURE__ */ new Set();
      const queue = [];
      borders.forEach((tile) => {
        const num = Number(tile);
        if (!Number.isFinite(num)) return;
        neighborsOf(num, width, height).forEach((nb) => {
          if (!isLandByte(terrain[nb]) && !visited.has(nb)) {
            visited.add(nb);
            queue.push({ tile: nb, dist: 1 });
          }
        });
      });
      let head = 0;
      while (head < queue.length && visited.size < BFS_TILE_CAP) {
        const { tile, dist } = queue[head];
        head += 1;
        if (dist > MAX_BOAT_DISTANCE) continue;
        const nbs = neighborsOf(tile, width, height);
        for (let i = 0; i < nbs.length; i += 1) {
          const nb = nbs[i];
          if (visited.has(nb)) continue;
          if (isLandByte(terrain[nb])) {
            if (isUnclaimedLand(gameView, nb)) return nb;
            visited.add(nb);
          } else {
            visited.add(nb);
            queue.push({ tile: nb, dist: dist + 1 });
          }
        }
      }
      return null;
    });
  }
  function isUnclaimedLand(gameView, tile) {
    try {
      if (typeof gameView.hasOwner === "function") return !gameView.hasOwner(tile);
      const owner = typeof gameView.owner === "function" ? gameView.owner(tile) : null;
      if (!owner) return true;
      return typeof owner.isPlayer === "function" ? !owner.isPlayer() : false;
    } catch (_) {
      return false;
    }
  }
  function neighborsOf(tile, width, height) {
    const x = tile % width;
    const y = Math.floor(tile / width);
    const out = [];
    if (x > 0) out.push(tile - 1);
    if (x < width - 1) out.push(tile + 1);
    if (y > 0) out.push(tile - width);
    if (y < height - 1) out.push(tile + width);
    return out;
  }
  function safeMyPlayer4(gameView) {
    try {
      return gameView && typeof gameView.myPlayer === "function" ? gameView.myPlayer() : null;
    } catch (_) {
    }
    return null;
  }

  // src/page/automation/nuke-planner.js
  //
  // SAM/nuke mechanics (from OpenFrontIO src/core):
  //   SAM range  = 150 - 480/(level+5)   →  L0≈54  L5≈90  L10≈111  max 150
  //   SAM cooldown = 90 ticks = 9 seconds
  //   Intercept: SAM fires if it can reach ANY point on the nuke's flight path
  //              (straight line from silo to target) within its range radius.
  //   H-bomb blast radius ≈ 50 tiles (Config.ts nukeExplosionRadius)
  //   Atom bomb blast radius ≈ 15 tiles
  //   Saturation doctrine: send N atoms simultaneously where N = SAMs covering
  //   the flight path. All SAMs fire on the first atom; subsequent ones slip
  //   through during the 90-tick cooldown window.
  //
  var SAM_RANGE_CONSERVATIVE = 54;   // Level-0 SAM range (tile units)
  var SAM_RANGE_UPGRADED     = 100;  // Estimate for upgraded SAMs (L≈7)
  var SAM_COOLDOWN_TICKS     = 90;   // Ticks before a SAM can fire again
  var HBOMB_BLAST_RADIUS     = 50;   // Tiles (Config.nukeExplosionRadius for H-bomb)
  var ATOM_BLAST_RADIUS      = 15;   // Tiles (Config.nukeExplosionRadius for atom)
  var NUKE_SPEED_TILES_PER_TICK = 5; // Approximate nuke travel speed

  function scanAllEnemySams(gameView, myState, teamDetection) {
    return scanUnitsByType(gameView, UNIT.SAM_LAUNCHER, myState, teamDetection).filter(
      (sam) => !sam.isMine && !sam.isAlly && !sam.underConstruction && sam.tile != null && sam.coords != null
    );
  }

  // Tile-space distance between two (x,y) coordinate objects.
  function coordDist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Distance from point P to the line-segment AB (all in coord space).
  // Returns the minimum distance and the parameter t ∈ [0,1] along AB.
  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  // For a nuke flying from siloCoords → targetCoords, return the list of enemy SAMs
  // that can intercept it (i.e. the flight path passes within their range).
  function samsThatCoverPath(siloCoords, targetCoords, enemySams, samRange) {
    return enemySams.filter((sam) => {
      const dist = pointToSegmentDist(
        sam.coords.x, sam.coords.y,
        siloCoords.x, siloCoords.y,
        targetCoords.x, targetCoords.y
      );
      return dist <= samRange;
    });
  }

  // Count enemy tiles within a circle of given radius centered on targetCoords.
  // Uses mapData width to convert tile index to (x,y), sampling a grid for speed.
  function countEnemyTilesInRadius(gameView, targetCoords, radius, myState, teamDetection, mapData) {
    if (!mapData || !mapData.width) return 0;
    const width = mapData.width;
    const height = mapData.height;
    const cx = targetCoords.x;
    const cy = targetCoords.y;
    const r2 = radius * radius;
    let count = 0;
    // Sample every 2nd tile in a bounding box for performance
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const tile = y * width + x;
        const owner = ownerOf(gameView, tile);
        if (!owner || owner.id === myState.id || owner.id === myState.smallID) continue;
        if (teamDetection?.isMyTeammate?.(owner.id)) continue;
        count++;
      }
    }
    return count;
  }

  // Score a potential H-bomb target tile:
  //   (+) enemy tiles in blast radius
  //   (-) SAMs that survive saturation (atoms sent = availableAtoms)
  //   (+) target tile owned by a high-threat player
  function scoreHBombTarget(gameView, targetTile, targetCoords, siloCoords, enemySams, threatRankMap, myState, teamDetection, mapData, availableAtoms) {
    const coveringSams = samsThatCoverPath(siloCoords, targetCoords, enemySams, SAM_RANGE_UPGRADED);
    // How many SAMs survive after saturation? If we send availableAtoms simultaneously,
    // each SAM can only fire once during the first burst, so they ALL fire on atom #1..N.
    // After the burst, all SAMs are on cooldown → H-bomb slips through.
    // So we only need availableAtoms >= coveringSams.length to guarantee penetration.
    const saturated = availableAtoms >= coveringSams.length;
    const survivingSams = saturated ? 0 : coveringSams.length - availableAtoms;
    if (survivingSams > 0) return null; // can't penetrate, skip

    const owner = ownerOf(gameView, targetTile);
    if (!owner) return null;
    const ownerID = owner.id;
    if (ownerID === myState.id || ownerID === myState.smallID) return null;
    if (teamDetection?.isMyTeammate?.(ownerID)) return null;

    const enemyTilesHit = countEnemyTilesInRadius(gameView, targetCoords, HBOMB_BLAST_RADIUS, myState, teamDetection, mapData);
    const threatBonus = threatRankMap.has(ownerID) ? (5 - Math.min(4, threatRankMap.get(ownerID))) * 500 : 0;
    return {
      tile: targetTile,
      coords: targetCoords,
      ownerID,
      ownerName: owner.name || ownerID,
      enemyTilesHit,
      coveringSams: coveringSams.length,
      saturated,
      score: enemyTilesHit + threatBonus
    };
  }

  // Find the best H-bomb target for a given silo, accounting for SAM coverage.
  // Samples the border tiles of the highest-threat enemy within range.
  function planHBombStrike(gameView, myPlayer, myState, mapData, enemySams, threats, teamDetection, availableAtoms) {
    return Promise.resolve()
      .then(() => typeof myPlayer.borderTiles === "function" ? myPlayer.borderTiles() : null)
      .then((info) => {
        const borders = info && info.borderTiles;
        if (!borders || typeof borders.forEach !== "function") return null;
        // Find our silo coords for flight-path calculation
        const mySilos = scanUnitsByType(gameView, UNIT.MISSILE_SILO, myState, null).filter((s) => s.isMine && s.coords);
        if (!mySilos.length) return null;
        const siloCoords = mySilos[0].coords;

        const threatRankMap = /* @__PURE__ */ new Map();
        (threats || []).forEach((t, i) => { if (t?.id != null) threatRankMap.set(t.id, i); });

        // Collect candidate enemy tiles from our border + one step in
        const candidates = [];
        borders.forEach((borderTile) => {
          const bNum = Number(borderTile);
          if (!Number.isFinite(bNum)) return;
          const nbs = neighborsOf2(bNum, mapData);
          nbs.forEach((nb) => {
            const coords = tileCoords(gameView, nb);
            if (!coords) return;
            const result = scoreHBombTarget(
              gameView, nb, coords, siloCoords, enemySams, threatRankMap,
              myState, teamDetection, mapData, availableAtoms
            );
            if (result && result.score > 0) candidates.push(result);
          });
        });

        if (!candidates.length) return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
      });
  }

  // Build a saturation + H-bomb strike plan for a target.
  // Returns { atomTiles, hBombTile, coveringSams, saturated, score } or null.
  function buildNukeStrikePlan(gameView, myPlayer, myState, mapData, threats, teamDetection, availableAtoms, availableHBombs) {
    const enemySams = scanAllEnemySams(gameView, myState, teamDetection);
    return planHBombStrike(
      gameView, myPlayer, myState, mapData, enemySams, threats, teamDetection, availableAtoms
    ).then((best) => {
      if (!best) return null;
      return {
        hBombTile: best.tile,
        hBombTarget: best.ownerName,
        hBombTargetID: best.ownerID,
        enemyTilesHit: best.enemyTilesHit,
        coveringSams: best.coveringSams,
        saturated: best.saturated,
        score: best.score,
        // Tiles to hit with atoms = the SAMs on the flight path
        // (aim at the SAM itself to destroy it / force interception waste)
        atomTargets: best.coveringSams > 0
          ? scanAllEnemySams(gameView, myState, teamDetection)
              .filter((s) => !s.isMine && !s.isAlly && s.tile != null)
              .slice(0, best.coveringSams)
              .map((s) => s.tile)
          : []
      };
    });
  }

  // src/page/automation/auto-weapons.js
  var SILO_UNIT = UNIT.MISSILE_SILO;
  var SILO_BUILD_COOLDOWN_MS = 15e3;
  var LAUNCH_COOLDOWN_MS = 12e3;
  var EARLY_NUKE_COOLDOWN_MS = 8e3;
  var MIN_COMBAT_SAFETY_BUILD = 0.6;
  var MIN_COMBAT_SAFETY_LAUNCH = 0.45;
  var MIN_COMBAT_SAFETY_EARLY = 0.3;
  var MAX_AUTO_SILOS = 1;
  var STABLE_ECO_STATES = /* @__PURE__ */ new Set(["GROWTH_PEAK", "READY", "PUSH", "CAP_WASTE"]);
  function createAutoWeapons({ gameState, mapDataRef, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection, getTroopEconomy }) {
    const pendingSilos = /* @__PURE__ */ new Map();
    let lastSiloAt = 0;
    let lastLaunchAt = 0;
    let lastEarlyNukeAt = 0;
    let lastSkipAt = 0;
    let buildInFlight = false;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        pendingSilos.clear();
        lastSiloAt = 0;
        lastLaunchAt = 0;
        lastEarlyNukeAt = 0;
        lastSkipAt = 0;
        buildInFlight = false;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      run({ threats } = {}, options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoWeapons")) return setStatus("idle", "disabled");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        if (buildInFlight) return setStatus("cooldown", "tile_scan");
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive");
        const economy = getTroopEconomy?.();
        const gameView = getGameView();
        if (!gameView || typeof gameView.myPlayer !== "function") return setStatus("blocked", "no_game_view");
        const myPlayer = safeMyPlayer5(gameView);
        if (!myPlayer) return setStatus("blocked", "no_player");
        expirePendingSilos();
        const builtSilos = countPlayerUnits(myPlayer, SILO_UNIT);
        const siloCount = builtSilos + pendingSilos.size;
        if (settings.get("autoWeaponsEarlyNuke") && builtSilos >= 1) {
          const early = maybeEarlyNuke({ myState, economy, gameView, myPlayer, threats });
          if (early) return early;
        }
        if (!economy || !STABLE_ECO_STATES.has(economy.state)) {
          return setStatus("idle", "eco_unstable", { ecoState: economy?.state || null });
        }
        if (siloCount < MAX_AUTO_SILOS) {
          return maybeBuildSilo({ myState, economy, gameView, myPlayer });
        }
        return maybeLaunch({ myState, economy, gameView, myPlayer, threats });
      }
    };
    function maybeEarlyNuke({ myState, economy, gameView, myPlayer, threats }) {
      const now = performance.now();
      if (now - lastEarlyNukeAt < EARLY_NUKE_COOLDOWN_MS) return null;
      if (finiteOrZero(economy?.combatSafety) < MIN_COMBAT_SAFETY_EARLY) return null;
      const sams = enemySamSitesUnderConstruction(gameView, myState, teamDetection);
      if (!sams.length) return null;
      const cost = getStructureCost(UNIT.ATOM_BOMB, { gameView, player: myPlayer });
      if (cost.source !== "runtime") {
        logSkip("early_no_atom_cost");
        return null;
      }
      const gold = finiteOrZero(myState.gold);
      if (gold < cost.cost + cost.reserveGold) {
        logSkip("early_atom_gold", { gold, estimatedCost: cost.cost });
        return null;
      }
      const threatRank = /* @__PURE__ */ new Map();
      (threats || []).forEach((threat, index) => {
        if (threat && threat.id != null) threatRank.set(threat.id, index);
      });
      sams.sort((a, b) => rankOf(threatRank, a.ownerID) - rankOf(threatRank, b.ownerID));
      const target = sams[0];
      origWsSend.call(
        gameState.state.gameSocket,
        JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: UNIT.ATOM_BOMB, tile: target.tile } })
      );
      lastEarlyNukeAt = now;
      lastLaunchAt = now;
      logger.info(\`Auto-weapons EARLY NUKE \${target.ownerName} SAM @\${target.tile}\`);
      roundLogger?.record("auto_weapons_early_nuke_sent", {
        unit: UNIT.ATOM_BOMB,
        tile: target.tile,
        targetName: target.ownerName,
        targetID: target.ownerID,
        estimatedCost: cost.cost
      });
      return setStatus("sent", "early_nuke", { unit: UNIT.ATOM_BOMB, target: target.ownerName });
    }
    function maybeBuildSilo({ myState, economy, gameView, myPlayer }) {
      const now = performance.now();
      if (now - lastSiloAt < SILO_BUILD_COOLDOWN_MS) return setStatus("cooldown", "silo_cooldown");
      if (finiteOrZero(economy.combatSafety) < MIN_COMBAT_SAFETY_BUILD) return setStatus("idle", "unsafe_flank");
      const cost = getStructureCost(SILO_UNIT, { gameView, player: myPlayer, pendingCounts: { [SILO_UNIT]: pendingSilos.size } });
      const gold = finiteOrZero(myState.gold);
      if (gold < cost.cost + cost.reserveGold) {
        logSkip("silo_gold", { gold, estimatedCost: cost.cost });
        return setStatus("blocked", "silo_gold", { gold, estimatedCost: cost.cost });
      }
      buildInFlight = true;
      chooseCentralTile(gameView, myPlayer, myState, mapDataRef.current).then((tile) => {
        buildInFlight = false;
        if (tile == null) {
          logSkip("silo_no_tile");
          return;
        }
        origWsSend.call(
          gameState.state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: SILO_UNIT, tile } })
        );
        lastSiloAt = performance.now();
        addPendingSilo(tile);
        logger.info(\`Auto-weapons build Missile Silo at \${tile}\`);
        roundLogger?.record("auto_weapons_silo_sent", { tile, estimatedCost: cost.cost, costSource: cost.source });
      }).catch((error) => {
        buildInFlight = false;
        logSkip("silo_tile_scan_failed", { message: String(error?.message || error || "") });
      });
      return setStatus("scanning", "silo_scan");
    }
    function maybeLaunch({ myState, economy, gameView, myPlayer, threats }) {
      const now = performance.now();
      if (now - lastLaunchAt < LAUNCH_COOLDOWN_MS) return setStatus("cooldown", "launch_cooldown");
      if (finiteOrZero(economy.combatSafety) < MIN_COMBAT_SAFETY_LAUNCH) return setStatus("idle", "unsafe_launch");
      const gold = finiteOrZero(myState.gold);

      // SAM-saturation + H-bomb strike planner
      if (settings.get("autoNukeStrike")) {
        const hBombCost = getStructureCost(UNIT.HYDROGEN_BOMB, { gameView, player: myPlayer });
        const atomCost = getStructureCost(UNIT.ATOM_BOMB, { gameView, player: myPlayer });
        const atomCostVal = atomCost.source === "runtime" ? atomCost.cost : 75e4;
        const hBombCostVal = hBombCost.source === "runtime" ? hBombCost.cost : 5e6;
        const canAffordHBomb = gold >= hBombCostVal + hBombCost.reserveGold;
        if (canAffordHBomb) {
          // Calculate how many atoms we can afford alongside the H-bomb
          const goldAfterHBomb = gold - hBombCostVal;
          const availableAtoms = Math.max(0, Math.floor(goldAfterHBomb / atomCostVal));
          buildInFlight = true;
          buildNukeStrikePlan(gameView, myPlayer, myState, mapDataRef.current, threats || [], teamDetection, availableAtoms, 1)
            .then((plan) => {
              buildInFlight = false;
              if (!plan) {
                logSkip("no_strike_plan");
                setStatus("idle", "no_strike_plan");
                return;
              }
              const sock = gameState.state.gameSocket;
              // Fire saturation atoms first (simultaneously — each is one intent)
              plan.atomTargets.forEach((atomTile) => {
                origWsSend.call(sock, JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: UNIT.ATOM_BOMB, tile: atomTile } }));
              });
              // Then the H-bomb at the scored target
              origWsSend.call(sock, JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: UNIT.HYDROGEN_BOMB, tile: plan.hBombTile } }));
              lastLaunchAt = performance.now();
              logger.info(\`Auto-nuke strike: \${plan.atomTargets.length} atoms + H-bomb -> \${plan.hBombTarget} (\${plan.enemyTilesHit} tiles, \${plan.coveringSams} SAMs covered)\`);
              roundLogger?.record("auto_nuke_strike_sent", {
                hBombTile: plan.hBombTile,
                hBombTargetID: plan.hBombTargetID,
                hBombTarget: plan.hBombTarget,
                atomCount: plan.atomTargets.length,
                atomTiles: plan.atomTargets,
                enemyTilesHit: plan.enemyTilesHit,
                coveringSams: plan.coveringSams,
                score: plan.score
              });
              setStatus("sent", \`strike_\${plan.hBombTarget}\`, { unit: UNIT.HYDROGEN_BOMB, target: plan.hBombTarget, atomCount: plan.atomTargets.length });
            }).catch((error) => {
              buildInFlight = false;
              logSkip("strike_plan_failed", { message: String(error?.message || error || "") });
            });
          return setStatus("scanning", "strike_scan");
        }
      }

      // Fallback: single-weapon launch as before
      const weapon = chooseAffordableWeapon(gameView, myPlayer, gold);
      if (!weapon) {
        logSkip("no_affordable_weapon");
        return setStatus("idle", "no_affordable_weapon");
      }
      buildInFlight = true;
      chooseNukeTarget(gameView, myPlayer, myState, threats || []).then((target) => {
        buildInFlight = false;
        if (!target) {
          logSkip("no_target");
          setStatus("idle", "no_target");
          return;
        }
        origWsSend.call(
          gameState.state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "build_unit", unit: weapon.unit, tile: target.tile } })
        );
        lastLaunchAt = performance.now();
        logger.info(\`Auto-weapons launch \${weapon.unit} -> \${target.targetName} @\${target.tile}\`);
        roundLogger?.record("auto_weapons_launch_sent", {
          unit: weapon.unit,
          tile: target.tile,
          targetName: target.targetName,
          targetID: target.targetID,
          estimatedCost: weapon.cost
        });
        setStatus("sent", \`launch_\${weapon.unit}\`, { unit: weapon.unit, target: target.targetName });
      }).catch((error) => {
        buildInFlight = false;
        logSkip("target_scan_failed", { message: String(error?.message || error || "") });
      });
      return setStatus("scanning", "launch_scan");
    }
    function chooseAffordableWeapon(gameView, myPlayer, gold) {
      for (let i = 0; i < WEAPONS_BY_POWER.length; i += 1) {
        const unit = WEAPONS_BY_POWER[i];
        const cost = getStructureCost(unit, { gameView, player: myPlayer });
        if (cost.source !== "runtime") continue;
        if (gold >= cost.cost + cost.reserveGold) return { unit, cost: cost.cost };
      }
      return null;
    }
    function chooseNukeTarget(gameView, myPlayer, myState, threats) {
      const threatRank = /* @__PURE__ */ new Map();
      (threats || []).forEach((threat, index) => {
        if (threat && threat.id != null) threatRank.set(threat.id, index);
      });
      return Promise.resolve().then(() => typeof myPlayer.borderTiles === "function" ? myPlayer.borderTiles() : null).then((info) => {
        const borders = info && info.borderTiles;
        if (!borders || typeof borders.forEach !== "function") return null;
        const enemyTile = /* @__PURE__ */ new Map();
        const enemyName = /* @__PURE__ */ new Map();
        borders.forEach((tile2) => {
          const num = Number(tile2);
          if (!Number.isFinite(num)) return;
          neighborsOf2(num, mapDataRef.current).forEach((nb) => {
            const owner = ownerOf(gameView, nb);
            if (!owner || owner.id == null) return;
            if (owner.id === myState.id || owner.id === myState.smallID) return;
            if (teamDetection?.isMyTeammate?.(owner.id)) return;
            if (isAllied3(myState, owner.id)) return;
            if (!enemyTile.has(owner.id)) {
              enemyTile.set(owner.id, nb);
              enemyName.set(owner.id, owner.name);
            }
          });
        });
        if (enemyTile.size === 0) return null;
        let bestID = null;
        let bestRank = Infinity;
        enemyTile.forEach((_tile, id) => {
          const rank = threatRank.has(id) ? threatRank.get(id) : 999;
          if (rank < bestRank) {
            bestRank = rank;
            bestID = id;
          }
        });
        if (bestID == null) return null;
        const boundaryTile = enemyTile.get(bestID);
        const tile = stepIntoTerritory(gameView, boundaryTile, bestID) ?? boundaryTile;
        return { tile, targetID: bestID, targetName: enemyName.get(bestID) || bestID };
      });
    }
    function stepIntoTerritory(gameView, tile, ownerID) {
      const nbs = neighborsOf2(tile, mapDataRef.current);
      for (let i = 0; i < nbs.length; i += 1) {
        const owner = ownerOf(gameView, nbs[i]);
        if (owner && owner.id === ownerID) return nbs[i];
      }
      return null;
    }
    function chooseCentralTile(gameView, myPlayer, myState, mapData) {
      return Promise.resolve().then(() => typeof myPlayer.borderTiles === "function" ? myPlayer.borderTiles() : null).then((info) => {
        const borders = info && info.borderTiles;
        if (!borders || typeof borders.forEach !== "function") return null;
        let best = null;
        let bestOwn = -1;
        borders.forEach((tile) => {
          const num = Number(tile);
          if (!Number.isFinite(num) || pendingSilos.has(num)) return;
          if (mapData?.terrain && !isLandByte(mapData.terrain[num])) return;
          if (!isOwnedByMe3(gameView, num, myState)) return;
          let own = 0;
          neighborsOf2(num, mapData).forEach((nb) => {
            if (isOwnedByMe3(gameView, nb, myState)) own += 1;
          });
          if (own > bestOwn) {
            bestOwn = own;
            best = num;
          }
        });
        return best;
      });
    }
    function addPendingSilo(tile) {
      const duration = getConstructionDurationMs(SILO_UNIT, { gameView: getGameView() });
      pendingSilos.set(Number(tile), { sentAt: performance.now(), ttlMs: duration.durationMs + 1500 });
    }
    function expirePendingSilos() {
      const now = performance.now();
      pendingSilos.forEach((entry, tile) => {
        if (now - entry.sentAt > (entry.ttlMs || 15e3)) pendingSilos.delete(tile);
      });
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_weapons_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
      return status;
    }
  }
  function rankOf(rankMap, id) {
    return rankMap.has(id) ? rankMap.get(id) : 999;
  }
  function ownerOf(gameView, tile) {
    try {
      if (!gameView || typeof gameView.owner !== "function") return null;
      const owner = gameView.owner(tile);
      if (!owner) return null;
      const isPlayer = typeof owner.isPlayer === "function" ? owner.isPlayer() : true;
      if (!isPlayer) return null;
      const id = typeof owner.id === "function" ? owner.id() : owner.id;
      const name = typeof owner.displayName === "function" ? owner.displayName() : typeof owner.name === "function" ? owner.name() : id;
      return { id, name };
    } catch (_) {
      return null;
    }
  }
  function isOwnedByMe3(gameView, tile, myState) {
    try {
      if (!gameView || typeof gameView.owner !== "function") return false;
      const owner = gameView.owner(tile);
      if (!owner) return false;
      const ownerID = typeof owner.id === "function" ? owner.id() : owner.id;
      return ownerID === myState.id || ownerID === myState.smallID;
    } catch (_) {
      return false;
    }
  }
  function isAllied3(myState, ownerID) {
    const alliances = Array.isArray(myState.alliances) ? myState.alliances : [];
    return alliances.some((alliance) => alliance && alliance.other === ownerID);
  }
  function neighborsOf2(tile, mapData) {
    if (!mapData?.width || !mapData?.height) return [];
    const width = mapData.width;
    const height = mapData.height;
    const x = tile % width;
    const y = Math.floor(tile / width);
    const out = [];
    if (x > 0) out.push(tile - 1);
    if (x < width - 1) out.push(tile + 1);
    if (y > 0) out.push(tile - width);
    if (y < height - 1) out.push(tile + width);
    return out;
  }
  function safeMyPlayer5(gameView) {
    try {
      return gameView && typeof gameView.myPlayer === "function" ? gameView.myPlayer() : null;
    } catch (_) {
    }
    return null;
  }

  // src/page/automation/auto-team-support.js
  var SUPPORT_COOLDOWN_MS = 1e4;
  var TARGET_COOLDOWN_MS = 1e4;
  var MIN_DONATION_TROOPS = 5e3;
  var MAX_DONATION_OWN_SHARE = 1 / 3;
  var SUPPORT_RESERVE_RATIO = 0.55;
  function createAutoTeamSupport({ gameState, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection, getTroopEconomy }) {
    const targetCooldowns = /* @__PURE__ */ new Map();
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let lastCandidateLogAt = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        targetCooldowns.clear();
        lastSentAt = 0;
        lastSkipAt = 0;
        lastCandidateLogAt = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      recommend() {
        return rankSupportCandidates().slice(0, 3);
      },
      run(options = {}) {
        const state = gameState.state;
        if (!options.force && !settings.get("autoTeamSupport")) return setStatus("idle", "disabled");
        if (!teamDetection?.isTeamMode) return setStatus("idle", "not_team_mode");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        const now = performance.now();
        if (tryDonateTroops(now, options)) return status;
        if (now - lastSentAt < SUPPORT_COOLDOWN_MS) {
          return setStatus("cooldown", "cooldown", { cooldownMs: Math.round(SUPPORT_COOLDOWN_MS - (now - lastSentAt)) });
        }
        return status;
      }
    };
    function tryDonateTroops(now, options = {}) {
      const state = gameState.state;
      if (now - lastSentAt < SUPPORT_COOLDOWN_MS) return false;
      const gate = supportGate(options);
      if (!gate.ok) {
        logSkip(gate.reason, gate.extra);
        setStatus("blocked", gate.reason, gate.extra);
        return false;
      }
      const candidates = rankSupportCandidates();
      logCandidates(candidates);
      const target = candidates.find((candidate) => {
        const lastTargetSentAt = targetCooldowns.get(candidate.id) || 0;
        return candidate.troops >= MIN_DONATION_TROOPS && now - lastTargetSentAt >= TARGET_COOLDOWN_MS;
      });
      if (!target) {
        logSkip(candidates.length ? "cooldown_or_too_small" : "no_candidate");
        setStatus("idle", candidates.length ? "cooldown_or_too_small" : "no_candidate");
        return false;
      }
      const troops = Math.floor(target.troops);
      origWsSend.call(
        state.gameSocket,
        JSON.stringify({ type: "intent", intent: { type: "donate_troops", recipient: target.id, troops } })
      );
      lastSentAt = now;
      targetCooldowns.set(target.id, now);
      logger.info(\`Auto-team support \${target.name || target.id}: \${troops} troops\`);
      roundLogger?.record("auto_team_support_sent", {
        recipient: target.id,
        name: target.name || target.id,
        troops,
        reason: target.reason,
        incoming: target.incoming,
        ownReserveAfterRatio: target.ownReserveAfterRatio
      });
      setStatus("sent", \`sent_\${target.name || target.id}\`, { targetName: target.name || target.id, troops });
      return true;
    }
    function supportGate(options = {}) {
      const myState = gameState.getMyState();
      if (!myState || !myState.isAlive) return { ok: false, reason: "not_alive" };
      const selfIncoming = incomingAttackTroops(gameState, myState);
      if (selfIncoming > 0) return { ok: false, reason: "self_under_attack", extra: { incoming: selfIncoming } };
      const ownOutgoing = troopsInCombat(myState);
      if (ownOutgoing > 0) return { ok: false, reason: "own_action_active", extra: { outgoingTroops: Math.round(ownOutgoing) } };
      const defense = options.automationStatus?.autoDefense;
      if (defense?.emergency || defense?.state === "alert") {
        return { ok: false, reason: "defense_active", extra: { defenseReason: defense.reason || null } };
      }
      const expand = options.automationStatus?.autoExpand;
      const farm = options.automationStatus?.autoFarm;
      if (expand?.state === "sent") return { ok: false, reason: "expand_active" };
      if (farm?.state === "sent") return { ok: false, reason: "farm_active" };
      const aiNeighbours = countHostileAiNeighbours(options.neighbourIDs);
      if (aiNeighbours > 0) return { ok: false, reason: "early_ai_neighbours", extra: { aiNeighbours } };
      return { ok: true };
    }
    function rankSupportCandidates() {
      const myState = gameState.getMyState();
      const economy = getTroopEconomy?.();
      if (!myState || !myState.isAlive || !teamDetection?.isTeamMode) return [];
      const myTroops = finiteOrZero(myState.troops);
      const maxTroops = finiteOrZero(economy?.maxTroops);
      if (myTroops <= 0 || maxTroops <= 0) return [];
      const reserveRatio = Math.max(SUPPORT_RESERVE_RATIO, finiteOrZero(economy?.recommendedReserve));
      const safeAvailable = Math.max(0, myTroops - maxTroops * reserveRatio);
      if (safeAvailable < MIN_DONATION_TROOPS) return [];
      const isCapWaste = economy?.state === "CAP_WASTE" || finiteOrZero(economy?.currentRatio) >= 0.85;
      const teammates = teamDetection.getMyTeamMembers().map((member) => gameState.state.playerStates.get(member.id)).filter((player) => player && player.id !== myState.id && player.isAlive);
      return teammates.map((player) => makeCandidate({ player, myTroops, maxTroops, safeAvailable, isCapWaste })).filter(Boolean).sort((a, b) => b.score - a.score);
    }
    function makeCandidate({ player, myTroops, maxTroops, safeAvailable, isCapWaste }) {
      const teammateTroops = finiteOrZero(player.troops);
      const incoming = incomingAttackTroopsForSmallID(gameState, player.smallID, player.id);
      const troubleDeficit = incoming > 0 ? Math.max(0, incoming * 1.25 - teammateTroops) : 0;
      const lowTeamDeficit = isCapWaste ? Math.max(0, myTroops * 0.25 - teammateTroops) : 0;
      const capWastePush = isCapWaste && teammateTroops < myTroops * 0.45 ? myTroops * 0.12 : 0;
      const desired = Math.max(troubleDeficit, lowTeamDeficit, capWastePush);
      const maxDonation = Math.min(safeAvailable, myTroops * MAX_DONATION_OWN_SHARE);
      const troops = Math.min(desired, maxDonation);
      if (troops < MIN_DONATION_TROOPS) return null;
      const ownReserveAfterRatio = (myTroops - troops) / maxTroops;
      const reason = troubleDeficit > 0 ? "under_attack" : lowTeamDeficit > 0 ? "low_team_troops" : "cap_waste";
      const score = incoming / Math.max(1, teammateTroops) * 3 + (1 - teammateTroops / Math.max(1, myTroops)) + (reason === "under_attack" ? 2 : 0);
      return {
        id: player.id,
        name: player.name || player.displayName || player.id,
        troops,
        reason,
        incoming,
        teammateTroops,
        ownReserveAfterRatio,
        score
      };
    }
    function logCandidates(candidates) {
      const now = performance.now();
      if (!candidates.length || now - lastCandidateLogAt < 5e3) return;
      lastCandidateLogAt = now;
      roundLogger?.record(
        "auto_team_support_candidate",
        candidates.slice(0, 3).map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          troops: Math.round(candidate.troops),
          reason: candidate.reason,
          incoming: Math.round(candidate.incoming || 0),
          teammateTroops: Math.round(candidate.teammateTroops || 0),
          ownReserveAfterRatio: candidate.ownReserveAfterRatio
        }))
      );
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("auto_team_support_skipped", { reason, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
    }
    function countHostileAiNeighbours(neighbourIDs) {
      if (!neighbourIDs || typeof neighbourIDs.forEach !== "function") return 0;
      const myState = gameState.getMyState();
      let count = 0;
      neighbourIDs.forEach((id) => {
        const player = gameState.state.playerStates.get(id);
        if (!player || !player.isAlive || player.id === myState?.id) return;
        if (teamDetection?.isMyTeammate(player.id)) return;
        if (isAllied5(myState, player)) return;
        if (String(player.playerType || "").toUpperCase() !== "HUMAN") count += 1;
      });
      return count;
    }
    function isAllied5(myState, target) {
      const alliances = Array.isArray(myState?.alliances) ? myState.alliances : [];
      return alliances.some((alliance) => alliance && alliance.other === target.id);
    }
  }

  // src/page/automation/quick-chat.js
  var SOS_KEY = "help.troops";
  var QUICK_CHAT_COOLDOWN_MS = 1e4;
  var MIN_INCOMING_FOR_SOS = 5e3;
  function createQuickChatAutomation({ gameState, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection }) {
    let lastSentAt = 0;
    let lastSkipAt = 0;
    let status = { state: "idle", reason: "not_started" };
    return {
      reset() {
        lastSentAt = 0;
        lastSkipAt = 0;
        status = { state: "idle", reason: "reset" };
      },
      getStatus() {
        return status;
      },
      observeIntent(intent) {
        if (!intent || intent.type !== "quick_chat") return;
        roundLogger?.record("quick_chat_observed", summarizeQuickChat(intent));
      },
      runAutoSos(context = {}) {
        const state = gameState.state;
        if (!settings.get("autoSosQuickChat")) return setStatus("idle", "disabled");
        if (!teamDetection?.isTeamMode) return setStatus("idle", "not_team_mode");
        if (!OrigWS) return setStatus("idle", "websocket_unavailable");
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) {
          return setStatus("idle", "not_ready");
        }
        if (!origWsSend) return setStatus("idle", "socket_unavailable");
        const now = performance.now();
        if (now - lastSentAt < QUICK_CHAT_COOLDOWN_MS) {
          return setStatus("cooldown", "cooldown", { cooldownMs: Math.round(QUICK_CHAT_COOLDOWN_MS - (now - lastSentAt)) });
        }
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return setStatus("idle", "not_alive");
        const incoming = incomingAttackTroops(gameState, myState);
        const threshold = Math.max(MIN_INCOMING_FOR_SOS, finiteOrZero(myState.troops) * 0.2);
        if (incoming < threshold) {
          logSkip("no_pressure", { incoming, threshold });
          return setStatus("idle", "no_pressure", { incoming });
        }
        const recipient = chooseRecipient();
        if (!recipient) {
          logSkip("no_recipient", { incoming });
          return setStatus("blocked", "no_recipient", { incoming });
        }
        const supportState = context.teamSupportStatus;
        if (supportState?.state === "sent" && incoming < threshold * 1.8) {
          logSkip("team_support_sent", { incoming, recipient: recipient.id });
          return setStatus("idle", "team_support_sent", { incoming });
        }
        const intent = { type: "quick_chat", recipient: recipient.id, quickChatKey: SOS_KEY };
        origWsSend.call(state.gameSocket, JSON.stringify({ type: "intent", intent }));
        lastSentAt = now;
        logger.info(\`Auto-SOS quick chat \${SOS_KEY} to \${recipient.name || recipient.id}\`);
        roundLogger?.record("quick_chat_sent", {
          quickChatKey: SOS_KEY,
          recipient: recipient.id,
          recipientName: recipient.name || recipient.id,
          incoming
        });
        return setStatus("sent", "sent_help_troops", { recipientName: recipient.name || recipient.id, incoming });
      }
    };
    function chooseRecipient() {
      const myState = gameState.getMyState();
      return teamDetection.getMyTeamMembers().map((member) => gameState.state.playerStates.get(member.id)).filter((player) => player && player.id !== myState?.id && player.isAlive).sort((a, b) => finiteOrZero(b.troops) - finiteOrZero(a.troops))[0];
    }
    function logSkip(reason, extra = {}) {
      const now = performance.now();
      if (now - lastSkipAt < 5e3) return;
      lastSkipAt = now;
      roundLogger?.record("quick_chat_skipped", { reason, quickChatKey: SOS_KEY, ...extra });
    }
    function setStatus(state, reason, extra = {}) {
      status = { state, reason, ...extra };
    }
  }
  function summarizeQuickChat(intent) {
    return {
      quickChatKey: intent.quickChatKey || null,
      recipient: intent.recipient ?? null,
      target: intent.target ?? null,
      keys: Object.keys(intent)
    };
  }

  // src/page/automation/assist-actions.js
  function createAssistActions({ gameState, OrigWS, origWsSend, settings, logger, roundLogger, teamDetection }) {
    return {
      sendManualAssistAttack(target) {
        const gate = validateAttackTarget({ gameState, OrigWS, origWsSend, settings, target, allowHuman: true, teamDetection });
        if (!gate.ok) {
          roundLogger?.record("autopilot_skip", { action: "manual_assist_attack", reason: gate.reason });
          return { ok: false, reason: gate.reason };
        }
        const troops = Math.max(1, Math.floor(target.suggestedTroops));
        origWsSend.call(
          gameState.state.gameSocket,
          JSON.stringify({ type: "intent", intent: { type: "attack", targetID: target.id, troops } })
        );
        logger.info(\`Manual assist attack \${target.name || target.id}: \${troops} troops\`);
        roundLogger?.record("manual_assist_attack_sent", {
          targetID: target.id,
          targetName: target.name || target.id,
          troops,
          suggestedPercent: target.suggestedPercent,
          reserveAfterRatio: target.reserveAfterRatio
        });
        return { ok: true };
      }
    };
  }
  function validateAttackTarget({ gameState, OrigWS, origWsSend, settings, target, allowHuman = false, teamDetection }) {
    const state = gameState.state;
    const myState = gameState.getMyState();
    if (!target) return { ok: false, reason: "no_target" };
    if (!OrigWS) return { ok: false, reason: "websocket_unavailable" };
    if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !origWsSend) return { ok: false, reason: "socket_closed" };
    if (!state.gameStarted || !state.myPlayerID || !myState || !myState.isAlive) return { ok: false, reason: "not_alive_or_not_started" };
    if (target.isHuman && !allowHuman) return { ok: false, reason: "human_blocked" };
    if (target.status !== "target" && target.status !== "farm") return { ok: false, reason: \`status_\${target.status || "unknown"}\` };
    const player = state.playerStates.get(target.id);
    if (!player || !player.isAlive) return { ok: false, reason: "target_not_alive" };
    if (isAllied4(myState, player)) return { ok: false, reason: "target_allied" };
    if (teamDetection?.isMyTeammate(player.id)) return { ok: false, reason: "target_team" };
    if (!Number.isFinite(Number(target.suggestedTroops)) || Number(target.suggestedTroops) <= 0) {
      return { ok: false, reason: "no_troops" };
    }
    const reserveAfter = Number(target.reserveAfterRatio);
    const reserveLimit = Number.isFinite(Number(target.appliedReserveRatio)) ? Number(target.appliedReserveRatio) : Number(settings.get("autoFarmReserveRatio")) || 0.55;
    if (!Number.isFinite(reserveAfter) || reserveAfter < reserveLimit) return { ok: false, reason: "reserve_limit" };
    return { ok: true };
  }
  function isAllied4(myState, target) {
    const alliances = Array.isArray(myState.alliances) ? myState.alliances : [];
    return alliances.some((alliance) => alliance && alliance.other === target.id);
  }

  // src/page/automation/autopilot-controller.js
  function createAutopilotController({ settings, gameState, autoSpawn, autoFarm, autoExpand, autoAlliance, autoEco, autoDefense, roundLogger }) {
    let lastStateLogAt = 0;
    let lastSkipLogAt = 0;
    return {
      reset() {
        lastStateLogAt = 0;
        lastSkipLogAt = 0;
      },
      run({ topSpot, farmRecommendations, buyRecommendations, expansion, threats, neighbourIDs, troopInfo, nukeThreat }) {
        if (!settings.get("autopilot")) return { active: false };
        const state = gameState.state;
        const myState = gameState.getMyState();
        if (!state.gameStarted || !myState || !myState.isAlive) {
          logSkip("not_ready");
          return { active: true, spawnHandled: false, farmHandled: false, expandHandled: false, allianceHandled: false, ecoHandled: false, defenseHandled: false };
        }
        logState({ expansion, threats });
        let spawnHandled = false;
        if (topSpot) {
          autoSpawn?.send(topSpot);
          spawnHandled = true;
        }
        const defenseStatus = autoDefense?.run({ force: true, nukeThreat, threats, neighbourIDs }) || null;
        if (defenseStatus?.emergency) {
          logSkip("defense_emergency");
          runEco(buyRecommendations);
          return { active: true, spawnHandled, farmHandled: true, expandHandled: true, allianceHandled: false, ecoHandled: true, defenseHandled: true };
        }
        const humanPressure = countHumanPressure(farmRecommendations);
        const strongThreat = isNeighbourThreatStrong(threats, neighbourIDs);
        let expandHandled = false;
        if (autoExpand) {
          autoExpand.run(troopInfo, { force: true });
          expandHandled = true;
        }
        const shouldPauseFarm = humanPressure >= 2 || strongThreat || expansion && expansion.level === "stop";
        if (shouldPauseFarm) {
          logSkip(strongThreat ? "strong_threat" : humanPressure >= 2 ? "human_pressure" : expansion.level);
          runEco(buyRecommendations);
          return { active: true, spawnHandled, farmHandled: true, expandHandled, allianceHandled: false, ecoHandled: true, defenseHandled: true };
        }
        autoFarm?.run(farmRecommendations, expansion, { force: true });
        runEco(buyRecommendations);
        let allianceHandled = false;
        if (settings.get("autoAlliance")) {
          autoAlliance?.run();
          allianceHandled = true;
        }
        return { active: true, spawnHandled, farmHandled: true, expandHandled, allianceHandled, ecoHandled: true, defenseHandled: true };
      }
    };
    function runEco(buyRecommendations) {
      if (settings.get("autoEco")) autoEco?.run({ buyRecommendations }, { force: true });
    }
    function logSkip(reason) {
      const now = performance.now();
      if (now - lastSkipLogAt < 3e3) return;
      lastSkipLogAt = now;
      roundLogger?.record("autopilot_skip", { reason });
    }
    function logState({ expansion, threats }) {
      const now = performance.now();
      if (now - lastStateLogAt < 5e3) return;
      lastStateLogAt = now;
      roundLogger?.record("autopilot_state", {
        expansion: expansion ? expansion.level : "unknown",
        topThreat: threats && threats[0] ? { name: threats[0].name, level: threats[0].level, score: threats[0].score } : null
      });
    }
  }
  function countHumanPressure(recommendations) {
    return (recommendations || []).filter((rec) => rec.isHuman && rec.status === "danger").length;
  }
  function isNeighbourThreatStrong(threats, neighbourIDs) {
    if (!Array.isArray(threats) || !neighbourIDs || neighbourIDs.size === 0) return false;
    return threats.some(
      (threat) => (threat.level === "Dangerous" || threat.level === "Critical") && neighbourIDs.has(threat.id)
    );
  }

  // src/page/automation/smart-attack.js
  function createSmartAttackModifier({ settings, gameState, logger, roundLogger, teamDetection, getTroopEconomy }) {
    return function maybeModifyAttack(data) {
      if (!settings.get("smartAttack") || typeof data !== "string") return data;
      try {
        const message = JSON.parse(data);
        if (!message || message.type !== "intent" || !message.intent) return data;
        const intent = message.intent;
        if (intent.type !== "attack" || !intent.troops || intent.troops <= 0 || !intent.targetID) return data;
        const targetState = resolveTarget(gameState, intent.targetID);
        if (targetState && teamDetection?.isMyTeammate(targetState.id)) return data;
        const economy = getTroopEconomy?.();
        const safe = economy ? economy.safeSpendableTroops : null;
        if (!Number.isFinite(safe)) return data;
        if (safe < 1) return data;
        const originalTroops = intent.troops;
        if (originalTroops <= safe) return data;
        const newTroops = Math.max(1, Math.floor(safe));
        if (newTroops === originalTroops) return data;
        intent.troops = newTroops;
        logger.info(
          \`Smart attack cap \${targetState?.name || intent.targetID}: \${originalTroops} -> \${newTroops} (safe \${Math.floor(safe)})\`
        );
        roundLogger?.record("smart_attack_modified", {
          reason: "growth_cap",
          targetID: intent.targetID,
          targetName: targetState?.name || intent.targetID,
          safeSpendable: Math.floor(safe),
          originalTroops,
          newTroops
        });
        return JSON.stringify(message);
      } catch (_) {
        return data;
      }
    };
  }
  function resolveTarget(gameState, targetID) {
    const direct = gameState.state.playerStates.get(targetID);
    if (direct) return direct;
    let match = null;
    gameState.state.playerStates.forEach((player) => {
      if (!match && player && player.smallID === targetID) match = player;
    });
    return match;
  }

  // src/page/automation/auto-alliance.js
  var ALLIANCE_RENEW_THRESHOLD = 50;
  var ALLIANCE_RETRY_COOLDOWN_TICKS = 300;
  var MAX_ALLIANCE_ATTEMPTS = 2;
  function createAutoAlliance({ gameState, neighbourFetcher, OrigWS, origWsSend, logger, roundLogger, teamDetection }) {
    const allianceRequestCooldowns = /* @__PURE__ */ new Map();
    let lastSkippedNeighbour = null;
    return {
      get lastSkippedNeighbour() {
        return lastSkippedNeighbour;
      },
      reset() {
        allianceRequestCooldowns.clear();
        lastSkippedNeighbour = null;
      },
      run() {
        const state = gameState.state;
        if (!OrigWS) return;
        if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !state.gameStarted || !state.myPlayerID) return;
        const myState = gameState.getMyState();
        if (!myState || !myState.isAlive) return;
        neighbourFetcher.refresh();
        if (!neighbourFetcher.cachedNeighbourIDs) return;
        const attacking = getAttackingPlayerIDs(state, myState);
        const humanNeighbours = [];
        neighbourFetcher.cachedNeighbourIDs.forEach((playerID) => {
          if (playerID === state.myPlayerID || attacking[playerID]) return;
          if (teamDetection?.isMyTeammate(playerID)) return;
          const player = state.playerStates.get(playerID);
          if (!player || !player.isAlive || !isHumanPlayerState(player)) return;
          humanNeighbours.push(player);
        });
        humanNeighbours.sort((a, b) => {
          const tilesA = a.tilesOwned || 0;
          const tilesB = b.tilesOwned || 0;
          if (tilesB !== tilesA) return tilesB - tilesA;
          return (b.troops || 0) - (a.troops || 0);
        });
        const targets = humanNeighbours.length > 1 ? humanNeighbours.slice(0, humanNeighbours.length - 1) : [];
        const skipped = humanNeighbours.length > 1 ? humanNeighbours[humanNeighbours.length - 1] : null;
        lastSkippedNeighbour = skipped ? skipped.name || skipped.id : null;
        const existingAlliances = {};
        (myState.alliances || []).forEach((alliance) => {
          existingAlliances[alliance.other] = alliance;
        });
        const pendingOutgoing = {};
        (myState.outgoingAllianceRequests || []).forEach((playerID) => {
          pendingOutgoing[playerID] = true;
        });
        targets.forEach((target) => {
          const existing = existingAlliances[target.id];
          if (existing) {
            if (existing.expiresAt && existing.expiresAt - state.currentTick < ALLIANCE_RENEW_THRESHOLD && !existing.hasExtensionRequest) {
              sendAllianceIntent(state, OrigWS, origWsSend, "allianceExtension", target.id, target.name, logger, roundLogger);
            }
            return;
          }
          if (pendingOutgoing[target.id]) return;
          const record = allianceRequestCooldowns.get(target.id);
          if (record) {
            if (record.attempts >= MAX_ALLIANCE_ATTEMPTS) return;
            if (state.currentTick - record.lastTick < ALLIANCE_RETRY_COOLDOWN_TICKS) return;
          }
          sendAllianceIntent(state, OrigWS, origWsSend, "allianceRequest", target.id, target.name, logger, roundLogger);
          allianceRequestCooldowns.set(target.id, {
            lastTick: state.currentTick,
            attempts: (record?.attempts || 0) + 1
          });
        });
      }
    };
  }
  function recommendAlliances(gameState, teamDetection) {
    const myState = gameState.getMyState();
    if (!myState) return [];
    const recommendations = [];
    gameState.state.playerStates.forEach((player) => {
      if (!player || !player.isAlive || player.id === myState.id || !isHumanPlayerState(player)) return;
      if (teamDetection?.isMyTeammate(player.id)) return;
      const score = (player.tilesOwned || 0) * 0.55 + (player.troops || 0) * 1e-5;
      recommendations.push({
        id: player.id,
        name: player.name || player.id,
        score,
        label: score > (myState.tilesOwned || 0) * 0.55 ? "Ally candidate" : "Possible target"
      });
    });
    return recommendations.sort((a, b) => b.score - a.score).slice(0, 3);
  }
  function getAttackingPlayerIDs(state, myState) {
    const smallIDtoPlayerID = {};
    state.playerStates.forEach((player) => {
      if (player.smallID != null) smallIDtoPlayerID[player.smallID] = player.id;
    });
    const attacking = {};
    (myState.outgoingAttacks || []).forEach((attack) => {
      if (!attack || attack.retreating) return;
      const targetID = smallIDtoPlayerID[attack.targetID];
      if (targetID) attacking[targetID] = true;
    });
    return attacking;
  }
  function sendAllianceIntent(state, OrigWS, origWsSend, intentType, recipientID, recipientName, logger, roundLogger) {
    if (!OrigWS) return;
    if (!state.gameSocket || state.gameSocket.readyState !== OrigWS.OPEN || !origWsSend) return;
    origWsSend.call(
      state.gameSocket,
      JSON.stringify({ type: "intent", intent: { type: intentType, recipient: recipientID } })
    );
    logger.info(\`\${intentType} sent to \${recipientName || recipientID}\`);
    roundLogger?.record("auto_alliance_sent", { intentType, recipientID, recipientName: recipientName || recipientID });
  }
  function isHumanPlayerState(state) {
    return !!state && String(state.playerType || "").toUpperCase() === "HUMAN";
  }

  // src/shared/html.js
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  // src/shared/troops.js
  function formatTroopCount(troops) {
    const num = Number(troops) / 10;
    if (!Number.isFinite(num)) return "0";
    if (num >= 1e7) return \`\${(Math.floor(num / 1e5) / 10).toFixed(1)}M\`;
    if (num >= 1e6) return \`\${(Math.floor(num / 1e4) / 100).toFixed(2)}M\`;
    if (num >= 1e5) return \`\${Math.floor(num / 1e3)}K\`;
    if (num >= 1e4) return \`\${(Math.floor(num / 100) / 10).toFixed(1)}K\`;
    if (num >= 1e3) return \`\${(Math.floor(num / 10) / 100).toFixed(2)}K\`;
    return Math.floor(num).toString();
  }

  // src/page/ui/advisor-panel.js
  function createAdvisorPanel({ app, settings, heatmap, actions = {} }) {
    let panel = null;
    return {
      create() {
        removeElementById("ofat-panel");
        removeElementById("ofat-heatmap");
        installPanelStyles();
        panel = document.createElement("div");
        panel.id = "ofat-panel";
        panel.style.display = settings.get("showAdvisorPanel") ? "block" : "none";
        appendWhenReady(panel, "body");
        preventFocusSteal(panel);
        makeDraggable(panel);
      },
      setVisible(visible) {
        if (panel) panel.style.display = visible ? "block" : "none";
      },
      attachHeatmap(canvas) {
        appendWhenReady(canvas, "body");
      },
      render(viewModel) {
        if (!panel) return;
        panel.innerHTML = renderPanelHtml(app, settings, viewModel);
        panel.querySelectorAll("button[data-setting]").forEach((button) => {
          button.addEventListener("click", () => settings.set(button.dataset.setting, !settings.get(button.dataset.setting)));
        });
        const closeButton = document.getElementById("ofat-close");
        if (closeButton) closeButton.addEventListener("click", () => settings.set("showAdvisorPanel", false));
        const assistButton = document.getElementById("ofat-assist-attack");
        if (assistButton && actions.onManualAssistAttack) assistButton.addEventListener("click", actions.onManualAssistAttack);
        panel.querySelectorAll("button[data-buy-unavailable]").forEach((button) => {
          button.addEventListener("click", () => actions.onUnavailableBuild?.(button.dataset.buyUnavailable));
        });
        heatmap.render(viewModel.scores, viewModel.topSpots, viewModel.playerSpawns);
      }
    };
  }
  function renderPanelHtml(app, settings, vm) {
    const skipped = vm.lastSkippedNeighbour ? \` | Skip: <b>\${escapeHtml(vm.lastSkippedNeighbour)}</b>\` : "";
    let html = "";
    html += \`<div class="ofat-head">\`;
    html += \`<div class="ofat-title">\${escapeHtml(app.name)}</div>\`;
    html += \`<div class="ofat-muted">v\${escapeHtml(app.version)} | updated \${escapeHtml(app.modified)}</div>\`;
    html += \`</div>\`;
    html += \`<div class="ofat-body">\`;
    html += \`<div class="ofat-muted">玩家 <b>\${vm.otherPlayerCount}</b> | 国家 <b>\${vm.nationCount}</b> | 回合 <b>\${vm.tick}</b></div>\`;
    if (vm.expansion) html += \`<div class="ofat-muted">\${escapeHtml(vm.expansion.label)}</div>\`;
    if (vm.troopEconomy && settings.get("showTroopEconomy")) html += renderEconomyHtml(vm.troopEconomy);
    if (vm.topThreats.length) {
      html += \`<div class="ofat-muted">威胁: \${vm.topThreats.map((t) => \`\${escapeHtml(t.name)} <b>\${escapeHtml(t.level)}</b>\`).join(" | ")}</div>\`;
    }
    if (vm.farmRecommendations && vm.farmRecommendations.length) {
      const farms = vm.farmRecommendations.filter((target) => target.status === "farm" || target.status === "mark").slice(0, 3);
      if (farms.length) {
        html += \`<div class="ofat-muted">农场: \${farms.map((t) => \`\${escapeHtml(t.name)} <b>\${escapeHtml(t.label)}</b>\`).join(" | ")}</div>\`;
      }
      const humanTargets = vm.farmRecommendations.filter((target) => target.isHuman).slice(0, 3);
      if (humanTargets.length) {
        html += \`<div class="ofat-muted">目标: \${humanTargets.map((t) => \`\${escapeHtml(t.name)} <b>\${escapeHtml(t.label)}</b>\`).join(" | ")}</div>\`;
      }
    }
    if (vm.assistTarget) {
      html += \`<div class="ofat-action-row">\`;
      html += \`<span>协助: <b>\${escapeHtml(vm.assistTarget.name)}</b> \${escapeHtml(vm.assistTarget.label)}</span>\`;
      html += \`<button id="ofat-assist-attack">发起进攻</button>\`;
      html += \`</div>\`;
    }
    if (vm.buyRecommendations && vm.buyRecommendations.length) {
      html += \`<div class="ofat-section-title">经济 / 建造</div>\`;
      html += \`<div class="ofat-buy-list">\`;
      vm.buyRecommendations.forEach((rec) => {
        if (rec.actionAvailable) {
          html += \`<span class="ofat-buy-chip" title="\${escapeHtml(rec.reason)}">\${escapeHtml(rec.label)}</span>\`;
        } else {
          html += \`<button data-buy-unavailable="\${escapeHtml(rec.actionKey)}" title="\${escapeHtml(rec.reason)}">\${escapeHtml(rec.label)}: 仅建议</button>\`;
        }
      });
      html += \`</div>\`;
    }
    if (vm.topSpots.length) html += \`<div class="ofat-section-title">出生点分析</div>\`;
    for (let i = 0; i < vm.topSpots.length; i += 1) {
      const spot = vm.topSpots[i];
      const scorePct = Math.max(0, Math.min(100, Math.round(spot.score * 100)));
      html += \`<div class="ofat-row" data-ofat-spot="\${i}">\`;
      html += \`<b>\${i + 1}</b>\`;
      html += \`<div>\`;
      html += \`<div>(\${spot.x},\${spot.y}) <span class="ofat-muted">\${escapeHtml(describeSpawnSpot(spot))}</span></div>\`;
      html += \`<div class="ofat-muted">L:\${Math.floor(spot.landDensity * 100)} G:\${Math.floor(spot.plainsRatio * 100)} N:\${Math.floor(spot.nationScore * 100)} P:\${Math.floor(spot.playerDistScore * 100)}</div>\`;
      html += \`<div class="ofat-scorebar"><span style="width:\${scorePct}%"></span></div>\`;
      html += \`</div>\`;
      html += \`<b>\${scorePct}</b>\`;
      html += \`</div>\`;
    }
    if (vm.allianceRecommendations.length) {
      html += \`<div class="ofat-muted">联盟: \${vm.allianceRecommendations.map((r) => \`\${escapeHtml(r.name)} (\${escapeHtml(r.label)})\`).join(" | ")}</div>\`;
    }
    html += \`<div class="ofat-muted">盟友: <b>\${vm.allyCount}</b>\${skipped}</div>\`;
    html += \`<div class="ofat-buttons">\`;
    html += buttonHtml(settings, "自动出生", "autoSpawn", false);
    html += buttonHtml(settings, "自动结盟", "autoAlliance", false);
    html += buttonHtml(settings, "热力图", "showHeatmap", false);
    html += buttonHtml(settings, "面板", "showAdvisorPanel", false);
    html += \`<button id="ofat-close">关闭</button>\`;
    html += \`</div></div>\`;
    return html;
  }
  function renderEconomyHtml(eco) {
    const growth = Math.round((eco.growthEfficiency || 0) * 100);
    const safety = Math.round((eco.combatSafety || 0) * 100);
    const safeSend = formatTroopCount(eco.safeSpendableTroops);
    const push = eco.timeToPushSec != null ? \` | 推进约\${eco.timeToPushSec}秒后\` : "";
    let html = \`<div class="ofat-eco ofat-eco-\${economyTone(eco.state)}">\`;
    html += \`<div>状态: <b>\${escapeHtml(eco.state)}</b> | 增长: <b>\${growth}%</b>\${push}</div>\`;
    html += \`<div>战斗安全: <b>\${safety}%</b> | 可用兵力: <b>\${escapeHtml(safeSend)}</b></div>\`;
    html += \`<div class="ofat-muted">\${escapeHtml(eco.hint || "")}</div>\`;
    html += \`</div>\`;
    return html;
  }
  function economyTone(state) {
    if (state === "CRITICAL" || state === "RECOVER") return "low";
    if (state === "PUSH" || state === "CAP_WASTE") return "push";
    return "ok";
  }
  function buttonHtml(settings, label, key, warn) {
    const on = settings.get(key);
    return \`<button data-setting="\${escapeHtml(key)}" data-on="\${on ? "true" : "false"}" data-warn="\${warn && on ? "true" : "false"}">\${escapeHtml(label)}: \${on ? "开" : "关"}</button>\`;
  }
  function installPanelStyles() {
    createStyle(
      "ofat-style",
      \`
      #ofat-panel {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 99999;
        width: min(460px, calc(100vw - 20px));
        max-height: calc(100vh - 20px);
        overflow: auto;
        background: rgba(8, 10, 13, 0.92);
        color: #f4f7fb;
        border: 1px solid rgba(113, 191, 255, 0.45);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        font: 12px/1.35 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        user-select: none;
      }
      #ofat-panel .ofat-head {
        padding: 10px 12px 7px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: move;
      }
      #ofat-panel .ofat-title { color: #71c7ff; font-size: 15px; font-weight: 700; }
      #ofat-panel .ofat-muted { color: rgba(244, 247, 251, 0.68); }
      #ofat-panel .ofat-body { padding: 9px 12px 12px; }
      #ofat-panel .ofat-row {
        display: grid;
        grid-template-columns: 26px 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 5px 6px;
        margin: 3px 0;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.055);
      }
      #ofat-panel .ofat-eco {
        margin: 6px 0;
        padding: 6px 8px;
        border-radius: 6px;
        border-left: 3px solid #71c7ff;
        background: rgba(255, 255, 255, 0.06);
      }
      #ofat-panel .ofat-eco-low { border-left-color: #ef5350; background: rgba(183, 28, 28, 0.16); }
      #ofat-panel .ofat-eco-ok { border-left-color: #66bb6a; background: rgba(46, 125, 50, 0.16); }
      #ofat-panel .ofat-eco-push { border-left-color: #71c7ff; background: rgba(41, 98, 255, 0.16); }
      #ofat-panel .ofat-scorebar {
        height: 4px;
        margin-top: 3px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        overflow: hidden;
      }
      #ofat-panel .ofat-scorebar > span { display: block; height: 100%; background: #71c7ff; }
      #ofat-panel .ofat-section-title {
        margin-top: 9px;
        margin-bottom: 4px;
        color: rgba(244, 247, 251, 0.9);
        font-weight: 700;
      }
      #ofat-panel .ofat-buttons { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      #ofat-panel .ofat-action-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        margin-top: 7px;
        padding: 6px;
        border-radius: 6px;
        background: rgba(83, 181, 255, 0.12);
      }
      #ofat-panel .ofat-buy-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 7px;
      }
      #ofat-panel .ofat-buy-chip {
        padding: 4px 7px;
        border-radius: 5px;
        background: rgba(46, 125, 50, 0.5);
        color: #f4f7fb;
      }
      #ofat-panel button {
        color: #f4f7fb;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.1);
        padding: 4px 7px;
        font: inherit;
        cursor: pointer;
      }
      #ofat-panel button[data-on="true"] { background: rgba(46, 125, 50, 0.85); }
      #ofat-panel button[data-warn="true"] { background: rgba(183, 28, 28, 0.85); }
      #ofat-heatmap {
        position: fixed;
        right: 10px;
        bottom: 10px;
        z-index: 99998;
        border: 2px solid #71c7ff;
        border-radius: 6px;
        background: #05070a;
        image-rendering: pixelated;
      }
    \`
    );
  }

  // src/page/ui/heatmap.js
  function createHeatmap({ mapDataRef }) {
    let canvas = null;
    let scale = 1;
    return {
      create(showHeatmap) {
        const mapData = mapDataRef.current;
        canvas = document.createElement("canvas");
        scale = Math.min(320 / mapData.width, 220 / mapData.height);
        canvas.width = Math.max(1, Math.floor(mapData.width * scale));
        canvas.height = Math.max(1, Math.floor(mapData.height * scale));
        canvas.id = "ofat-heatmap";
        canvas.style.display = showHeatmap ? "block" : "none";
        return canvas;
      },
      setVisible(visible) {
        if (canvas) canvas.style.display = visible ? "block" : "none";
      },
      render(scores, topSpots, playerSpawns) {
        if (!canvas) return;
        const mapData = mapDataRef.current;
        if (!mapData) return;
        renderHeatmap(canvas, scale, mapData, scores, topSpots, playerSpawns);
      }
    };
  }
  function renderHeatmap(canvas, scale, mapData, scores, topSpots, playerSpawns) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const scoreGrid = new Float32Array(mapData.width * mapData.height);
    let maxScore = 0;
    const half = 8;
    for (let i = 0; i < scores.length; i += 1) {
      const score = scores[i];
      const x0 = Math.max(0, Math.floor(score.x - half));
      const x1 = Math.min(mapData.width - 1, Math.ceil(score.x + half));
      const y0 = Math.max(0, Math.floor(score.y - half));
      const y1 = Math.min(mapData.height - 1, Math.ceil(score.y + half));
      for (let y = y0; y <= y1; y += 1) {
        const rowOffset = y * mapData.width;
        for (let x = x0; x <= x1; x += 1) scoreGrid[rowOffset + x] = score.score;
      }
      if (score.score > maxScore) maxScore = score.score;
    }
    const imageData = ctx.createImageData(w, h);
    const invMax = maxScore > 0 ? 1 / maxScore : 0;
    for (let y = 0; y < h; y += 1) {
      const my = Math.min(mapData.height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x += 1) {
        const mx = Math.min(mapData.width - 1, Math.floor(x / scale));
        const value = scoreGrid[my * mapData.width + mx] * invMax;
        const pi = (y * w + x) * 4;
        if (value > 0) {
          imageData.data[pi] = Math.floor((1 - value) * 255);
          imageData.data[pi + 1] = Math.floor(value * 255);
          imageData.data[pi + 2] = 42;
          imageData.data[pi + 3] = Math.floor(value * 180 + 50);
        } else {
          imageData.data[pi] = 8;
          imageData.data[pi + 1] = 10;
          imageData.data[pi + 2] = 14;
          imageData.data[pi + 3] = 150;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    ctx.fillStyle = "#71c7ff";
    mapData.nations.forEach((nation) => {
      ctx.beginPath();
      ctx.arc(Math.floor(nation.coordinates[0] * scale), Math.floor(nation.coordinates[1] * scale), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = "#ff5757";
    ctx.lineWidth = 2;
    playerSpawns.forEach((spawn) => {
      const x = Math.floor(spawn.x * scale);
      const y = Math.floor(spawn.y * scale);
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.moveTo(x + 4, y - 4);
      ctx.lineTo(x - 4, y + 4);
      ctx.stroke();
    });
    topSpots.forEach((spot, index) => {
      const x = Math.floor(spot.x * scale);
      const y = Math.floor(spot.y * scale);
      ctx.strokeStyle = index === 0 ? "#ffd54f" : index < 3 ? "#9ccc65" : "#d8dde6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = index === 0 ? "#ffd54f" : "#ffffff";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x, y);
    });
  }

  // src/page/logging/log-export.js
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function createRoundLogFilename(startedAt = /* @__PURE__ */ new Date()) {
    const stamp = [
      startedAt.getFullYear(),
      pad2(startedAt.getMonth() + 1),
      pad2(startedAt.getDate()),
      "-",
      pad2(startedAt.getHours()),
      pad2(startedAt.getMinutes()),
      pad2(startedAt.getSeconds())
    ].join("");
    return \`openfront-round-log-\${stamp}.json\`;
  }
  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  // src/page/logging/log-sanitize.js
  function summarizeMap(mapData) {
    if (!mapData) return null;
    return {
      width: mapData.width,
      height: mapData.height,
      nationCount: mapData.nations ? mapData.nations.length : 0
    };
  }
  function summarizeSettings(settings) {
    return {
      autoSpawn: !!settings.autoSpawn,
      autopilot: !!settings.autopilot,
      autoAlliance: !!settings.autoAlliance,
      autoFarm: !!settings.autoFarm,
      autoFarmHumanTargets: !!settings.autoFarmHumanTargets,
      autoEco: !!settings.autoEco,
      autoTeamSupport: !!settings.autoTeamSupport,
      autoSosQuickChat: !!settings.autoSosQuickChat,
      smartAttack: !!settings.smartAttack,
      showAttackBadges: !!settings.showAttackBadges,
      showAdvisorPanel: !!settings.showAdvisorPanel,
      showHeatmap: !!settings.showHeatmap,
      roundLogging: !!settings.roundLogging,
      roundLogAutoDownload: !!settings.roundLogAutoDownload,
      roundLogSnapshotIntervalMs: settings.roundLogSnapshotIntervalMs,
      networkLogging: !!settings.networkLogging,
      autoSpawnDelayMs: settings.autoSpawnDelayMs,
      autoFarmWindowMs: settings.autoFarmWindowMs,
      autoFarmReserveRatio: settings.autoFarmReserveRatio,
      autoFarmCooldownMs: settings.autoFarmCooldownMs,
      autoFarmDynamicReserve: !!settings.autoFarmDynamicReserve,
      autoFarmBaseReserveRatio: settings.autoFarmBaseReserveRatio,
      autoFarmMinReserveRatio: settings.autoFarmMinReserveRatio,
      autoFarmMaxReserveRatio: settings.autoFarmMaxReserveRatio,
      autoExpand: !!settings.autoExpand
    };
  }
  function summarizePlayers(gameState, keepNames) {
    const players = [];
    gameState.state.playerStates.forEach((player) => {
      if (!player) return;
      players.push({
        id: player.id,
        name: keepNames ? player.name || player.id : player.id,
        troops: finiteOrZero(player.troops),
        tilesOwned: finiteOrZero(player.tilesOwned),
        gold: finiteOrZero(player.gold),
        isAlive: player.isAlive,
        playerType: player.playerType,
        allianceCount: Array.isArray(player.alliances) ? player.alliances.length : 0,
        outgoingAttackCount: Array.isArray(player.outgoingAttacks) ? player.outgoingAttacks.filter((attack) => attack && !attack.retreating).length : 0
      });
    });
    return players.sort((a, b) => {
      if (b.tilesOwned !== a.tilesOwned) return b.tilesOwned - a.tilesOwned;
      return b.troops - a.troops;
    });
  }
  function summarizeMyState(gameState, keepNames) {
    const player = gameState.getMyState();
    if (!player) return null;
    return {
      id: player.id,
      name: keepNames ? player.name || player.id : player.id,
      troops: finiteOrZero(player.troops),
      tilesOwned: finiteOrZero(player.tilesOwned),
      gold: finiteOrZero(player.gold),
      isAlive: player.isAlive,
      allianceCount: Array.isArray(player.alliances) ? player.alliances.length : 0,
      outgoingAttackCount: Array.isArray(player.outgoingAttacks) ? player.outgoingAttacks.filter((attack) => attack && !attack.retreating).length : 0
    };
  }
  function summarizeAdvisorView(viewModel) {
    if (!viewModel) return null;
    return {
      tick: viewModel.tick,
      troopEconomy: viewModel.troopEconomy ? {
        state: viewModel.troopEconomy.state,
        currentRatio: round3(viewModel.troopEconomy.currentRatio),
        growthEfficiency: round3(viewModel.troopEconomy.growthEfficiency),
        combatSafety: round3(viewModel.troopEconomy.combatSafety),
        recommendedReserve: round3(viewModel.troopEconomy.recommendedReserve),
        safeSpendableTroops: Math.round(viewModel.troopEconomy.safeSpendableTroops || 0)
      } : null,
      topSpots: (viewModel.topSpots || []).slice(0, 5).map((spot) => ({
        x: spot.x,
        y: spot.y,
        score: round3(spot.score),
        landDensity: round3(spot.landDensity),
        plainsRatio: round3(spot.plainsRatio),
        nationScore: round3(spot.nationScore),
        playerDistScore: round3(spot.playerDistScore)
      })),
      topThreats: (viewModel.topThreats || []).map((threat) => ({
        id: threat.id,
        name: threat.name,
        level: threat.level,
        score: round3(threat.score),
        troopsRatio: round3(threat.troopsRatio),
        tilesRatio: round3(threat.tilesRatio),
        nukePotential: threat.nukePotential
      })),
      expansion: viewModel.expansion || null,
      farmRecommendations: (viewModel.farmRecommendations || []).slice(0, 8).map((rec) => ({
        id: rec.id,
        name: rec.name,
        status: rec.status,
        label: rec.label,
        reason: rec.reason,
        score: round3(rec.score),
        strengthRatio: round3(rec.strengthRatio),
        suggestedPercent: rec.suggestedPercent,
        reserveAfterRatio: round3(rec.reserveAfterRatio),
        reserveMaxSend: Math.round(rec.reserveMaxSend || 0),
        captureMaxSend: Math.round(rec.captureMaxSend || 0),
        usedCaptureOverdraft: !!rec.usedCaptureOverdraft,
        estimatedCaptureTurns: rec.estimatedCaptureTurns || null,
        captureCostEstimate: Math.round(rec.captureCostEstimate || 0),
        officialCaptureCostEstimate: Math.round(rec.officialCaptureCostEstimate || 0),
        officialCaptureTurns: rec.officialCaptureTurns || null,
        officialCaptureSource: rec.officialCaptureSource || null,
        effectiveTargetTroops: Math.round(rec.effectiveTargetTroops || 0)
      })),
      assistTarget: viewModel.assistTarget ? {
        id: viewModel.assistTarget.id,
        name: viewModel.assistTarget.name,
        label: viewModel.assistTarget.label,
        reason: viewModel.assistTarget.reason,
        suggestedPercent: viewModel.assistTarget.suggestedPercent
      } : null,
      buyRecommendations: (viewModel.buyRecommendations || []).map((rec) => ({
        label: rec.label,
        reason: rec.reason,
        actionKey: rec.actionKey,
        actionAvailable: !!rec.actionAvailable,
        estimatedCost: Math.round(rec.estimatedCost || 0),
        costSource: rec.costSource || null
      })),
      automationStatus: viewModel.automationStatus || null,
      teamSupportRecommendations: (viewModel.teamSupportRecommendations || []).slice(0, 3).map((rec) => ({
        id: rec.id,
        name: rec.name,
        reason: rec.reason,
        troops: Math.round(rec.troops || 0),
        incoming: Math.round(rec.incoming || 0),
        ownReserveAfterRatio: round3(rec.ownReserveAfterRatio)
      })),
      allianceRecommendations: (viewModel.allianceRecommendations || []).map((rec) => ({
        id: rec.id,
        name: rec.name,
        label: rec.label,
        score: round3(rec.score)
      })),
      allyCount: viewModel.allyCount || 0
    };
  }
  function round3(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 1e3) / 1e3;
  }

  // src/page/logging/round-logger.js
  var MAX_TIMELINE_BYTES = 2 * 1024 * 1024;
  var PROTECTED_LOG_TYPES = /* @__PURE__ */ new Set([
    "round_started",
    "round_ended",
    "map_loaded",
    "setting_changed",
    "auto_spawn_sent",
    "auto_alliance_sent",
    "smart_attack_modified",
    "autopilot_action",
    "autopilot_skip",
    "autopilot_state",
    "farm_recommendation",
    "auto_farm_attack_sent",
    "auto_farm_skipped",
    "auto_expand_sent",
    "auto_expand_skipped",
    "auto_eco_sent",
    "auto_eco_skipped",
    "auto_eco_cost_model",
    "auto_eco_pending_blocked",
    "auto_eco_runtime_probe",
    "auto_team_support_sent",
    "auto_team_support_skipped",
    "auto_team_support_candidate",
    "auto_team_support_gold_sent",
    "auto_defense_build_sent",
    "auto_defense_counter_sent",
    "auto_defense_skipped",
    "auto_boat_sent",
    "auto_boat_skipped",
    "auto_weapons_silo_sent",
    "auto_weapons_launch_sent",
    "auto_weapons_early_nuke_sent",
    "auto_weapons_skipped",
    "weapon_intent_observed",
    "retreat_intent_observed",
    "manual_assist_attack_sent",
    "buy_recommendation",
    "build_button_unavailable",
    "intent_observed",
    "boat_intent_observed",
    "team_detected",
    "mechanics_discovered",
    "gameview_discovered",
    "spawn_phase_state",
    "eco_cost_model",
    "quick_chat_observed",
    "quick_chat_sent",
    "quick_chat_skipped",
    "combat_model_estimate"
  ]);
  function createRoundLogger({ app, settings, gameState, mapDataRef, logger }) {
    let session = null;
    let lastSnapshotAt = 0;
    let lastAdvisorView = null;
    let lastExportAt = null;
    let truncated = false;
    let sequence = 0;
    let approxBytes = 0;
    return {
      start(reason = "start") {
        if (!settings.get("roundLogging")) return;
        if (session && !session.endedAt) this.end("restarted", { autoDownload: false });
        const startedAt = /* @__PURE__ */ new Date();
        session = {
          meta: {
            appName: app.name,
            appVersion: app.version,
            createdAt: startedAt.toISOString(),
            endedAt: null,
            durationMs: null,
            reason,
            truncated: false
          },
          settings: summarizeSettings(settings.snapshot()),
          map: summarizeMap(mapDataRef.current),
          timeline: [],
          finalState: null
        };
        truncated = false;
        sequence = 0;
        approxBytes = 0;
        lastExportAt = null;
        lastSnapshotAt = performance.now();
        push("round_started", {});
        this.snapshot("initial");
      },
      end(reason = "socket_closed", options = {}) {
        if (!session || session.endedAt) return;
        this.snapshot("final");
        const endedAt = /* @__PURE__ */ new Date();
        session.meta.endedAt = endedAt.toISOString();
        session.meta.durationMs = Date.parse(session.meta.endedAt) - Date.parse(session.meta.createdAt);
        session.meta.reason = reason;
        session.meta.truncated = truncated;
        session.finalState = {
          tick: gameState.state.currentTick,
          myState: summarizeMyState(gameState, settings.get("roundLogKeepPlayerNames")),
          advisor: summarizeAdvisorView(lastAdvisorView)
        };
        push("round_ended", { reason });
        const shouldDownload = options.autoDownload ?? settings.get("roundLogAutoDownload");
        if (shouldDownload && settings.get("roundLogging")) this.export("auto");
      },
      record(type, data = {}) {
        if (!session || session.endedAt || !settings.get("roundLogging")) return;
        push(type, data);
      },
      recordSettingChange(key, value) {
        if (!session || session.endedAt || !settings.get("roundLogging")) return;
        push("setting_changed", { key, value });
      },
      recordMapLoaded(mapData) {
        if (!settings.get("roundLogging")) return;
        if (session) session.map = summarizeMap(mapData);
        push("map_loaded", summarizeMap(mapData));
      },
      recordAdvisor(viewModel) {
        lastAdvisorView = viewModel;
        if (!session || session.endedAt || !settings.get("roundLogging")) return;
        push("advisor", summarizeAdvisorView(viewModel));
      },
      maybeSnapshot() {
        if (!session || session.endedAt || !settings.get("roundLogging")) return;
        const now = performance.now();
        const interval = Number(settings.get("roundLogSnapshotIntervalMs")) || 5e3;
        if (now - lastSnapshotAt < interval) return;
        lastSnapshotAt = now;
        this.snapshot("interval");
      },
      snapshot(reason = "manual") {
        if (!session || session.endedAt || !settings.get("roundLogging")) return;
        push("snapshot", {
          reason,
          myClientID: gameState.state.myClientID,
          myPlayerID: gameState.state.myPlayerID,
          playerCount: gameState.state.playerStates.size,
          players: summarizePlayers(gameState, settings.get("roundLogKeepPlayerNames"))
        });
      },
      export(reason = "manual") {
        if (!session) {
          logger.warn("No round log session to export");
          return;
        }
        const payload = {
          ...session,
          meta: {
            ...session.meta,
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            exportReason: reason,
            truncated
          }
        };
        downloadJson(createRoundLogFilename(new Date(session.meta.createdAt)), payload);
        lastExportAt = payload.meta.exportedAt;
      },
      clear() {
        session = null;
        lastAdvisorView = null;
        lastSnapshotAt = 0;
        lastExportAt = null;
        truncated = false;
        sequence = 0;
        approxBytes = 0;
        logger.info("Round log cleared");
      },
      hasSession() {
        return !!session;
      },
      getStatus() {
        return {
          active: !!session && !session.endedAt,
          hasSession: !!session,
          eventCount: session ? session.timeline.length : 0,
          truncated,
          lastExportAt,
          endedAt: session?.meta?.endedAt || null
        };
      }
    };
    function entrySize(entry) {
      return JSON.stringify(entry).length + 1;
    }
    function push(type, data) {
      if (!session) return;
      const entry = {
        seq: ++sequence,
        timeMs: Date.now() - Date.parse(session.meta.createdAt),
        tick: gameState.state.currentTick,
        type,
        data
      };
      session.timeline.push(entry);
      approxBytes += entrySize(entry);
      enforceTimelineLimit();
    }
    function enforceTimelineLimit() {
      if (!session || approxBytes <= MAX_TIMELINE_BYTES) return;
      const removableTypes = ["network_request", "advisor", "snapshot", "log_truncated"];
      let removed = 0;
      const dropMatching = (predicate) => {
        for (let i = 0; i < session.timeline.length && approxBytes > MAX_TIMELINE_BYTES; ) {
          if (predicate(session.timeline[i])) {
            approxBytes -= entrySize(session.timeline[i]);
            session.timeline.splice(i, 1);
            removed += 1;
          } else {
            i += 1;
          }
        }
      };
      for (const removableType of removableTypes) {
        if (approxBytes <= MAX_TIMELINE_BYTES) break;
        dropMatching((entry) => entry.type === removableType);
      }
      if (approxBytes > MAX_TIMELINE_BYTES) {
        dropMatching((entry) => !PROTECTED_LOG_TYPES.has(entry.type));
      }
      if (removed === 0) return;
      truncated = true;
      const last = session.timeline[session.timeline.length - 1];
      if (last && last.type === "log_truncated") {
        approxBytes -= entrySize(last);
        last.data.removedEntries += removed;
        last.timeMs = Date.now() - Date.parse(session.meta.createdAt);
        last.tick = gameState.state.currentTick;
        approxBytes += entrySize(last);
      } else {
        const entry = {
          seq: ++sequence,
          timeMs: Date.now() - Date.parse(session.meta.createdAt),
          tick: gameState.state.currentTick,
          type: "log_truncated",
          data: { removedEntries: removed, maxTimelineBytes: MAX_TIMELINE_BYTES }
        };
        session.timeline.push(entry);
        approxBytes += entrySize(entry);
      }
    }
  }

  // src/page/logging/network-logger.js
  function installNetworkMetadataLogger({ settings, roundLogger }) {
    installFetchLogger(settings, roundLogger);
    installXhrLogger(settings, roundLogger);
    installBeaconLogger(settings, roundLogger);
  }
  function installFetchLogger(settings, roundLogger) {
    const origFetch = window.fetch;
    if (typeof origFetch !== "function") return;
    window.fetch = function loggedFetch(input, init) {
      const startedAt = performance.now();
      const requestInfo = getFetchRequestInfo(input, init);
      return origFetch.apply(this, arguments).then(
        (response) => {
          recordNetwork(settings, roundLogger, {
            ...requestInfo,
            status: response.status,
            ok: response.ok,
            durationMs: performance.now() - startedAt,
            responseSize: getResponseSize(response),
            initiator: "fetch"
          });
          return response;
        },
        (error) => {
          recordNetwork(settings, roundLogger, {
            ...requestInfo,
            status: 0,
            ok: false,
            durationMs: performance.now() - startedAt,
            responseSize: 0,
            initiator: "fetch",
            error: error && error.name ? error.name : "FetchError"
          });
          throw error;
        }
      );
    };
  }
  function installXhrLogger(settings, roundLogger) {
    if (!window.XMLHttpRequest || !XMLHttpRequest.prototype) return;
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function loggedOpen(method, url) {
      this.__ofatNetworkInfo = {
        method: String(method || "GET").toUpperCase(),
        url: sanitizeUrl(url),
        sameOrigin: isSameOrigin(url),
        requestType: classifyUrl(url)
      };
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function loggedSend() {
      const startedAt = performance.now();
      this.addEventListener("loadend", () => {
        const info = this.__ofatNetworkInfo || {};
        recordNetwork(settings, roundLogger, {
          method: info.method || "GET",
          url: info.url || "",
          sameOrigin: !!info.sameOrigin,
          requestType: info.requestType || "other",
          status: this.status || 0,
          ok: this.status >= 200 && this.status < 400,
          durationMs: performance.now() - startedAt,
          responseSize: getXhrResponseSize(this),
          initiator: "xhr"
        });
      });
      return origSend.apply(this, arguments);
    };
  }
  function installBeaconLogger(settings, roundLogger) {
    if (!navigator.sendBeacon) return;
    const origSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function loggedSendBeacon(url, data) {
      const startedAt = performance.now();
      const ok = origSendBeacon(url, data);
      recordNetwork(settings, roundLogger, {
        method: "POST",
        url: sanitizeUrl(url),
        sameOrigin: isSameOrigin(url),
        requestType: classifyUrl(url),
        status: ok ? 204 : 0,
        ok,
        durationMs: performance.now() - startedAt,
        responseSize: 0,
        initiator: "beacon"
      });
      return ok;
    };
  }
  function recordNetwork(settings, roundLogger, event) {
    if (!settings.get("networkLogging")) return;
    roundLogger.record("network_request", {
      method: event.method || "GET",
      url: event.url || "",
      status: event.status || 0,
      ok: !!event.ok,
      durationMs: round1(event.durationMs),
      requestType: event.requestType || "other",
      responseSize: event.responseSize || 0,
      sameOrigin: !!event.sameOrigin,
      initiator: event.initiator || "unknown",
      error: event.error || void 0
    });
  }
  function getFetchRequestInfo(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const method = init && init.method ? init.method : input && input.method ? input.method : "GET";
    return {
      method: String(method || "GET").toUpperCase(),
      url: sanitizeUrl(url),
      sameOrigin: isSameOrigin(url),
      requestType: classifyUrl(url)
    };
  }
  function sanitizeUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return \`\${url.origin === location.origin ? "" : url.origin}\${url.pathname}\${url.search ? "?..." : ""}\`;
    } catch (_) {
      return String(value || "").split("?")[0];
    }
  }
  function isSameOrigin(value) {
    try {
      return new URL(String(value || ""), location.href).origin === location.origin;
    } catch (_) {
      return false;
    }
  }
  function classifyUrl(value) {
    const url = sanitizeUrl(value);
    if (/\\/maps\\//.test(url)) return "map";
    if (/\\/api\\//.test(url)) return "api";
    if (/\\/assets\\/|\\/_assets\\//.test(url)) return "asset";
    if (/\\/analytics|\\/collect|\\/beacon/.test(url)) return "telemetry";
    return "other";
  }
  function getResponseSize(response) {
    const length = response.headers && response.headers.get ? response.headers.get("content-length") : null;
    const parsed = Number(length);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function getXhrResponseSize(xhr) {
    const length = xhr.getResponseHeader ? Number(xhr.getResponseHeader("content-length")) : 0;
    if (Number.isFinite(length) && length > 0) return length;
    if (typeof xhr.responseText === "string") return xhr.responseText.length;
    if (xhr.response instanceof ArrayBuffer) return xhr.response.byteLength;
    return 0;
  }
  function round1(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 10) / 10;
  }

  // src/page/ui/control-hud.js
  function createControlHud({ app, settings, roundLogger, teamDetection, getTroopEconomy }) {
    let el = null;
    return {
      create() {
        removeElementById("ofat-control-hud");
        installHudStyles();
        el = document.createElement("div");
        el.id = "ofat-control-hud";
        appendWhenReady(el, "body");
        preventFocusSteal(el);
        this.render();
      },
      render() {
        if (!el) return;
        const status = roundLogger.getStatus();
        const team = teamDetection?.isTeamMode ? teamDetection.teamSummary() : null;
        const economy = settings.get("showTroopEconomy") ? getTroopEconomy?.() || null : null;
        el.innerHTML = renderHudHtml(app, settings, status, team, economy);
        el.querySelectorAll("button[data-setting]").forEach((button) => {
          button.addEventListener("click", () => settings.set(button.dataset.setting, !settings.get(button.dataset.setting)));
        });
        const exportButton = el.querySelector("[data-action='export']");
        if (exportButton) {
          exportButton.addEventListener("click", () => {
            roundLogger.export("hud");
            this.render();
          });
        }
        const clearButton = el.querySelector("[data-action='clear']");
        if (clearButton) {
          clearButton.addEventListener("click", () => {
            roundLogger.clear();
            this.render();
          });
        }
      }
    };
  }
  function renderHudHtml(app, settings, status, team, economy) {
    const logState = status.active ? "录制" : status.hasSession ? "结束" : "空闲";
    const lastExport = status.lastExportAt ? "已导出" : "未导出";
    const truncated = status.truncated ? " 已截断" : "";
    const teamLine = team ? \`<div class="ofat-hud-team"><span class="ofat-hud-dot" style="background:\${safeColor(team.myTeamColor)}"></span>队伍: \${escapeHtml(team.myTeamName)} (\${team.memberCount}人)</div>\` : "";
    const ecoLine = economy ? \`<div class="ofat-hud-eco">经济: <b>\${escapeHtml(economy.state)}</b> | 可用 \${escapeHtml(formatTroopCount(economy.safeSpendableTroops))}</div>\` : "";
    return \`
    <div class="ofat-hud-title">\${app.shortName} <span>\${logState}</span></div>
    <div class="ofat-hud-status">\${status.eventCount} 事件 | \${lastExport}\${truncated}</div>
    \${teamLine}
    \${ecoLine}
    <div class="ofat-hud-grid">
      \${toggle("回合日志", "roundLogging", settings.get("roundLogging"))}
      \${toggle("自动下载", "roundLogAutoDownload", settings.get("roundLogAutoDownload"))}
      \${toggle("网络日志", "networkLogging", settings.get("networkLogging"))}
      \${toggle("顾问面板", "showAdvisorPanel", settings.get("showAdvisorPanel"))}
      \${toggle("热力图", "showHeatmap", settings.get("showHeatmap"))}
      \${toggle("动态储备", "autoFarmDynamicReserve", settings.get("autoFarmDynamicReserve"))}
      \${toggle("经济面板", "showTroopEconomy", settings.get("showTroopEconomy"))}
      \${toggle("队伍支援", "autoTeamSupport", settings.get("autoTeamSupport"), true)}
      \${toggle("自动求救", "autoSosQuickChat", settings.get("autoSosQuickChat"), true)}
      \${toggle("自动防御", "autoDefense", settings.get("autoDefense"), true)}
      \${toggle("自动登船", "autoBoat", settings.get("autoBoat"), true)}
      \${toggle("自动武器", "autoWeapons", settings.get("autoWeapons"), true)}
      \${toggle("饱和核打击", "autoNukeStrike", settings.get("autoNukeStrike"), true)}
      \${toggle("攻击标记", "showAttackBadges", settings.get("showAttackBadges"))}
    </div>
    <div class="ofat-hud-actions">
      <button data-action="export">导出日志</button>
      <button data-action="clear">清空日志</button>
    </div>
  \`;
  }
  function safeColor(value) {
    return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$|^rgb/.test(String(value || "")) ? value : "#71c7ff";
  }
  function toggle(label, key, enabled, warn = false) {
    return \`<button data-setting="\${key}" data-on="\${enabled ? "true" : "false"}" data-warn="\${warn && enabled ? "true" : "false"}">\${label}</button>\`;
  }
  function installHudStyles() {
    createStyle(
      "ofat-control-hud-style",
      \`
      #ofat-control-hud {
        position: fixed;
        top: 10px;
        left: 10px;
        z-index: 100000;
        width: 330px;
        padding: 10px;
        color: #f4f7fb;
        background: rgba(8, 10, 13, 0.92);
        border: 1px solid rgba(113, 191, 255, 0.45);
        border-radius: 8px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
        font: 12px/1.25 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        user-select: none;
      }
      #ofat-control-hud .ofat-hud-title {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: #71c7ff;
        font-weight: 700;
        margin-bottom: 4px;
      }
      #ofat-control-hud .ofat-hud-title span {
        color: #f4f7fb;
      }
      #ofat-control-hud .ofat-hud-status {
        color: rgba(244, 247, 251, 0.68);
        margin-bottom: 8px;
      }
      #ofat-control-hud .ofat-hud-team {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(244, 247, 251, 0.85);
        margin-bottom: 8px;
      }
      #ofat-control-hud .ofat-hud-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.6);
      }
      #ofat-control-hud .ofat-hud-eco {
        color: rgba(244, 247, 251, 0.85);
        margin-bottom: 8px;
      }
      #ofat-control-hud .ofat-hud-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }
      #ofat-control-hud .ofat-hud-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-top: 7px;
      }
      #ofat-control-hud button {
        min-width: 0;
        height: 32px;
        padding: 0 8px;
        color: #f4f7fb;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.1);
        font: inherit;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #ofat-control-hud button[data-on="true"] {
        background: rgba(46, 125, 50, 0.88);
      }
      #ofat-control-hud button[data-warn="true"] {
        background: rgba(183, 28, 28, 0.88);
      }
      #ofat-control-hud button:hover {
        border-color: rgba(113, 191, 255, 0.72);
      }
    \`
    );
  }

  // src/page/ui/action-hud.js
  var ACTION_SETTINGS = [
    { key: "autopilot", label: "自动驾驶", warn: true },
    { key: "autoExpand", label: "扩张", warn: true },
    { key: "autoFarm", label: "农场", warn: true },
    { key: "autoFarmHumanTargets", label: "打人类", warn: true },
    { key: "autoAttack", label: "自动进攻", warn: true },
    { key: "autoEco", label: "经济", warn: true },
    { key: "autoDefense", label: "防御", warn: true },
    { key: "autoBoat", label: "登船", warn: true },
    { key: "autoWeapons", label: "武器", warn: true },
    { key: "autoTeamSupport", label: "团队", warn: true },
    { key: "autoSosQuickChat", label: "求救", warn: true },
    { key: "smartAttack", label: "智能比例", warn: true }
  ];
  function createActionHud({ settings, getViewModel, getAutomationStatus }) {
    let el = null;
    return {
      create() {
        removeElementById("ofat-action-hud");
        installActionHudStyles();
        el = document.createElement("div");
        el.id = "ofat-action-hud";
        appendWhenReady(el, "body");
        preventFocusSteal(el);
        this.render();
      },
      render() {
        if (!el) return;
        el.innerHTML = renderActionHudHtml(settings, getViewModel?.() || null, getAutomationStatus?.() || {});
        el.querySelectorAll("button[data-setting]").forEach((button) => {
          button.addEventListener("click", () => settings.set(button.dataset.setting, !settings.get(button.dataset.setting)));
        });
        const AGG_LABELS = ["稳健", "均衡", "进取", "强攻", "全力"];
        el.querySelectorAll("input[type='range'][data-setting]").forEach((input) => {
          input.addEventListener("input", () => {
            const val = Number(input.value);
            settings.set(input.dataset.setting, val);
            const valueEl = input.parentElement?.querySelector(".ofat-agg-value");
            if (valueEl) {
              valueEl.textContent = AGG_LABELS[Math.max(0, Math.min(4, val - 1))];
              valueEl.dataset.agg = String(val);
            }
          });
        });
      }
    };
  }
  function renderActionHudHtml(settings, vm, status) {
    const economy = vm?.troopEconomy;
    const expansion = vm?.expansion?.level || "unknown";
    const threat = vm?.topThreats?.[0] ? \`\${vm.topThreats[0].name} \${vm.topThreats[0].level}\` : "安全";
    const ecoState = economy ? \`\${economy.state} \${Math.round((economy.currentRatio || 0) * 100)}%\` : "空闲";
    const target = (vm?.farmRecommendations || []).find((rec) => rec.status === "farm") || null;
    const support = (vm?.teamSupportRecommendations || [])[0] || null;
    let html = \`<div class="ofat-action-row ofat-action-toggles">\`;
    ACTION_SETTINGS.forEach((item) => {
      html += actionToggle(settings, item);
    });
    html += \`</div>\`;
    html += \`<div class="ofat-action-row ofat-action-state">\`;
    html += actionPill("出生", summarizeStatus(status.autoSpawn, "空闲"), toneFromStatus(status.autoSpawn));
    html += actionPill("经济", ecoState, toneFromStatus(status.autoEco));
    html += actionPill("扩张", summarizeStatus(status.autoExpand, expansion), toneFromStatus(status.autoExpand));
    html += actionPill("农场", target ? target.label : summarizeStatus(status.autoFarm, "无"), target ? "ready" : toneFromStatus(status.autoFarm));
    if (settings.get("autoAttack")) {
      const aggLabel = getAggressionLabel(settings);
      const atkSummary = summarizeStatus(status.autoAttack, "空闲");
      html += actionPill(\`进攻[\${aggLabel}]\`, atkSummary, toneFromStatus(status.autoAttack));
    }
    html += actionPill("防御", defenseSummary(status.autoDefense), status.autoDefense?.emergency ? "warn" : toneFromStatus(status.autoDefense));
    if (settings.get("autoBoat")) html += actionPill("登船", summarizeStatus(status.autoBoat, "空闲"), toneFromStatus(status.autoBoat));
    if (settings.get("autoWeapons")) {
      const wLabel = settings.get("autoNukeStrike") ? "⚛饱和" : "武器";
      html += actionPill(wLabel, weaponsSummary(status.autoWeapons), toneFromStatus(status.autoWeapons));
    }
    html += actionPill("团队", support ? \`\${support.name} \${Math.round(support.troops || 0)}\` : summarizeStatus(status.autoTeamSupport, "空闲"), support ? "ready" : toneFromStatus(status.autoTeamSupport));
    html += actionPill("求救", summarizeStatus(status.quickChat, "空闲"), toneFromStatus(status.quickChat));
    html += actionPill("威胁", threat, threat === "安全" ? "ok" : "warn");
    html += \`</div>\`;
    if (settings.get("autoAttack")) {
      const aggLevel = Math.max(1, Math.min(5, Number(settings.get("autoAttackAggression")) || 2));
      const aggLabels = ["稳健", "均衡", "进取", "强攻", "全力"];
      html += \`<div class="ofat-action-row ofat-aggression-row">
        <span class="ofat-agg-label">进攻强度</span>
        <input type="range" class="ofat-agg-slider" data-setting="autoAttackAggression" min="1" max="5" step="1" value="\${aggLevel}">
        <span class="ofat-agg-value" data-agg="\${aggLevel}">\${aggLabels[aggLevel - 1]}</span>
      </div>\`;
    }
    return html;
  }
  function actionToggle(settings, item) {
    const on = !!settings.get(item.key);
    const tone = item.warn && on ? "warn" : on ? "on" : "off";
    return \`<button data-setting="\${escapeHtml(item.key)}" data-tone="\${tone}">\${escapeHtml(item.label)}</button>\`;
  }
  function actionPill(label, value, tone) {
    return \`<span class="ofat-action-pill" data-tone="\${escapeHtml(tone || "ok")}"><b>\${escapeHtml(label)}</b> \${escapeHtml(String(value || ""))}</span>\`;
  }
  function weaponsSummary(status) {
    if (!status) return "空闲";
    if (status.unit) return status.target ? \`\${status.unit}->\${status.target}\` : status.unit;
    return status.reason || "空闲";
  }
  function defenseSummary(status) {
    if (!status) return "安全";
    if (status.emergency) return status.lastAction || (status.topAttacker ? \`攻击 \${status.topAttacker}\` : "受攻击");
    return status.reason === "no_pressure" ? "安全" : status.reason || "空闲";
  }
  function summarizeStatus(status, fallback) {
    if (!status) return fallback;
    if (status.targetName) return status.targetName;
    if (status.unit) return status.unit;
    if (status.reason) return status.reason;
    return fallback;
  }
  function toneFromStatus(status) {
    if (!status) return "ok";
    if (status.state === "sent") return "ready";
    if (status.state === "blocked") return "warn";
    if (status.state === "cooldown") return "cooldown";
    return "ok";
  }
  function installActionHudStyles() {
    createStyle(
      "ofat-action-hud-style",
      \`
      #ofat-action-hud {
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100001;
        width: min(720px, calc(100vw - 24px));
        padding: 8px;
        color: #f4f7fb;
        background: rgba(8, 10, 13, 0.9);
        border: 1px solid rgba(255, 190, 72, 0.55);
        border-radius: 8px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
        font: 12px/1.25 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        user-select: none;
      }
      #ofat-action-hud .ofat-action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        justify-content: center;
      }
      #ofat-action-hud .ofat-action-state {
        margin-top: 6px;
      }
      #ofat-action-hud button {
        min-width: 72px;
        height: 28px;
        padding: 0 8px;
        color: #f4f7fb;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.1);
        font: inherit;
        cursor: pointer;
      }
      #ofat-action-hud button[data-tone="warn"] { background: rgba(183, 28, 28, 0.88); }
      #ofat-action-hud button[data-tone="on"] { background: rgba(46, 125, 50, 0.88); }
      #ofat-action-hud .ofat-action-pill {
        max-width: 170px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 3px 7px;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(244, 247, 251, 0.86);
      }
      #ofat-action-hud .ofat-action-pill[data-tone="ready"] { background: rgba(46, 125, 50, 0.68); }
      #ofat-action-hud .ofat-action-pill[data-tone="warn"] { background: rgba(183, 28, 28, 0.72); }
      #ofat-action-hud .ofat-action-pill[data-tone="cooldown"] { background: rgba(255, 190, 72, 0.35); }
      #ofat-action-hud .ofat-aggression-row {
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
      }
      #ofat-action-hud .ofat-agg-label {
        color: rgba(244, 247, 251, 0.7);
        white-space: nowrap;
        font-size: 11px;
      }
      #ofat-action-hud .ofat-agg-slider {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        max-width: 220px;
        height: 4px;
        border-radius: 999px;
        background: linear-gradient(to right, #4caf50, #ff9800, #f44336);
        outline: none;
        cursor: pointer;
      }
      #ofat-action-hud .ofat-agg-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #f4f7fb;
        border: 2px solid rgba(113, 191, 255, 0.8);
        cursor: pointer;
      }
      #ofat-action-hud .ofat-agg-value {
        min-width: 36px;
        text-align: center;
        font-weight: 700;
        font-size: 11px;
      }
      #ofat-action-hud .ofat-agg-value[data-agg="1"] { color: #66bb6a; }
      #ofat-action-hud .ofat-agg-value[data-agg="2"] { color: #aed581; }
      #ofat-action-hud .ofat-agg-value[data-agg="3"] { color: #ffca28; }
      #ofat-action-hud .ofat-agg-value[data-agg="4"] { color: #ffa726; }
      #ofat-action-hud .ofat-agg-value[data-agg="5"] { color: #ef5350; }
    \`
    );
  }

  // src/page/page-main.js
  var RECALC_INTERVAL = 1e3;
  function startPage(payload) {
    if (!payload || !payload.appInfo) return;
    installGameViewCapture();
    const app = payload.appInfo;
    const logger = createLogger(app);
    const bus = createEventBus();
    const settings = createPageSettingsStore(app, DEFAULT_SETTINGS, payload.initialSettings || DEFAULT_SETTINGS);
    const gameState = createGameState();
    const mapDataRef = { current: null };
    const staticCandidatesRef = { current: null };
    const neighbourFetcher = createNeighbourFetcher();
    const goldIntel = createGoldIntel();
    let attackAdvisor = null;
    let teamDetection = null;
    let roundLogger = null;
    let recalcTimer = null;
    let ui = null;
    let heatmap = null;
    let controlHud = null;
    let actionHud = null;
    let autoSpawn = null;
    let autoAlliance = null;
    let autoFarm = null;
    let autoEco = null;
    let autoDefense = null;
    let autoBoat = null;
    let autoWeapons = null;
    let autoTeamSupport = null;
    let quickChat = null;
    let autoExpand = null;
    let autoAttack = null;
    let assistActions = null;
    let autopilot = null;
    let lastViewModel = null;
    let lastTroopEconomy = null;
    let lastBuyRecommendationLoggedAt = 0;
    let lastFarmRecommendationLoggedAt = 0;
    let lastGameViewDiscoveryKey = null;
    let lastMechanicsLogAt = 0;
    let observedIntentCount = 0;
    const OBSERVED_INTENT_CAP = 400;
    logger.banner();
    if (settings.get("hideAds")) hideAds();
    roundLogger = createRoundLogger({ app, settings, gameState, mapDataRef, logger });
    teamDetection = createTeamDetection({ gameState, logger, roundLogger });
    teamDetection.observeLobby();
    attackAdvisor = createAttackAdvisor({ settings, teamDetection });
    const smartAttackModifier = createSmartAttackModifier({
      settings,
      gameState,
      logger,
      roundLogger,
      teamDetection,
      getTroopEconomy: () => lastTroopEconomy
    });
    const network = installNetworkHooks({
      bus,
      getSmartAttackModifier: () => smartAttackModifier,
      logger
    });
    installMapAssetHook({ bus, logger });
    installNetworkMetadataLogger({ settings, roundLogger });
    controlHud = createControlHud({ app, settings, roundLogger, teamDetection, getTroopEconomy: () => lastTroopEconomy });
    controlHud.create();
    actionHud = createActionHud({
      settings,
      getViewModel: () => lastViewModel,
      getAutomationStatus: () => ({
        autoExpand: autoExpand?.getStatus?.() || null,
        autoFarm: autoFarm?.getStatus?.() || null,
        autoAttack: autoAttack?.getStatus?.() || null,
        autoEco: autoEco?.getStatus?.() || null,
        autoDefense: autoDefense?.getStatus?.() || null,
        autoBoat: autoBoat?.getStatus?.() || null,
        autoWeapons: autoWeapons?.getStatus?.() || null,
        autoSpawn: autoSpawn?.getStatus?.() || null,
        autoTeamSupport: autoTeamSupport?.getStatus?.() || null,
        quickChat: quickChat?.getStatus?.() || null
      })
    });
    actionHud.create();
    registerEvents();
    function registerEvents() {
      bus.on("mapLoaded", (mapData) => {
        mapDataRef.current = mapData;
        const startedAt = performance.now();
        staticCandidatesRef.current = precomputeStaticScores(mapData);
        logger.info(
          \`Static spawn analysis: \${staticCandidatesRef.current.length} candidates in \${(performance.now() - startedAt).toFixed(0)}ms\`
        );
        roundLogger.recordMapLoaded(mapData);
        heatmap = createHeatmap({ mapDataRef });
        ui = createAdvisorPanel({
          app,
          settings,
          heatmap,
          actions: {
            onManualAssistAttack: () => handleManualAssistAttack(),
            onUnavailableBuild: (actionKey) => handleUnavailableBuild(actionKey)
          }
        });
        ui.create();
        ui.attachHeatmap(heatmap.create(settings.get("showHeatmap")));
        autoSpawn = createAutoSpawn({
          gameState,
          mapDataRef,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection
        });
        autoFarm = createAutoFarm({
          gameState,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoExpand = createAutoExpand({
          gameState,
          neighbourFetcher,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoAttack = createAutoAttack({
          gameState,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoEco = createAutoEco({
          gameState,
          mapDataRef,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoDefense = createAutoDefense({
          gameState,
          mapDataRef,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoBoat = createAutoBoat({
          gameState,
          mapDataRef,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoWeapons = createAutoWeapons({
          gameState,
          mapDataRef,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection,
          getTroopEconomy: () => lastTroopEconomy
        });
        autoTeamSupport = createAutoTeamSupport({
          gameState,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection,
          getTroopEconomy: () => lastTroopEconomy
        });
        quickChat = createQuickChatAutomation({
          gameState,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection
        });
        assistActions = createAssistActions({
          gameState,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          settings,
          logger,
          roundLogger,
          teamDetection
        });
        autoAlliance = createAutoAlliance({
          gameState,
          neighbourFetcher,
          OrigWS: network.OrigWS,
          origWsSend: network.origWsSend,
          logger,
          roundLogger,
          teamDetection
        });
        autopilot = createAutopilotController({
          settings,
          gameState,
          autoSpawn,
          autoFarm,
          autoExpand,
          autoAlliance,
          autoEco,
          autoDefense,
          roundLogger
        });
        recalculate();
        startRecalcLoop();
      });
      bus.on("wsMessage", (message) => {
        gameState.handleWsMessage(message, mapDataRef.current);
        if (message.type === "start") {
          roundLogger.start("websocket_start");
          if (Array.isArray(message.turns)) message.turns.forEach((turn) => recordMyIntents(turn));
          controlHud?.render();
        } else if (message.type === "turn") {
          recordMyIntents(message.turn);
          roundLogger.maybeSnapshot();
        }
      });
      bus.on("workerGameUpdateBatch", (batch) => {
        gameState.handleWorkerBatch(batch);
        roundLogger.maybeSnapshot();
      });
      bus.on("socketReady", (socket) => gameState.setSocket(socket));
      bus.on("socketClosed", (socket) => {
        roundLogger.end("socket_closed");
        gameState.resetSocket(socket);
        autoSpawn?.reset();
        autoAlliance?.reset();
        autoFarm?.reset();
        autoEco?.reset();
        autoDefense?.reset();
        autoBoat?.reset();
        autoWeapons?.reset();
        autoTeamSupport?.reset();
        quickChat?.reset();
        autoExpand?.reset();
        autoAttack?.reset();
        autopilot?.reset();
        attackAdvisor.reset();
        teamDetection.reset();
        resetGameViewCache();
        goldIntel.reset();
        lastGameViewDiscoveryKey = null;
        lastTroopEconomy = null;
        controlHud?.render();
        actionHud?.render();
      });
      settings.onChange(({ key, value }) => {
        if (key === "showHeatmap") heatmap?.setVisible(value);
        if (key === "showAdvisorPanel") ui?.setVisible(value);
        if (key === "autoSpawn" && !value) autoSpawn?.reset();
        if (key === "autoFarm" && !value) autoFarm?.reset();
        if (key === "autoEco" && !value) autoEco?.reset();
        if (key === "autoDefense" && !value) autoDefense?.reset();
        if (key === "autoBoat" && !value) autoBoat?.reset();
        if (key === "autoWeapons" && !value) autoWeapons?.reset();
        if (key === "autoTeamSupport" && !value) autoTeamSupport?.reset();
        if (key === "autoSosQuickChat" && !value) quickChat?.reset();
        if (key === "autoExpand" && !value) autoExpand?.reset();
        if (key === "autoAttack" && !value) autoAttack?.reset();
        roundLogger.recordSettingChange(key, value);
        controlHud?.render();
        actionHud?.render();
        recalculate();
      });
      window.addEventListener("message", (event) => {
        const data = event && event.data;
        if (!data || data.source !== app.messageSource) return;
        if (data.type === "export-round-log") roundLogger.export("manual");
        if (data.type === "clear-round-log") roundLogger.clear();
        if (data.type === "export-round-log" || data.type === "clear-round-log") controlHud?.render();
        if (data.type === "export-round-log" || data.type === "clear-round-log") actionHud?.render();
      });
    }
    function startRecalcLoop() {
      if (recalcTimer) return;
      recalcTimer = setInterval(recalculate, RECALC_INTERVAL);
    }
    function recalculate() {
      if (!mapDataRef.current || !staticCandidatesRef.current || !ui) return;
      teamDetection.syncFromGameView();
      recordGameViewDiscovery();
      const teammateClientIDs = teamDetection.myTeammateClientIDs();
      const results = rankSpawnCandidates(staticCandidatesRef.current, gameState.state.playerSpawns, { teammateClientIDs });
      const myState = gameState.getMyState();
      const troopInfo = getMyTroopRatio();
      const siloIntel = scanMissileSilos(getGameView(), myState, teamDetection);
      const nukeBuilders = enemyNukeBuilders(siloIntel);
      goldIntel.sample(gameState);
      const threats = Array.from(evaluateThreats(gameState, teamDetection, nukeBuilders, goldIntel).values()).sort((a, b) => b.score - a.score).slice(0, 3);
      neighbourFetcher.refresh();
      const troopEconomy = evaluateTroopEconomy({
        troopInfo,
        myState,
        gameState,
        neighbours: neighbourFetcher.cachedNeighbourIDs,
        settings,
        teamDetection,
        threats
      });
      lastTroopEconomy = troopEconomy;
      const expansion = evaluateExpansionState(troopInfo, myState, troopEconomy);
      const farmRecommendations = attackAdvisor.evaluate({
        gameState,
        neighbourFetcher,
        troopInfo,
        expansion,
        troopEconomy,
        mapData: mapDataRef.current
      });
      const allianceRecommendations = recommendAlliances(gameState, teamDetection);
      const buyRecommendations = recommendBuys({ gameState, troopInfo, threats, farmRecommendations, troopEconomy });
      const spawnPhase = getSpawnPhaseInfo({ gameView: getGameView(), state: gameState.state, teamMode: !!teamDetection?.isTeamMode });
      recordMechanicsDiscovery(spawnPhase);
      const teamSupportRecommendations = autoTeamSupport?.recommend?.() || [];
      const allyCount = myState && myState.alliances ? myState.alliances.length : 0;
      const assistTarget = chooseAssistTarget(farmRecommendations);
      const nukeThreatActive = nukeBuilders.size > 0 || threats.some((threat) => threat.nukePotential >= 1 || threat.nukeSoon);
      const viewModel = {
        scores: results.scores,
        topSpots: results.topSpots,
        playerSpawns: gameState.state.playerSpawns,
        otherPlayerCount: gameState.state.playerSpawns.size,
        nationCount: mapDataRef.current.nations.length,
        tick: gameState.state.currentTick,
        topThreats: threats,
        expansion,
        troopEconomy,
        farmRecommendations,
        assistTarget,
        buyRecommendations,
        siloIntel,
        nukeThreatActive,
        spawnPhase,
        teamSupportRecommendations,
        allianceRecommendations,
        allyCount,
        lastSkippedNeighbour: autoAlliance?.lastSkippedNeighbour || null,
        automationStatus: {
          autoExpand: autoExpand?.getStatus?.() || null,
          autoFarm: autoFarm?.getStatus?.() || null,
          autoEco: autoEco?.getStatus?.() || null,
          autoDefense: autoDefense?.getStatus?.() || null,
          autoBoat: autoBoat?.getStatus?.() || null,
          autoWeapons: autoWeapons?.getStatus?.() || null,
          autoSpawn: autoSpawn?.getStatus?.() || null,
          autoTeamSupport: autoTeamSupport?.getStatus?.() || null,
          quickChat: quickChat?.getStatus?.() || null
        }
      };
      lastViewModel = viewModel;
      ui.render(viewModel);
      publishFarmRecommendations(farmRecommendations);
      roundLogger.recordAdvisor(viewModel);
      recordFarmRecommendations(farmRecommendations);
      recordBuyRecommendations(buyRecommendations);
      roundLogger.maybeSnapshot();
      controlHud?.render();
      actionHud?.render();
      const autopilotState = autopilot?.run({
        topSpot: results.topSpots[0] || null,
        farmRecommendations,
        buyRecommendations,
        expansion,
        threats,
        neighbourIDs: neighbourFetcher.cachedNeighbourIDs,
        troopInfo,
        nukeThreat: nukeThreatActive
      });
      if (!autopilotState?.defenseHandled && settings.get("autoDefense")) {
        autoDefense?.run({ nukeThreat: nukeThreatActive, threats, neighbourIDs: neighbourFetcher.cachedNeighbourIDs });
      }
      const underAttack = !!autoDefense?.getStatus?.()?.emergency;
      if (!autopilotState?.spawnHandled && settings.get("autoSpawn") && results.topSpots.length > 0) autoSpawn?.send(results.topSpots[0]);
      if (!underAttack && !autopilotState?.expandHandled && settings.get("autoExpand")) autoExpand?.run(troopInfo);
      if (!underAttack && !autopilotState?.farmHandled && settings.get("autoFarm")) autoFarm?.run(farmRecommendations, expansion);
      if (!underAttack && settings.get("autoAttack")) autoAttack?.run(farmRecommendations, expansion);
      if (!underAttack && !autopilotState?.ecoHandled && settings.get("autoEco")) autoEco?.run({ buyRecommendations });
      if (!underAttack && settings.get("autoBoat")) autoBoat?.run();
      if (!underAttack && settings.get("autoWeapons")) autoWeapons?.run({ threats });
      if (!autopilotState?.allianceHandled && settings.get("autoAlliance")) autoAlliance?.run();
      if (settings.get("autoTeamSupport")) {
        autoTeamSupport?.run({
          neighbourIDs: neighbourFetcher.cachedNeighbourIDs,
          automationStatus: {
            autoDefense: autoDefense?.getStatus?.() || null,
            autoExpand: autoExpand?.getStatus?.() || null,
            autoFarm: autoFarm?.getStatus?.() || null
          }
        });
      }
      if (settings.get("autoSosQuickChat")) quickChat?.runAutoSos({ teamSupportStatus: autoTeamSupport?.getStatus?.() || null });
      actionHud?.render();
    }
    function handleManualAssistAttack() {
      const target = lastViewModel?.assistTarget;
      const result = assistActions?.sendManualAssistAttack(target);
      if (!result?.ok) logger.warn(\`Manual assist attack skipped: \${result?.reason || "unknown"}\`);
    }
    function handleUnavailableBuild(actionKey) {
      roundLogger.record("build_button_unavailable", { actionKey, reason: "intent_not_verified" });
      logger.warn(\`Build action \${actionKey} is not verified yet\`);
    }
    function chooseAssistTarget(recommendations) {
      return (recommendations || []).find((rec) => rec.isHuman && rec.status === "target") || null;
    }
    function recordGameViewDiscovery() {
      const discovery = getGameViewDiscovery();
      if (!discovery) return;
      const key = JSON.stringify(discovery);
      if (key === lastGameViewDiscoveryKey && roundLogger.hasSession()) return;
      if (!roundLogger.hasSession()) return;
      lastGameViewDiscoveryKey = key;
      roundLogger.record("gameview_discovered", discovery);
    }
    function recordMechanicsDiscovery(spawnPhase) {
      const now = performance.now();
      if (now - lastMechanicsLogAt < 15e3) return;
      lastMechanicsLogAt = now;
      roundLogger.record("mechanics_discovered", {
        spawnPhaseTurns: spawnPhase?.totalTurns || null,
        spawnPhaseSource: spawnPhase?.source || null
      });
    }
    function recordMyIntents(turn) {
      if (!turn || !Array.isArray(turn.intents)) return;
      const myClientID = gameState.state.myClientID;
      if (!myClientID) return;
      for (let i = 0; i < turn.intents.length; i += 1) {
        const intent = turn.intents[i];
        if (!intent || intent.clientID !== myClientID) continue;
        autoEco?.observeIntent?.(intent);
        autoDefense?.observeIntent?.(intent);
        quickChat?.observeIntent?.(intent);
        if (observedIntentCount >= OBSERVED_INTENT_CAP) return;
        observedIntentCount += 1;
        roundLogger.record("intent_observed", summarizeIntent(intent));
        if (intent.type === "boat") roundLogger.record("boat_intent_observed", decodeBoatIntent(intent));
        if (isRetreatLikeIntent(intent)) {
          roundLogger.record("retreat_intent_observed", { type: intent.type, keys: Object.keys(intent), raw: intent });
        }
        if (intent.type === "build_unit" && isWeaponUnit(intent.unit)) {
          roundLogger.record("weapon_intent_observed", decodeWeaponIntent(intent));
        }
      }
    }
    function isWeaponUnit(unit) {
      return unit === UNIT.ATOM_BOMB || unit === UNIT.HYDROGEN_BOMB || unit === UNIT.MIRV || unit === UNIT.WARSHIP;
    }
    function decodeWeaponIntent(intent) {
      const mapData = mapDataRef.current;
      const tile = Number(intent.tile);
      const out = { unit: intent.unit, tile: intent.tile != null ? intent.tile : null, keys: Object.keys(intent), raw: intent };
      if (mapData && mapData.width && Number.isFinite(tile)) {
        out.tileX = tile % mapData.width;
        out.tileY = Math.floor(tile / mapData.width);
        const byte = mapData.terrain ? mapData.terrain[tile] : void 0;
        out.tileIsLand = byte === void 0 ? null : isLandByte(byte);
      }
      return out;
    }
    function isRetreatLikeIntent(intent) {
      if (!intent) return false;
      if (typeof intent.type === "string" && /cancel|retreat|abort/i.test(intent.type)) return true;
      if ("retreating" in intent && intent.retreating) return true;
      if (intent.attackID != null && intent.type !== "attack") return true;
      return false;
    }
    function decodeBoatIntent(intent) {
      const mapData = mapDataRef.current;
      const dst = intent.dst;
      const out = { dst: dst != null ? dst : null, troops: intent.troops != null ? intent.troops : null, keys: Object.keys(intent), raw: intent };
      if (mapData && mapData.width && Number.isFinite(Number(dst))) {
        const tile = Number(dst);
        out.dstX = tile % mapData.width;
        out.dstY = Math.floor(tile / mapData.width);
        const byte = mapData.terrain ? mapData.terrain[tile] : void 0;
        out.dstIsLand = byte === void 0 ? null : isLandByte(byte);
      }
      return out;
    }
    function summarizeIntent(intent) {
      const targetID = intent.targetID;
      let resolved = "none";
      if (targetID != null) {
        let match = gameState.state.playerStates.get(targetID) || null;
        if (!match) {
          gameState.state.playerStates.forEach((player) => {
            if (!match && player && player.smallID === targetID) match = player;
          });
        }
        resolved = match ? \`\${match.playerType || "?"}:\${match.name || match.id}\` : "unresolved";
      }
      return {
        type: intent.type,
        targetID: targetID === void 0 ? "__undefined__" : targetID,
        targetIDType: targetID === null ? "null" : typeof targetID,
        troops: intent.troops != null ? intent.troops : null,
        resolved,
        keys: Object.keys(intent),
        raw: intent
      };
    }
    function publishFarmRecommendations(recommendations) {
      window.postMessage(
        {
          source: app.messageSource,
          type: "farm-recommendations",
          recommendations: recommendations.map((rec) => ({
            id: rec.id,
            name: rec.name,
            status: rec.status,
            label: rec.label,
            suggestedPercent: rec.suggestedPercent,
            reason: rec.reason,
            estimatedCaptureTurns: rec.estimatedCaptureTurns
          }))
        },
        "*"
      );
    }
    function recordFarmRecommendations(recommendations) {
      const now = performance.now();
      if (now - lastFarmRecommendationLoggedAt < 5e3) return;
      const actionable = recommendations.filter((rec) => rec.status === "farm" || rec.status === "mark").slice(0, 5);
      if (!actionable.length) return;
      lastFarmRecommendationLoggedAt = now;
      roundLogger.record(
        "farm_recommendation",
        actionable.map((rec) => ({
          id: rec.id,
          name: rec.name,
          status: rec.status,
          suggestedPercent: rec.suggestedPercent,
          reason: rec.reason,
          score: rec.score,
          targetTroops: rec.targetTroops,
          effectiveTargetTroops: rec.effectiveTargetTroops,
          targetTiles: rec.targetTiles,
          reserveMaxSend: rec.reserveMaxSend,
          captureMaxSend: rec.captureMaxSend,
          usedCaptureOverdraft: !!rec.usedCaptureOverdraft,
          captureCostEstimate: rec.captureCostEstimate,
          officialCaptureCostEstimate: rec.officialCaptureCostEstimate,
          officialCaptureTileCost: rec.officialCaptureTileCost,
          officialCaptureTurns: rec.officialCaptureTurns,
          officialCaptureSource: rec.officialCaptureSource,
          estimatedCaptureTurns: rec.estimatedCaptureTurns,
          sizingMode: rec.sizingMode
        }))
      );
      roundLogger.record(
        "combat_model_estimate",
        actionable.slice(0, 5).map((rec) => ({
          id: rec.id,
          name: rec.name,
          status: rec.status,
          oldCaptureCost: rec.captureCostEstimate,
          newCaptureCost: rec.officialCaptureCostEstimate,
          oldTurns: rec.estimatedCaptureTurns,
          newTurns: rec.officialCaptureTurns,
          source: rec.officialCaptureSource,
          terrain: rec.officialTerrainClass
        }))
      );
    }
    function recordBuyRecommendations(recommendations) {
      const now = performance.now();
      if (!recommendations.length || now - lastBuyRecommendationLoggedAt < 1e4) return;
      lastBuyRecommendationLoggedAt = now;
      roundLogger.record(
        "buy_recommendation",
        recommendations.map((rec) => ({
          label: rec.label,
          reason: rec.reason,
          actionKey: rec.actionKey,
          actionAvailable: !!rec.actionAvailable,
          estimatedCost: rec.estimatedCost || null,
          costSource: rec.costSource || null
        }))
      );
    }
  }

  // src/page-entry.js
  var payloadKey = window.__OFAT_PAGE_PAYLOAD__?.payloadKey || "__OFAT_PAGE_PAYLOAD__";
  startPage(window[payloadKey]);
})();
`;

  // src/meta.js
  var APP = Object.freeze({
    name: "OpenFront Tactical Assistant",
    shortName: "OF Tactical",
    version: "0.9.2",
    modified: "2026-06-17",
    storageKey: "ofat.settings.v1",
    pagePayloadKey: "__OFAT_PAGE_PAYLOAD__",
    messageSource: "openfront-tactical-assistant"
  });
  var USERSCRIPT_META = Object.freeze({
    name: [APP.name],
    namespace: ["https://github.com/local/openfront-script"],
    version: [APP.version],
    description: ["Modular OpenFront advisor toolkit with spawn, threat, expansion, alliance, and optional assist features."],
    license: ["MIT"],
    match: ["https://openfront.io/*", "https://beta.openfront.io/*"],
    grant: ["GM_setValue", "GM_getValue", "GM_registerMenuCommand", "unsafeWindow"],
    "run-at": ["document-start"],
    "inject-into": ["auto"]
  });
  var DEFAULT_SETTINGS = Object.freeze({
    settingsSchemaVersion: 13,
    showAdvisorPanel: true,
    showHeatmap: true,
    hideAds: true,
    autopilot: false,
    autoSpawn: false,
    autoAlliance: false,
    autoFarm: false,
    autoFarmHumanTargets: true,
    autoEco: false,
    autoDefense: false,
    autoDefenseCounterAttack: true,
    autoDefenseBuildPosts: true,
    autoDefenseBuildSam: true,
    autoDefenseIncomingRatio: 0.35,
    autoBoat: false,
    autoWeapons: false,
    autoWeaponsEarlyNuke: false,
    autoTeamSupport: true,
    autoTeamSupportGold: false,
    autoSosQuickChat: true,
    smartAttack: false,
    showAttackBadges: true,
    showRatioBar: true,
    showTroopRatios: true,
    showWeaknessIndicator: true,
    showDangerIndicator: true,
    showThreatIcons: true,
    showTroopEconomy: true,
    roundLogging: true,
    roundLogAutoDownload: false,
    roundLogSnapshotIntervalMs: 5e3,
    roundLogKeepPlayerNames: true,
    networkLogging: true,
    autoSpawnDelayMs: 2e3,
    autoFarmWindowMs: 24e4,
    autoFarmReserveRatio: 0.55,
    autoFarmCooldownMs: 2500,
    autoFarmDynamicReserve: true,
    autoFarmBaseReserveRatio: 0.3,
    autoFarmMinReserveRatio: 0.2,
    autoFarmMaxReserveRatio: 0.65,
    autoExpand: true,
    autoAttack: false,
    autoAttackIncludeMark: false,
    autoAttackCooldownMs: 3000,
    autoAttackAggression: 2,
    autoNukeStrike: false
  });

  // src/settings/settings-store.js
  function createSettingsStore(defaults, initialValues = {}) {
    const values = Object.assign({}, defaults, initialValues);
    const listeners = /* @__PURE__ */ new Set();
    function has(key) {
      return Object.prototype.hasOwnProperty.call(defaults, key);
    }
    return {
      values,
      has,
      get(key) {
        return has(key) ? values[key] : void 0;
      },
      set(key, value, meta = {}) {
        if (!has(key)) return false;
        if (values[key] === value) return true;
        values[key] = value;
        listeners.forEach((listener) => listener({ key, value, meta }));
        return true;
      },
      update(nextValues, meta = {}) {
        Object.keys(nextValues || {}).forEach((key) => this.set(key, nextValues[key], meta));
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      snapshot() {
        return Object.assign({}, values);
      }
    };
  }

  // src/bootstrap/gm-settings.js
  function createGmSettingsStore(defaults) {
    const initial = {};
    Object.keys(defaults).forEach((key) => {
      initial[key] = gmGet(key, defaults[key]);
    });
    applySettingsMigrations(initial, defaults);
    const store = createSettingsStore(defaults, initial);
    store.onChange(({ key, value, meta }) => {
      gmSet(key, value);
      if (!meta.skipPageSync && meta.pageWindow && meta.app) {
        meta.pageWindow.postMessage(
          {
            source: meta.app.messageSource,
            type: "set-setting",
            key,
            value
          },
          "*"
        );
      }
    });
    return store;
  }
  function applySettingsMigrations(initial, defaults) {
    const targetSchema = Number(defaults.settingsSchemaVersion) || 0;
    const currentSchema = Number(gmGet("settingsSchemaVersion", 0)) || 0;
    if (!targetSchema || currentSchema >= targetSchema) return;
    initial.roundLogAutoDownload = false;
    initial.settingsSchemaVersion = targetSchema;
    gmSet("roundLogAutoDownload", false);
    gmSet("settingsSchemaVersion", targetSchema);
  }
  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch (_) {
    }
    return fallback;
  }
  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") GM_setValue(key, value);
    } catch (_) {
    }
  }
  function registerToggleMenu(label, key, store, context) {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand(label, () => {
      store.set(key, !store.get(key), context);
      console.log(`[${context.app.shortName}] ${key}: ${store.get(key) ? "ON" : "OFF"}`);
    });
  }

  // src/bootstrap/page-injection.js
  function injectPageBundle(pageWindow, app, initialSettings, pageBundleSource) {
    const payloadKey = app.pagePayloadKey;
    pageWindow[payloadKey] = {
      appInfo: app,
      initialSettings,
      payloadKey
    };
    try {
      pageWindow.eval(pageBundleSource);
    } finally {
      try {
        delete pageWindow[payloadKey];
      } catch (_) {
        pageWindow[payloadKey] = void 0;
      }
    }
  }

  // src/shared/dom.js
  function appendWhenReady(node, parentSelector = "head") {
    const target = parentSelector === "body" ? document.body : document.head || document.documentElement;
    if (target) {
      target.appendChild(node);
      return;
    }
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        const parent = parentSelector === "body" ? document.body : document.head;
        parent.appendChild(node);
      },
      { once: true }
    );
  }
  function createStyle(id, css) {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    appendWhenReady(style);
    return style;
  }

  // src/shared/troops.js
  function formatTroopCount(troops) {
    const num = Number(troops) / 10;
    if (!Number.isFinite(num)) return "0";
    if (num >= 1e7) return `${(Math.floor(num / 1e5) / 10).toFixed(1)}M`;
    if (num >= 1e6) return `${(Math.floor(num / 1e4) / 100).toFixed(2)}M`;
    if (num >= 1e5) return `${Math.floor(num / 1e3)}K`;
    if (num >= 1e4) return `${(Math.floor(num / 100) / 10).toFixed(1)}K`;
    if (num >= 1e3) return `${(Math.floor(num / 10) / 100).toFixed(2)}K`;
    return Math.floor(num).toString();
  }

  // src/userscript/name-layer-enhancer.js
  var CURRENT_WEAKNESS_THRESHOLD = 0.1;
  var TOTAL_POTENTIAL_THRESHOLD = 0.3;
  var DANGER_THRESHOLD = 1.35;
  var ATOM_COST = 75e4;
  var HYDROGEN_COST = 5e6;
  var ATOM_ICON = "[A]";
  var HYDROGEN_ICON = "[H]";
  function installNameLayerEnhancer({ app, settings, syncContext }) {
    let game = null;
    let nameLayerContainer = null;
    let farmRecommendations = /* @__PURE__ */ new Map();
    installEnhancerStyles();
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("刷新 OpenFront UI 叠加层", refreshAllTroopDisplays);
      GM_registerMenuCommand("禁用所有自动化", () => {
        settings.set("autopilot", false, syncContext);
        settings.set("autoSpawn", false, syncContext);
        settings.set("autoFarm", false, syncContext);
        settings.set("autoAlliance", false, syncContext);
        settings.set("smartAttack", false, syncContext);
      });
    }
    settings.onChange(refreshAllTroopDisplays);
    window.addEventListener("message", (event) => {
      const data = event && event.data;
      if (!data || data.source !== app.messageSource || data.type !== "farm-recommendations") return;
      farmRecommendations = new Map((data.recommendations || []).map((rec) => [rec.id, rec]));
      refreshAllTroopDisplays();
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", waitForGame, { once: true });
    } else {
      waitForGame();
    }
    console.log(`%c[${app.shortName}] UI enhancer loaded`, "color:#4fc3f7;font-weight:bold");
    function waitForGame() {
      try {
        const pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        const leaderboard = pageWin.document.querySelector("leader-board");
        if (leaderboard && leaderboard.game) {
          game = leaderboard.game;
          findNameLayerContainer();
        } else {
          setTimeout(waitForGame, 1e3);
        }
      } catch (error) {
        console.error(`[${app.shortName}] waitForGame failed`, error);
      }
    }
    function findNameLayerContainer() {
      try {
        const selector = 'div[style*="position: fixed"][style*="left: 50%"][style*="top: 50%"][style*="pointer-events: none"][style*="z-index: 2"]';
        const containers = document.querySelectorAll(selector);
        if (containers.length > 0) {
          nameLayerContainer = containers[0];
          setupObservers();
        } else {
          setTimeout(findNameLayerContainer, 1e3);
        }
      } catch (error) {
        console.error(`[${app.shortName}] findNameLayerContainer failed`, error);
      }
    }
    function setupObservers() {
      const containerObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const troopsDiv = node.querySelector(".player-troops");
            if (troopsDiv) setupTroopObserver(troopsDiv);
          });
        });
      });
      containerObserver.observe(nameLayerContainer, { childList: true, subtree: true });
      nameLayerContainer.querySelectorAll(".player-troops").forEach(setupTroopObserver);
    }
    function setupTroopObserver(troopsDiv) {
      if (troopsDiv._ofatObserver) return;
      const observer = new MutationObserver(() => {
        if (troopsDiv.textContent && troopsDiv.textContent.indexOf("/") === -1) updateTroopDisplay(troopsDiv);
      });
      observer.observe(troopsDiv, { childList: true, characterData: true, subtree: true });
      troopsDiv._ofatObserver = observer;
      updateTroopDisplay(troopsDiv);
    }
    function refreshAllTroopDisplays() {
      if (!nameLayerContainer) return;
      nameLayerContainer.querySelectorAll(".player-troops").forEach(updateTroopDisplay);
    }
    function updateTroopDisplay(troopsDiv) {
      if (!game || !troopsDiv) return;
      const element = troopsDiv.parentElement;
      if (!element) return;
      const nameSpan = element.querySelector(".player-name-span");
      if (!nameSpan) return;
      const playerName = getBasePlayerName(nameSpan);
      const player = findPlayerByName(playerName);
      if (!player) return;
      const observer = troopsDiv._ofatObserver;
      if (observer) observer.disconnect();
      try {
        const currentTroops = Number(player.troops());
        const maxTroops = Number(game.config().maxTroops(player));
        const attackingTroops = getOutgoingAttackTroops(player);
        if (!Number.isFinite(currentTroops) || !Number.isFinite(maxTroops) || !Number.isFinite(attackingTroops)) return;
        renderTroopText(troopsDiv, currentTroops, maxTroops);
        renderRatioBar(element, player, currentTroops, maxTroops, attackingTroops);
        renderRiskState(troopsDiv, player, currentTroops, maxTroops, attackingTroops);
        renderThreatIcon(nameSpan, playerName, player);
        renderFarmBadge(nameSpan, player);
      } catch (error) {
        console.error(`[${app.shortName}] updateTroopDisplay failed`, error);
      } finally {
        if (observer) observer.observe(troopsDiv, { childList: true, characterData: true, subtree: true });
      }
    }
    function cleanPlayerName(text) {
      return String(text || "").replace(ATOM_ICON, "").replace(HYDROGEN_ICON, "").replace(/\b(?:FARM\s+\d+%|TARGET\s+\d+%|MARK|WAIT|DANGER|HOLD)\b/g, "").trim();
    }
    function getBasePlayerName(nameSpan) {
      const textNode = Array.from(nameSpan.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      return cleanPlayerName(textNode ? textNode.textContent : nameSpan.textContent);
    }
    function findPlayerByName(playerName) {
      const players = typeof game.playerViews === "function" ? game.playerViews() : [];
      return players.find((player) => {
        if (!player || typeof player.isAlive === "function" && !player.isAlive()) return false;
        const name = typeof player.name === "function" ? player.name() : "";
        const displayName = typeof player.displayName === "function" ? player.displayName() : "";
        return name === playerName || displayName === playerName;
      });
    }
    function getOutgoingAttackTroops(player) {
      if (typeof player.outgoingAttacks !== "function") return 0;
      return player.outgoingAttacks().reduce((sum, attack) => sum + (attack.retreating ? 0 : Number(attack.troops || 0)), 0);
    }
    function renderTroopText(troopsDiv, currentTroops, maxTroops) {
      troopsDiv.textContent = "";
      troopsDiv.appendChild(document.createTextNode(formatTroopCount(currentTroops)));
      if (settings.get("showTroopRatios")) {
        const maxSpan = document.createElement("span");
        maxSpan.className = "ofat-max-troops";
        maxSpan.textContent = `/${formatTroopCount(maxTroops)}`;
        troopsDiv.appendChild(maxSpan);
      }
    }
    function renderRatioBar(element, player, currentTroops, maxTroops, attackingTroops) {
      let ratioBar = element.querySelector(".ofat-troop-ratio-bar");
      if (!ratioBar) {
        ratioBar = document.createElement("div");
        ratioBar.className = "ofat-troop-ratio-bar";
        ratioBar.appendChild(Object.assign(document.createElement("div"), { className: "ofat-ratio-fill" }));
        ratioBar.appendChild(Object.assign(document.createElement("div"), { className: "ofat-ratio-buffer" }));
        element.appendChild(ratioBar);
      }
      const fill = ratioBar.querySelector(".ofat-ratio-fill");
      const buffer = ratioBar.querySelector(".ofat-ratio-buffer");
      const isBot = getPlayerType(player) === "BOT";
      if (!settings.get("showRatioBar") || isBot) {
        ratioBar.style.display = "none";
        return;
      }
      ratioBar.style.display = "";
      const totalPotential = currentTroops + attackingTroops;
      const totalRatio = maxTroops > 0 ? Math.min(totalPotential / maxTroops, 1) : 0;
      const mainRatio = attackingTroops === 0 ? 1 : totalPotential > 0 ? currentTroops / totalPotential : 0;
      const bufferRatio = attackingTroops === 0 ? 0 : totalPotential > 0 ? attackingTroops / totalPotential : 0;
      const mainWidth = mainRatio * totalRatio * 100;
      const bufferWidth = bufferRatio * totalRatio * 100;
      fill.style.width = `${mainWidth}%`;
      buffer.style.width = `${bufferWidth}%`;
      buffer.style.left = `${mainWidth}%`;
    }
    function renderRiskState(troopsDiv, player, currentTroops, maxTroops, attackingTroops) {
      const myPlayer = typeof game.myPlayer === "function" ? game.myPlayer() : null;
      troopsDiv.classList.remove("ofat-flashing-orange");
      troopsDiv.style.color = "";
      if (!myPlayer || player.id() === myPlayer.id()) return;
      const myTroops = Number(myPlayer.troops());
      if (!Number.isFinite(myTroops) || myTroops <= 0) return;
      const dangerRatio = currentTroops / myTroops;
      const sameTeam = isSameTeamMode() && typeof player.isOnSameTeam === "function" && player.isOnSameTeam(myPlayer);
      if (settings.get("showWeaknessIndicator") && currentTroops <= CURRENT_WEAKNESS_THRESHOLD * maxTroops && currentTroops + attackingTroops < TOTAL_POTENTIAL_THRESHOLD * maxTroops) {
        troopsDiv.classList.add("ofat-flashing-orange");
      } else if (settings.get("showDangerIndicator") && dangerRatio >= DANGER_THRESHOLD && !sameTeam) {
        troopsDiv.style.color = "red";
      }
    }
    function renderThreatIcon(nameSpan, playerName, player) {
      nameSpan.textContent = playerName;
      if (!settings.get("showThreatIcons")) return;
      const myPlayer = typeof game.myPlayer === "function" ? game.myPlayer() : null;
      if (myPlayer && player.id() === myPlayer.id()) return;
      const icon = getThreatIcon(player);
      if (!icon) return;
      const span = document.createElement("span");
      span.className = "ofat-threat-icon";
      span.textContent = icon;
      nameSpan.appendChild(span);
    }
    function renderFarmBadge(nameSpan, player) {
      if (!settings.get("showAttackBadges")) return;
      const playerID = typeof player.id === "function" ? player.id() : null;
      const rec = playerID ? farmRecommendations.get(playerID) : null;
      if (!rec || !rec.label) return;
      const span = document.createElement("span");
      span.className = `ofat-farm-badge ofat-farm-badge-${rec.status || "hold"}`;
      span.textContent = rec.label;
      span.title = rec.reason || "";
      nameSpan.appendChild(span);
    }
    function getThreatIcon(player) {
      const hasSilo = typeof player.units === "function" && Array.isArray(player.units("Missile Silo")) && player.units("Missile Silo").length > 0;
      if (!hasSilo) return "";
      const gold = Number(typeof player.gold === "function" ? player.gold() : 0);
      if (gold >= HYDROGEN_COST) return HYDROGEN_ICON;
      if (gold >= ATOM_COST) return ATOM_ICON;
      return "";
    }
    function getPlayerType(player) {
      try {
        return String(typeof player.type === "function" ? player.type() : "").toUpperCase();
      } catch (_) {
        return "";
      }
    }
    function isSameTeamMode() {
      try {
        const config = game.config().gameConfig();
        return config && config.gameMode === "Team";
      } catch (_) {
        return false;
      }
    }
  }
  function installEnhancerStyles() {
    createStyle(
      "ofat-name-layer-style",
      `
      .ofat-flashing-orange { color: #fff !important; animation: ofat-flash 0.2s infinite; }
      @keyframes ofat-flash { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.68; } }
      .player-name-span, .player-troops {
        color: #000;
        text-shadow: 0 0 0.1em #fff;
        font-weight: 600;
      }
      .ofat-max-troops {
        font-size: 0.68em;
        color: rgba(0,0,0,0.82);
        text-shadow: 0 0 0.1em #fff;
      }
      .ofat-troop-ratio-bar {
        width: 32px;
        height: 4px;
        background: rgba(34,34,34,0.5);
        position: relative;
        border: 1px solid rgba(68,68,68,0.6);
        overflow: hidden;
      }
      .ofat-ratio-fill, .ofat-ratio-buffer { height: 100%; position: absolute; top: 0; }
      .ofat-ratio-fill { background: rgba(0, 210, 82, 0.74); }
      .ofat-ratio-buffer { background: rgba(255, 166, 0, 0.52); }
      .ofat-threat-icon { font-size: 0.72em; opacity: 0.72; margin-left: 2px; }
      .ofat-farm-badge {
        display: inline-block;
        margin-left: 3px;
        padding: 1px 3px;
        color: #05070a;
        border-radius: 3px;
        font-size: 0.62em;
        font-weight: 800;
        text-shadow: none;
        vertical-align: middle;
      }
      .ofat-farm-badge-farm { background: rgba(77, 224, 117, 0.9); }
      .ofat-farm-badge-target { background: rgba(83, 181, 255, 0.92); }
      .ofat-farm-badge-mark { background: rgba(255, 190, 72, 0.92); }
      .ofat-farm-badge-wait { background: rgba(190, 198, 210, 0.86); }
      .ofat-farm-badge-danger { background: rgba(255, 80, 80, 0.92); color: #fff; }
      .ofat-farm-badge-hold { background: rgba(190, 198, 210, 0.86); }
    `
    );
  }

  // src/main.js
  (function bootstrapUserscriptContext() {
    "use strict";
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const settings = createGmSettingsStore(DEFAULT_SETTINGS);
    const syncContext = { app: APP, pageWindow };
    registerToggleMenu("切换 隐藏广告", "hideAds", settings, syncContext);
    registerToggleMenu("切换 顾问面板", "showAdvisorPanel", settings, syncContext);
    registerToggleMenu("切换 出生热力图", "showHeatmap", settings, syncContext);
    registerToggleMenu("切换 自动驾驶", "autopilot", settings, syncContext);
    registerToggleMenu("切换 自动出生", "autoSpawn", settings, syncContext);
    registerToggleMenu("切换 自动农场", "autoFarm", settings, syncContext);
    registerToggleMenu("切换 农场人类目标", "autoFarmHumanTargets", settings, syncContext);
    registerToggleMenu("切换 自动进攻", "autoAttack", settings, syncContext);
    registerToggleMenu("切换 自动经济", "autoEco", settings, syncContext);
    registerToggleMenu("切换 自动防御", "autoDefense", settings, syncContext);
    registerToggleMenu("切换 自动登船", "autoBoat", settings, syncContext);
    registerToggleMenu("切换 自动武器", "autoWeapons", settings, syncContext);
    registerToggleMenu("切换 提前核弹(代替SAM)", "autoWeaponsEarlyNuke", settings, syncContext);
    registerToggleMenu("切换 SAM饱和+H弹打击", "autoNukeStrike", settings, syncContext);
    registerToggleMenu("切换 自动结盟", "autoAlliance", settings, syncContext);
    registerToggleMenu("切换 智能进攻比例", "smartAttack", settings, syncContext);
    registerToggleMenu("切换 攻击标记", "showAttackBadges", settings, syncContext);
    registerToggleMenu("切换 兵力比例条", "showRatioBar", settings, syncContext);
    registerToggleMenu("切换 最大兵力文字", "showTroopRatios", settings, syncContext);
    registerToggleMenu("切换 弱点指示器", "showWeaknessIndicator", settings, syncContext);
    registerToggleMenu("切换 危险指示器", "showDangerIndicator", settings, syncContext);
    registerToggleMenu("切换 威胁图标", "showThreatIcons", settings, syncContext);
    registerToggleMenu("切换 经济面板", "showTroopEconomy", settings, syncContext);
    registerToggleMenu("切换 回合日志", "roundLogging", settings, syncContext);
    registerToggleMenu("切换 自动下载日志", "roundLogAutoDownload", settings, syncContext);
    registerToggleMenu("切换 网络日志", "networkLogging", settings, syncContext);
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("导出当前回合日志", () => {
        pageWindow.postMessage({ source: APP.messageSource, type: "export-round-log" }, "*");
      });
      GM_registerMenuCommand("清空当前回合日志", () => {
        pageWindow.postMessage({ source: APP.messageSource, type: "clear-round-log" }, "*");
      });
    }
    window.addEventListener("message", (event) => {
      const data = event && event.data;
      if (!data || data.source !== APP.messageSource || data.type !== "setting-changed") return;
      settings.set(data.key, data.value, { skipPageSync: true });
    });
    injectPageBundle(pageWindow, APP, settings.snapshot(), PAGE_BUNDLE_SOURCE);
    installNameLayerEnhancer({ app: APP, settings, syncContext });
  })();
})();

