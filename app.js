const ROTATE_INTERVAL_MS = 10 * 60 * 1000;
const VARIANT_SWITCH_INTERVAL_MS = 11 * 60 * 1000;
const EURONEWS_KEY = "euronews";
const NHK_KEY = "nhk";
const ALJAZEERA_KEY = "aljazeera";
const DW_KEY = "dw";

const channels = [
  {
    key: ALJAZEERA_KEY,
    name: "Al Jazeera / TRT World",
    switchLabel: "Switch AJ/TRT",
    switchIntervalMs: 11 * 60 * 1000,
    variants: [
      {
        name: "Al Jazeera English",
        videoId: "gCNeDWCI0vo",
        regionLabel: "Doha",
        timeZone: "Asia/Qatar",
      },
      {
        name: "TRT World",
        videoId: "b8lPrtjmnmw",
        regionLabel: "Ankara",
        timeZone: "Europe/Istanbul",
      },
    ],
  },
  {
    key: DW_KEY,
    name: "DW / FRANCE 24",
    switchLabel: "Switch DW/F24",
    switchIntervalMs: 11 * 60 * 1000,
    variants: [
      {
        name: "DW News",
        videoId: "LuKwFajn37U",
        regionLabel: "Bonn",
        timeZone: "Europe/Berlin",
      },
      {
        name: "FRANCE 24",
        videoId: "a47ckXKZjxI",
        regionLabel: "Paris",
        timeZone: "Europe/Paris",
      },
    ],
  },
  {
    key: "cna",
    name: "CNA / NTN24",
    switchLabel: "Switch CNA/NTN24",
    variants: [
      {
        name: "CNA",
        videoId: "XWq5kBlakcQ",
        regionLabel: "Singapore",
        timeZone: "Asia/Singapore",
      },
      {
        name: "NTN24",
        videoId: "kHcuZsMTckM",
        regionLabel: "Bogota",
        timeZone: "America/Bogota",
      },
    ],
  },
  {
    key: "cnn",
    name: "CNN",
    switchLabel: "Switch CNN/ABC",
    variants: [
      {
        name: "CNN",
        videoId: "GotlA1KKWoo",
        regionLabel: "Atlanta",
        timeZone: "America/New_York",
      },
      {
        name: "ABC News Australia",
        videoId: "vOTiJkg1voo",
        regionLabel: "Ultimo",
        timeZone: "Australia/Sydney",
      },
    ],
  },
  {
    key: EURONEWS_KEY,
    name: "Euronews / Africanews",
    switchLabel: "Switch EN/ES/AF",
    variants: [
      {
        name: "Euronews Espanol",
        videoId: "O9mOtdZ-nSk",
        regionLabel: "Lyon",
        timeZone: "Europe/Paris",
        switchIntervalMs: 5 * 60 * 1000,
      },
      {
        name: "Africanews English",
        videoId: "NQjabLGdP5g",
        regionLabel: "Pointe-Noire",
        timeZone: "Africa/Brazzaville",
        switchIntervalMs: 5 * 60 * 1000,
      },
      {
        name: "Euronews English",
        videoId: "pykpO5kQJ98",
        regionLabel: "Lyon",
        timeZone: "Europe/Paris",
        switchIntervalMs: 5 * 60 * 1000,
      },
    ],
  },
  {
    key: NHK_KEY,
    name: "CGTN / Phoenix / TVBS",
    switchLabel: "Switch CGTN/PHX/TVBS",
    switchIntervalMs: 11 * 60 * 1000,
    variants: [
      {
        name: "CGTN",
        videoId: "BOy2xDU1LC8",
        regionLabel: "Beijing",
        timeZone: "Asia/Shanghai",
        switchIntervalMs: 5 * 60 * 1000,
      },
      {
        name: "Phoenix InfoNews",
        videoId: "Ry--eMIjYLQ",
        regionLabel: "Hong Kong",
        timeZone: "Asia/Hong_Kong",
        switchIntervalMs: 5 * 60 * 1000,
      },
      {
        name: "TVBS News",
        videoId: "2mCSYvcfhtc",
        regionLabel: "Taipei",
        timeZone: "Asia/Taipei",
        switchIntervalMs: 2 * 60 * 1000,
      },
    ],
  },
];

