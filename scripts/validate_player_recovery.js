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
  applyActiveChannel,
  pauseAllFeeds,
  frameLoadRecoveryTimers,
  FRAME_LOAD_CONFIRMATION_TIMEOUT_MS,
} = sandbox.module.exports;

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
const { frame, playerWrap, commands } = registerTile(primaryChannel.key);

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

const initialSrc = frame.src;
const firstTimeout = timers.get(frameLoadRecoveryTimers[primaryChannel.key]);
firstTimeout.fn();
assert(frame.src === initialSrc, "inactive startup timeout should not force a background reload");
assert(frame.dataset.expectedVideoId === "", "inactive startup timeout should clear pending expected video");
assert(
  playerWrap.dataset.playerStatus === undefined,
  "inactive startup timeout should keep the frame visible instead of marking it errored",
);

applyActiveChannel(0, true);
assert(
  frame.src.includes(`tvq_reload=load-2`),
  "activating an unconfirmed tile should force a fresh foreground reload",
);

const activeTimeout = timers.get(frameLoadRecoveryTimers[primaryChannel.key]);
activeTimeout.fn();
assert(frame.dataset.loadRetryCount === "1", "active timeout should trigger exactly one retry");
assert(
  frame.src.includes(`tvq_reload=retry-2-1`),
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

commands.length = 0;
switchFrameVideo(frame, firstVideoId, { forceReload: true });
const preReadySwitchSrc = frame.src;
switchFrameVideo(frame, secondVideoId);
assert(
  frame.src !== preReadySwitchSrc && frame.src.includes(`/embed/${secondVideoId}`),
  "pre-ready switches should refresh the iframe src instead of relying on a dropped loadVideoById command",
);
assert(commands.length === 0, "pre-ready switches should not send loadVideoById before confirmation");

handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: frame.contentWindow,
  data: JSON.stringify({
    info: {
      playerState: 5,
      videoData: {
        video_id: secondVideoId,
      },
    },
  }),
});
assert(playerWrap.dataset.playerStatus === "ready", "playerState=5 should confirm a loaded frame");
assert(
  frameLoadRecoveryTimers[primaryChannel.key] === null,
  "playerState=5 confirmation should cancel the watchdog",
);

commands.length = 0;
switchFrameVideo(frame, firstVideoId);
assert(
  commands.some((command) => command.func === "loadVideoById" && command.args?.[0] === firstVideoId),
  "ready frames should continue using loadVideoById for normal in-place switches",
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

console.log(
  "Validated per-tile load watchdog retries, confirmation, pre-ready reload fallback, ready-state loadVideoById switching, stale-generation safety, terminal error handling, and pause cleanup.",
);
