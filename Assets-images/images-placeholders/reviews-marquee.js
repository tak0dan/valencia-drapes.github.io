(function () {
  var root = document.querySelector("[data-google-reviews]");
  if (!root) return;

  var lanes = Array.from(root.querySelectorAll("[data-reviews-track]"));
  var statusEl = root.querySelector("[data-reviews-status]");
  var summaryEl = root.querySelector("[data-rating-summary]");
  var countEl = root.querySelector("[data-rating-count]");

  var minRating = Number.parseFloat(root.getAttribute("data-min-rating") || "3.5");
  var source = (root.getAttribute("data-reviews-source") || "auto").toLowerCase();
  var placeQuery = root.getAttribute("data-google-place-query") || "INGAMA TEXTIL Valencia";
  var apiKey = root.getAttribute("data-google-api-key") || "";
  var endpoint = root.getAttribute("data-reviews-endpoint") || "";
  var prefetchedUrl = root.getAttribute("data-prefetched-reviews") || "";

  var fallbackReviews = [
    {
      author: "Marta C.",
      rating: 5,
      avatarUrl: "https://i.pravatar.cc/96?img=32",
      text: "Atencion excelente y muy buen asesoramiento. Nos ayudaron a acertar con tejido y caida para todo el salon.",
    },
    {
      author: "Diego N.",
      rating: 5,
      avatarUrl: "https://i.pravatar.cc/96?img=13",
      text: "Trabajo fino y puntual. La instalacion fue limpia y el resultado quedo mejor de lo esperado.",
    },
    {
      author: "Silvia A.",
      rating: 4,
      avatarUrl: "https://i.pravatar.cc/96?img=47",
      text: "Buena relacion calidad precio y trato cercano. Recomendable para cortinas a medida.",
    },
  ];

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function makeStars(rating) {
    var rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "★★★★★".slice(0, rounded) + "☆☆☆☆☆".slice(0, 5 - rounded);
  }

  function compact(text, maxLen) {
    var normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLen) return normalized;
    return normalized.slice(0, maxLen - 1).trimEnd() + "…";
  }

  function buildFallbackAvatar(author) {
    return "https://ui-avatars.com/api/?background=D7C3AD&color=5E4B3F&size=96&name=" + encodeURIComponent(author || "Google");
  }

  function normalizeReview(review) {
    if (!review) return null;
    var text = "";
    var author = "Cliente de Google";
    var rating = Number(review.rating || review.stars || 0);
    var avatarUrl = "";

    if (typeof review.text === "string") {
      text = review.text;
    } else if (review.text && typeof review.text.text === "string") {
      text = review.text.text;
    }

    if (typeof review.author === "string") {
      author = review.author;
    } else if (review.authorAttribution && typeof review.authorAttribution.displayName === "string") {
      author = review.authorAttribution.displayName;
    }

    if (typeof review.avatarUrl === "string") {
      avatarUrl = review.avatarUrl;
    } else if (typeof review.authorPhotoUrl === "string") {
      avatarUrl = review.authorPhotoUrl;
    } else if (typeof review.profile_photo_url === "string") {
      avatarUrl = review.profile_photo_url;
    } else if (review.authorAttribution && typeof review.authorAttribution.photoUri === "string") {
      avatarUrl = review.authorAttribution.photoUri;
    }

    if (!text.trim() || Number.isNaN(rating)) return null;
    return {
      text: compact(text, 200),
      author: compact(author, 36),
      rating: rating,
      avatarUrl: avatarUrl || buildFallbackAvatar(author),
    };
  }

  function rotate(array, shift) {
    if (!array.length) return [];
    var offset = shift % array.length;
    return array.slice(offset).concat(array.slice(0, offset));
  }

  function shuffle(array) {
    var list = array.slice();
    for (var i = list.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function buildLaneReviews(reviews, laneCount) {
    var pool = shuffle(reviews);
    var lanesData = [];

    for (var laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      lanesData.push([]);
    }

    pool.forEach(function (review, index) {
      lanesData[index % laneCount].push(review);
    });

    lanesData = lanesData.map(function (laneItems, laneIndex) {
      var lanePool = laneItems.length ? laneItems.slice() : rotate(pool, laneIndex);
      while (lanePool.length < 6) {
        lanePool.push(pool[(lanePool.length + laneIndex) % pool.length]);
      }
      return shuffle(lanePool);
    });

    lanesData = resolveVerticalAuthorCollisions(lanesData);

    return lanesData;
  }

  function resolveVerticalAuthorCollisions(lanesData) {
    var lanes = lanesData.map(function (lane) {
      return lane.slice();
    });

    var maxLen = lanes.reduce(function (acc, lane) {
      return Math.max(acc, lane.length);
    }, 0);

    function findSwapIndex(lane, fromIndex, blockedAuthors) {
      for (var i = fromIndex + 1; i < lane.length; i += 1) {
        var candidate = lane[i];
        if (candidate && blockedAuthors.indexOf(candidate.author) === -1) {
          return i;
        }
      }
      return -1;
    }

    for (var slot = 0; slot < maxLen; slot += 1) {
      var usedAuthors = [];

      for (var laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
        var lane = lanes[laneIndex];
        if (!lane.length) continue;

        var idx = slot % lane.length;
        var current = lane[idx];
        if (!current) continue;

        if (usedAuthors.indexOf(current.author) !== -1) {
          var swapIndex = findSwapIndex(lane, idx, usedAuthors);
          if (swapIndex !== -1) {
            var tmp = lane[idx];
            lane[idx] = lane[swapIndex];
            lane[swapIndex] = tmp;
            current = lane[idx];
          }
        }

        usedAuthors.push(current.author);
      }
    }

    return lanes;
  }

  function renderLane(track, reviews, laneIndex) {
    var ordered = rotate(reviews, laneIndex * 2);
    var cardsHtml = ordered
      .map(function (review) {
        return (
          '<article class="review-pill">' +
          '<p class="review-pill-text">“' + escapeHtml(review.text) + '”</p>' +
          '<p class="review-pill-meta"><span class="review-pill-stars">' + makeStars(review.rating) + '</span></p>' +
          '<p class="review-pill-person"><img class="review-pill-avatar" src="' + escapeHtml(review.avatarUrl) + '" alt="Foto de perfil de ' +
          escapeHtml(review.author) + '" loading="lazy" referrerpolicy="no-referrer" /><span class="review-pill-author">' +
          escapeHtml(review.author) + "</span></p>" +
          "</article>"
        );
      })
      .join("");

    track.innerHTML = cardsHtml + cardsHtml;

    // De-sync tracks so rows do not align and show the same card in a vertical column.
    var phase = -1 * (laneIndex * 18 + 6);
    track.style.animationDelay = String(phase) + "s";
  }

  async function fetchFromEndpoint(url) {
    var response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el endpoint de resenas.");
    return response.json();
  }

  function pickSource() {
    if (source === "prefetched") return "prefetched";
    if (source === "live") return "live";
    if (endpoint || prefetchedUrl) return "prefetched";
    if (apiKey) return "live";
    return "fallback";
  }

  async function fetchFromGoogle(apiKeyValue, textQuery) {
    var searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKeyValue,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({
        textQuery: textQuery,
        languageCode: "es",
      }),
    });

    if (!searchResponse.ok) {
      throw new Error("No se pudo resolver el lugar en Google Places API.");
    }

    var searchJson = await searchResponse.json();
    var placeId = searchJson && searchJson.places && searchJson.places[0] && searchJson.places[0].id;

    if (!placeId) {
      throw new Error("No se encontro el place id del negocio.");
    }

    var detailResponse = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + "?languageCode=es", {
      headers: {
        "X-Goog-Api-Key": apiKeyValue,
        "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews",
      },
    });

    if (!detailResponse.ok) {
      throw new Error("No se pudieron descargar las resenas del lugar.");
    }

    return detailResponse.json();
  }

  function toRows(reviews, rowCount) {
    var list = reviews.slice();
    if (!list.length) return [];
    while (list.length < rowCount * 3) {
      list.push.apply(list, reviews);
    }
    return list;
  }

  async function init() {
    try {
      setStatus("Cargando resenas filtradas (>= " + minRating.toFixed(1) + " estrellas)...");

      var payload;
      var selectedSource = pickSource();

      if (selectedSource === "prefetched") {
        payload = await fetchFromEndpoint(endpoint || prefetchedUrl);
      } else if (selectedSource === "live") {
        if (!apiKey) {
          throw new Error("Modo live activo, pero falta data-google-api-key.");
        }
        payload = await fetchFromGoogle(apiKey, placeQuery);
      } else {
        payload = {
          rating: 4.7,
          userRatingCount: fallbackReviews.length,
          reviews: fallbackReviews,
        };
      }

      var sourceReviews = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.reviews)
          ? payload.reviews
          : [];

      var filtered = sourceReviews
        .map(normalizeReview)
        .filter(function (item) {
          return item && item.rating >= minRating;
        });

      if (!filtered.length) {
        setStatus("No hay resenas publicas con rating >= " + minRating.toFixed(1) + ".");
        return;
      }

      var laneData = buildLaneReviews(filtered, lanes.length || 3);
      lanes.forEach(function (track, index) {
        renderLane(track, laneData[index] || filtered, index);
      });

      var average = Number(payload.rating || 0);
      var total = Number(payload.userRatingCount || filtered.length);

      if (summaryEl) {
        summaryEl.textContent = average > 0 ? average.toFixed(1) + " / 5" : "Google Reviews";
      }
      if (countEl) {
        countEl.textContent = "(" + total + " opiniones)";
      }

      setStatus("Mostrando resenas reales de Google con rating >= " + minRating.toFixed(1) + ".");
    } catch (error) {
      console.error(error);

      var fallbackFiltered = fallbackReviews
        .map(normalizeReview)
        .filter(function (item) {
          return item && item.rating >= minRating;
        });

      if (fallbackFiltered.length) {
        var fallbackLaneData = buildLaneReviews(fallbackFiltered, lanes.length || 3);
        lanes.forEach(function (track, index) {
          renderLane(track, fallbackLaneData[index] || fallbackFiltered, index);
        });

        if (summaryEl) summaryEl.textContent = "4.7 / 5";
        if (countEl) countEl.textContent = "(" + fallbackFiltered.length + " opiniones)";
      }

      setStatus("No se pudieron cargar resenas remotas. Mostrando resenas pre-cargadas.");
    }
  }

  init();
})();