const grid = document.getElementById("grid");
const template = document.getElementById("tileTemplate");
const statusText = document.getElementById("statusText");
const protocolWarning = document.getElementById("protocolWarning");
const rotationCountdown = document.getElementById("rotationCountdown");
const nextAudioBtn = document.getElementById("nextAudioBtn");
const muteAllBtn = document.getElementById("muteAllBtn");
const pauseFeedsBtn = document.getElementById("pauseFeedsBtn");

let activeIndex = -1;
let rotationTimer = null;
let rotationStartAt = null;
let rotationCountdownTimer = null;
let feedsPaused = false;
const variantIndices = {};
const variantTimers = {};
const variantNextSwitchAt = {};
const variantLastAudioIndex = {};
let audioActivationToken = 0;
const LOUD_CHANNEL_VOLUME_OVERRIDES = {
  XWq5kBlakcQ: 70, // CNA
  "2mCSYvcfhtc": 50, // TVBS
  BOy2xDU1LC8: 70, // CGTN
  kHcuZsMTckM: 70, // NTN24
};
const TIME_FORMATTERS = {};

function buildEmbedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
  });
  if (window.location.protocol.startsWith("http")) {
    params.set("origin", window.location.origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function getChannelIndexByKey(channelKey) {
  return channels.findIndex((channel) => channel.key === channelKey);
}

function getCurrentVariant(channelKey) {
  const channel = channels[getChannelIndexByKey(channelKey)];
  if (!channel?.variants?.length) {
    return null;
  }
  const index = variantIndices[channelKey] ?? 0;
  return channel.variants[index] ?? channel.variants[0];
}

function getDisplayChannelName(index) {
  const channel = channels[index];
  if (!channel) {
    return "";
  }
  if (channel.variants?.length) {
    return getCurrentVariant(channel.key)?.name ?? channel.name;
  }
  return channel.name;
}

function getCurrentVideoId(channel) {
  if (channel.variants?.length) {
    const variant = getCurrentVariant(channel.key);
    return variant?.videoId ?? "";
  }
  return channel.videoId;
}

function getVariantSwitchIntervalMs(channelKey) {
  const channel = channels[getChannelIndexByKey(channelKey)];
  if (!channel?.variants?.length) {
    return channel?.switchIntervalMs ?? VARIANT_SWITCH_INTERVAL_MS;
  }
  const currentVariant = getCurrentVariant(channelKey);
  return (
    currentVariant?.switchIntervalMs ??
    channel?.switchIntervalMs ??
    VARIANT_SWITCH_INTERVAL_MS
  );
}

function getTargetVolumeForChannelIndex(index) {
  const channel = channels[index];
  if (!channel) {
    return 100;
  }
  const videoId = getCurrentVideoId(channel);
  return LOUD_CHANNEL_VOLUME_OVERRIDES[videoId] ?? 100;
}

function getRegionTimeMeta(channel) {
  if (!channel) {
    return null;
  }
  if (channel.variants?.length) {
    const currentVariant = getCurrentVariant(channel.key);
    if (!currentVariant) {
      return null;
    }
    return {
      regionLabel: currentVariant.regionLabel ?? currentVariant.name,
      timeZone: currentVariant.timeZone,
    };
  }
  return {
    regionLabel: channel.regionLabel ?? channel.name,
    timeZone: channel.timeZone,
  };
}

function getTimeForTimeZone(timeZone) {
  if (!timeZone) {
    return "--:--";
  }
  if (!TIME_FORMATTERS[timeZone]) {
    TIME_FORMATTERS[timeZone] = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });
  }
  return TIME_FORMATTERS[timeZone].format(new Date());
}

