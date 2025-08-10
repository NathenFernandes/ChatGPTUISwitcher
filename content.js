// ChatGPT Persistent Landing Background
// Strategy: ensure the landing <picture> exists as a fixed background layer, keep it above page chrome but below content, and neutralize black/light flips.

(function () {
  const BACKGROUND_ID = 'persistent-chatgpt-landing-picture';
  let isEnabled = true;
  let bodyObserver = null;
  let htmlObserver = null;
  let periodicIntervalId = null;
  let popstateListener = null;
  const originalPushState = history.pushState;
  let pushStatePatched = false;

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get({ enabled: true });
      isEnabled = result.enabled;
    } catch (error) {
      console.debug('Could not load settings, defaulting to enabled');
      isEnabled = true;
    }
  }

  // Listen for toggle messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_EXTENSION') {
      isEnabled = message.enabled;
      applyToggle();
      sendResponse({ success: true });
    }
  });

  function applyToggle() {
    if (!isEnabled) {
      // Remove background and reset styles
      const existing = document.getElementById(BACKGROUND_ID);
      if (existing) {
        existing.remove();
      }
      // Remove our injected styles
      const styleEl = document.getElementById('persistent-chatgpt-zfix');
      if (styleEl) {
        styleEl.remove();
      }
      const legacyStyle = document.getElementById('chatgpt-background-override');
      if (legacyStyle) {
        legacyStyle.remove();
      }
      // Reset any inline style changes we made and stop observers
      resetInlineStyles();
      teardownObservers();
    } else {
      // Re-enable everything
      forceDarkColorScheme();
      ensureBackgroundPicture();
      neutralizeInlineBackgrounds();
      forceSidebarTransparent();
      removeProblematicClasses();
      addBlurEffectToTargetElements();
      setupObservers();
    }
  }

  function resetInlineStyles() {
    // Reset html and body inline styles
    const html = document.documentElement;
    const body = document.body;
    if (html) {
      html.style.removeProperty('background');
      html.style.removeProperty('background-color');
      html.style.removeProperty('color-scheme');
      html.classList.remove('dark');
    }
    if (body) {
      body.style.removeProperty('background');
      body.style.removeProperty('background-color');
    }
    
    // Reset sidebar elements
    const sidebarElements = document.querySelectorAll([
      'aside',
      '[data-testid*="sidebar"]',
      '[class*="sidebar"]',
      '[class*="side-nav"]',
      'div[class*="flex"][class*="h-full"]:first-child',
      'div[class*="h-screen"]:first-child'
    ].join(','));
    
    for (const el of sidebarElements) {
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
      el.style.removeProperty('z-index');
    }
  }

  function teardownObservers() {
    try {
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
      if (htmlObserver) { htmlObserver.disconnect(); htmlObserver = null; }
      if (periodicIntervalId) { clearInterval(periodicIntervalId); periodicIntervalId = null; }
      if (pushStatePatched) {
        history.pushState = originalPushState;
        pushStatePatched = false;
      }
      if (popstateListener) {
        window.removeEventListener('popstate', popstateListener);
        popstateListener = null;
      }
    } catch (_) {}
  }

  function backgroundPictureExists() {
    // Only consider our injected background as "exists"
    return document.getElementById(BACKGROUND_ID);
  }

  function createBackgroundPicture() {
    const existing = document.getElementById(BACKGROUND_ID);
    if (existing) return existing;

    const picture = document.createElement('picture');
    picture.id = BACKGROUND_ID;
    picture.className = 'absolute inset-0 h-full w-full overflow-hidden';
    picture.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100%',
      'height:100%',
      'z-index:-1',
      'opacity:1',
      'pointer-events:none',
    ].join(';');

    const source = document.createElement('source');
    source.type = 'image/webp';
    source.srcset = [
      'https://persistent.oaistatic.com/burrito-nux/640.webp 640w',
      'https://persistent.oaistatic.com/burrito-nux/1280.webp 1280w',
      'https://persistent.oaistatic.com/burrito-nux/1920.webp 1920w',
    ].join(', ');

    const img = document.createElement('img');
    img.className = 'absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-50 blur-2xl dark:opacity-30';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.src = 'https://persistent.oaistatic.com/burrito-nux/640.webp';
    img.srcset = source.srcset;
    img.sizes = '100vw';
    img.loading = 'eager';
    img.fetchpriority = 'high';

    const overlayDiv = document.createElement('div');
    overlayDiv.className = 'absolute inset-0 h-full w-full';
    overlayDiv.style.background = 'rgba(0, 0, 0, 0.3)';
    overlayDiv.style.zIndex = '0';
    // Dark overlay directly over the image, not over content

    picture.appendChild(source);
    picture.appendChild(img);
    picture.appendChild(overlayDiv);

    return picture;
  }

  function ensureContentAboveBackground() {
    if (!isEnabled) return;
    
    // Elevate main app content above the background layer
    const styleId = 'persistent-chatgpt-zfix';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      main, [role="main"], #__next > div { position: relative !important; z-index: 10 !important; }
      /* Keep header/toolbar above bg and transparent */
      header, nav, [role="banner"], [data-testid="page-header"], [class*="sticky"][class*="top-0"], [class*="top-0"][class*="sticky"] {
        position: relative !important; z-index: 10 !important;
        background: transparent !important; background-color: transparent !important;
      }
      /* Left sidebar & wrappers - keep original position but make transparent */
      aside, [data-testid*="sidebar"], [class*="sidebar"], [class*="side-nav"], [class*="SideNav"], [class*="sideNav"], nav[aria-label*="chat" i] {
        z-index: 10 !important;
        background: transparent !important; background-color: transparent !important;
      }
      /* Target specific ChatGPT sidebar containers */
      div[class*="flex"][class*="h-full"]:first-child,
      div[class*="h-screen"]:first-child,
      nav[class*="flex"],
      .sidebar,
      [role="navigation"] {
        background: transparent !important; background-color: transparent !important;
      }
      html, body, #__next, main { background: transparent !important; background-color: transparent !important; }
      /* Neutralize common dark/light token flips */
      [class*="bg-black"], [class*="bg-gray-900"], [class*="dark:bg-"] {
        background: transparent !important; background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureBackgroundPicture() {
    if (!isEnabled) return;
    
    // Always ensure our fixed picture exists, regardless of a native picture
    let pic = document.getElementById(BACKGROUND_ID);
    if (!pic) {
      pic = createBackgroundPicture();
      document.body.appendChild(pic);
    }
    // Reassert critical styles
    if (pic && pic.style) {
      pic.style.position = 'fixed';
      pic.style.inset = '0px';
      pic.style.width = '100%';
      pic.style.height = '100%';
      pic.style.zIndex = '-1';
      pic.style.pointerEvents = 'none';
      pic.style.opacity = '1';
    }
    ensureContentAboveBackground();
  }

  function neutralizeInlineBackgrounds() {
    if (!isEnabled) return;
    
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;
    // Hard override via inline !important to win any later stylesheet rules
    html.style.setProperty('background', 'transparent', 'important');
    html.style.setProperty('background-color', 'transparent', 'important');
    body.style.setProperty('background', 'transparent', 'important');
    body.style.setProperty('background-color', 'transparent', 'important');
  }

  function forceSidebarTransparent() {
    if (!isEnabled) return;
    
    const candidates = Array.from(document.querySelectorAll([
      'aside',
      '[data-testid*="sidebar"]',
      '[class*="sidebar"]',
      '[class*="side-nav"]',
      '[class*="SideNav"]',
      '[class*="sideNav"]',
      'nav[aria-label*="chat" i]',
      'div[class*="flex"][class*="h-full"]:first-child',
      'div[class*="h-screen"]:first-child',
      'nav[class*="flex"]',
      '[role="navigation"]'
    ].join(',')));

    for (const el of candidates) {
      try {
        const rect = el.getBoundingClientRect();
        // Likely left column if narrow-ish and near left edge
        if (rect.width <= Math.max(420, innerWidth * 0.35) && rect.left < 100) {
          el.style.setProperty('background', 'transparent', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('z-index', '10', 'important');
        }
      } catch (_) {}
    }
    
    // Also target any element that looks like a sidebar container
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      try {
        const rect = div.getBoundingClientRect();
        const cs = getComputedStyle(div);
        // If it's a tall, narrow element on the left with a dark background
        if (rect.height > innerHeight * 0.5 && 
            rect.width < 350 && 
            rect.left < 50 &&
            (cs.backgroundColor.includes('rgb(') && !cs.backgroundColor.includes('rgba(0, 0, 0, 0)'))) {
          div.style.setProperty('background', 'transparent', 'important');
          div.style.setProperty('background-color', 'transparent', 'important');
        }
      } catch (_) {}
    }
  }

  function forceDarkColorScheme() {
    if (!isEnabled) return;
    
    try {
      const root = document.documentElement;
      root.style.setProperty('color-scheme', 'dark', 'important');
      root.classList.add('dark');
    } catch (_) {}
  }

  function removeProblematicClasses() {
    if (!isEnabled) return;
    
    // Target elements with the specific problematic class string
    const problematicSelector = '[class*="relative isolate z-10 w-full basis-auto"]';
    const elements = document.querySelectorAll(problematicSelector);
    
    for (const el of elements) {
      try {
        // Remove the entire problematic class string
        const classesToRemove = "relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)] md:border-transparent md:pt-0 dark:border-white/20 md:dark:border-transparent content-fade single-line flex flex-col";
        const classArray = classesToRemove.split(' ');
        
        for (const className of classArray) {
          if (className.trim()) {
            el.classList.remove(className.trim());
          }
        }
        
        // Also force transparent background
        el.style.setProperty('background', 'transparent', 'important');
        el.style.setProperty('background-color', 'transparent', 'important');
      } catch (_) {}
    }
  }

  function addBlurEffectToTargetElements() {
    if (!isEnabled) return;
    
    // Target elements with the specific class pattern the user wants to modify
    // Look for elements that contain the max-xs force-hide-label pattern
    const targetSelector = '[class*="max-xs"][class*="force-hide-label"][class*="relative"][class*="z-1"][class*="flex"][class*="h-full"][class*="max-w-full"][class*="flex-1"][class*="flex-col"]';
    const elements = document.querySelectorAll(targetSelector);
    
    if (elements.length > 0) {
      // Only modify the LAST instances as requested by user
      // Take the last 2 elements to ensure we get the ones the user wants
      const lastElements = Array.from(elements).slice(-2);
      
      for (const el of lastElements) {
        try {
          // Check if element already has our blur classes to avoid duplicate application
          if (!el.classList.contains('backdrop-blur-sm')) {
            // Add the new classes: backdrop-blur-sm rounded-[28px] overflow-hidden
            el.classList.add('backdrop-blur-sm');
            el.classList.add('rounded-[28px]');
            el.classList.add('overflow-hidden');
          }
        } catch (_) {}
      }
    }
  }

  function setupObservers() {
    if (!isEnabled) { teardownObservers(); return; }

    // Clear any existing observers/intervals before re-creating
    teardownObservers();

    bodyObserver = new MutationObserver(() => {
      ensureBackgroundPicture();
      neutralizeInlineBackgrounds();
      forceSidebarTransparent();
      removeProblematicClasses();
      addBlurEffectToTargetElements();
    });
    if (document.body) {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    htmlObserver = new MutationObserver(() => {
      ensureBackgroundPicture();
      neutralizeInlineBackgrounds();
      forceSidebarTransparent();
      removeProblematicClasses();
      addBlurEffectToTargetElements();
    });
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme']
    });

    // Periodic guard in case SPA navigation removes it entirely
    periodicIntervalId = setInterval(() => {
      ensureBackgroundPicture();
      neutralizeInlineBackgrounds();
      forceSidebarTransparent();
      removeProblematicClasses();
      addBlurEffectToTargetElements();
    }, 500);

    // Handle history navigation (SPA-like)
    if (!pushStatePatched) {
      history.pushState = function () {
        const result = originalPushState.apply(this, arguments);
        setTimeout(ensureBackgroundPicture, 0);
        return result;
      };
      pushStatePatched = true;
    }
    if (!popstateListener) {
      popstateListener = () => setTimeout(ensureBackgroundPicture, 0);
      window.addEventListener('popstate', popstateListener);
    }
  }

  async function init() {
    // Load settings first
    await loadSettings();
    
    // Run early; DOM may not be ready, so guard
    if (document.body) {
      if (isEnabled) {
        forceDarkColorScheme();
        ensureBackgroundPicture();
        neutralizeInlineBackgrounds();
        forceSidebarTransparent();
        removeProblematicClasses();
        addBlurEffectToTargetElements();
      }
      setupObservers();
    } else {
      // Wait for body
      const readyObserver = new MutationObserver(() => {
        if (document.body) {
          if (isEnabled) {
            forceDarkColorScheme();
            ensureBackgroundPicture();
            neutralizeInlineBackgrounds();
            forceSidebarTransparent();
            removeProblematicClasses();
          }
          setupObservers();
          readyObserver.disconnect();
        }
      });
      readyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  try {
    init();
  } catch (err) {
    // Swallow to avoid breaking the page in case of unforeseen DOM changes
    // eslint-disable-next-line no-console
    console.debug('Persistent background init error', err);
  }
})();
