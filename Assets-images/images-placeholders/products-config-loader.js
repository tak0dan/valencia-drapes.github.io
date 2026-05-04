(function () {
  var CONFIG_PATH = "config/products-section.json";
  var STYLE_LINK_ID = "products-style-link";

  function isObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function mergeShallow(base, extension) {
    var result = Object.assign({}, base || {});
    if (!isObject(extension)) return result;
    Object.keys(extension).forEach(function (key) {
      if (extension[key] !== undefined && extension[key] !== null) {
        result[key] = extension[key];
      }
    });
    return result;
  }

  function findStyleLink() {
    return document.getElementById(STYLE_LINK_ID);
  }

  function resolveActiveStyle(themeSelection) {
    if (!themeSelection || !Array.isArray(themeSelection.styles) || !themeSelection.styles.length) {
      return null;
    }

    var strategy = String(themeSelection.strategy || "lastTrueWins").toLowerCase();
    var enabled = themeSelection.styles.filter(function (item) {
      return item && item.enabled === true;
    });

    if (!enabled.length) {
      return themeSelection.styles[0];
    }

    if (strategy === "firsttruewins") {
      return enabled[0];
    }

    return enabled[enabled.length - 1];
  }

  function matchesViewport(when, width) {
    if (!isObject(when)) return false;
    if (typeof when.minWidth === "number" && width < when.minWidth) return false;
    if (typeof when.maxWidth === "number" && width > when.maxWidth) return false;
    return true;
  }

  function resolveActiveSwitch(viewportSwitches, width) {
    if (!Array.isArray(viewportSwitches)) return "desktop";

    var match = viewportSwitches.find(function (entry) {
      return entry && typeof entry.name === "string" && matchesViewport(entry.when, width);
    });

    return match ? match.name : "desktop";
  }

  function normalizeOverlayPercent(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return "15%";
    var clamped = Math.max(0, Math.min(100, numeric));
    return String(clamped) + "%";
  }

  function applySectionConfig(sectionConfig, activeSwitch) {
    if (!sectionConfig || typeof sectionConfig.id !== "string") return;

    var sectionElement = document.getElementById(sectionConfig.id);
    if (!sectionElement) return;

    var base = isObject(sectionConfig.base) ? sectionConfig.base : {};
    var switchCases = isObject(sectionConfig.switchCases) ? sectionConfig.switchCases : {};
    var chosenCase = isObject(switchCases[activeSwitch]) ? switchCases[activeSwitch] : {};

    var measures = mergeShallow(base.measures, chosenCase.measures);
    var overrides = mergeShallow(base.overrides, chosenCase.overrides);

    if (typeof measures.top === "string") {
      sectionElement.style.setProperty("--products-section-top", measures.top);
    }
    if (typeof measures.bottom === "string") {
      sectionElement.style.setProperty("--products-section-bottom", measures.bottom);
    }

    if (overrides.titleScale !== undefined) {
      sectionElement.style.setProperty("--products-title-scale", String(overrides.titleScale));
    }
    if (overrides.tileOverlayPercent !== undefined) {
      sectionElement.style.setProperty("--products-tile-overlay-alpha", normalizeOverlayPercent(overrides.tileOverlayPercent));
    }
    if (typeof overrides.descriptionColor === "string") {
      sectionElement.style.setProperty("--products-description-color", overrides.descriptionColor);
    }
    if (typeof overrides.idleBorderColor === "string") {
      sectionElement.style.setProperty("--products-border-idle", overrides.idleBorderColor);
    }
    if (typeof overrides.hoverBorderColor === "string") {
      sectionElement.style.setProperty("--products-border-hover", overrides.hoverBorderColor);
    }
    if (typeof overrides.titleOutlineWidth === "number") {
      sectionElement.style.setProperty("--products-title-outline-width", overrides.titleOutlineWidth + "px");
    }
    if (typeof overrides.titleOutlineOpacity === "number") {
      sectionElement.style.setProperty("--products-title-outline-opacity", String(overrides.titleOutlineOpacity));
    }
  }

  function applyConfig(config) {
    var activeStyle = resolveActiveStyle(config.themeSelection);
    var styleLink = findStyleLink();

    if (styleLink && activeStyle && typeof activeStyle.css === "string") {
      styleLink.href = activeStyle.css;
      styleLink.dataset.activeStyle = activeStyle.id || "";
    }

    var activeSwitch = resolveActiveSwitch(config.viewportSwitches, window.innerWidth || 1280);

    if (Array.isArray(config.sections)) {
      config.sections.forEach(function (sectionConfig) {
        applySectionConfig(sectionConfig, activeSwitch);
      });
    }
  }

  function fetchConfig() {
    return fetch(CONFIG_PATH, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("products config request failed with " + response.status);
        }
        return response.json();
      });
  }

  function boot() {
    fetchConfig()
      .then(function (config) {
        applyConfig(config);
        window.addEventListener("resize", function () {
          applyConfig(config);
        });
      })
      .catch(function (error) {
        console.warn("Products config loader fallback:", error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