function updateTileRegionClock(channelKey) {
  const channelIndex = getChannelIndexByKey(channelKey);
  const channel = channels[channelIndex];
  const tile = document.querySelector(`.tile[data-channel-key="${channelKey}"]`);
  if (!channel || !tile) {
    return;
  }
  const regionClock = tile.querySelector(".regionClock");
  if (!regionClock) {
    return;
  }
  const meta = getRegionTimeMeta(channel);
  if (!meta?.regionLabel || !meta?.timeZone) {
    regionClock.hidden = true;
    return;
  }
  regionClock.hidden = false;
  regionClock.textContent = `${meta.regionLabel} ${getTimeForTimeZone(meta.timeZone)}`;
  updateTileHeaderCompression(tile);
}

function updateAllRegionClocks() {
  channels.forEach((channel) => {
    updateTileRegionClock(channel.key);
  });
}

function updateTileHeaderCompression(tile) {
  if (!tile) {
    return;
  }
  const channelMain = tile.querySelector(".channelMain");
  if (!channelMain) {
    return;
  }
  const isOverflowing = channelMain.scrollWidth > channelMain.clientWidth + 1;
  tile.classList.toggle("compactHeader", isOverflowing);
}

function updateAllTileHeaderCompression() {
  document.querySelectorAll(".tile").forEach((tile) => {
    updateTileHeaderCompression(tile);
  });
}

function syncVariantUiByChannelKey(channelKey) {
  const channel = channels[getChannelIndexByKey(channelKey)];
  if (!channel?.variants?.length) {
    return;
  }
  const tile = document.querySelector(`.tile[data-channel-key="${channelKey}"]`);
  if (!tile) {
    return;
  }
  const frame = tile.querySelector(".playerFrame");
  const channelName = tile.querySelector(".channelName");
  const variant = getCurrentVariant(channelKey);
  if (!variant) {
    return;
  }
  channelName.textContent = variant.name;
  frame.title = `${variant.name} Live`;
  frame.dataset.currentVideoId = variant.videoId;
  updateTileRegionClock(channelKey);
  updateTileHeaderCompression(tile);
}

function handleYouTubePlayerMessage(event) {
  if (!event.origin.includes("youtube.com")) {
    return;
  }
  const frame = [...document.querySelectorAll(".playerFrame")].find(
    (candidate) => candidate.contentWindow === event.source,
  );
  if (!frame) {
    return;
  }

  let payload = event.data;
  if (typeof payload === "string") {
    if (!payload.startsWith("{")) {
      return;
    }
    try {
      payload = JSON.parse(payload);
    } catch {
      return;
    }
  }

  const channelKey = frame.dataset.channelKey;
  const channel = channels[getChannelIndexByKey(channelKey)];
  const reportedVideoId = payload.info?.videoData?.video_id;
  const expectedVideoId = frame.dataset.expectedVideoId ?? "";
  const switchRequestedAt = Number(frame.dataset.switchRequestedAt ?? 0);
  const expectedRepairTried = frame.dataset.expectedRepairTried === "1";
  const withinSwitchGraceWindow =
    expectedVideoId.length > 0 && Date.now() - switchRequestedAt < 6000;
  if (
    channelKey &&
    channel?.variants?.length &&
    typeof reportedVideoId === "string" &&
    reportedVideoId.length > 0
  ) {
    if (withinSwitchGraceWindow && reportedVideoId !== expectedVideoId) {
      return;
    }
    if (
      !withinSwitchGraceWindow &&
      expectedVideoId.length > 0 &&
      reportedVideoId !== expectedVideoId
    ) {
      if (!expectedRepairTried) {
        frame.dataset.expectedRepairTried = "1";
        switchFrameVideo(frame, expectedVideoId, { forceReload: true });
        forceCaptionsOffForFrame(frame);
        const channelIndex = getChannelIndexByKey(channelKey);
        if (channelIndex === activeIndex) {
          setTimeout(() => {
            maximizeAndStabilizeAudio(frame, channelIndex, audioActivationToken);
          }, 900);
        }
        return;
      }
      // If one repair already failed, clear expectation to avoid infinite retries.
      frame.dataset.expectedVideoId = "";
      frame.dataset.switchRequestedAt = "0";
      frame.dataset.expectedRepairTried = "0";
    }
    if (reportedVideoId === expectedVideoId) {
      frame.dataset.expectedVideoId = "";
      frame.dataset.switchRequestedAt = "0";
      frame.dataset.expectedRepairTried = "0";
    }
    const matchedIndex = channel.variants.findIndex(
      (variant) => variant.videoId === reportedVideoId,
    );
    if (matchedIndex >= 0 && variantIndices[channelKey] !== matchedIndex) {
      variantIndices[channelKey] = matchedIndex;
      syncVariantUiByChannelKey(channelKey);
    }
  }
}

