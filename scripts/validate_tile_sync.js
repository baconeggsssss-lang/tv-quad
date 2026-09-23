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
  sourceDefinitions,
  channels,
  variantIndices,
  audioVariantPointers,
  getCurrentVariant,
  syncTilePresentation,
  handleYouTubePlayerMessage,
  renderVariantTile,
  switchVariant,
  advanceVariantOnAutoRotation,
  reloadAllFeedsFresh,
  pauseAllFeeds,
  resumeAllFeedsFresh,
};`,
  sandbox,
  { filename: "app.js" },
);

const {
  sourceDefinitions,
  channels,
  variantIndices,
  audioVariantPointers,
  getCurrentVariant,
  syncTilePresentation,
  handleYouTubePlayerMessage,
  renderVariantTile,
  switchVariant,
  advanceVariantOnAutoRotation,
  reloadAllFeedsFresh,
  pauseAllFeeds,
  resumeAllFeedsFresh,
} = sandbox.module.exports;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createFakeTile(channelKey) {
  const classNames = new Set();
  const channelName = createStubElement();
  const regionClock = createStubElement();
  regionClock.hidden = true;
  const variantCountdown = createStubElement();
  const sourceInlineSwitch = createStubElement();
  const audioStatusText = createStubElement();
  const channelMain = {
    scrollWidth: 100,
    clientWidth: 400,
  };
  const playerWrap = {
    clientWidth: 1600,
    clientHeight: 900,
    style: createStyleStore(),
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
    src: "https://www.youtube.com/embed/bootstrap",
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
  const headerBtn = createStubElement();
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
        ".tileHeader": headerBtn,
        ".channelMain": channelMain,
        ".channelName": channelName,
        ".regionClock": regionClock,
        ".variantCountdown": variantCountdown,
        ".sourceInlineSwitch": sourceInlineSwitch,
        ".playerFrame": frame,
        ".playerWrap": playerWrap,
        ".audioBadge": badge,
        ".audioStatusText": audioStatusText,
      };
      return map[selector] ?? null;
    },
  };
  badge.closest = (selector) => (selector === ".tile" ? tile : null);
  return { tile, frame, playerWrap, channelName, regionClock };
}

function registerTile(channel) {
  const fake = createFakeTile(channel.key);
  domRegistry.tilesByKey.set(channel.key, fake.tile);
  domRegistry.allTiles.push(fake.tile);
  return fake;
}

function getTileParts(channelKey) {
  const tile = domRegistry.tilesByKey.get(channelKey);
  return {
    tile,
    frame: tile.querySelector(".playerFrame"),
    playerWrap: tile.querySelector(".playerWrap"),
    channelName: tile.querySelector(".channelName"),
    regionClock: tile.querySelector(".regionClock"),
  };
}

function assertPresentation(channelKey, expectedSource, context) {
  const { tile, frame, playerWrap, channelName, regionClock } =
    getTileParts(channelKey);
  assert(channelName.textContent === expectedSource.name, `${context}: title mismatch`);
  assert(frame.title === `${expectedSource.name} Live`, `${context}: frame title mismatch`);
  assert(
    frame.dataset.currentVideoId === expectedSource.videoId,
    `${context}: video id mismatch`,
  );
  assert(tile.dataset.flag === expectedSource.flagKey, `${context}: flag mismatch`);
  assert(regionClock.hidden === false, `${context}: region clock should be visible`);
  assert(
    regionClock.textContent.startsWith(`${expectedSource.regionLabel} `),
    `${context}: region clock mismatch`,
  );
  assert(
    playerWrap.style.values["--player-thumbnail"]?.includes(expectedSource.videoId),
    `${context}: thumbnail mismatch`,
  );
}

channels.forEach((channel) => {
  registerTile(channel);
  if (channel.variants?.length) {
    variantIndices[channel.key] = 0;
    audioVariantPointers[channel.key] = 0;
    syncTilePresentation(domRegistry.tilesByKey.get(channel.key), channel, channel.variants[0], {
      syncVideo: true,
      forceReload: true,
    });
  } else {
    syncTilePresentation(domRegistry.tilesByKey.get(channel.key), channel, channel, {
      syncVideo: true,
      forceReload: true,
    });
  }
});

const expectedFlags = new Map([
  ["Al Jazeera English", "qa"],
  ["TRT World", "tr"],
  ["Arise News", "ng"],
  ["DW News", "de"],
  ["FRANCE 24", "fr"],
  ["CNA", "sg"],
  ["NTN24", "co"],
  ["TN", "ar"],
  ["CNN", "us"],
  ["Bloomberg Business News", "us"],
  ["ABC News Australia", "au"],
  ["CBC News", "ca"],
  ["RTVE 24H", "es"],
  ["Africanews English", "cg"],
  ["Euronews English", "eu"],
  ["CCTV13", "cn"],
  ["Phoenix InfoNews", "hk"],
  ["WION LIVE", "in"],
  ["GB News", "gb"],
  ["Sky News", "gb"],
  ["Arirang TV", "kr"],
  ["NHK WORLD-JAPAN", "jp"],
  ["ABC News", "us"],
  ["CGTN", "cn"],
]);

assert(sourceDefinitions.length === expectedFlags.size, "unexpected source definition count");
sourceDefinitions.forEach((source) => {
  assert(
    expectedFlags.get(source.name) === source.flagKey,
    `source flag mapping mismatch for ${source.name}`,
  );
});

channels.forEach((channel) => {
  channel.variants.forEach((variant, index) => {
    variantIndices[channel.key] = index;
    renderVariantTile(channel.key);
    assertPresentation(channel.key, variant, `render ${channel.key} -> ${variant.name}`);
  });
});

const rapidSwitchChannel = channels.find((channel) => channel.variants.length > 1);
assert(rapidSwitchChannel, "expected at least one multi-variant channel");
variantIndices[rapidSwitchChannel.key] = 0;
renderVariantTile(rapidSwitchChannel.key);
const staleVariant = getCurrentVariant(rapidSwitchChannel.key);
switchVariant(rapidSwitchChannel.key, true);
const currentVariant = getCurrentVariant(rapidSwitchChannel.key);
const rapidFrame = getTileParts(rapidSwitchChannel.key).frame;
assertPresentation(
  rapidSwitchChannel.key,
  currentVariant,
  "rapid switch current presentation",
);
handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: rapidFrame.contentWindow,
  data: JSON.stringify({ info: { videoData: { video_id: staleVariant.videoId } } }),
});
assertPresentation(
  rapidSwitchChannel.key,
  currentVariant,
  "stale message should not rollback presentation",
);
assert(
  variantIndices[rapidSwitchChannel.key] ===
    rapidSwitchChannel.variants.indexOf(currentVariant),
  "stale message should not rollback variant index",
);
handleYouTubePlayerMessage({
  origin: "https://www.youtube.com",
  source: rapidFrame.contentWindow,
  data: JSON.stringify({ info: { videoData: { video_id: currentVariant.videoId } } }),
});
assert(rapidFrame.dataset.expectedVideoId === "", "current message should clear expected video id");

audioVariantPointers[rapidSwitchChannel.key] = 0;
for (let index = 0; index < rapidSwitchChannel.variants.length * 2; index += 1) {
  const expectedVariant =
    rapidSwitchChannel.variants[
      index % rapidSwitchChannel.variants.length
    ];
  advanceVariantOnAutoRotation(rapidSwitchChannel.key);
  assertPresentation(
    rapidSwitchChannel.key,
    expectedVariant,
    `auto rotation ${index + 1}`,
  );
}

const invalidFlagChannel = {
  key: "invalid-flag",
  name: "No Flag Channel",
  videoId: "no-flag-video",
  regionLabel: "Nowhere",
  timeZone: "UTC",
};
const invalidFlagTile = createFakeTile(invalidFlagChannel.key).tile;
invalidFlagTile.dataset.flag = "gb";
syncTilePresentation(invalidFlagTile, invalidFlagChannel, invalidFlagChannel);
assert(
  !("flag" in invalidFlagTile.dataset),
  "syncTilePresentation should clear stale flags when no flagKey is present",
);

const corruptedTile = domRegistry.tilesByKey.get(rapidSwitchChannel.key);
corruptedTile.dataset.flag = "gb";
reloadAllFeedsFresh();
assertPresentation(
  rapidSwitchChannel.key,
  getCurrentVariant(rapidSwitchChannel.key),
  "reload should restore current flag",
);
pauseAllFeeds();
resumeAllFeedsFresh();
channels.forEach((channel) => {
  assertPresentation(
    channel.key,
    getCurrentVariant(channel.key),
    `resume ${channel.key}`,
  );
});

console.log("Validated all 24 source → flag mappings.");
console.log("Validated tile build/render, rapid switch stale-message protection, auto rotation, and pause/resume reload sync.");
