(function () {
  "use strict";

  var PATH_ATTR = "ms-path";
  var PATH_ATTR_ALT = "ms_path";
  var PATH_ATTR_LEGACY = "dv-path";
  var PATH_ATTR_LEGACY_ALT = "dv_path";
  var PATH_ATTRS = [
    PATH_ATTR,
    PATH_ATTR_ALT,
    PATH_ATTR_LEGACY,
    PATH_ATTR_LEGACY_ALT
  ];
  var PATH_SELECTOR_ATTRS = PATH_ATTRS.concat([
    "ms-path-mode",
    "ms_path_mode",
    "dv-path-mode",
    "dv_path_mode",
    "ms-path-trigger",
    "ms_path_trigger",
    "dv-path-trigger",
    "dv_path_trigger"
  ]);
  var REVEAL_ATTR = "ms-reveal";
  var REVEAL_ATTR_LEGACY = "dv-reveal";
  var REVEAL_ATTRS = [REVEAL_ATTR, REVEAL_ATTR_LEGACY];
  var READY_FLAG = "msPathReady";
  var REVEAL_READY_FLAG = "msRevealReady";
  var OBSERVER_READY_FLAG = "msPathObserverReady";
  var GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";
  var SCROLL_TRIGGER_URL =
    "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/ScrollTrigger.min.js";

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", function () {
          reject(new Error("Failed loading " + url));
        });
        return;
      }

      var script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.addEventListener("load", function () {
        script.dataset.loaded = "true";
        resolve();
      });
      script.addEventListener("error", function () {
        reject(new Error("Failed loading " + url));
      });
      document.head.appendChild(script);
    });
  }

  function ensureGsap(needsScrollTrigger) {
    var gsapReady = window.gsap
      ? Promise.resolve()
      : loadScript(GSAP_URL).then(function () {
          if (!window.gsap) {
            throw new Error("GSAP unavailable.");
          }
        });

    return gsapReady.then(function () {
      if (!needsScrollTrigger) {
        return;
      }

      if (window.ScrollTrigger) {
        return;
      }
      return loadScript(SCROLL_TRIGGER_URL).then(function () {
        if (!window.ScrollTrigger) {
          throw new Error("ScrollTrigger unavailable.");
        }
      });
    });
  }

  function parseTokens(raw) {
    var tokens = {};

    if (!raw) {
      return tokens;
    }

    raw.split(/\s+/).forEach(function (token) {
      var match;

      if (!token) {
        return;
      }

      tokens[token] = true;

      match = token.match(/^([a-z-]+)-(.+)$/);
      if (match) {
        tokens[match[1]] = match[2];
      }
    });

    return tokens;
  }

  function readAttr(el, attrs) {
    var names = Array.isArray(attrs) ? attrs : [attrs];
    var raw;

    for (var i = 0; i < names.length; i += 1) {
      raw = el.getAttribute(names[i]);
      if (raw !== null && raw !== "") {
        return raw;
      }
    }

    return null;
  }

  function readNumber(el, attrs, fallback) {
    var raw = readAttr(el, attrs);
    var value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function readString(el, attrs, fallback) {
    var raw = readAttr(el, attrs);
    return raw === null || raw === "" ? fallback : raw;
  }

  function readDistance(el, attrs) {
    var raw = readAttr(el, attrs);
    var value;

    if (raw === null || raw === "") {
      return null;
    }

    value = Number(raw);
    if (Number.isFinite(value)) {
      return "+=" + value;
    }

    return raw;
  }

  function readScrub(el, attrs, fallback) {
    var raw = readAttr(el, attrs);
    var value;

    if (raw === null || raw === "") {
      return fallback;
    }

    if (raw === "true") {
      return true;
    }

    if (raw === "false") {
      return false;
    }

    value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function readBoolean(el, attrs, fallback) {
    var raw = readAttr(el, attrs);

    if (raw === null || raw === "") {
      return fallback;
    }

    return raw !== "false";
  }

  function parseProgress(raw, fallback) {
    var value;

    if (raw === null || raw === "") {
      return fallback;
    }

    if (/%$/.test(raw)) {
      value = Number(raw.slice(0, -1)) / 100;
    } else {
      value = Number(raw);
    }

    return Number.isFinite(value) ? value : fallback;
  }

  function readProgress(el, attrs, fallback) {
    return parseProgress(readAttr(el, attrs), fallback);
  }

  function pathAttr(name) {
    var snakeName = name.replace(/-/g, "_");
    return [
      "ms-path-" + name,
      "ms_path_" + snakeName,
      "dv-path-" + name,
      "dv_path_" + snakeName
    ];
  }

  function revealAttr(name) {
    return ["ms-reveal-" + name, "dv-reveal-" + name];
  }

  function normalizeMode(value) {
    return value === "static" ? "static" : "scroll";
  }

  function normalizeRepeat(value) {
    return value === "infinite" || value === "loop" ? -1 : 0;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isTouchDevice() {
    return (
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0
    );
  }

  function resolveScrollScrub(path, mode) {
    var scrub = readScrub(path, pathAttr("scrub"), true);
    var mobileScrub = readScrub(path, pathAttr("mobile-scrub"), null);

    if (mode === "scroll" && scrub === true && isTouchDevice()) {
      return mobileScrub === null ? 0.2 : mobileScrub;
    }

    return scrub;
  }

  function normalizeMobileScroll(value) {
    return value === "scrub" ? "scrub" : "play";
  }

  function resolveTarget(el, selector, fallback) {
    var closestTarget;
    var ownerSvg;

    if (!selector || selector === "self") {
      return fallback || el;
    }

    if (selector === "parent") {
      return el.parentElement || fallback || el;
    }

    closestTarget = el.closest ? el.closest(selector) : null;
    ownerSvg = el.closest ? el.closest("svg") : null;
    return (
      closestTarget ||
      (ownerSvg && ownerSvg.querySelector(selector)) ||
      document.querySelector(selector) ||
      fallback ||
      el
    );
  }

  function resolveSelector(el, selector) {
    var ownerSvg;

    if (!selector) {
      return null;
    }

    ownerSvg = el.closest ? el.closest("svg") : null;
    return (
      (ownerSvg && ownerSvg.querySelector(selector)) ||
      document.querySelector(selector)
    );
  }

  function getDefaultTrigger() {
    return (
      document.querySelector(".msc-page") ||
      document.scrollingElement ||
      document.documentElement ||
      document.body
    );
  }

  function getPathOptions(path) {
    var tokens = parseTokens(readAttr(path, PATH_ATTRS));
    var triggerSelector =
      readAttr(path, pathAttr("trigger")) ||
      tokens.trigger;
    var hasCustomTrigger = Boolean(triggerSelector);
    var trigger = hasCustomTrigger
      ? resolveTarget(path, triggerSelector, getDefaultTrigger())
      : null;
    var scrollDistance = readDistance(path, pathAttr("scroll-distance"));
    var mode = normalizeMode(
      readAttr(path, pathAttr("mode")) ||
        tokens.mode ||
        (tokens.static ? "static" : "scroll")
    );

    return {
      mode: mode,
      drawFrom: readNumber(
        path,
        pathAttr("from"),
        tokens.reverse ? 0 : 1
      ),
      drawTo: readNumber(
        path,
        pathAttr("to"),
        tokens.reverse ? 1 : 0
      ),
      scrub: resolveScrollScrub(path, mode),
      mobileScroll: normalizeMobileScroll(
        readString(path, pathAttr("mobile-scroll"), "play")
      ),
      pin: readBoolean(path, pathAttr("pin"), false),
      pinSpacing: readBoolean(path, pathAttr("pin-spacing"), true),
      start: readString(
        path,
        pathAttr("start"),
        hasCustomTrigger ? "top top" : 0
      ),
      end: readString(
        path,
        pathAttr("end"),
        scrollDistance || (hasCustomTrigger ? "bottom bottom" : "max")
      ),
      duration: readNumber(
        path,
        pathAttr("duration"),
        tokens.duration ? Number(tokens.duration) : 2
      ),
      delay: readNumber(
        path,
        pathAttr("delay"),
        tokens.delay ? Number(tokens.delay) : 0
      ),
      repeat: normalizeRepeat(
        readAttr(path, pathAttr("repeat")) ||
          tokens.repeat ||
          (tokens.infinite ? "infinite" : "once")
      ),
      tail: clamp(
        readNumber(
          path,
          pathAttr("tail"),
          tokens.tail ? Number(tokens.tail) : 0.32
        ),
        0.01,
        1
      ),
      offset: clamp(
        readProgress(
          path,
          pathAttr("offset"),
          tokens.offset ? parseProgress(tokens.offset, 0) : 0
        ),
        0,
        1
      ),
      trigger: trigger,
      rotateGradient:
        readAttr(path, pathAttr("gradient")) ||
        tokens.gradient ||
        "",
      rotateDuration: readNumber(
        path,
        pathAttr("gradient-duration"),
        5
      ),
      rotateCenter: readString(
        path,
        pathAttr("gradient-center"),
        ""
      ),
      rotateGradientOnMobile: readBoolean(
        path,
        pathAttr("gradient-mobile"),
        false
      ),
      debug: readAttr(path, pathAttr("debug")) !== null
    };
  }

  function setPathProgress(path, length, progress) {
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length * progress;
  }

  function initPath(path) {
    var length;
    var options;
    var gradient;
    var rotateCenter;
    var useMobilePlay;

    if (path.dataset[READY_FLAG] === "true" || !path.getTotalLength) {
      return;
    }

    length = path.getTotalLength();
    options = getPathOptions(path);
    useMobilePlay =
      options.mode === "scroll" &&
      isTouchDevice() &&
      options.mobileScroll !== "scrub";
    window.gsap.killTweensOf(path);
    setPathProgress(path, length, options.drawFrom);

    if (options.debug) {
      console.info("[ms-path] Initialized", {
        path: path,
        length: length,
        mode: options.mode,
        trigger: options.trigger || "document",
        start: options.start,
        end: options.end,
        scrub: options.scrub,
        mobileScroll: options.mobileScroll,
        mobilePlay: useMobilePlay,
        pin: options.pin,
        pinSpacing: options.pinSpacing,
        duration: options.duration,
        delay: options.delay,
        repeat: options.repeat,
        tail: options.tail,
        offset: options.offset
      });
    }

    if (options.mode === "static") {
      var tailLength = length * options.tail;
      var forward = options.drawFrom >= options.drawTo;
      var startOffset = length * options.offset;

      path.style.strokeDasharray = tailLength + " " + length;
      path.style.strokeDashoffset = forward
        ? tailLength - startOffset
        : -length + startOffset;

      window.gsap.to(path, {
        strokeDashoffset: forward
          ? -length - startOffset
          : tailLength + startOffset,
        duration: options.duration,
        ease: "none",
        repeat: options.repeat,
        repeatDelay: options.delay
      });
    } else if (useMobilePlay) {
      window.gsap.to(path, {
        strokeDashoffset: length * options.drawTo,
        duration: options.duration,
        delay: options.delay,
        ease: "none",
        scrollTrigger: {
          trigger: options.trigger || undefined,
          start: options.start,
          toggleActions: "play none none none",
          once: true,
          invalidateOnRefresh: true
        }
      });
    } else {
      window.gsap.to(path, {
        strokeDashoffset: length * options.drawTo,
        ease: "none",
        scrollTrigger: {
          trigger: options.trigger || undefined,
          start: options.start,
          end: options.end,
          pin: options.pin,
          pinSpacing: options.pinSpacing,
          scrub: options.scrub,
          invalidateOnRefresh: true
        }
      });
    }

    if (
      options.rotateGradient &&
      (!isTouchDevice() || options.rotateGradientOnMobile)
    ) {
      gradient = resolveSelector(path, options.rotateGradient);
      rotateCenter = options.rotateCenter ? " " + options.rotateCenter : "";

      if (gradient) {
        window.gsap.to(gradient, {
          attr: { gradientTransform: "rotate(360" + rotateCenter + ")" },
          duration: options.rotateDuration,
          ease: "none",
          repeat: -1
        });
      }
    }

    path.dataset[READY_FLAG] = "true";
  }

  function getRevealOptions(el) {
    var tokens = parseTokens(readAttr(el, REVEAL_ATTRS));

    return {
      y: readNumber(el, revealAttr("y"), tokens.y ? Number(tokens.y) : 40),
      duration: readNumber(el, revealAttr("duration"), 0.9),
      delay: readNumber(el, revealAttr("delay"), 0),
      start: readString(el, revealAttr("start"), "top 88%"),
      once: readString(el, revealAttr("once"), "true") !== "false",
      stagger: readNumber(el, revealAttr("stagger"), 0)
    };
  }

  function initReveal(el) {
    var options;
    var targets;

    if (el.dataset[REVEAL_READY_FLAG] === "true") {
      return;
    }

    options = getRevealOptions(el);
    targets = el.children.length && options.stagger > 0 ? el.children : el;

    window.gsap.from(targets, {
      y: options.y,
      opacity: 0,
      duration: options.duration,
      delay: options.delay,
      stagger: options.stagger,
      ease: "power3.out",
      scrollTrigger: {
        trigger: el,
        start: options.start,
        once: options.once
      }
    });

    el.dataset[REVEAL_READY_FLAG] = "true";
  }

  function showReducedMotionFallback(paths, reveals) {
    paths.forEach(function (path) {
      if (!path.getTotalLength) {
        return;
      }
      setPathProgress(path, path.getTotalLength(), 0);
    });

    reveals.forEach(function (el) {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  function refreshScrollTrigger() {
    if (!window.ScrollTrigger) {
      return;
    }

    window.ScrollTrigger.refresh();
  }

  function configureScrollTrigger() {
    if (!window.ScrollTrigger) {
      return;
    }

    window.ScrollTrigger.config({
      ignoreMobileResize: true
    });
  }

  function scheduleScrollTriggerRefresh() {
    if (!window.ScrollTrigger) {
      return;
    }

    refreshScrollTrigger();

    window.requestAnimationFrame(refreshScrollTrigger);
    window.setTimeout(refreshScrollTrigger, 120);
    window.setTimeout(refreshScrollTrigger, 500);
  }

  function initAll() {
    var paths = Array.prototype.slice.call(
      document.querySelectorAll(
        PATH_SELECTOR_ATTRS.map(function (attr) {
          return "[" + attr + "]";
        }).join(",")
      )
    );
    var reveals = Array.prototype.slice.call(
      document.querySelectorAll(
        REVEAL_ATTRS.map(function (attr) {
          return "[" + attr + "]";
        }).join(",")
      )
    );
    var prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    var needsScrollTrigger = reveals.length > 0;

    if (!paths.length && !reveals.length) {
      return;
    }

    if (prefersReducedMotion) {
      showReducedMotionFallback(paths, reveals);
      return;
    }

    if (!needsScrollTrigger) {
      needsScrollTrigger = paths.some(function (path) {
        return getPathOptions(path).mode !== "static";
      });
    }

    ensureGsap(needsScrollTrigger)
      .then(function () {
        if (needsScrollTrigger) {
          window.gsap.registerPlugin(window.ScrollTrigger);
          configureScrollTrigger();
        }
        paths.forEach(initPath);
        reveals.forEach(initReveal);
        if (needsScrollTrigger) {
          scheduleScrollTriggerRefresh();
        }
      })
      .catch(function (error) {
        console.error("[ms-path] Initialization failed:", error);
      });
  }

  window.msPathRefresh = function () {
    initAll();
    scheduleScrollTriggerRefresh();
  };

  window.dvPathRefresh = window.msPathRefresh;

  function watchForLatePaths() {
    if (
      document.documentElement.dataset[OBSERVER_READY_FLAG] === "true" ||
      !("MutationObserver" in window)
    ) {
      return;
    }

    document.documentElement.dataset[OBSERVER_READY_FLAG] = "true";

    var schedule;
    var observer = new MutationObserver(function () {
      window.clearTimeout(schedule);
      schedule = window.setTimeout(initAll, 80);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        PATH_ATTR,
        PATH_ATTR_ALT,
        PATH_ATTR_LEGACY,
        PATH_ATTR_LEGACY_ALT,
        "ms-path-scrub",
        "ms_path_scrub",
        "dv-path-scrub",
        "dv_path_scrub",
        "ms-path-mobile-scrub",
        "ms_path_mobile_scrub",
        "dv-path-mobile-scrub",
        "dv_path_mobile_scrub",
        "ms-path-mobile-scroll",
        "ms_path_mobile_scroll",
        "dv-path-mobile-scroll",
        "dv_path_mobile_scroll",
        "ms-path-trigger",
        "ms_path_trigger",
        "dv-path-trigger",
        "dv_path_trigger",
        "ms-path-scroll-distance",
        "ms_path_scroll_distance",
        "dv-path-scroll-distance",
        "dv_path_scroll_distance",
        "ms-path-mode",
        "ms_path_mode",
        "dv-path-mode",
        "dv_path_mode",
        "ms-path-duration",
        "ms_path_duration",
        "dv-path-duration",
        "dv_path_duration",
        "ms-path-delay",
        "ms_path_delay",
        "dv-path-delay",
        "dv_path_delay",
        "ms-path-repeat",
        "ms_path_repeat",
        "dv-path-repeat",
        "dv_path_repeat",
        "ms-path-tail",
        "ms_path_tail",
        "dv-path-tail",
        "dv_path_tail",
        "ms-path-offset",
        "ms_path_offset",
        "dv-path-offset",
        "dv_path_offset",
        "ms-path-gradient-mobile",
        "ms_path_gradient_mobile",
        "dv-path-gradient-mobile",
        "dv_path_gradient_mobile"
      ]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initAll();
      watchForLatePaths();
    });
  } else {
    initAll();
    watchForLatePaths();
  }

  window.addEventListener("load", scheduleScrollTriggerRefresh);
})();
