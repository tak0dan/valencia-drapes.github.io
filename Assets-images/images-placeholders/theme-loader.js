(function () {
  const storageKey = "cortinas-theme";
  const storageVersionKey = "cortinas-theme-version";
  const storageVersion = "2";
  const styleId = "dynamic-theme-style";
  const fastLogoDevicePixelRatio = 1.25;
  const sharpLogoDevicePixelRatio = 3;
  const logoSourceCache = new Map();
  const logoRenderCache = new Map();
  const svgSourceCache = new Map();
  let themeApplySequence = 0;
  const legacyBrandLogoPath = "Assets-images/images-placeholders/logo.jpeg";
  const preferredBrandLogoPath = "Assets-images/images-placeholders/logo-ingama.svg";
  const brandLogoAccentHex = "#8a6c26";
  const brandLogoTextHex = "#473f3c";
  const heroPatternBackgroundHex = "#f1e7d1";
  const heroPatternMainHex = "#b44a2f";
  const heroPatternSecondaryHex = "#6d2f45";
  const heroPatternAccentHex = "#d89d3f";
  const heroPatternThemes = {
    zigzag: {
      file: "boho-zigzag.svg",
      size: "540px 540px",
    },
    arches: {
      file: "boho-arches.svg",
      size: "540px 540px",
    },
    chevron: {
      file: "boho-chevron.svg",
      size: "540px 540px",
    },
    rosette: {
      file: "boho-rosette.svg",
      size: "540px 540px",
    },
  };
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

  function getContrastRatio(foreground, background) {
    const foregroundLuminance = getRelativeLuminance(foreground);
    const backgroundLuminance = getRelativeLuminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function mixColors(left, right, ratio) {
    return left.map((value, index) => clampChannel((value * (1 - ratio)) + (right[index] * ratio)));
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function dedupeColors(colors) {
    const seen = new Set();
    return colors.filter((color) => {
      const key = color.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function pickForeground(backgrounds, candidates, minContrast = 4.5) {
    const ranked = dedupeColors(candidates)
      .map((candidate, index) => ({
        candidate,
        index,
        score: Math.min(...backgrounds.map((background) => getContrastRatio(candidate, background))),
      }));

    const passing = ranked.find((entry) => entry.score >= minContrast);
    if (passing) {
      return passing.candidate;
    }

    return ranked.sort((left, right) => right.score - left.score || left.index - right.index)[0].candidate;
  }

  function pickSurfaceSet(backgroundSets, foregroundCandidates, minContrast = 4.5) {
    const ranked = backgroundSets.map((backgrounds, index) => {
      const foreground = pickForeground(backgrounds, foregroundCandidates, minContrast);
      return {
        backgrounds,
        foreground,
        index,
        score: Math.min(...backgrounds.map((background) => getContrastRatio(foreground, background))),
      };
    });

    return ranked.find((entry) => entry.score >= minContrast)
      || ranked.sort((left, right) => right.score - left.score || left.index - right.index)[0];
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

  function getLogoPalette() {
    const computed = getComputedStyle(document.documentElement);
    return {
      background: parseColor(computed.getPropertyValue("--logo-strip-bg") || computed.getPropertyValue("--panel-bg")),
      accent: parseColor(computed.getPropertyValue("--color-accent-bg") || computed.getPropertyValue("--color-logo-mark") || computed.getPropertyValue("--primary")),
      text: parseColor(computed.getPropertyValue("--color-logo-text") || computed.getPropertyValue("--color-text-on-brand") || computed.getPropertyValue("--secondary")),
    };
  }

  function getPaletteSignature(palette) {
    return Object.values(palette)
      .map((value) => value.join(","))
      .join("|");
  }

  function normalizeLogoSource(source) {
    if (!source || /^data:/i.test(source)) return source;
    return source.replace(legacyBrandLogoPath, preferredBrandLogoPath);
  }

  function resolveThemeSiblingUrl(basePath, siblingPath) {
    const normalizedBase = String(basePath || "./themes").replace(/\/?$/, "/");
    return new URL(`../${siblingPath}`, new URL(normalizedBase, window.location.href)).href;
  }

  function getHeroPatternKey(themeId) {
    const normalized = String(themeId || "").toLowerCase();

    if (/teal|cyber|monokai|vibrant|prism|cosmic|colorful|tseentch|slaanesh/.test(normalized)) {
      return "chevron";
    }

    if (/gruvbox|crimson|khorn|rosewood|velvet|oil|red|domination/.test(normalized)) {
      return "zigzag";
    }

    if (/night|dark|mocha|eclipse|lantern|slate|desert/.test(normalized)) {
      return "arches";
    }

    return "rosette";
  }

  function isStaticBrandLogo(source) {
    const normalized = normalizeLogoSource(source);
    return typeof normalized === "string" && normalized.includes(preferredBrandLogoPath);
  }

  function getThemeSemanticPalette() {
    const computed = getComputedStyle(document.documentElement);
    return {
      bg: parseColor(computed.getPropertyValue("--bg")),
      surface: parseColor(computed.getPropertyValue("--surface")),
      surfaceAlt: parseColor(computed.getPropertyValue("--surface-alt")),
      panelBg: parseColor(computed.getPropertyValue("--panel-bg")),
      logoStripBg: parseColor(computed.getPropertyValue("--logo-strip-bg")),
      primary: parseColor(computed.getPropertyValue("--primary")),
      secondary: parseColor(computed.getPropertyValue("--secondary")),
      accent: parseColor(computed.getPropertyValue("--accent")),
      edge: parseColor(computed.getPropertyValue("--edge")),
      accentBg: parseColor(computed.getPropertyValue("--color-accent-bg")),
      accentBgStrong: parseColor(computed.getPropertyValue("--color-accent-bg-strong")),
      topbarBg: parseColor(computed.getPropertyValue("--color-topbar-bg")),
      footerBg: parseColor(computed.getPropertyValue("--color-footer-bg")),
      success: parseColor(computed.getPropertyValue("--color-success")),
    };
  }

  function syncThemeContrastTokens() {
    const rootStyle = document.documentElement.style;
    const palette = getThemeSemanticPalette();
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    const surfaceBlend = mixColors(palette.surface, palette.bg, 0.5);
    const pageSurfaces = [palette.bg, palette.surface, palette.panelBg, palette.logoStripBg];
    const baseCandidates = [
      palette.secondary,
      mixColors(palette.secondary, black, 0.22),
      mixColors(palette.secondary, white, 0.18),
      palette.primary,
      mixColors(palette.primary, black, 0.25),
      mixColors(palette.primary, white, 0.18),
      mixColors(palette.surface, black, 0.82),
      mixColors(palette.bg, black, 0.82),
      mixColors(palette.surface, white, 0.82),
      mixColors(palette.bg, white, 0.82),
      black,
      white,
    ];
    const textBase = pickForeground([palette.bg], baseCandidates, 4.5);
    const textOnSurface = pickForeground([palette.surface, palette.panelBg, palette.logoStripBg], baseCandidates, 4.5);
    const textOnBrand = pickForeground([palette.logoStripBg], baseCandidates, 4.5);
    const textStrong = pickForeground(pageSurfaces, baseCandidates, 4.5);
    const textSoft = pickForeground(
      [palette.bg, palette.surface, palette.panelBg],
      [
        mixColors(textOnSurface, palette.surface, 0.22),
        mixColors(textOnSurface, palette.panelBg, 0.24),
        mixColors(textOnSurface, palette.bg, 0.28),
        textOnSurface,
      ],
      3
    );
    const heading = pickForeground(
      [palette.bg, palette.surface, palette.panelBg],
      [
        palette.primary,
        mixColors(palette.primary, palette.secondary, 0.32),
        mixColors(palette.primary, black, 0.2),
        mixColors(palette.primary, white, 0.16),
        textStrong,
        palette.secondary,
      ],
      3.2
    );
    const logoText = pickForeground(
      [palette.logoStripBg],
      [
        textOnBrand,
        palette.secondary,
        heading,
        textStrong,
        black,
        white,
      ],
      4.5
    );
    const logoMark = pickForeground(
      [palette.logoStripBg],
      [
        palette.primary,
        mixColors(palette.primary, palette.accent, 0.34),
        palette.accent,
        mixColors(palette.accent, white, 0.22),
        mixColors(palette.accent, black, 0.24),
        heading,
        black,
        white,
      ],
      3
    );
    const link = pickForeground(
      [palette.bg],
      [
        palette.accent,
        mixColors(palette.accent, palette.primary, 0.36),
        mixColors(palette.accent, black, 0.18),
        mixColors(palette.accent, white, 0.16),
        heading,
        textStrong,
        black,
        white,
      ],
      4.5
    );
    const linkOnSurface = pickForeground(
      [palette.surface, palette.panelBg],
      [
        palette.accent,
        mixColors(palette.accent, palette.primary, 0.36),
        mixColors(palette.accent, black, 0.18),
        mixColors(palette.accent, white, 0.16),
        heading,
        textStrong,
        black,
        white,
      ],
      4.5
    );
    const linkOnBrand = pickForeground(
      [palette.logoStripBg],
      [
        palette.accent,
        mixColors(palette.accent, palette.primary, 0.36),
        mixColors(palette.accent, black, 0.18),
        mixColors(palette.accent, white, 0.16),
        heading,
        textStrong,
        black,
        white,
      ],
      4.5
    );
    const accentSurface = pickSurfaceSet(
      [
        [palette.accent, mixColors(palette.accent, black, 0.26)],
        [mixColors(palette.accent, palette.primary, 0.18), mixColors(palette.accent, black, 0.34)],
        [mixColors(palette.accent, black, 0.16), mixColors(palette.accent, black, 0.42)],
        [mixColors(palette.accent, white, 0.16), mixColors(palette.accent, black, 0.28)],
        [mixColors(palette.accent, black, 0.34), mixColors(palette.accent, black, 0.56)],
        [mixColors(palette.accent, white, 0.28), mixColors(palette.accent, white, 0.08)],
      ],
      [
        palette.secondary,
        mixColors(palette.secondary, black, 0.28),
        mixColors(palette.secondary, white, 0.22),
        palette.surface,
        mixColors(palette.surface, black, 0.82),
        mixColors(palette.surface, white, 0.82),
        black,
        white,
      ],
      4.5
    );
    const emphasisSurface = pickSurfaceSet(
      [
        [palette.primary, palette.secondary],
        [mixColors(palette.primary, black, 0.22), mixColors(palette.secondary, black, 0.22)],
        [mixColors(palette.primary, black, 0.38), mixColors(palette.secondary, black, 0.38)],
        [mixColors(palette.primary, black, 0.52), mixColors(palette.secondary, black, 0.52)],
        [mixColors(palette.primary, white, 0.22), mixColors(palette.secondary, white, 0.22)],
        [mixColors(palette.primary, white, 0.36), mixColors(palette.secondary, white, 0.36)],
        [mixColors(palette.primary, palette.bg, 0.18), mixColors(palette.secondary, palette.bg, 0.18)],
      ],
      [
        palette.surface,
        mixColors(palette.surface, white, 0.72),
        mixColors(palette.surface, black, 0.82),
        palette.secondary,
        mixColors(palette.secondary, black, 0.24),
        mixColors(palette.secondary, white, 0.2),
        black,
        white,
      ],
      4.5
    );
    const topbarSurface = pickSurfaceSet(
      [
        [mixColors(palette.bg, black, 0.55)],
        [mixColors(palette.secondary, black, 0.34)],
        [mixColors(palette.bg, black, 0.72)],
        [mixColors(palette.secondary, black, 0.5)],
        [mixColors(palette.surface, black, 0.78)],
      ],
      [
        palette.surface,
        mixColors(palette.surface, white, 0.78),
        mixColors(palette.secondary, white, 0.42),
        mixColors(palette.bg, white, 0.82),
        white,
        mixColors(palette.surface, black, 0.82),
        black,
      ],
      4.5
    );
    const footerSurface = pickSurfaceSet(
      [
        [mixColors(palette.secondary, black, 0.18)],
        [mixColors(palette.secondary, black, 0.34)],
        [mixColors(palette.bg, black, 0.58)],
        [mixColors(palette.secondary, palette.bg, 0.28)],
        [mixColors(palette.surface, black, 0.82)],
      ],
      [
        palette.surface,
        mixColors(palette.surface, white, 0.78),
        mixColors(palette.secondary, white, 0.42),
        mixColors(palette.bg, white, 0.82),
        white,
        mixColors(palette.surface, black, 0.82),
        black,
      ],
      4.5
    );
    const accentOnTopbar = pickForeground(
      [topbarSurface.backgrounds[0]],
      [
        palette.accent,
        mixColors(palette.accent, white, 0.22),
        mixColors(palette.accent, palette.primary, 0.28),
        topbarSurface.foreground,
      ],
      3.2
    );
    const accentOnFooter = pickForeground(
      [footerSurface.backgrounds[0]],
      [
        palette.accent,
        mixColors(palette.accent, white, 0.22),
        mixColors(palette.accent, palette.primary, 0.28),
        footerSurface.foreground,
      ],
      3.2
    );
    const onInk = pickForeground(
      [textStrong],
      [
        palette.surface,
        mixColors(palette.surface, white, 0.74),
        mixColors(palette.surface, black, 0.82),
        palette.bg,
        mixColors(palette.bg, white, 0.82),
        mixColors(palette.bg, black, 0.82),
        black,
        white,
      ],
      4.5
    );
    const onSuccess = pickForeground(
      [palette.success],
      [
        palette.secondary,
        mixColors(palette.secondary, black, 0.28),
        mixColors(palette.secondary, white, 0.24),
        mixColors(palette.bg, black, 0.82),
        mixColors(palette.surface, white, 0.82),
        black,
        white,
      ],
      4.5
    );
    const ratingStar = pickForeground(
      [palette.surface, palette.surfaceAlt, palette.panelBg, surfaceBlend],
      [
        palette.accent,
        mixColors(palette.accent, palette.primary, 0.3),
        mixColors(palette.accent, black, 0.24),
        mixColors(palette.accent, white, 0.16),
        link,
        heading,
        black,
        white,
      ],
      3
    );

    rootStyle.setProperty("--color-text-base", rgbToCss(textBase));
    rootStyle.setProperty("--color-text-on-surface", rgbToCss(textOnSurface));
    rootStyle.setProperty("--color-text-on-brand", rgbToCss(textOnBrand));
    rootStyle.setProperty("--color-logo-text", rgbToCss(logoText));
    rootStyle.setProperty("--color-logo-mark", rgbToCss(logoMark));
    rootStyle.setProperty("--color-text-strong", rgbToCss(textStrong));
    rootStyle.setProperty("--color-text-soft", rgbToCss(textSoft));
    rootStyle.setProperty("--color-heading", rgbToCss(heading));
    rootStyle.setProperty("--color-link", rgbToCss(link));
    rootStyle.setProperty("--color-link-on-surface", rgbToCss(linkOnSurface));
    rootStyle.setProperty("--color-link-on-brand", rgbToCss(linkOnBrand));
    rootStyle.setProperty("--color-topbar-bg", rgbToCss(topbarSurface.backgrounds[0]));
    rootStyle.setProperty("--color-topbar-link", rgbToCss(topbarSurface.foreground));
    rootStyle.setProperty("--color-footer-bg", rgbToCss(footerSurface.backgrounds[0]));
    rootStyle.setProperty("--color-footer-fg", rgbToCss(footerSurface.foreground));
    rootStyle.setProperty("--color-accent-bg", rgbToCss(accentSurface.backgrounds[0]));
    rootStyle.setProperty("--color-accent-bg-strong", rgbToCss(accentSurface.backgrounds[1]));
    rootStyle.setProperty("--color-on-accent", rgbToCss(accentSurface.foreground));
    rootStyle.setProperty("--color-emphasis-bg-start", rgbToCss(emphasisSurface.backgrounds[0]));
    rootStyle.setProperty("--color-emphasis-bg-end", rgbToCss(emphasisSurface.backgrounds[1]));
    rootStyle.setProperty("--color-on-emphasis", rgbToCss(emphasisSurface.foreground));
    rootStyle.setProperty("--color-on-ink", rgbToCss(onInk));
    rootStyle.setProperty("--color-on-dark", rgbToCss(pickForeground(
      [mixColors(palette.bg, black, 0.64)],
      [white, mixColors(palette.surface, white, 0.24), mixColors(palette.bg, white, 0.82), black],
      4.5
    )));
    rootStyle.setProperty("--color-accent-on-topbar", rgbToCss(accentOnTopbar));
    rootStyle.setProperty("--color-accent-on-footer", rgbToCss(accentOnFooter));
    rootStyle.setProperty("--color-accent-on-dark", rgbToCss(accentOnFooter));
    rootStyle.setProperty("--color-on-success", rgbToCss(onSuccess));
    rootStyle.setProperty("--color-rating-star", rgbToCss(ratingStar));
  }

  function loadLogoSource(source) {
    if (!logoSourceCache.has(source)) {
      logoSourceCache.set(source, new Promise((resolve, reject) => {
        const bitmap = new Image();
        bitmap.decoding = "async";
        bitmap.onload = function () {
          resolve(bitmap);
        };
        bitmap.onerror = function () {
          reject(new Error(`No se pudo cargar el logo base: ${source}`));
        };
        bitmap.src = source;
      }));
    }

    return logoSourceCache.get(source);
  }

  function loadSvgSource(source) {
    if (!svgSourceCache.has(source)) {
      svgSourceCache.set(source, fetch(source).then((response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el SVG: ${source}`);
        }
        return response.text();
      }));
    }

    return svgSourceCache.get(source);
  }

  function loadLogoSvgSource(source) {
    return loadSvgSource(source);
  }

  function getLogoRenderSize(image, bitmap, devicePixelRatioCap = sharpLogoDevicePixelRatio) {
    const rect = image.getBoundingClientRect();
    const cssWidth = rect.width || image.clientWidth || image.width || bitmap.naturalWidth;
    const aspectRatio = bitmap.naturalHeight / bitmap.naturalWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, devicePixelRatioCap);
    const targetWidth = Math.max(1, Math.min(bitmap.naturalWidth, Math.round(cssWidth * dpr)));
    const targetHeight = Math.max(1, Math.min(bitmap.naturalHeight, Math.round(targetWidth * aspectRatio)));

    return { width: targetWidth, height: targetHeight };
  }

  function renderRecoloredLogo(source, palette, width, height) {
    const cacheKey = `${source}|${getPaletteSignature(palette)}|${width}x${height}`;
    if (!logoRenderCache.has(cacheKey)) {
      logoRenderCache.set(cacheKey, loadLogoSource(source).then((bitmap) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("No se pudo inicializar el canvas del logo");
        }

        context.drawImage(bitmap, 0, 0, width, height);
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
        return canvas.toDataURL("image/png");
      }));
    }

    return logoRenderCache.get(cacheKey);
  }

  function renderThemedBrandLogoSvg(source, palette) {
    const cacheKey = `${source}|svg|${getPaletteSignature(palette)}`;
    if (!logoRenderCache.has(cacheKey)) {
      logoRenderCache.set(cacheKey, loadLogoSvgSource(source).then((svg) => {
        const themedSvg = svg
          .replace(new RegExp(brandLogoAccentHex, "gi"), rgbToCss(palette.accent))
          .replace(new RegExp(brandLogoTextHex, "gi"), rgbToCss(palette.text));

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(themedSvg)}`;
      }));
    }

    return logoRenderCache.get(cacheKey);
  }

  function getHeroPatternPalette() {
    const palette = getThemeSemanticPalette();
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    const darkMode = getRelativeLuminance(palette.bg) < 0.24;
    const primaryBase = colorDistance(palette.primary, black) < 12 ? mixColors(palette.bg, white, 0.18) : palette.primary;
    const accentBase = colorDistance(palette.accent, black) < 12 ? palette.accentBg : palette.accent;
    const edgeBase = colorDistance(palette.edge, black) < 12 ? mixColors(primaryBase, black, 0.24) : palette.edge;

    return {
      background: darkMode
        ? mixColors(primaryBase, edgeBase, 0.68)
        : mixColors(primaryBase, white, 0.76),
      main: darkMode
        ? mixColors(primaryBase, white, 0.16)
        : mixColors(primaryBase, black, 0.08),
      secondary: darkMode
        ? mixColors(edgeBase, white, 0.18)
        : mixColors(edgeBase, black, 0.04),
      accent: darkMode
        ? mixColors(accentBase, white, 0.26)
        : mixColors(accentBase, white, 0.18),
    };
  }

  function renderThemedHeroPatternSvg(source, palette) {
    const cacheKey = `${source}|hero|${getPaletteSignature(palette)}`;
    if (!logoRenderCache.has(cacheKey)) {
      logoRenderCache.set(cacheKey, loadSvgSource(source).then((svg) => {
        const themedSvg = svg
          .replace(new RegExp(heroPatternBackgroundHex, "gi"), rgbToCss(palette.background))
          .replace(new RegExp(heroPatternMainHex, "gi"), rgbToCss(palette.main))
          .replace(new RegExp(heroPatternSecondaryHex, "gi"), rgbToCss(palette.secondary))
          .replace(new RegExp(heroPatternAccentHex, "gi"), rgbToCss(palette.accent));

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(themedSvg)}`;
      }));
    }

    return logoRenderCache.get(cacheKey);
  }

  function setHeroPatternTheme(theme, basePath, sequence = themeApplySequence) {
    const rootStyle = document.documentElement.style;
    const key = getHeroPatternKey(theme && theme.id);
    const pattern = heroPatternThemes[key] || heroPatternThemes.rosette;
    const url = resolveThemeSiblingUrl(basePath, `assets/hero-patterns/${pattern.file}`);

    rootStyle.setProperty("--hero-pattern-size", pattern.size);

    renderThemedHeroPatternSvg(url, getHeroPatternPalette())
      .then((renderedSource) => {
        if (sequence !== themeApplySequence) return;
        rootStyle.setProperty("--hero-pattern-image", `url("${renderedSource}")`);
      })
      .catch((error) => {
        if (sequence !== themeApplySequence) return;
        rootStyle.setProperty("--hero-pattern-image", "none");
        console.error("Error tematizando ornamento del hero", error);
      });
  }

  function scheduleLogoSharpenPass(image, source, palette, bitmap, sequence) {
    const { width, height } = getLogoRenderSize(image, bitmap, sharpLogoDevicePixelRatio);
    const sharpenKey = `${sequence}|${source}|${getPaletteSignature(palette)}|${width}x${height}`;
    image.dataset.logoSharpenKey = sharpenKey;

    const schedule = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback.bind(window)
      : (callback) => window.setTimeout(callback, 48);

    schedule(() => {
      if (!image.isConnected || sequence !== themeApplySequence || image.dataset.logoSharpenKey !== sharpenKey) {
        return;
      }

      renderRecoloredLogo(source, palette, width, height)
        .then((renderedSource) => {
          if (!image.isConnected || sequence !== themeApplySequence || image.dataset.logoSharpenKey !== sharpenKey) {
            return;
          }

          if (image.src !== renderedSource) {
            image.src = renderedSource;
          }
        })
        .catch((error) => {
          console.error("Error afinando logo", error);
        });
    });
  }

  function recolorLogoImage(image, palette, sequence = themeApplySequence) {
    const source = normalizeLogoSource(image.dataset.logoSrc || image.getAttribute("src"));
    if (!source) return Promise.resolve();

    if (image.dataset.logoSrc !== source) {
      image.dataset.logoSrc = source;
    }

    if (isStaticBrandLogo(source)) {
      return renderThemedBrandLogoSvg(source, palette)
        .then((renderedSource) => {
          if (!image.isConnected || sequence !== themeApplySequence) {
            return;
          }

          if (image.getAttribute("src") !== renderedSource) {
            image.setAttribute("src", renderedSource);
          }
        })
        .catch((error) => {
          console.error("Error tematizando logo vectorial", error);
        });
    }

    return loadLogoSource(source)
      .then((bitmap) => {
        const { width, height } = getLogoRenderSize(image, bitmap, fastLogoDevicePixelRatio);
        const fastRender = renderRecoloredLogo(source, palette, width, height);
        scheduleLogoSharpenPass(image, source, palette, bitmap, sequence);
        return fastRender;
      })
      .then((renderedSource) => {
        if (!image.isConnected || sequence !== themeApplySequence) {
          return;
        }

        if (image.src !== renderedSource) {
          image.src = renderedSource;
        }
      })
      .catch((error) => {
        console.error("Error recoloreando logo", error);
      });
  }

  function syncThemeLogos(sequence = themeApplySequence) {
    const palette = getLogoPalette();
    document.querySelectorAll("[data-theme-logo]").forEach((image) => {
      recolorLogoImage(image, palette, sequence);
    });
  }

  function finalizeThemeApplication(sequence, theme, basePath) {
    if (sequence !== themeApplySequence) return;
    setThemeModeFromComputed();
    syncThemeContrastTokens();
    setHeroPatternTheme(theme, basePath, sequence);
    syncThemeLogos(sequence);
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

  function getThemeProfile(themeId) {
    if (!themeId) return "standard";

    const normalized = String(themeId).toLowerCase();
    return /premium|atelier|remembrance/.test(normalized) ? "premium" : "standard";
  }

  function setThemeProfile(themeId) {
    document.documentElement.setAttribute("data-theme-profile", getThemeProfile(themeId));
  }

  function getThemeModeOverride(theme) {
    if (!theme || typeof theme.mode !== "string") return null;

    const normalized = theme.mode.trim().toLowerCase();
    return normalized === "light" || normalized === "dark" ? normalized : null;
  }

  function applyTheme(theme, basePath) {
    if (!theme || !theme.css || !theme.id) return;
    setThemeProfile(theme.id);
    const modeOverride = getThemeModeOverride(theme);
    if (modeOverride) {
      document.documentElement.setAttribute("data-theme-mode", modeOverride);
    } else {
      document.documentElement.removeAttribute("data-theme-mode");
    }
    const cssPath = `${basePath.replace(/\/$/, "")}/${theme.css}`;
    const link = getThemeLink();
    const sequence = ++themeApplySequence;
    const currentHref = link.href;
    if (currentHref && currentHref === new URL(cssPath, window.location.href).href) {
      document.documentElement.setAttribute("data-theme", theme.id);
      finalizeThemeApplication(sequence, theme, basePath);
      return;
    }

    let fallbackTimer = null;
    const handleLoad = function () {
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
      }
      finalizeThemeApplication(sequence, theme, basePath);
    };

    link.onload = handleLoad;
    document.documentElement.setAttribute("data-theme", theme.id);
    link.href = cssPath;
    fallbackTimer = window.setTimeout(handleLoad, 250);
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

    if (localStorage.getItem(storageVersionKey) !== storageVersion) {
      localStorage.removeItem(storageKey);
      localStorage.setItem(storageVersionKey, storageVersion);
    }

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

  function initServicePageContent() {
    if (!document.body || document.body.classList.contains("reviews-page")) return;
    if (!document.querySelector(".service-shell")) return;

    const servicePageImages = {
      "antiguedad": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG_20190731_091523_1.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG_20190731_091533_1.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG-20210319-WA0059.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140539.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140546.jpg",
        ],
      },
      "asesoramiento": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140549.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140846.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140855.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140906.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140920.jpg",
        ],
      },
      "barras": {
        hero: "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135634.jpg",
        article: "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135642.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135704.jpg",
          "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135710.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140929.jpg",
        ],
      },
      "colocacion": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140934.jpg",
        article: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145456.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140942.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145057.jpg",
          "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135723.jpg",
        ],
      },
      "complementos-fallera": {
        hero: "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20200117_182326.jpg",
        article: "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20200118_113252.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20200118_114318.jpg",
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220221_175844.jpg",
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220221_175853.jpg",
        ],
      },
      "confeccion-medida": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/20241209_140956.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155702.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155709.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155718.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155727.jpg",
        ],
      },
      "cortinas-medida": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155801.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155807.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155818.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221014_155824.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221102_171000.jpg",
        ],
      },
      "cortinas-tecnicas-impresion-digital": {
        hero: "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20201130_090343.jpg",
        article: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20201031_114059.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG-20210603-WA0028.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG-20210219-WA0066.jpg",
          "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG-20210426-WA0038.jpg",
        ],
      },
      "domotica": {
        hero: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20201031_121031.jpg",
        article: "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220423_121604.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG-20210317-WA0031.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG-20210603-WA0029.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG-20210522-WA0028.jpg",
        ],
      },
      "estores-dia-noche": {
        hero: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210114_143349.jpg",
        article: "../../Assets-images/Ingama-photos/Cocina_combinada-3-001/IMG_20200605_203157.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG-20210603-WA0030.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG-20210522-WA0029.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221102_171008.jpg",
        ],
      },
      "estores-enrollables": {
        hero: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210123_130800.jpg",
        article: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210123_130849.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20201103_080922_687.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20201103_080922_708.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210424_124727.jpg",
        ],
      },
      "estores-paquete-plegables": {
        hero: "../../Assets-images/Ingama-photos/estor_paqueto-3-001/IMG_20191116_121704.jpg",
        article: "../../Assets-images/Ingama-photos/estor_paqueto-3-001/IMG_20191116_121749.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/estor_paqueto-3-001/IMG_20191116_121816.jpg",
          "../../Assets-images/Ingama-photos/estor_paqueto-3-001/IMG_20191116_121856.jpg",
          "../../Assets-images/Ingama-photos/estor_paqueto-3-001/IMG_20191120_163621.jpg",
        ],
      },
      "fabricantes": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_152556.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_154347.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221102_171028.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145112.jpg",
          "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG-20210523-WA0009.jpg",
        ],
      },
      "galerias": {
        hero: "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135728.jpg",
        article: "../../Assets-images/Ingama-photos/BARRAS-3-001/IMG_20230131_135733.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Tablas/IMG-20210227-WA0018.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG-20210520-WA0089.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG-20210604-WA0050.jpg",
        ],
      },
      "historia": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG_20190731_091556.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG_20191116_120015.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG-20210327-WA0011.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfects-3-001/IMG-20210327-WA0012.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221102_171035.jpg",
        ],
      },
      "hoteles-cortinas-ignifugas": {
        hero: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145511.jpg",
        article: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145515.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145211.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145441.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220726_145523.jpg",
        ],
      },
      "instalacion": {
        hero: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_160709.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230102_151814.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172628.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_152610.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191105_134911.jpg",
        ],
      },
      "marcas": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230307_143536.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230307_143550.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_152618.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_152630.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172638.jpg",
        ],
      },
      "mecanismos-manuales-motorizados": {
        hero: "../../Assets-images/Ingama-photos/Tablas/IMG_20191105_134920.jpg",
        article: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210424_124958.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191108_194636.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210508_094707.jpg",
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20210508_094800.jpg",
        ],
      },
      "medicion": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230307_143600.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20240625_151645.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_152654.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_153220.jpg",
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172647.jpg",
        ],
      },
      "paneles-japoneses": {
        hero: "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG_20191024_201232.jpg",
        article: "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG_20191024_201333.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG_20191108_143835.jpg",
          "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG_20191108_143909.jpg",
          "../../Assets-images/Ingama-photos/Panel_japones-3-001/IMG_20200121_154144.jpg",
        ],
      },
      "plisados": {
        hero: "../../Assets-images/Ingama-photos/Cocina_combinada-3-001/IMG_20200605_203209.jpg",
        article: "../../Assets-images/Ingama-photos/Cocina_combinada-3-001/IMG_20200910_205116.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_193455.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_193540.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_193900.jpg",
        ],
      },
      "prendas-rizo": {
        hero: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172715.jpg",
        article: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172721.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220802_172655.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_153231.jpg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG-20200723-WA0001.jpeg",
        ],
      },
      "rieles": {
        hero: "../../Assets-images/Ingama-photos/Tablas/IMG_20191108_194652.jpg",
        article: "../../Assets-images/Ingama-photos/Tablas/IMG_20191115_163356.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191115_192312.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191115_192731.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191129_142236.jpg",
        ],
      },
      "ropa-de-cama": {
        hero: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220803_203150.jpg",
        article: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220803_203536.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220803_203246.jpg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG-20200723-WA0003.jpeg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_153241.jpg",
        ],
      },
      "servicio-bordado": {
        hero: "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220315_115751.jpg",
        article: "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220315_115846.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220315_115852.jpg",
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220315_120135.jpg",
          "../../Assets-images/Ingama-photos/CAPA_FALLERA-3-001/IMG_20220316_090344.jpg",
        ],
      },
      "sistema-noche-dia-vertical-duomo": {
        hero: "../../Assets-images/Ingama-photos/Cocina_combinada-3-001/IMG_20200910_205129.jpg",
        article: "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20211023_094456.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/ESTOR_ENROLLABLE-3-001/IMG_20211023_095252.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_195725.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_154013.jpg",
        ],
      },
      "sistema-vertical": {
        hero: "../../Assets-images/Ingama-photos/Cocina_combinada-3-001/IMG_20200910_205152.jpg",
        article: "../../Assets-images/Ingama-photos/COCINA_ONDA-3-001/20251211_180001.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_195743.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_195814.jpg",
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_195944.jpg",
        ],
      },
      "tapiceria": {
        hero: "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG_20211123_173402.jpg",
        article: "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG_20211123_173416.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG-20210528-WA0011.jpeg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG-20210528-WA0013.jpeg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG-20210528-WA0015.jpeg",
        ],
      },
      "telas": {
        hero: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20240625_153003.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20240626_152302.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20221223_154539.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230102_151546.jpg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG_20200827_231257_811.jpg",
        ],
      },
      "textil-hogar": {
        hero: "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220803_203836.jpg",
        article: "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20240626_152315.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/PISOS_ENTEROS-3-001/IMG_20220803_203252.jpg",
          "../../Assets-images/Ingama-photos/Onda_perfecta_2-3-001/IMG_20230102_151552.jpg",
          "../../Assets-images/Ingama-photos/Tapiseria-3-001/IMG_20200827_231257_813.jpg",
        ],
      },
      "venecianas": {
        hero: "../../Assets-images/Ingama-photos/COCINA_ONDA-3-001/20251211_180014.jpg",
        article: "../../Assets-images/Ingama-photos/Tablas/IMG_20191129_142345.jpg",
        cards: [
          "../../Assets-images/Ingama-photos/VERTI_ALES-3-001/IMG_20220425_200008.jpg",
          "../../Assets-images/Ingama-photos/Tablas/IMG_20191211_142641.jpg",
          "../../Assets-images/Ingama-photos/COCINA_ONDA-3-001/20251211_180035.jpg",
        ],
      },
    };

    const servicePages = {
      antiguedad: {
        title: "Antiguedad",
        lead: "Recuperamos cortinajes clasicos y detalles textiles con una restauracion cuidada y funcional.",
        imageSet: "heritage",
        cards: [
          {
            title: "Restauracion respetuosa",
            text: "Revisamos forros, galones, pasamanerias y costuras para conservar el caracter original de cada pieza sin renunciar a una presentacion limpia y elegante.",
          },
          {
            title: "Actualizacion discreta",
            text: "Cuando hace falta, renovamos cintas, ganchos y sistemas de sujecion para mejorar seguridad, caida y uso diario con acabados casi invisibles.",
          },
          {
            title: "Valor decorativo duradero",
            text: "Es una solucion ideal para viviendas senoriales, despachos clasicos o piezas familiares que merecen seguir formando parte del espacio.",
          },
        ],
      },
      asesoramiento: {
        title: "Asesoramiento",
        lead: "Te orientamos en tejidos, colores y sistemas para que cada estancia funcione tan bien como se ve.",
        imageSet: "fabricLibrary",
        cards: [
          {
            title: "Seleccion guiada",
            text: "Comparamos visillos, opacos, linos, tecnicos y tapicerias teniendo en cuenta orientacion, privacidad, mantenimiento y estilo decorativo.",
          },
          {
            title: "Propuesta coherente",
            text: "Cruzamos telas, barras, rieles y acabados para que salon, dormitorio o negocio mantengan un lenguaje visual equilibrado de una estancia a otra.",
          },
          {
            title: "Decision con seguridad",
            text: "Nuestro objetivo es que elijas con muestras reales y criterios claros, evitando sorpresas en color, transparencia o caida final.",
          },
        ],
      },
      barras: {
        title: "Barras",
        lead: "Barras decorativas y tecnicas para vestir la ventana con estabilidad, presencia y buen deslizamiento.",
        imageSet: "hardware",
        cards: [
          {
            title: "Acabados que decoran",
            text: "Trabajamos barras en distintos diametros, metales y terminaciones para integrarlas con cortinas ligeras, ondas perfectas o visillos dobles.",
          },
          {
            title: "Soportes bien resueltos",
            text: "Elegimos fijaciones seguras segun pared, peso del tejido y vuelo necesario para que la cortina quede proporcionada y funcional.",
          },
          {
            title: "Detalle que cambia el conjunto",
            text: "Una barra bien escogida refuerza la arquitectura de la estancia y mejora la lectura visual de la ventana incluso cuando la cortina esta abierta.",
          },
        ],
      },
      colocacion: {
        title: "Colocacion",
        lead: "Terminamos cada proyecto con una colocacion precisa, limpia y ajustada al milimetro.",
        imageSet: "atelierService",
        cards: [
          {
            title: "Montaje sin improvisaciones",
            text: "Llegamos con herrajes, soportes y medidas revisadas para que barras, rieles y estores se instalen con rapidez y sin correcciones de ultima hora.",
          },
          {
            title: "Ajuste fino en obra",
            text: "Nivelamos, comprobamos recorridos y dejamos las caidas equilibradas para que el conjunto funcione desde el primer dia.",
          },
          {
            title: "Entrega cuidada",
            text: "Retiramos protecciones, revisamos el accionamiento y explicamos el uso y mantenimiento para que la experiencia final sea impecable.",
          },
        ],
      },
      "complementos-fallera": {
        title: "Complementos Fallera",
        lead: "Confeccionamos y coordinamos piezas textiles que respetan la tradicion y elevan la presencia del conjunto.",
        imageSet: "fallera",
        cards: [
          {
            title: "Acabados con identidad",
            text: "Trabajamos capas, fulares y detalles textiles con materiales seleccionados para mantener la elegancia propia de la indumentaria fallera.",
          },
          {
            title: "Color y textura en armonia",
            text: "Asesoramos en tonos, brillos y caidas para que cada complemento dialogue con el traje sin recargar el resultado final.",
          },
          {
            title: "Pieza pensada para lucir",
            text: "Cada encargo se prepara para ocasiones especiales, desfiles y actos donde el acabado, la comodidad y la presencia importan por igual.",
          },
        ],
      },
      "confeccion-medida": {
        title: "Confeccion a Medida",
        lead: "Patronamos y confeccionamos cada pieza en funcion del hueco, el tejido y la caida deseada.",
        imageSet: "waveCurtains",
        cards: [
          {
            title: "Taller adaptado al proyecto",
            text: "Definimos frunces, ondas, dobladillos y forros con medidas reales para que la cortina llegue lista para instalarse sin ajustes improvisados.",
          },
          {
            title: "Control de caida y proporciones",
            text: "La relacion entre altura, largura y peso del tejido se estudia antes de coser para lograr un frente ordenado y una lectura elegante.",
          },
          {
            title: "Calidad que se nota al abrir y cerrar",
            text: "Una buena confeccion mejora la duracion, el movimiento y la imagen del conjunto durante todo el uso diario.",
          },
        ],
      },
      "cortinas-medida": {
        title: "Cortinas a la Medida",
        lead: "Disenamos cortinas personalizadas para conseguir privacidad, control de luz y una presencia elegante en cada ambiente.",
        imageSet: "waveCurtains",
        cards: [
          {
            title: "Ambientes bien vestidos",
            text: "Combinamos visillos, opacos y tejidos decorativos para adaptar cada ventana al estilo del salon, dormitorio o proyecto comercial.",
          },
          {
            title: "Caida y confecciones precisas",
            text: "Estudiamos vuelo, arrastre, ondas y terminaciones para que la cortina mantenga proporciones bonitas incluso en ventanales grandes.",
          },
          {
            title: "Privacidad con personalidad",
            text: "La solucion final protege del sol y de las miradas sin perder luminosidad ni coherencia con el resto de la decoracion.",
          },
        ],
      },
      "cortinas-tecnicas-impresion-digital": {
        title: "Cortinas Tecnicas e Impresion Digital",
        lead: "Soluciones textiles de alto rendimiento con opcion de personalizacion grafica para espacios singulares.",
        imageSet: "contract",
        cards: [
          {
            title: "Prestacion tecnica real",
            text: "Seleccionamos tejidos screen, opacos o de control solar para responder a exigencias de uso intensivo, mantenimiento y confort visual.",
          },
          {
            title: "Imagen personalizada",
            text: "La impresion digital permite integrar graficas, colores corporativos o mensajes decorativos en estores y paneles de forma limpia y duradera.",
          },
          {
            title: "Pensado para negocio y proyecto",
            text: "Es una via muy util para oficinas, retail, hoteles o espacios expositivos que necesitan diferenciarse sin sacrificar funcionalidad.",
          },
        ],
      },
      domotica: {
        title: "Domotica",
        lead: "Integramos cortinas y estores automatizados en rutinas comodas, silenciosas y faciles de controlar.",
        imageSet: "dayNight",
        cards: [
          {
            title: "Automatizacion a medida",
            text: "Definimos motorizaciones y escenas segun uso diario, orientacion solar y tipo de estancia para que la luz se gestione con un solo gesto.",
          },
          {
            title: "Confort y eficiencia",
            text: "Programar apertura y cierre ayuda a proteger tejidos, reducir sobrecalentamiento y mantener la casa preparada incluso cuando no estas.",
          },
          {
            title: "Tecnologia que acompana la decoracion",
            text: "La instalacion queda integrada en el sistema textil, sin perder limpieza visual ni renunciar a la calidez del ambiente.",
          },
        ],
      },
      "estores-dia-noche": {
        title: "Estores Dia-Noche",
        lead: "Alternan franjas opacas y transluidas para graduar la entrada de luz con una estetica actual.",
        imageSet: "dayNight",
        cards: [
          {
            title: "Luz regulable al instante",
            text: "La superposicion de bandas permite pasar de una luz tamizada a una mayor privacidad sin recoger por completo el estor.",
          },
          {
            title: "Perfectos para estancias versatiles",
            text: "Funcionan muy bien en salones, dormitorios y zonas de trabajo donde la iluminacion cambia varias veces a lo largo del dia.",
          },
          {
            title: "Imagen ligera y contemporanea",
            text: "Su linea limpia encaja en interiores modernos y ayuda a mantener una ventana despejada, ordenada y facil de usar.",
          },
        ],
      },
      "estores-enrollables": {
        title: "Estores Enrollables",
        lead: "Sistemas limpios y resistentes para regular luz, proteger del sol y simplificar el mantenimiento diario.",
        imageSet: "rollerBlinds",
        cards: [
          {
            title: "Solucion practica y elegante",
            text: "Los enrollables son ideales para cocinas, despachos, dormitorios y estancias donde se busca una ventana ligera y facil de accionar.",
          },
          {
            title: "Tejidos para cada necesidad",
            text: "Podemos trabajar opciones screen, traslucidas u opacas segun el nivel de visibilidad, proteccion solar y privacidad que necesites.",
          },
          {
            title: "Mantenimiento sencillo",
            text: "Su estructura compacta y sus materiales tecnicos facilitan la limpieza y alargan la vida util del conjunto en el dia a dia.",
          },
        ],
      },
      "estores-paquete-plegables": {
        title: "Estores Paquete y Plegables",
        lead: "Textiles suaves y decorativos para ventanas que piden calidez, textura y una caida natural.",
        imageSet: "packageRoman",
        cards: [
          {
            title: "Caida con caracter textil",
            text: "Son perfectos para ambientes acogedores donde interesa ver el tejido protagonista y no solo un sistema tecnico de control solar.",
          },
          {
            title: "Linos, visillos y mezclas",
            text: "Trabajamos telas ligeras o con mas cuerpo para modular transparencia, volumen y presencia segun el estilo de la estancia.",
          },
          {
            title: "Elegancia relajada",
            text: "El plegado aporta movimiento y suavidad visual, especialmente en salones, comedores y dormitorios con un lenguaje decorativo natural.",
          },
        ],
      },
      fabricantes: {
        title: "Fabricantes",
        lead: "Colaboramos con fabricantes que responden bien en calidad, continuidad y acabados.",
        imageSet: "brandShowroom",
        cards: [
          {
            title: "Red de confianza",
            text: "Seleccionamos partners que nos permiten trabajar con regularidad de color, buen comportamiento del tejido y soluciones tecnicas fiables.",
          },
          {
            title: "Mas margen de eleccion",
            text: "Tener varios fabricantes de referencia nos ayuda a ofrecer al cliente mas opciones de estilo, presupuesto y prestaciones reales.",
          },
          {
            title: "Resultado consistente",
            text: "La calidad del proveedor influye en la caida, el mantenimiento y la durabilidad final, por eso cuidamos mucho esa seleccion.",
          },
        ],
      },
      galerias: {
        title: "Galerias",
        lead: "Ocultan sistemas y rematan la ventana con una presencia mas arquitectonica y cuidada.",
        imageSet: "hardware",
        cards: [
          {
            title: "Remate visual limpio",
            text: "Las galerias ayudan a esconder rieles y soportes para que la mirada se quede en la cortina y no en la mecanica del conjunto.",
          },
          {
            title: "Integracion con el ambiente",
            text: "Se pueden adaptar a interiores clasicos, contemporaneos o contract, segun materiales, lineas y dimension del frente.",
          },
          {
            title: "Mas presencia en grandes huecos",
            text: "En ventanales amplios o composiciones dobles aportan continuidad y terminacion profesional, especialmente cuando todo esta hecho a medida.",
          },
        ],
      },
      historia: {
        title: "Historia",
        lead: "Mas de cuatro decadas de oficio textil en Valencia, combinando tradicion, taller y gusto por el detalle.",
        imageSet: "heritage",
        cards: [
          {
            title: "Una trayectoria construida en taller",
            text: "Nuestra historia nace del trabajo artesanal, del conocimiento del tejido y de una manera cercana de acompanar cada proyecto.",
          },
          {
            title: "Evolucion sin perder esencia",
            text: "Hemos incorporado sistemas tecnicos, motorizaciones y soluciones contract manteniendo la misma exigencia en confeccion y montaje.",
          },
          {
            title: "Experiencia aplicada hoy",
            text: "Todo lo aprendido durante anos se traduce en mejores decisiones sobre materiales, proporciones, durabilidad y acabados.",
          },
        ],
      },
      "hoteles-cortinas-ignifugas": {
        title: "Hoteles y Cortinas Ignifugas",
        lead: "Equipamos habitaciones y zonas comunes con textiles certificados, elegantes y preparados para un uso intensivo.",
        imageSet: "contract",
        cards: [
          {
            title: "Seguridad y presencia",
            text: "Trabajamos tejidos ignifugos que responden a exigencias normativas sin renunciar a una imagen cuidada y confortable para el huesped.",
          },
          {
            title: "Pensado para operativa hotelera",
            text: "Priorizamos soluciones faciles de mantener, resistentes al uso continuado y compatibles con los ritmos de limpieza y reposicion.",
          },
          {
            title: "Contract con identidad",
            text: "Cada proyecto puede mantener su estilo propio mediante colores, texturas y configuraciones que refuercen la personalidad del establecimiento.",
          },
        ],
      },
      instalacion: {
        title: "Instalacion",
        lead: "Instalamos cortinas, estores, barras, rieles y motorizaciones con criterio tecnico y acabado limpio.",
        imageSet: "atelierService",
        cards: [
          {
            title: "Preparacion previa",
            text: "Revisamos soporte, alineacion, alturas y tipo de accionamiento antes de fijar nada para evitar tensiones o desviaciones posteriores.",
          },
          {
            title: "Montaje profesional",
            text: "Cuidamos nivel, separaciones, vuelos y remates para que el sistema funcione suave y la cortina conserve la caida prevista.",
          },
          {
            title: "Puesta en marcha final",
            text: "Probamos recorridos, recogidas y motorizaciones para entregar un conjunto listo para usar y facil de mantener.",
          },
        ],
      },
      marcas: {
        title: "Marcas",
        lead: "Trabajamos con firmas reconocidas para ofrecer tejidos y sistemas con buena respuesta estetica y tecnica.",
        imageSet: "brandShowroom",
        cards: [
          {
            title: "Marcas que suman valor",
            text: "Elegimos colecciones con personalidad, continuidad y calidad de fabricacion para que la propuesta final tenga recorrido y coherencia.",
          },
          {
            title: "Variedad bien curada",
            text: "No se trata de acumular catalogos, sino de contar con marcas que cubran estilos, presupuestos y necesidades concretas de proyecto.",
          },
          {
            title: "Confianza desde la muestra hasta la entrega",
            text: "Cuando la marca responde bien, el proceso es mas fluido y el cliente percibe mayor seguridad en acabado, color y comportamiento del tejido.",
          },
        ],
      },
      "mecanismos-manuales-motorizados": {
        title: "Mecanismos Manuales y Motorizados",
        lead: "Escogemos el accionamiento adecuado para cada ventana, peso textil y frecuencia de uso.",
        imageSet: "hardware",
        cards: [
          {
            title: "La mecanica correcta",
            text: "No todas las soluciones piden motor: valoramos altura, accesibilidad, tamano y comodidad para proponer el sistema mas sensato.",
          },
          {
            title: "Suavidad y duracion",
            text: "Un buen mecanismo mejora la experiencia diaria, reduce desgaste y hace que el textil conserve su caida sin tirones ni deformaciones.",
          },
          {
            title: "Preparado para crecer",
            text: "Podemos dejar soluciones manuales muy refinadas o configurar mecanismos listos para evolucionar a motorizacion y domotica.",
          },
        ],
      },
      medicion: {
        title: "Medicion",
        lead: "Tomamos medidas exactas para que el resultado final se vea proporcionado y funcione sin correcciones.",
        imageSet: "atelierService",
        cards: [
          {
            title: "Lectura completa del hueco",
            text: "Medimos ancho, alto, desplomes, radiadores, muebles y encuentros para decidir desde donde debe arrancar y terminar cada solucion textil.",
          },
          {
            title: "Base de una buena confeccion",
            text: "Una medicion precisa es la diferencia entre una cortina que simplemente cabe y otra que cae bien, recoge bien y luce mejor.",
          },
          {
            title: "Menos incidencias, mejor resultado",
            text: "Al anticipar interferencias y necesidades de fijacion evitamos retrasos y garantizamos un montaje mas rapido y limpio.",
          },
        ],
      },
      "paneles-japoneses": {
        title: "Paneles Japoneses",
        lead: "Lineas puras y desplazamiento suave para grandes ventanales y divisiones ligeras de espacio.",
        imageSet: "panels",
        cards: [
          {
            title: "Ideal para huecos amplios",
            text: "Los paneles japoneses funcionan especialmente bien en salidas a terraza, miradores y frentes acristalados de gran anchura.",
          },
          {
            title: "Orden visual y ritmo",
            text: "El sistema por vias crea una lectura serena y arquitectonica, con tejido plano y una apertura muy comoda.",
          },
          {
            title: "Tambien como separador",
            text: "Ademas de vestir la ventana, pueden usarse para sectorizar espacios de forma ligera y elegante sin levantar obra.",
          },
        ],
      },
      plisados: {
        title: "Plisados",
        lead: "Soluciones ligeras y versatiles para ventanas especiales, hojas oscilobatientes y huecos de geometria compleja.",
        imageSet: "vertical",
        cards: [
          {
            title: "Adaptacion a medidas complejas",
            text: "Los plisados resuelven muy bien lucernarios, buhardillas y ventanas donde otros sistemas no consiguen un ajuste limpio.",
          },
          {
            title: "Control de luz sin peso visual",
            text: "Su estructura liviana deja una ventana despejada y ayuda a tamizar la entrada de luz con mucha delicadeza.",
          },
          {
            title: "Comodidad en el uso diario",
            text: "Bien instalados son practicos, discretos y muy eficaces cuando se necesita funcionalidad sin renunciar a una imagen afinada.",
          },
        ],
      },
      "prendas-rizo": {
        title: "Prendas de Rizo",
        lead: "Textiles suaves, absorbentes y resistentes para hogar, apartamento turistico y uso profesional.",
        imageSet: "bedroom",
        cards: [
          {
            title: "Confort al primer contacto",
            text: "Seleccionamos prendas de rizo que transmiten sensacion de limpieza, suavidad y calidad desde el primer uso.",
          },
          {
            title: "Pensadas para lavados frecuentes",
            text: "Priorizamos gramajes y acabados que mantengan absorcion, volumen y buena presencia incluso con un mantenimiento intensivo.",
          },
          {
            title: "Imagen cuidada en banos y suites",
            text: "El rizo adecuado completa la experiencia del cliente o del hogar y refuerza la sensacion global de confort y detalle.",
          },
        ],
      },
      rieles: {
        title: "Rieles",
        lead: "Rieles discretos y robustos para movimientos suaves, trazados limpios y cortinas bien guiadas.",
        imageSet: "hardware",
        cards: [
          {
            title: "Discrecion visual",
            text: "Son la mejor opcion cuando se quiere que el protagonismo recaiga por completo en el tejido y no en el herraje.",
          },
          {
            title: "Recorridos precisos",
            text: "Trabajamos rieles rectos o adaptados al hueco para asegurar deslizamiento continuo y una apertura comoda incluso en largos grandes.",
          },
          {
            title: "Compatibles con distintos estilos",
            text: "Pueden integrarse en vivienda, hoteleria o proyecto contemporaneo gracias a su perfil limpio y a su buena respuesta tecnica.",
          },
        ],
      },
      "ropa-de-cama": {
        title: "Ropa de Cama",
        lead: "Vestimos el dormitorio con textiles suaves, bien coordinados y pensados para descansar mejor.",
        imageSet: "bedroom",
        cards: [
          {
            title: "Capas de confort",
            text: "Sabanas, fundas, cuadrantes y colchas se seleccionan para que el dormitorio gane calidez y una imagen cuidada sin recargar.",
          },
          {
            title: "Coordinacion con el resto del ambiente",
            text: "Relacionamos la ropa de cama con cortinas, tapicerias y tonos de pared para construir un conjunto armonico y sereno.",
          },
          {
            title: "Dormitorios que invitan a quedarse",
            text: "La combinacion adecuada de tacto, color y volumen transforma la cama en el centro visual y sensorial de la estancia.",
          },
        ],
      },
      "servicio-bordado": {
        title: "Servicio de Bordado",
        lead: "Personalizamos textiles con bordados finos para hogar, regalo, uniformidad y proyectos especiales.",
        imageSet: "embroidery",
        cards: [
          {
            title: "Bordado con identidad",
            text: "Aplicamos iniciales, nombres, logotipos o motivos decorativos sobre piezas textiles con una ejecucion limpia y bien proporcionada.",
          },
          {
            title: "Detalle que eleva la pieza",
            text: "Un buen bordado convierte un textil cotidiano en una pieza mas personal, mas elegante y con mayor valor percibido.",
          },
          {
            title: "Ideal para regalo o proyecto corporativo",
            text: "Es una opcion muy apreciada en ajuar, hosteleria, eventos y regalos con intencion, donde el detalle marca la diferencia.",
          },
        ],
      },
      "sistema-noche-dia-vertical-duomo": {
        title: "Sistema Noche y Dia Vertical Duomo",
        lead: "Un sistema vertical contemporaneo para modular entrada de luz y privacidad con gran precision.",
        imageSet: "dayNight",
        cards: [
          {
            title: "Control vertical refinado",
            text: "La combinacion de franjas y orientacion permite jugar con luz, visibilidad y ambiente de manera muy flexible.",
          },
          {
            title: "Adecuado para grandes ventanales",
            text: "Su lectura vertical estiliza el hueco y facilita un manejo comodo en ventanas amplias o zonas de paso a terraza.",
          },
          {
            title: "Tecnica con imagen decorativa",
            text: "Aporta orden y modernidad sin perder calidez, especialmente cuando se integra en interiores de linea limpia.",
          },
        ],
      },
      "sistema-vertical": {
        title: "Sistema Vertical",
        lead: "Lamas verticales para regular luz, orientar vistas y mantener una imagen sobria y profesional.",
        imageSet: "vertical",
        cards: [
          {
            title: "Muy eficaz en huecos grandes",
            text: "Las lamas verticales responden muy bien en ventanales anchos, oficinas, estudios y salidas a exterior donde la luz cambia durante el dia.",
          },
          {
            title: "Orientacion precisa",
            text: "Permiten matizar la incidencia solar y la privacidad con pequenos ajustes, sin necesidad de recoger completamente el sistema.",
          },
          {
            title: "Imagen limpia y actual",
            text: "Su lenguaje recto y ordenado encaja especialmente bien en espacios contemporaneos y proyectos de uso profesional.",
          },
        ],
      },
      tapiceria: {
        title: "Tapiceria",
        lead: "Renovamos sofas, butacas y cabeceros con tejidos que mejoran confort, duracion y presencia visual.",
        imageSet: "upholstery",
        cards: [
          {
            title: "Nueva vida para cada pieza",
            text: "Una buena tapiceria transforma el mueble, actualiza el ambiente y permite conservar estructuras que siguen mereciendo la pena.",
          },
          {
            title: "Tejidos segun uso real",
            text: "Proponemos opciones resistentes, faciles de limpiar o especialmente agradables al tacto segun el ritmo de cada hogar o negocio.",
          },
          {
            title: "Integracion con el resto del proyecto",
            text: "Coordinamos colores y texturas con cortinas, ropa de cama o cojineria para que todo el espacio se perciba mas armonico.",
          },
        ],
      },
      telas: {
        title: "Telas",
        lead: "Un catalogo cuidado de tejidos decorativos y tecnicos para proyectos residenciales y profesionales.",
        imageSet: "fabricLibrary",
        cards: [
          {
            title: "Selecciones con criterio",
            text: "Linos, visillos, opacos, terciopelos y tejidos tecnicos se valoran por tacto, transparencia, mantenimiento y comportamiento real.",
          },
          {
            title: "Muestras para decidir mejor",
            text: "Ver el tejido en contexto ayuda a entender como trabaja la luz sobre el color y como se comportara la caida una vez confeccionado.",
          },
          {
            title: "La base de un buen proyecto",
            text: "Una tela bien elegida condiciona confort, estilo y durabilidad, por eso le damos un papel central en cada propuesta.",
          },
        ],
      },
      "textil-hogar": {
        title: "Textil Hogar",
        lead: "Coordinamos cortinas, cama, cojineria y detalles textiles para construir espacios mas calidos y completos.",
        imageSet: "bedroom",
        cards: [
          {
            title: "Mirada de conjunto",
            text: "No tratamos cada pieza por separado: buscamos que todos los textiles conversen entre si y refuercen la personalidad del ambiente.",
          },
          {
            title: "Confort visual y tactil",
            text: "La mezcla de tejidos, tonos y volumenes bien pensada mejora la sensacion de abrigo y hace que la estancia se sienta terminada.",
          },
          {
            title: "Soluciones para cada ritmo de vida",
            text: "Ajustamos las propuestas a hogares familiares, segundas residencias o alojamientos que necesitan belleza y mantenimiento razonable.",
          },
        ],
      },
      venecianas: {
        title: "Venecianas",
        lead: "Control solar preciso con una solucion ligera, ordenada y muy versatil.",
        imageSet: "vertical",
        cards: [
          {
            title: "Luz orientada con exactitud",
            text: "Las lamas permiten regular entrada de sol, vistas y privacidad de forma inmediata, algo muy util en cocinas, despachos y zonas de trabajo.",
          },
          {
            title: "Materiales para distintos ambientes",
            text: "Podemos trabajar opciones que aporten calidez, resistencia o una lectura mas tecnica segun el espacio y su mantenimiento.",
          },
          {
            title: "Ventana despejada",
            text: "Su estructura compacta ayuda a mantener el hueco limpio visualmente, con una presencia comedida y funcional.",
          },
        ],
      },
    };

    function buildIntroParagraphs(pageData) {
      if (Array.isArray(pageData.description) && pageData.description.length) {
        return pageData.description;
      }

      const intro = `${pageData.title} es una de las especialidades de Ingama Textil dentro del asesoramiento, la confeccion y la instalacion a medida para vivienda, comercio y proyectos contract. ${pageData.lead}`;
      const detail = pageData.cards[0] ? pageData.cards[0].text : "";
      return [intro, detail].filter(Boolean);
    }

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const menuIndex = pathParts.lastIndexOf("menu");
    const slug = menuIndex >= 0 ? pathParts[menuIndex + 1] : "";
    const pageData = servicePages[slug];
    if (!pageData) return;

    const imageSet = servicePageImages[slug];
    const breadcrumb = document.querySelector(".breadcrumb");
    const titleNode = document.querySelector(".hero-panel h1");
    const leadNode = document.querySelector(".hero-panel .lead");
    const sectionIntro = document.querySelector(".section-intro");
    const postCards = document.querySelectorAll(".post-card");

    document.title = `${pageData.title} | Ingama Textil`;
    document.body.style.setProperty("--hero-image", `url("${imageSet.hero}")`);
    document.body.style.setProperty("--article-image", `url("${imageSet.article}")`);

    if (breadcrumb) {
      breadcrumb.innerHTML = `<a href="../../index.html">Inicio</a> / ${pageData.title}`;
    }

    if (titleNode) {
      titleNode.textContent = pageData.title;
    }

    if (leadNode) {
      leadNode.textContent = pageData.lead;
    }

    if (sectionIntro) {
      const introParagraphs = buildIntroParagraphs(pageData)
        .map((paragraph) => `<p>${paragraph}</p>`)
        .join("");

      sectionIntro.innerHTML = `
        <h2>Descripcion</h2>
        ${introParagraphs}
      `;
    }

    postCards.forEach((card, index) => {
      const content = pageData.cards[index];
      if (!content) return;

      const imageSrc = imageSet.cards[index % imageSet.cards.length];
      card.innerHTML = `
        <img
          class="post-photo"
          src="${imageSrc}"
          alt="${pageData.title}: ${content.title}"
          loading="lazy"
          decoding="async"
          width="1600"
          height="1000"
        />
        <h2>${content.title}</h2>
        <p>${content.text}</p>
      `;
    });
  }

  initThemeSelector();
  initServicePageContent();
})();
