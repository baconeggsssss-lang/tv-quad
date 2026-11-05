// Apply channel-list changes after app.js has initialized its source data.
// Keep the app's normal tile construction and player behavior for the updated list.
(function applyChannelOverrides() {
  const citizenIndex = sourceDefinitions.findIndex(
    (source) => source.name === "Citizen TV Kenya",
  );
  if (citizenIndex >= 0) {
    sourceDefinitions.splice(citizenIndex, 1);
  }

  const trtWorld = sourceDefinitions.find((source) => source.name === "TRT World");
  if (trtWorld) {
    trtWorld.videoId = "JV5w1MhzcfQ";
  }

  Object.values(variantTimers).forEach((timer) => {
    if (timer) {
      clearTimeout(timer);
    }
  });
  Object.keys(variantTimers).forEach((key) => delete variantTimers[key]);
  Object.keys(variantIndices).forEach((key) => delete variantIndices[key]);
  Object.keys(audioVariantPointers).forEach((key) => delete audioVariantPointers[key]);
  Object.keys(variantNextSwitchAt).forEach((key) => delete variantNextSwitchAt[key]);

  const updatedChannels = channels
    .map((channel) => {
      if (!channel.variants?.length) {
        return channel;
      }
      channel.variants = channel.variants.filter(
        (variant) => variant.name !== "Citizen TV Kenya",
      );
      channel.name = channel.variants.map((variant) => variant.name).join(" / ");
      channel.switchLabel = `Switch ${channel.variants
        .map((variant) => variant.shortName)
        .join("/")}`;
      return channel;
    })
    .filter((channel) => !channel.variants || channel.variants.length > 0);
  channels.splice(0, channels.length, ...updatedChannels);

  grid.replaceChildren();
  channels.forEach((channel, index) => {
    const tile = buildTile(channel, index);
    grid.appendChild(tile);
    syncTilePresentation(tile, channel, null, { syncVideo: true, forceReload: true });
    updatePlayerFrameFit(tile.querySelector(".playerWrap"));
    if (channel.variants?.length) {
      scheduleVariantSwitch(channel.key);
    }
  });
  updateAllTileHeaderCompression();
  updateAllRegionClocks();
})();
