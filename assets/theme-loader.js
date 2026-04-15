(function () {
  const storageKey = "cortinas-theme";
  const styleId = "dynamic-theme-style";
  const originalPalette = {
    background: [251, 247, 235],
    accent: [155, 122, 33],
    text: [84, 72, 69],
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
      syncThemeLogos();
    };
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
        opt.textContent = item.label;
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