function sendPlayerCommand(iframe, func, args = []) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://www.youtube.com",
  );
}

function forceCaptionsOffForFrame(frame) {
  sendPlayerCommand(frame, "unloadModule", ["captions"]);
  sendPlayerCommand(frame, "setOption", ["captions", "track", {}]);
}

function forceCaptionsOffAll() {
  document.querySelectorAll(".playerFrame").forEach((frame) => {
    forceCaptionsOffForFrame(frame);
  });
}

function switchFrameVideo(frame, videoId, { forceReload = false } = {}) {
  if (!frame || !videoId) {
    return;
  }
  const currentVideoId = frame.dataset.currentVideoId ?? "";
  if (!forceReload && currentVideoId === videoId) {
    return;
  }
  frame.dataset.expectedVideoId = videoId;
  frame.dataset.switchRequestedAt = String(Date.now());
  frame.dataset.expectedRepairTried = "0";

  const hasEmbedPlayer = frame.src.includes("youtube.com/embed/");
  if (!forceReload && hasEmbedPlayer && currentVideoId) {
    sendPlayerCommand(frame, "loadVideoById", [videoId]);
  } else {
    frame.src = buildEmbedUrl(videoId);
  }
  frame.dataset.currentVideoId = videoId;
}

function maximizeAndStabilizeAudio(frame, expectedIndex, token) {
  if (!frame) {
    return;
  }

  if (feedsPaused || activeIndex !== expectedIndex || audioActivationToken !== token) {
    return;
  }
  sendPlayerCommand(frame, "setVolume", [getTargetVolumeForChannelIndex(expectedIndex)]);
  sendPlayerCommand(frame, "unMute");
  sendPlayerCommand(frame, "playVideo");
}

function setAudioState(nextActiveIndex) {
  const activationToken = ++audioActivationToken;
  const tiles = [...document.querySelectorAll(".tile")];
  tiles.forEach((tile, index) => {
    const frame = tile.querySelector(".playerFrame");
    const badge = tile.querySelector(".audioBadge");
    forceCaptionsOffForFrame(frame);
    if (index === nextActiveIndex) {
      maximizeAndStabilizeAudio(frame, nextActiveIndex, activationToken);
      tile.classList.add("active");
      badge.textContent = "Audio On";
    } else {
      sendPlayerCommand(frame, "mute");
      tile.classList.remove("active");
      badge.textContent = "Muted";
    }
  });
}

function formatNextRotationText() {
  if (rotationStartAt === null || activeIndex < 0) {
    return "Click a tile header to start audio rotation (10-minute interval).";
  }
  const nextAt = new Date(rotationStartAt + ROTATE_INTERVAL_MS);
  return `Audio: ${getDisplayChannelName(activeIndex)}. Next rotation at ${nextAt.toLocaleTimeString()}.`;
}

