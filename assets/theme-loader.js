(function () {
  const storageKey = "cortinas-theme";
  const styleId = "dynamic-theme-style";
  const originalPalette = {
    background: [251, 247, 235],
    accent: [155, 122, 33],
    text: [84, 72, 69],
  };
  const premiumThemeLabels = {
    "wallpaper-1": "Teal Atelier",
    "wallpaper-11": "Amethyst Nocturne",
    "wallpaper-111": "Cerulean Linen",
    "wallpaper-abstract-flower": "Burnt Sienna Bloom",
    "wallpaper-buildings": "Terracotta Passage",
    "wallpaper-desert-blossom-red": "Carmine Dune",
    "wallpaper-desert-blossom-remembrance": "Rose Remembrance",
    "wallpaper-desert-blossom-soft": "Petal Veil",
    "wallpaper-desert-calm-crimson": "Crimson Horizon",
    "wallpaper-desert-calm": "Quiet Dune",
    "wallpaper-desert-cosmic-distortion": "Cosmic Indigo",
    "wallpaper-desert-dark": "Midnight Mesa",
    "wallpaper-desert-duality": "Dual Horizon",
    "wallpaper-desert-eclipse": "Eclipse Sand",
    "wallpaper-desert-emerald": "Solar Mirage",
    "wallpaper-desert-magic-distortion": "Mirage Prism",
    "wallpaper-desert-night": "Nocturne Dune",
    "wallpaper-desert-oil": "Burnt Terracotta",
    "wallpaper-desert-pastel-dream": "Pastel Reverie",
    "wallpaper-desert-pastel-soft": "Soft Solstice",
    "wallpaper-desert-remembrance-of-domination": "Regal Remembrance",
    "wallpaper-desert-remembrance-of-sacrifice": "Mahogany Remembrance",
    "wallpaper-desert-simple": "Bare Sand",
    "wallpaper-desert-vibrant": "Amethyst Blaze",
    "wallpaper-desert-white": "Cardinal Veil",
    "wallpaper-desert-whm40k-imperium": "Imperial Sandstone",
    "wallpaper-desert-whm40k-khorn": "Crimson Forge",
    "wallpaper-desert-whm40k-nurgle": "Verdigris Vale",
    "wallpaper-desert-whm40k-slaanesh": "Velvet Amaranth",
    "wallpaper-desert-whm40k-tseentch": "Indigo Arc",
    "wallpaper-desert": "Desert Atelier",
    "wallpaper-fantasy-japanese-street": "Lantern District",
  };

  function parseColor(value) {
    if (!value) return [0, 0, 0];

    const normalized = value.trim();
    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3) {
        return hex.split("").map((part) => parseInt(part + part, 16));
      }
      return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    }

    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgbMatch) return [0, 0, 0];

    return rgbMatch[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Math.round(Number.parseFloat(part.trim())) || 0);
  }

  function getRelativeLuminance(rgb) {
    const channel = rgb.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channel[0]) + (0.7152 * channel[1]) + (0.0722 * channel[2]);
  }

  function setThemeModeFromComputed() {
    const computed = getComputedStyle(document.documentElement);
    const bg = parseColor(computed.getPropertyValue("--bg"));
    const mode = getRelativeLuminance(bg) < 0.24 ? "dark" : "light";
    document.documentElement.setAttribute("data-theme-mode", mode);
  }

  function humanizeThemeId(themeId) {
    return themeId
      .split("-")
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }

  function getThemeLabel(theme) {
    if (!theme || !theme.id) return "";

    const rawLabel = typeof theme.label === "string" ? theme.label.trim() : "";
    if (rawLabel && !/^wallpaper[-\s]/i.test(rawLabel)) {
      return rawLabel;
    }

    return premiumThemeLabels[theme.id] || rawLabel || humanizeThemeId(theme.id);
  }

  function colorDistance(left, right) {
    return Math.sqrt(
      (left[0] - right[0]) ** 2 +
      (left[1] - right[1]) ** 2 +
      (left[2] - right[2]) ** 2
    );
  }

  function pickPaletteTarget(rgb) {
    const distances = Object.entries(originalPalette)
      .map(([key, sample]) => [key, colorDistance(rgb, sample)])
      .sort((left, right) => left[1] - right[1]);

    return distances[0][0];
  }

  function getThemePalette() {
    const computed = getComputedStyle(document.documentElement);
    return {
      background: parseColor(computed.getPropertyValue("--logo-strip-bg") || computed.getPropertyValue("--panel-bg")),
      accent: parseColor(computed.getPropertyValue("--accent") || computed.getPropertyValue("--primary")),
      text: parseColor(computed.getPropertyValue("--secondary")),
    };
  }

  function recolorLogoImage(image, palette) {
    const source = image.dataset.logoSrc || image.getAttribute("src");
    if (!source) return;

    const bitmap = new Image();
    bitmap.decoding = "async";
    bitmap.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.naturalWidth;
      canvas.height = bitmap.naturalHeight;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(bitmap, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = frame.data;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        if (!alpha) continue;

        const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
        const targetKey = pickPaletteTarget(rgb);
        const target = palette[targetKey];

        if (targetKey === "background") {
          pixels[index + 3] = 0;
          continue;
        }

        pixels[index] = target[0];
        pixels[index + 1] = target[1];
        pixels[index + 2] = target[2];
      }

      context.putImageData(frame, 0, 0);
      image.src = canvas.toDataURL("image/png");
    };
    bitmap.src = source;
  }

  function syncThemeLogos() {
    const palette = getThemePalette();
    document.querySelectorAll("[data-theme-logo]").forEach((image) => {
      recolorLogoImage(image, palette);
    });
  }

  function getThemeLink() {
    let link = document.getElementById(styleId);
    if (!link) {
      link = document.createElement("link");
      link.id = styleId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    return link;
  }

  function applyTheme(theme, basePath) {
    if (!theme || !theme.css || !theme.id) return;
    const cssPath = `${basePath.replace(/\/$/, "")}/${theme.css}`;
    const link = getThemeLink();
    link.href = cssPath;
    document.documentElement.setAttribute("data-theme", theme.id);
    link.onload = function () {
      setThemeModeFromComputed();
      syncThemeLogos();
    };
    // Fallback for cases where stylesheet is already cached and applied quickly.
    requestAnimationFrame(setThemeModeFromComputed);
  }

  async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`No se pudo cargar ${path}`);
    }
    return res.json();
  }

  async function initThemeSelector() {
    const selector = document.querySelector("[data-theme-selector]");
    if (!selector) return;

    const basePath = document.body.getAttribute("data-themes-base") || "./themes";
    const manifestPath = `${basePath.replace(/\/$/, "")}/manifest.json`;

    try {
      const manifest = await loadJson(manifestPath);
      const themes = manifest.themes || [];
      selector.innerHTML = "";

      themes.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = getThemeLabel(item);
        selector.appendChild(opt);
      });

      const saved = localStorage.getItem(storageKey);
      const defaultTheme = manifest.default || (themes[0] && themes[0].id);
      const selectedTheme = themes.some((t) => t.id === saved) ? saved : defaultTheme;

      if (!selectedTheme) return;
      selector.value = selectedTheme;
      const currentTheme = themes.find((item) => item.id === selectedTheme);
      applyTheme(currentTheme, basePath);

      selector.addEventListener("change", async (e) => {
        const selected = e.target.value;
        const data = themes.find((item) => item.id === selected);
        applyTheme(data, basePath);
        localStorage.setItem(storageKey, selected);
      });
    } catch (err) {
      console.error("Error cargando temas", err);
    }
  }

  initThemeSelector();
})();
