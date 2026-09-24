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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const domRegistry = {
  tilesByKey: new Map(),
  allTiles: [],
};

const elementById = {
  grid: createStubElement(),
  tileTemplate: createStubElement(),
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
  pauseAllFeeds,
  frameLoadRecoveryTimers,
  FRAME_LOAD_CONFIRMATION_TIMEOUT_MS,
};`,
  sandbox,
  { filename: "app.js" },
);

const {
  channels,
  switchFrameVideo,
  handleYouTubePlayerMessage,
  pauseAllFeeds,
  frameLoadRecoveryTimers,
  FRAME_LOAD_CONFIRMATION_TIMEOUT_MS,
} = sandbox.module.exports;

function createFakeTile(channelKey) {
  const classNames = new Set();
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
      postMessage() {},
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
  return { tile, frame, playerWrap };
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
const { frame, playerWrap } = registerTile(primaryChannel.key);

switchFrameVideo(frame, firstVideoId, { forceReload: true });
assert(playerWrap.dataset.playerStatus === "loading", "initial switch should mark loading");
assert(frame.dataset.expectedVideoId === firstVideoId, "initial switch should track expected video");
assert(
  frame.src.includes(`tvq_reload=load-1`),
  "force reload should include a fresh embed token",
);
assert(
  timers.get(frameLoadRecoveryTimers[primaryChannel.key])?.delay ===
    FRAME_LOAD_CONFIRMATION_TIMEOUT_MS,
  "initial switch should schedule a watchdog timeout",
);

const firstTimeout = timers.get(frameLoadRecoveryTimers[primaryChannel.key]);
firstTimeout.fn();
assert(frame.dataset.loadRetryCount === "1", "first timeout should trigger exactly one retry");
assert(
  frame.src.includes(`tvq_reload=retry-1-1`),
  "retry should reload with a fresh embed URL",
);
assert(playerWrap.dataset.playerStatus === "loading", "retry should remain in loading state");

const secondTimeout = timers.get(frameLoadRecoveryTimers[primaryChannel.key]);
secondTimeout.fn();
assert(
  playerWrap.dataset.playerStatus === "error",
  "second timeout should stop retrying and mark the frame as error",
);
assert(frame.dataset.expectedVideoId === "", "terminal timeout should clear expected video state");

switchFrameVideo(frame, firstVideoId, { forceReload: true });
handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: frame.contentWindow,
  data: JSON.stringify({
    event: "onReady",
    info: {
      videoData: {
        video_id: firstVideoId,
      },
    },
  }),
});
assert(playerWrap.dataset.playerStatus === "ready", "onReady should confirm the frame");
assert(frame.dataset.expectedVideoId === "", "successful confirmation should clear expected video");
assert(
  frameLoadRecoveryTimers[primaryChannel.key] === null,
  "successful confirmation should cancel the watchdog",
);

switchFrameVideo(frame, firstVideoId, { forceReload: true });
const staleTimeout = timers.get(frameLoadRecoveryTimers[primaryChannel.key]);
switchFrameVideo(frame, secondVideoId, { forceReload: true });
staleTimeout.fn();
assert(
  frame.dataset.currentVideoId === secondVideoId,
  "stale timeout must not revert the frame to a previous video",
);
assert(
  frame.dataset.loadRetryCount === "0",
  "stale timeout must not consume the retry budget for a newer generation",
);

switchFrameVideo(frame, firstVideoId, { forceReload: true });
handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: frame.contentWindow,
  data: JSON.stringify({
    event: "onError",
    info: 100,
  }),
});
assert(
  playerWrap.dataset.playerStatus === "error",
  "terminal YouTube errors should mark the frame as error immediately",
);
assert(
  frameLoadRecoveryTimers[primaryChannel.key] === null,
  "terminal YouTube errors should cancel the watchdog",
);

switchFrameVideo(frame, firstVideoId, { forceReload: true });
pauseAllFeeds();
assert(frame.src === "about:blank", "pausing should unload the iframe");
assert(playerWrap.dataset.playerStatus === "paused", "pausing should mark the frame as paused");
assert(frame.dataset.expectedVideoId === "", "pausing should clear pending expected video state");
assert(
  frameLoadRecoveryTimers[primaryChannel.key] === null,
  "pausing should clear outstanding watchdog timers",
);

console.log("Validated per-tile load watchdog retries, confirmation, stale-generation safety, terminal error handling, and pause cleanup.");