function updateRotationCountdown() {
  if (feedsPaused) {
    rotationCountdown.textContent = "Next audio rotation in paused";
    return;
  }
  if (rotationStartAt === null || activeIndex < 0) {
    rotationCountdown.textContent = "Next audio rotation in --:--";
    return;
  }
  const remainingMs = Math.max(0, rotationStartAt + ROTATE_INTERVAL_MS - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  rotationCountdown.textContent = `Next audio rotation in ${mm}:${ss}`;
}

function updateVariantCountdowns() {
  channels.forEach((channel) => {
    if (!channel.variants?.length) {
      return;
    }
    const tile = document.querySelector(`.tile[data-channel-key="${channel.key}"]`);
    if (!tile) {
      return;
    }
    const countdownEl = tile.querySelector(".variantCountdown");
    if (!countdownEl) {
      return;
    }
    const nextAt = variantNextSwitchAt[channel.key];
    if (feedsPaused) {
      countdownEl.textContent = "Next switch in paused";
      return;
    }
    if (!nextAt) {
      countdownEl.textContent = "Next switch in --:--";
      return;
    }
    const remainingMs = Math.max(0, nextAt - Date.now());
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    countdownEl.textContent = `Next switch in ${mm}:${ss}`;
    updateTileHeaderCompression(tile);
  });
}

function startRotationCountdownTicker() {
  if (rotationCountdownTimer) {
    clearInterval(rotationCountdownTimer);
  }
  rotationCountdownTimer = setInterval(() => {
    updateRotationCountdown();
    updateVariantCountdowns();
    updateAllRegionClocks();
    updateAllTileHeaderCompression();
  }, 1000);
  updateRotationCountdown();
  updateVariantCountdowns();
  updateAllRegionClocks();
  updateAllTileHeaderCompression();
}

function applyActiveChannel(index, initiatedByUser) {
  if (feedsPaused) {
    return;
  }
  const targetChannel = channels[index];
  if (!targetChannel) {
    return;
  }

  activeIndex = index;
  if (!initiatedByUser && targetChannel.variants?.length) {
    advanceVariantOnAudioActivation(targetChannel.key);
  }
  rotationStartAt = Date.now();
  setAudioState(activeIndex);
  statusText.textContent = formatNextRotationText();

  if (rotationTimer) {
    clearTimeout(rotationTimer);
  }
  rotationTimer = setTimeout(() => {
    applyActiveChannel((activeIndex + 1) % channels.length, false);
  }, ROTATE_INTERVAL_MS);
  updateRotationCountdown();

  if (initiatedByUser) {
    const nextAt = new Date(rotationStartAt + ROTATE_INTERVAL_MS);
    statusText.textContent = `Audio switched to ${getDisplayChannelName(index)}. Next rotation at ${nextAt.toLocaleTimeString()}.`;
  }
}

function switchToNextAudioNow() {
  if (feedsPaused) {
    return;
  }
  if (!channels.length) {
    return;
  }
  if (activeIndex < 0) {
    applyActiveChannel(0, true);
    return;
  }
  applyActiveChannel((activeIndex + 1) % channels.length, true);
}

function renderVariantTile(channelKey) {
  const tile = document.querySelector(`.tile[data-channel-key="${channelKey}"]`);
  if (!tile) {
    return;
  }
  const frame = tile.querySelector(".playerFrame");
  frame.dataset.channelKey = channelKey;
  const channelName = tile.querySelector(".channelName");
  const variant = getCurrentVariant(channelKey);
  if (!variant) {
    return;
  }
  channelName.textContent = variant.name;
  frame.title = `${variant.name} Live`;
  const forceReloadForKnownUnstableSwitch = channelKey === "cnn";
  switchFrameVideo(frame, variant.videoId, {
    forceReload: forceReloadForKnownUnstableSwitch,
  });
  updateTileRegionClock(channelKey);
  updateTileHeaderCompression(tile);
  setTimeout(() => {
    forceCaptionsOffForFrame(frame);
  }, 1800);

  if (getChannelIndexByKey(channelKey) === activeIndex) {
    setTimeout(() => {
      maximizeAndStabilizeAudio(frame, getChannelIndexByKey(channelKey), audioActivationToken);
    }, 900);
  }
}

function scheduleVariantSwitch(channelKey) {
  if (feedsPaused) {
    return;
  }
  if (variantTimers[channelKey]) {
    clearTimeout(variantTimers[channelKey]);
  }
  const intervalMs = getVariantSwitchIntervalMs(channelKey);
  variantNextSwitchAt[channelKey] = Date.now() + intervalMs;
  variantTimers[channelKey] = setTimeout(() => {
    switchVariant(channelKey, false);
  }, intervalMs);
}

function switchVariant(channelKey, triggeredByUser) {
  if (feedsPaused) {
    return;
  }
  const channel = channels[getChannelIndexByKey(channelKey)];
  if (!channel?.variants?.length) {
    return;
  }
  const current = variantIndices[channelKey] ?? 0;
  variantIndices[channelKey] = (current + 1) % channel.variants.length;
  renderVariantTile(channelKey);
  scheduleVariantSwitch(channelKey);
  if (triggeredByUser) {
    statusText.textContent = `Switched to ${getCurrentVariant(channelKey).name}.`;
  }
}

function advanceVariantOnAudioActivation(channelKey) {
  const channel = channels[getChannelIndexByKey(channelKey)];
  if (!channel?.variants?.length) {
    return;
  }
  const lastAudioIndex = variantLastAudioIndex[channelKey];
  const nextAudioIndex = ((lastAudioIndex ?? -1) + 1) % channel.variants.length;
  variantIndices[channelKey] = nextAudioIndex;
  variantLastAudioIndex[channelKey] = nextAudioIndex;
  renderVariantTile(channelKey);
  scheduleVariantSwitch(channelKey);
}

function bindInlineSwitch(sourceInlineSwitch, channelKey) {
  sourceInlineSwitch.addEventListener("click", (event) => {
    event.stopPropagation();
    switchVariant(channelKey, true);
  });
  sourceInlineSwitch.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      switchVariant(channelKey, true);
    }
  });
}

