#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const appPath = path.join(repoRoot, "app.js");
const appSource = fs
  .readFileSync(appPath, "utf8")
  .replace(/\ninit\(\);\s*$/, "\n");

const timers = new Map();
let nextTimerId = 1;

function createStyleStore() {
  const values = {};
  return {
    values,
    setProperty(name, value) {
      values[name] = value;
    },
    removeProperty(name) {
      delete values[name];
    },
  };
}

function createStubElement() {
  return {
    hidden: false,
    textContent: "",
    dataset: {},
    style: createStyleStore(),
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
  };
}

const domRegistry = {
  tilesByKey: new Map(),
  allTiles: [],
};

const templateStub = createStubElement();
templateStub.content = {
  firstElementChild: {
    cloneNode() {
      throw new Error("buildTile() is not used by this validator");
    },
  },
};

const elementById = {
  grid: createStubElement(),
  tileTemplate: templateStub,
  statusText: createStubElement(),
  protocolWarning: createStubElement(),
  rotationCountdown: createStubElement(),
  nextAudioBtn: createStubElement(),
  muteAllBtn: createStubElement(),
  pauseFeedsBtn: createStubElement(),
};

const documentStub = {
  getElementById(id) {
    return elementById[id] ?? createStubElement();
  },
  querySelector(selector) {
    const tileMatch = selector.match(/^\.tile\[data-channel-key="([^"]+)"\]$/);
    if (tileMatch) {
      return domRegistry.tilesByKey.get(tileMatch[1]) ?? null;
    }
    const frameMatch = selector.match(
      /^\.tile\[data-channel-key="([^"]+)"\] \.playerFrame$/,
    );
    if (frameMatch) {
      return domRegistry.tilesByKey.get(frameMatch[1])?.querySelector(".playerFrame") ?? null;
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === ".tile") {
      return [...domRegistry.allTiles];
    }
    if (selector === ".playerFrame") {
      return domRegistry.allTiles.map((tile) => tile.querySelector(".playerFrame"));
    }
    if (selector === ".playerWrap") {
      return domRegistry.allTiles.map((tile) => tile.querySelector(".playerWrap"));
    }
    return [];
  },
  addEventListener() {},
};

const sandbox = {
  console,
  Math,
  Date,
  Intl,
  URLSearchParams,
  document: documentStub,
  window: {
    location: {
      protocol: "http:",
      origin: "http://localhost:8080",
    },
    addEventListener() {},
    removeEventListener() {},
  },
  ResizeObserver: function ResizeObserver() {
    return {
      observe() {},
      disconnect() {},
    };
  },
  setTimeout(fn, delay) {
    const id = nextTimerId++;
    timers.set(id, { type: "timeout", fn, delay });
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  setInterval(fn, delay) {
    const id = nextTimerId++;
    timers.set(id, { type: "interval", fn, delay });
    return id;
  },
  clearInterval(id) {
    timers.delete(id);
  },
  module: { exports: {} },
  exports: {},
};
sandbox.window.document = sandbox.document;

vm.runInNewContext(
  `${appSource}
module.exports = {
  channels,
  switchFrameVideo,
  handleYouTubePlayerMessage,
  applyActiveChannel,
  pauseAllFeeds,
};`,
  sandbox,
  { filename: "app.js" },
);

const {
  channels,
  switchFrameVideo,
  handleYouTubePlayerMessage,
  applyActiveChannel,
  pauseAllFeeds,
} = sandbox.module.exports;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createFakeTile(channelKey) {
  const classNames = new Set();
  const commands = [];
  const playerWrap = {
    dataset: {},
    style: createStyleStore(),
    clientWidth: 1600,
    clientHeight: 900,
    querySelector(selector) {
      if (selector === ".playerFrame") {
        return frame;
      }
      return null;
    },
  };
  const frame = {
    dataset: { channelKey },
    title: "",
    src: "about:blank",
    style: createStyleStore(),
    contentWindow: {
      postMessage(message) {
        commands.push(JSON.parse(message));
      },
    },
    closest(selector) {
      if (selector === ".playerWrap") {
        return playerWrap;
      }
      return null;
    },
  };
  const badge = createStubElement();
  const tile = {
    dataset: { channelKey },
    classList: {
      add(name) {
        classNames.add(name);
      },
      remove(name) {
        classNames.delete(name);
      },
      toggle(name, force) {
        if (force === undefined) {
          if (classNames.has(name)) {
            classNames.delete(name);
          } else {
            classNames.add(name);
          }
          return;
        }
        if (force) {
          classNames.add(name);
        } else {
          classNames.delete(name);
        }
      },
      contains(name) {
        return classNames.has(name);
      },
    },
    querySelector(selector) {
      const map = {
        ".playerFrame": frame,
        ".playerWrap": playerWrap,
        ".audioBadge": badge,
      };
      return map[selector] ?? createStubElement();
    },
  };
  badge.closest = (selector) => (selector === ".tile" ? tile : null);
  return { tile, frame, playerWrap, commands };
}

function registerTile(channelKey) {
  const fake = createFakeTile(channelKey);
  domRegistry.tilesByKey.set(channelKey, fake.tile);
  domRegistry.allTiles.push(fake.tile);
  return fake;
}

const primaryChannel = channels[0];
assert(primaryChannel?.variants?.length >= 2, "expected a multi-variant channel");
const firstVideoId = primaryChannel.variants[0].videoId;
const secondVideoId = primaryChannel.variants[1].videoId;
const { tile, frame, playerWrap, commands } = registerTile(primaryChannel.key);

switchFrameVideo(frame, firstVideoId, { forceReload: true });
assert(
  frame.src.includes(`/embed/${firstVideoId}`),
  "force reload should load the expected YouTube embed",
);
assert(
  !frame.src.includes("tvq_reload="),
  "restored startup flow should not append recovery reload tokens",
);
assert(
  frame.dataset.expectedVideoId === firstVideoId,
  "initial switch should still track the expected video",
);
assert(
  playerWrap.dataset.playerStatus === undefined,
  "restored startup flow should not hide frames behind player status transitions",
);

const initialSrc = frame.src;
applyActiveChannel(0, true);
assert(
  frame.src === initialSrc,
  "activating an unconfirmed tile should not force a second iframe reload",
);
assert(tile.classList.contains("active"), "activating a tile should mark it active");
assert(
  commands.some((command) => command.func === "unMute"),
  "activating a tile should still request audio playback",
);

commands.length = 0;
switchFrameVideo(frame, secondVideoId);
assert(
  commands.some(
    (command) => command.func === "loadVideoById" && command.args?.[0] === secondVideoId,
  ),
  "restored switching should continue using loadVideoById for in-place variant changes",
);
assert(
  frame.src === initialSrc,
  "in-place variant switching should avoid reloading the iframe src",
);

handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: frame.contentWindow,
  data: JSON.stringify({
    info: {
      videoData: {
        video_id: secondVideoId,
      },
    },
  }),
});
assert(
  frame.dataset.expectedVideoId === "",
  "matching player metadata should clear pending expected video state",
);

pauseAllFeeds();
assert(frame.src === "about:blank", "pausing should still unload the iframe");
assert(
  playerWrap.dataset.playerStatus === undefined,
  "pausing should not depend on hidden-frame player status markers",
);

console.log(
  "Validated restored non-watchdog startup flow, in-place switching, message sync, and pause cleanup.",
);
