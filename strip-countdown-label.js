(() => {
  const countdownSelector = ".variantCountdown";
  const labelPattern = /^Next switch in\s*/;

  function stripLabel(element) {
    if (!element.matches(countdownSelector)) {
      return;
    }

    const text = element.textContent;
    const strippedText = text.replace(labelPattern, "");
    if (strippedText !== text) {
      element.textContent = strippedText;
    }
  }

  document.querySelectorAll(countdownSelector).forEach(stripLabel);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const element =
        mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;

      if (element?.matches(countdownSelector)) {
        stripLabel(element);
      }
    });
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})();