function stopAudioRotation() {
  if (rotationTimer) {
    clearTimeout(rotationTimer);
    rotationTimer = null;
  }
  activeIndex = -1;
  rotationStartAt = null;
}

function stopVariantSwitches() {
  channels.forEach((channel) => {
    if (!channel.variants?.length) {
      return;
    }
    if (variantTimers[channel.key]) {
      clearTimeout(variantTimers[channel.key]);
      variantTimers[channel.key] = null;
    }
    variantNextSwitchAt[channel.key] = null;
  });
}

function reloadAllFeedsFresh() {
  channels.forEach((channel) => {
    const tile = document.querySelector(`.tile[data-channel-key="${channel.key}"]`);
    if (!tile) {
      return;
    }
    const frame = tile.querySelector(".playerFrame");
    const channelName = tile.querySelector(".channelName");
    const badge = tile.querySelector(".audioBadge");
    const videoId = getCurrentVideoId(channel);
    if (channel.variants?.length) {
      channelName.textContent = getCurrentVariant(channel.key).name;
      frame.title = `${getCurrentVariant(channel.key).name} Live`;
    } else {
      channelName.textContent = channel.name;
      frame.title = `${channel.name} Live`;
    }
    switchFrameVideo(frame, videoId, { forceReload: true });
    setTimeout(() => {
      forceCaptionsOffForFrame(frame);
    }, 1800);
    badge.textContent = "Muted";
    tile.classList.remove("active");
  });
}

function pauseAllFeeds() {
  if (feedsPaused) {
    return;
  }
  feedsPaused = true;
  stopAudioRotation();
  stopVariantSwitches();
  document.querySelectorAll(".tile").forEach((tile) => {
    const frame = tile.querySelector(".playerFrame");
    const badge = tile.querySelector(".audioBadge");
    frame.src = "about:blank";
    badge.textContent = "Paused";
    tile.classList.remove("active");
  });
  pauseFeedsBtn.textContent = "Resume all feeds";
  statusText.textContent = "All feeds paused.";
  updateRotationCountdown();
  updateVariantCountdowns();
}

function resumeAllFeedsFresh() {
  if (!feedsPaused) {
    return;
  }
  feedsPaused = false;
  stopAudioRotation();
  reloadAllFeedsFresh();
  channels.forEach((channel) => {
    if (channel.variants?.length) {
      scheduleVariantSwitch(channel.key);
    }
  });
  pauseFeedsBtn.textContent = "Pause all feeds";
  statusText.textContent =
    "All feeds reloaded fresh. Click a tile header to start audio rotation.";
  updateRotationCountdown();
  updateVariantCountdowns();
}

function togglePauseFeeds() {
  if (feedsPaused) {
    resumeAllFeedsFresh();
    return;
  }
  pauseAllFeeds();
}

