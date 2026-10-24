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
      return createFakeTile("").tile;
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
  buildTile,
  buildEmbedUrl,
  applyCaptionPolicyAll,
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
  applyActiveChannel,
  muteAllAudio,
};`,
  sandbox,
  { filename: "app.js" },
);

const {
  sourceDefinitions,
  channels,
  buildTile,
  buildEmbedUrl,
  applyCaptionPolicyAll,
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
  applyActiveChannel,
  muteAllAudio,
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
    listeners: {},
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    },
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

domRegistry.allTiles.forEach((tile) => {
  const frame = tile.querySelector(".playerFrame");
  assert(
    new URLSearchParams(frame.src.split("?")[1]).get("mute") === "1",
    "startup embeds should be muted",
  );
});

const expectedSources = new Map([
  ["Al Jazeera English", { flagKey: "qa", videoId: "gCNeDWCI0vo" }],
  ["TRT World", { flagKey: "tr", videoId: "qBe59l6p_EU" }],
  ["CNN Türk", { flagKey: "tr", videoId: "6N8_r2uwLEc" }],
  ["Arise News", { flagKey: "ng", videoId: "wqAwGhKnkjc" }],
  ["Citizen TV Kenya", { flagKey: "ke", videoId: "1Vm7lAjpZZM" }],
  ["DW News", { flagKey: "de", videoId: "LuKwFajn37U" }],
  ["FRANCE 24", { flagKey: "fr", videoId: "a47ckXKZjxI" }],
  ["CNA", { flagKey: "sg", videoId: "-PWMxjBgr0k" }],
  ["CNA Originals", { flagKey: "sg", videoId: "9Y4kOQk_K3Y" }],
  ["NTN24", { flagKey: "co", videoId: "GNyQH9R1_V0" }],
  ["teleSUR", { flagKey: "ve", videoId: "cOsv8sEoMAY" }],
  ["TN", { flagKey: "ar", videoId: "cb12KmMMDJA" }],
  ["Milenio", { flagKey: "mx", videoId: "oPy8a-TCjzA" }],
  ["CNN Brasil", { flagKey: "br", videoId: "gmBuQX-uDfo" }],
  ["CNN", { flagKey: "us", videoId: "GotlA1KKWoo" }],
  ["CNN en Español", { flagKey: "us", videoId: "Qr61waJ6AZg" }], // US-based CNN Spanish-language feed
  ["Fox News", { flagKey: "us", videoId: "C96oohpWBGw" }],
  ["Noticias Telemundo", { flagKey: "us", videoId: "c660thEPeeY" }],
  ["Bloomberg Business News", { flagKey: "us", videoId: "QB5BNdBFujE" }],
  ["Yahoo Finance", { flagKey: "us", videoId: "KQp-e_XQnDE" }],
  ["ABC News Australia", { flagKey: "au", videoId: "vOTiJkg1voo" }],
  ["CBC News", { flagKey: "ca", videoId: "5vfaDsMhCF4" }],
  ["RTVE 24H", { flagKey: "es", videoId: "b4tE5aKhtlg" }],
  ["Africanews English", { flagKey: "cg", videoId: "NQjabLGdP5g" }],
  ["Euronews English", { flagKey: "eu", videoId: "pykpO5kQJ98" }],
  ["TVP World", { flagKey: "pl", videoId: "tvXWIgsWuK0" }],
  ["Phoenix InfoNews", { flagKey: "hk", videoId: "Ry--eMIjYLQ" }],
  ["WION LIVE", { flagKey: "in", videoId: "vfszY1JYbMc" }],
  ["GB News", { flagKey: "gb", videoId: "EDbWwVR7i9Q" }],
  ["BBC News Arabic", { flagKey: "gb", videoId: "O1pGmVtj2Y8" }],
  ["Sky News", { flagKey: "gb", videoId: "umLWFz4izTM" }],
  ["Arirang TV", { flagKey: "kr", videoId: "hvVlyZ5GiE8" }],
  ["NHK WORLD-JAPAN", { flagKey: "jp", videoId: "IimtbuqYIE8" }],
  ["TBS NEWS DIG", { flagKey: "jp", videoId: "Anr15FA9OCI" }],
  ["ABC News", { flagKey: "us", videoId: "iipR5yUp36o" }],
  ["Channels TV", { flagKey: "ng", videoId: "W8nThq62Vb4" }],
  ["Al Arabiya", { flagKey: "sa", videoId: "n7eQejkXbnM" }],
  ["CGTN", { flagKey: "cn", videoId: "0i7n3r01L2U" }],
  ["CCTV 13", { flagKey: "cn", videoId: "tcrLV8j2GVk" }],
  ["CCTV 4", { flagKey: "cn", videoId: "vNVp6bxkL1c" }],
]);

assert(sourceDefinitions.length === expectedSources.size, "unexpected source definition count");
const seenSourceNames = new Set();
const seenVideoIds = new Set();
sourceDefinitions.forEach((source) => {
  const expectedSource = expectedSources.get(source.name);
  assert(expectedSource, `unexpected source definition for ${source.name}`);
  assert(!seenSourceNames.has(source.name), `duplicate source name ${source.name}`);
  assert(!seenVideoIds.has(source.videoId), `duplicate video id ${source.videoId}`);
  seenSourceNames.add(source.name);
  seenVideoIds.add(source.videoId);
  assert(
    expectedSource.flagKey === source.flagKey,
    `source flag mapping mismatch for ${source.name}`,
  );
  assert(
    expectedSource.videoId === source.videoId,
    `source video id mismatch for ${source.name}`,
  );
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: source.timeZone }).format(new Date());
  } catch (error) {
    throw new Error(`invalid IANA time zone for ${source.name}: ${source.timeZone}`);
  }
});
const expectedNewSourceDetails = new Map([
  [
    "CNN Türk",
    {
      shortName: "CNN TR",
      regionLabel: "Istanbul",
      timeZone: "Europe/Istanbul",
    },
  ],
  [
    "CNN Brasil",
    {
      shortName: "CNN BR",
      regionLabel: "São Paulo",
      timeZone: "America/Sao_Paulo",
    },
  ],
  [
    "Arise News",
    {
      shortName: "Arise",
      regionLabel: "Lagos",
      timeZone: "Africa/Lagos",
    },
  ],
  [
    "TBS NEWS DIG",
    {
      shortName: "TBS",
      regionLabel: "Tokyo",
      timeZone: "Asia/Tokyo",
    },
  ],
  [
    "Noticias Telemundo",
    {
      shortName: "Telemundo",
      regionLabel: "Miami",
      timeZone: "America/New_York",
    },
  ],
  [
    "CNN en Español",
    {
      shortName: "CNN ES",
      regionLabel: "Atlanta",
      timeZone: "America/New_York",
    },
  ],
  [
    "Yahoo Finance",
    {
      shortName: "Yahoo",
      regionLabel: "New York",
      timeZone: "America/New_York",
    },
  ],
  [
    "TVP World",
    {
      shortName: "TVP",
      regionLabel: "Warsaw",
      timeZone: "Europe/Warsaw",
    },
  ],
]);
expectedNewSourceDetails.forEach((expectedSource, name) => {
  const source = sourceDefinitions.find((entry) => entry.name === name);
  assert(source, `missing source definition for ${name}`);
  assert(source.shortName === expectedSource.shortName, `short name mismatch for ${name}`);
  assert(source.regionLabel === expectedSource.regionLabel, `region label mismatch for ${name}`);
  assert(source.timeZone === expectedSource.timeZone, `time zone mismatch for ${name}`);
});
const totalGroups = 6;
assert(channels.length === totalGroups, "expected exactly six random channel groups");
const flattenedVariants = channels.flatMap((channel) => channel.variants);
assert(
  flattenedVariants.length === sourceDefinitions.length,
  "random groups should cover every source exactly once",
);
assert(
  new Set(flattenedVariants.map((variant) => variant.name)).size === sourceDefinitions.length,
  "random groups should not duplicate any source",
);
const expectedGroupSizes = Array.from({ length: totalGroups }, (_, index) => {
  const baseGroupSize = Math.floor(sourceDefinitions.length / totalGroups);
  const extraSources = sourceDefinitions.length % totalGroups;
  return baseGroupSize + (index < extraSources ? 1 : 0);
}).sort((left, right) => left - right);
assert(
  channels
    .map((channel) => channel.variants.length)
    .sort((left, right) => left - right)
    .join(",") === expectedGroupSizes.join(","),
  "source count should split into balanced group sizes across six tiles",
);

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

function runTimeouts(delay) {
  [...timers.entries()].forEach(([id, timer]) => {
    if (timer.type === "timeout" && timer.delay === delay) {
      timers.delete(id);
      timer.fn();
    }
  });
}

const reducedVolumeSources = new Set(["Channels TV", "Arise News"]);
channels.forEach((channel, channelIndex) => {
  const commands = [];
  getTileParts(channel.key).frame.contentWindow.postMessage = (message) => {
    commands.push(JSON.parse(message));
  };
  channel.variants.forEach((variant, variantIndex) => {
    muteAllAudio();
    timers.clear();
    variantIndices[channel.key] = variantIndex;
    renderVariantTile(channel.key);
    commands.length = 0;
    applyActiveChannel(channelIndex, true);
    assertAudioVolume(variant, commands, "audio activation");
    commands.length = 0;
    runTimeouts(1200);
    assertAudioVolume(variant, commands, "delayed audio activation");
    commands.length = 0;
    switchVariant(channel.key, true);
    runTimeouts(900);
    assertAudioVolume(getCurrentVariant(channel.key), commands, "active source switch");
  });
});

function assertAudioVolume(source, commands, context) {
  const expectedVolume = reducedVolumeSources.has(source.name) ? 50 : 100;
  const volumeCommands = commands.filter((command) => command.func === "setVolume");
  assert(
    volumeCommands.length > 0 && volumeCommands.every((command) => command.args[0] === expectedVolume),
    `${context}: ${source.name} should receive volume ${expectedVolume}`,
  );
  assert(commands.some((command) => command.func === "unMute"), `${context}: ${source.name} should be unmuted`);
}
muteAllAudio();

sourceDefinitions.forEach((source) => {
  const params = new URLSearchParams(buildEmbedUrl(source.videoId).split("?")[1]);
  const isYahoo = source.name === "Yahoo Finance";
  assert(
    params.get("cc_load_policy") === (isYahoo ? "1" : null),
    `${source.name}: only Yahoo should request captions in the embed URL`,
  );
  assert(
    params.get("cc_lang_pref") === (isYahoo ? "en" : null),
    `${source.name}: only Yahoo should request English captions`,
  );
});

const captionCommands = new Map();
channels.forEach((channel) => {
  const frame = getTileParts(channel.key).frame;
  const commands = [];
  captionCommands.set(channel.key, commands);
  frame.contentWindow.postMessage = (message) => commands.push(JSON.parse(message));
});

function assertCaptionPolicy(commands, source, context, expectModule = true) {
  const isYahoo = source.name === "Yahoo Finance";
  const trackCommands = commands.filter(
    (command) => command.func === "setOption" &&
      command.args[0] === "captions" && command.args[1] === "track",
  );
  assert(trackCommands.length > 0, `${context}: missing caption track policy`);
  assert(
    trackCommands.every((command) => isYahoo
      ? command.args[2].languageCode === "en"
      : Object.keys(command.args[2]).length === 0),
    `${context}: ${source.name} received the wrong caption track policy`,
  );
  const moduleCommands = commands.filter(
    (command) => ["loadModule", "unloadModule"].includes(command.func),
  );
  assert(
    expectModule
      ? moduleCommands.length > 0 && moduleCommands.every(
        (command) => command.func === (isYahoo ? "loadModule" : "unloadModule") &&
          command.args[0] === "captions",
      )
      : moduleCommands.length === 0,
    `${context}: caption module policy must not conflict or loop on API changes`,
  );
}

const yahooChannel = channels.find(
  (channel) => channel.variants.some((source) => source.name === "Yahoo Finance"),
);
const yahooIndex = yahooChannel.variants.findIndex((source) => source.name === "Yahoo Finance");
const yahooFrame = getTileParts(yahooChannel.key).frame;
const yahooCommands = captionCommands.get(yahooChannel.key);
// Start and end on Yahoo so queued callbacks exercise both directions of a reused iframe.
const captionSequence = [
  yahooIndex,
  ...yahooChannel.variants.map((_, index) => index).filter((index) => index !== yahooIndex),
  yahooIndex,
];
channels.forEach((channel, channelIndex) => {
  const frame = getTileParts(channel.key).frame;
  const commands = captionCommands.get(channel.key);
  const sequence = channel === yahooChannel
    ? captionSequence
    : channel.variants.map((_, index) => index);
  variantIndices[channel.key] = (sequence[0] + 1) % channel.variants.length;
  renderVariantTile(channel.key);
  sequence.forEach((variantIndex) => {
    const source = channel.variants[variantIndex];
    variantIndices[channel.key] = variantIndex;
    commands.length = 0;
    const previousSrc = frame.src;
    renderVariantTile(channel.key);
    assert(frame.src === previousSrc, "caption switching should reuse the iframe");
    assertCaptionPolicy(commands, source, "in-place switch");
    commands.length = 0;
    runTimeouts(1800);
    assertCaptionPolicy(commands, source, "delayed enforcement");
    commands.length = 0;
    applyActiveChannel(channelIndex, true);
    assertCaptionPolicy(commands, source, "audio focus change");
    ["onReady", "onApiChange", "onStateChange"].forEach((event) => {
      commands.length = 0;
      handleYouTubePlayerMessage({
        origin: "https://www.youtube.com",
        source: frame.contentWindow,
        data: JSON.stringify({ event, info: event === "onStateChange" ? 1 : undefined }),
      });
      assertCaptionPolicy(commands, source, event, event !== "onApiChange");
      if (event === "onReady") {
        ["onApiChange", "onStateChange"].forEach((name) => {
          assert(commands.some((command) => command.func === "addEventListener" &&
            command.args[0] === name), `ready player should subscribe to ${name}`);
        });
      }
    });
  });
});

// A Yahoo callback queued before a rapid switch must use the new source's policy.
variantIndices[yahooChannel.key] = yahooIndex;
renderVariantTile(yahooChannel.key);
variantIndices[yahooChannel.key] = (yahooIndex + 1) % yahooChannel.variants.length;
renderVariantTile(yahooChannel.key);
yahooCommands.length = 0;
runTimeouts(1800);
assertCaptionPolicy(yahooCommands, getCurrentVariant(yahooChannel.key), "stale Yahoo timer");
variantIndices[yahooChannel.key] = yahooIndex;
renderVariantTile(yahooChannel.key);

["global enforcement", "forced reload", "pause/resume"].forEach((context) => {
  captionCommands.forEach((commands) => { commands.length = 0; });
  if (context === "global enforcement") {
    applyCaptionPolicyAll();
  } else if (context === "forced reload") {
    reloadAllFeedsFresh();
    runTimeouts(1800);
  } else {
    pauseAllFeeds();
    resumeAllFeedsFresh();
    runTimeouts(1800);
  }
  channels.forEach((channel) => {
    assertCaptionPolicy(captionCommands.get(channel.key), getCurrentVariant(channel.key), context);
  });
  if (context !== "global enforcement") {
    assert(new URLSearchParams(yahooFrame.src.split("?")[1]).get("cc_load_policy") === "1",
      `${context}: Yahoo reload should retain the initial CC request`);
  }
});

const builtTile = buildTile(yahooChannel, channels.indexOf(yahooChannel));
const builtFrame = builtTile.querySelector(".playerFrame");
const loadCommands = [];
builtFrame.contentWindow.postMessage = (message) => loadCommands.push(JSON.parse(message));
variantIndices[yahooChannel.key] = yahooIndex;
syncTilePresentation(builtTile, yahooChannel, null, { syncVideo: true, forceReload: true });
loadCommands.length = 0;
builtFrame.listeners.load();
assert(loadCommands.some((command) => command.event === "listening"),
  "iframe load should initiate player event delivery");
assertCaptionPolicy(loadCommands, yahooChannel.variants[yahooIndex], "iframe load");

console.log(
  `Validated all ${sourceDefinitions.length} source definitions, exact video IDs, source → flag mappings, and IANA time zones.`,
);
console.log("Validated six-group random coverage without omissions or duplicates.");
console.log("Validated tile build/render, rapid switch stale-message protection, auto rotation, and pause/resume reload sync.");
console.log("Validated muted startup and per-source volumes on audio activation and active source switches.");
console.log("Validated Yahoo-only caption requests, reused-iframe transitions, stale timers, player events, audio focus, reload, and pause/resume (mock checks, not live caption rendering).");