function muteAllAudio() {
  if (feedsPaused) {
    return;
  }
  stopAudioRotation();
  document.querySelectorAll(".tile").forEach((tile) => {
    const frame = tile.querySelector(".playerFrame");
    const badge = tile.querySelector(".audioBadge");
    sendPlayerCommand(frame, "mute");
    badge.textContent = "Muted";
    tile.classList.remove("active");
  });
  statusText.textContent = "All feeds muted.";
  updateRotationCountdown();
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function handleGlobalHotkeys(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  if (isTypingTarget(event.target)) {
    return;
  }

  if (event.code === "Space") {
    if (feedsPaused || activeIndex < 0) {
      return;
    }
    const activeChannel = channels[activeIndex];
    if (!activeChannel?.variants?.length) {
      return;
    }
    event.preventDefault();
    switchVariant(activeChannel.key, true);
    return;
  }

  if (event.code === "Enter") {
    event.preventDefault();
    switchToNextAudioNow();
    return;
  }

  if (event.code === "Escape") {
    event.preventDefault();
    pauseAllFeeds();
    return;
  }

  const mainDigitMatch = event.code.match(/^Digit([1-6])$/);
  const numpadDigitMatch = event.code.match(/^Numpad([1-6])$/);
  const digit = mainDigitMatch?.[1] ?? numpadDigitMatch?.[1];
  if (!digit) {
    return;
  }

  const channelIndex = Number(digit) - 1;
  if (channelIndex < 0 || channelIndex >= channels.length) {
    return;
  }
  event.preventDefault();
  applyActiveChannel(channelIndex, true);
}

function buildTile(channel, index) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.channelKey = channel.key;
  const headerBtn = node.querySelector(".tileHeader");
  const channelName = node.querySelector(".channelName");
  const regionClock = node.querySelector(".regionClock");
  const variantCountdown = node.querySelector(".variantCountdown");
  const sourceInlineSwitch = node.querySelector(".sourceInlineSwitch");
  const frame = node.querySelector(".playerFrame");
  frame.dataset.channelKey = channel.key;

  if (channel.variants?.length) {
    variantIndices[channel.key] = 0;
    const variant = getCurrentVariant(channel.key);
    channelName.textContent = variant.name;
    frame.title = `${variant.name} Live`;
    switchFrameVideo(frame, variant.videoId, { forceReload: true });
    variantCountdown.hidden = false;
    variantCountdown.textContent = "Next switch in --:--";
    if (channel.switchLabel) {
      sourceInlineSwitch.hidden = false;
      sourceInlineSwitch.textContent = channel.switchLabel;
      bindInlineSwitch(sourceInlineSwitch, channel.key);
    } else {
      sourceInlineSwitch.hidden = true;
    }
  } else {
    channelName.textContent = channel.name;
    frame.title = `${channel.name} Live`;
    switchFrameVideo(frame, channel.videoId, { forceReload: true });
  }
  if (regionClock) {
    regionClock.hidden = true;
  }

  headerBtn.addEventListener("click", () => {
    applyActiveChannel(index, true);
  });

  return node;
}

function init() {
  if (window.location.protocol === "file:") {
    protocolWarning.hidden = false;
    statusText.textContent =
      "Run via http://localhost first, then click a tile to start audio rotation.";
  }

  channels.forEach((channel, index) => {
    grid.appendChild(buildTile(channel, index));
    if (channel.variants?.length) {
      scheduleVariantSwitch(channel.key);
    }
  });
  updateAllTileHeaderCompression();
  setTimeout(() => {
    forceCaptionsOffAll();
  }, 2200);
  setTimeout(() => {
    forceCaptionsOffAll();
  }, 4500);

  startRotationCountdownTicker();
  nextAudioBtn.addEventListener("click", () => {
    switchToNextAudioNow();
  });
  muteAllBtn.addEventListener("click", () => {
    muteAllAudio();
  });
  pauseFeedsBtn.addEventListener("click", () => {
    togglePauseFeeds();
  });
  document.addEventListener("keydown", handleGlobalHotkeys, true);
  window.addEventListener("message", handleYouTubePlayerMessage);
  window.addEventListener("resize", () => {
    updateAllTileHeaderCompression();
  });

  if (window.location.protocol !== "file:") {
    statusText.textContent =
      "All streams are loading muted with CC off. Click a tile header to start audio rotation.";
  }
}

init();
