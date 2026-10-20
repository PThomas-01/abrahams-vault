// =========================
// CONFIGURATION
// =========================

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/original";

// Works locally and on the deployed website.
const API_BASE_URL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://abrahams-vault-backend.onrender.com/api";

const movieGrid = document.getElementById("movie-grid");
const movieStatus = document.getElementById("movie-status");
const industryContainer = document.getElementById("industry-filters");
const genreContainer = document.getElementById("genre-filters");
const watchlistContainer = document.getElementById("watchlist-items");

const featuredBackdrop = document.getElementById("featured-backdrop");
const featuredTitle = document.getElementById("featured-title");
const featuredLabel = document.getElementById("featured-label");
const featuredMeta = document.getElementById("featured-meta");
const featuredDescription = document.getElementById("featured-description");
const featuredDetails = document.getElementById("featured-details");
const featuredList = document.getElementById("featured-list");
const featuredStatus = document.getElementById("featured-status");
const featuredPrev = document.getElementById("featured-prev");
const featuredNext = document.getElementById("featured-next");
const featuredIndicators = document.getElementById("featured-indicators");
const featuredCounter = document.getElementById("featured-counter");

const trendingRow = document.getElementById("trending-row");
const popularRow = document.getElementById("popular-row");
const searchToggle = document.getElementById("search-toggle");

let featuredMovies = [];
let featuredIndex = 0;
let featuredAutoplayTimer = null;
let featuredPauseUntil = 0;

const savedMovies = new Map();

let movies = [];
let genres = [];
let movieGenres = [];
let tvGenres = [];
let currentGenreType = "movie";

let selectedGenreId = null;
let selectedLanguage = "all";
let activeCategory = null;
let selectedYear = "all";
let searchQuery = "";
let currentPage = 1;
let totalPages = 1;
let requestNumber = 0;
let suggestionRequestNumber = 0;
let isLoadingMore = false;

const INDUSTRIES = {
    all: "All Movies",
    en: "Hollywood / English",
    ml: "Mollywood",
    te: "Tollywood",
    hi: "Bollywood"
};

// =========================
// AUTHENTICATION
// =========================

function getAuthHeaders() {
    const token = sessionStorage.getItem("vaultToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function requireLogin() {
    const userId = sessionStorage.getItem("vaultUserId");
    const token = sessionStorage.getItem("vaultToken");

    if (!userId || !token) {
        alert("Please log in to manage your watchlist.");
        window.location.href = "login.html";
        return false;
    }

    return true;
}

async function readResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status}).`
        );
    }

    return data;
}

// =========================
// TMDB API THROUGH BACKEND
// =========================

async function tmdbRequest(endpoint) {
    const parsedUrl = new URL(endpoint, "https://tmdb-endpoint.local");
    const params = new URLSearchParams();

    params.set("path", parsedUrl.pathname);

    parsedUrl.searchParams.forEach((value, key) => {
        params.set(key, value);
    });

    const response = await fetch(
        `${API_BASE_URL}/tmdb?${params.toString()}`
    );

    return readResponse(response);
}

function openMovieDetails(movie) {
    const mediaId = Number(movie?.id);

    if (!Number.isSafeInteger(mediaId) || mediaId <= 0) {
        console.error("Invalid media ID:", movie?.id);
        return;
    }

    const mediaType =
        movie?.media_type === "tv" || movie?.mediaType === "tv"
            ? "tv"
            : "movie";

    sessionStorage.setItem("vaultSelectedMovieId", String(mediaId));
    sessionStorage.setItem("vaultSelectedMediaType", mediaType);

    window.location.href =
        `movie-details.html?id=${encodeURIComponent(mediaId)}` +
        `&type=${encodeURIComponent(mediaType)}`;
}

// =========================
// WATCHLIST
// =========================

async function loadSavedMoviesFromDatabase() {
    const userId = sessionStorage.getItem("vaultUserId");
    const token = sessionStorage.getItem("vaultToken");

    savedMovies.clear();

    if (!userId || !token) {
        renderWatchlist();
        updateAllWatchlistButtons();
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}`,
            { headers: getAuthHeaders() }
        );

        const data = await readResponse(response);

        if (!Array.isArray(data)) {
            throw new Error("Unexpected watchlist response.");
        }

        data.forEach(movie => {
            const id = Number(
                movie.movieId ?? movie.tmdb_movie_id ?? movie.id
            );

            if (!Number.isSafeInteger(id) || id <= 0) return;

            savedMovies.set(id, {
                id,
                title: movie.title || movie.movie_title || "Untitled",
                poster_path:
                    movie.posterPath ??
                    movie.poster_path ??
                    movie.posterpath ??
                    null
            });
        });
    } catch (error) {
        console.error("Watchlist loading error:", error);

        if (movieStatus) {
            movieStatus.textContent =
                `Watchlist could not be loaded: ${error.message}`;
        }
    }

    renderWatchlist();
    updateAllWatchlistButtons();
}

function updateAllWatchlistButtons() {
    document.querySelectorAll(".watchlist-btn[data-id]").forEach(button => {
        updateWatchlistButtons(Number(button.dataset.id));
    });

    if (featuredList?.dataset.id) {
        updateWatchlistButtons(Number(featuredList.dataset.id));
    }
}

async function toggleWatchlist(movie, button) {
    if (!requireLogin()) return;

    const userId = sessionStorage.getItem("vaultUserId");
    const movieId = Number(movie.id);
    const alreadySaved = savedMovies.has(movieId);

    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
        alert("Invalid movie ID. Please refresh and try again.");
        return;
    }

    if (button?.disabled) return;
    if (button) button.disabled = true;

    try {
        let response;

        if (alreadySaved) {
            response = await fetch(
                `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}/${movieId}`,
                {
                    method: "DELETE",
                    headers: getAuthHeaders()
                }
            );
        } else {
            response = await fetch(
                `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...getAuthHeaders()
                    },
                    body: JSON.stringify({
                        movieId,
                        title: movie.title || movie.original_title || "Untitled",
                        posterPath: movie.poster_path || null
                    })
                }
            );
        }

        await readResponse(response);

        if (alreadySaved) {
            savedMovies.delete(movieId);
        } else {
            savedMovies.set(movieId, {
                id: movieId,
                title: movie.title || movie.original_title || "Untitled",
                poster_path: movie.poster_path || null
            });
        }

        updateWatchlistButtons(movieId);
        renderWatchlist();
    } catch (error) {
        console.error("Watchlist update error:", error);
        alert(error.message || "Could not update your watchlist.");
    } finally {
        if (button) button.disabled = false;
    }
}

function updateWatchlistButtons(movieId) {
    const id = Number(movieId);
    const isSaved = savedMovies.has(id);

    document.querySelectorAll(
        `.watchlist-btn[data-id="${id}"]`
    ).forEach(button => {
        button.classList.toggle("saved", isSaved);
        button.textContent = isSaved ? "✓" : "＋";
        button.setAttribute(
            "aria-label",
            isSaved ? "Remove from watchlist" : "Add to watchlist"
        );
        button.title = isSaved ? "Remove from My List" : "Add to My List";
    });

    if (featuredList && Number(featuredList.dataset.id) === id) {
        featuredList.textContent = isSaved ? "✓ In My List" : "＋ My List";
    }
}

function renderWatchlist() {
    if (!watchlistContainer) return;

    watchlistContainer.replaceChildren();

    if (savedMovies.size === 0) {
        const message = document.createElement("p");
        message.className = "empty-watchlist";
        message.textContent =
            "Your watchlist is waiting for its first film. Tap + on any movie to save it.";

        watchlistContainer.appendChild(message);
        return;
    }

    savedMovies.forEach(movie => {
        const item = document.createElement("div");
        item.className = "saved-item";

        const name = document.createElement("span");
        name.textContent = movie.title;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${movie.title}`);

        removeButton.addEventListener("click", async () => {
            if (!requireLogin()) return;

            const userId = sessionStorage.getItem("vaultUserId");
            removeButton.disabled = true;

            try {
                const response = await fetch(
                    `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}/${movie.id}`,
                    {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    }
                );

                await readResponse(response);

                savedMovies.delete(movie.id);
                updateWatchlistButtons(movie.id);
                renderWatchlist();
            } catch (error) {
                console.error("Remove movie error:", error);
                alert(error.message || "Could not remove the movie.");
                removeButton.disabled = false;
            }
        });

        item.append(name, removeButton);
        watchlistContainer.appendChild(item);
    });
}

// =========================
// FEATURED MOVIE CAROUSEL
// =========================

function renderFeaturedMovie(movie) {
    if (!movie) return;

    const title = movie.title || movie.original_title || "Untitled";
    const year = movie.release_date
        ? movie.release_date.slice(0, 4)
        : "Year unknown";
    const rating = Number(movie.vote_average || 0).toFixed(1);

    if (featuredTitle) featuredTitle.textContent = title;
    if (featuredLabel) featuredLabel.textContent = "FEATURED TODAY";

    if (featuredMeta) {
        featuredMeta.textContent = `${year} · ★ ${rating} · Movie`;
    }

    if (featuredDescription) {
        featuredDescription.textContent =
            movie.overview || "Discover this film in Abraham's Vault.";
    }

    if (featuredBackdrop) {
        const imagePath = movie.backdrop_path || movie.poster_path;
        const imageBase = movie.backdrop_path
            ? BACKDROP_BASE_URL
            : IMAGE_BASE_URL;

        featuredBackdrop.style.backgroundImage = imagePath
            ? `url("${imageBase}${imagePath}")`
            : "none";
    }

    if (featuredDetails) {
        featuredDetails.href =
            `movie-details.html?id=${encodeURIComponent(movie.id)}`;

        featuredDetails.onclick = event => {
            event.preventDefault();
            openMovieDetails(movie);
        };
    }

    if (featuredList) {
        featuredList.dataset.id = String(movie.id);
        featuredList.disabled = false;
        featuredList.textContent = savedMovies.has(Number(movie.id))
            ? "✓ In My List"
            : "＋ My List";

        featuredList.onclick = () => toggleWatchlist(movie, featuredList);
    }

    if (featuredCounter) {
        featuredCounter.textContent =
            `${String(featuredIndex + 1).padStart(2, "0")} / ` +
            `${String(featuredMovies.length).padStart(2, "0")}`;
    }

    if (featuredIndicators) {
        featuredIndicators.querySelectorAll(".hero-indicator")
            .forEach((button, index) => {
                const active = index === featuredIndex;

                button.classList.toggle("active", active);
                button.setAttribute("aria-current", active ? "true" : "false");
                button.setAttribute(
                    "aria-label",
                    `Show featured movie ${index + 1}: ${
                        featuredMovies[index]?.title || "Movie"
                    }`
                );
            });
    }

    if (featuredStatus) featuredStatus.textContent = "";
}

function renderFeaturedIndicators() {
    if (!featuredIndicators) return;

    featuredIndicators.replaceChildren();

    featuredMovies.forEach((movie, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hero-indicator";
        button.setAttribute(
            "aria-label",
            `Show featured movie ${index + 1}: ${movie.title || "Movie"}`
        );

        button.addEventListener("click", () => {
            showFeaturedMovie(index, true);
        });

        featuredIndicators.appendChild(button);
    });
}

function showFeaturedMovie(index, resetAutoplay = false) {
    if (!featuredMovies.length) return;

    featuredIndex =
        (index + featuredMovies.length) % featuredMovies.length;

    const hero = document.getElementById("featured-movie");

    if (hero) {
        hero.classList.remove("is-changing");
        void hero.offsetWidth;
        hero.classList.add("is-changing");

        if (hero._contentAnimationTimer) {
            clearTimeout(hero._contentAnimationTimer);
        }

        hero._contentAnimationTimer = setTimeout(() => {
            hero.classList.remove("is-changing");
        }, 450);
    }

    renderFeaturedMovie(featuredMovies[featuredIndex]);

    if (resetAutoplay) {
        featuredPauseUntil = Date.now() + 10000;
    }
}

function startFeaturedAutoplay() {
    if (featuredAutoplayTimer) {
        clearInterval(featuredAutoplayTimer);
    }

    if (featuredMovies.length < 2) return;

    featuredAutoplayTimer = setInterval(() => {
        const hero = document.getElementById("featured-movie");

        if (document.hidden) return;
        if (hero && hero.matches(":hover")) return;
        if (Date.now() < featuredPauseUntil) return;

        showFeaturedMovie(featuredIndex + 1);
    }, 6000);
}

function setupFeaturedCarousel() {
    featuredPrev?.addEventListener("click", () => {
        showFeaturedMovie(featuredIndex - 1, true);
    });

    featuredNext?.addEventListener("click", () => {
        showFeaturedMovie(featuredIndex + 1, true);
    });

    const hero = document.getElementById("featured-movie");

    hero?.addEventListener("mouseenter", () => {
        featuredPauseUntil = Date.now() + 10000;
    });

    hero?.addEventListener("focusin", () => {
        featuredPauseUntil = Date.now() + 10000;
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            featuredPauseUntil = Date.now() + 3000;
        }
    });
}

// =========================
// HORIZONTAL MOVIE CARDS
// Keep this original design for homepage rows
// and extra categories.
// =========================

function createHorizontalMovieCard(movie) {
    const movieId = Number(movie.id);
    const title =
        movie.title || movie.original_title || movie.name || "Untitled";

    const releaseDate = movie.release_date || movie.first_air_date || "";
    const year = releaseDate ? releaseDate.slice(0, 4) : "Year unknown";

    const card = document.createElement("article");
    card.className = "cinema-movie-card";

    const detailsLink = document.createElement("a");
    detailsLink.className = "cinema-poster-link";
    detailsLink.href =
        `movie-details.html?id=${encodeURIComponent(movieId)}`;
    detailsLink.setAttribute("aria-label", `View ${title} details`);

    detailsLink.addEventListener("click", event => {
        event.preventDefault();
        openMovieDetails(movie);
    });

    if (movie.poster_path) {
        const poster = document.createElement("img");
        poster.className = "cinema-poster";
        poster.src = IMAGE_BASE_URL + movie.poster_path;
        poster.alt = `${title} poster`;
        poster.loading = "lazy";

        poster.addEventListener("error", () => {
            const fallback = document.createElement("div");
            fallback.className = "cinema-poster cinema-poster-fallback";
            fallback.textContent = title;
            poster.replaceWith(fallback);
        });

        detailsLink.appendChild(poster);
    } else {
        const fallback = document.createElement("div");
        fallback.className = "cinema-poster cinema-poster-fallback";
        fallback.textContent = title;
        detailsLink.appendChild(fallback);
    }

    const info = document.createElement("div");
    info.className = "cinema-card-info";

    const name = document.createElement("a");
    name.className = "cinema-card-title";
    name.href = detailsLink.href;
    name.textContent = title;

    name.addEventListener("click", event => {
        event.preventDefault();
        openMovieDetails(movie);
    });

    const meta = document.createElement("span");
    meta.className = "cinema-card-meta";
    meta.textContent =
        `${year} · ★ ${Number(movie.vote_average || 0).toFixed(1)}`;

    const actions = document.createElement("div");
    actions.className = "cinema-card-actions";

    const listButton = document.createElement("button");
    listButton.type = "button";
    listButton.className = "watchlist-btn cinema-card-list-btn";
    listButton.dataset.id = movieId;
    listButton.textContent = savedMovies.has(movieId) ? "✓" : "＋";

    listButton.setAttribute(
        "aria-label",
        savedMovies.has(movieId)
            ? "Remove from watchlist"
            : "Add to watchlist"
    );

    if (savedMovies.has(movieId)) listButton.classList.add("saved");

    listButton.addEventListener("click", event => {
        event.stopPropagation();
        toggleWatchlist(movie, listButton);
    });

    actions.appendChild(listButton);
    info.append(name, meta, actions);
    card.append(detailsLink, info);

    return card;
}

function renderHorizontalRow(container, movieList) {
    if (!container) return;

    container.replaceChildren();

    if (!movieList.length) {
        const message = document.createElement("p");
        message.className = "cinema-row-message";
        message.textContent = "No movies are available right now.";
        container.appendChild(message);
        return;
    }

    movieList.forEach(movie => {
        container.appendChild(createHorizontalMovieCard(movie));
    });
}

// =========================
// TRENDING AND POPULAR ROWS
// =========================

async function loadHomeRows() {
    const requests = [];

    if (trendingRow) {
        requests.push(
            tmdbRequest("/trending/movie/week?language=en-US")
                .then(data => {
                    const results = data.results || [];

                    renderHorizontalRow(trendingRow, results);

                    const availableMovies = results.filter(
                        movie => movie.backdrop_path || movie.poster_path
                    );

                    const shuffledMovies = [...availableMovies].sort(
                        () => Math.random() - 0.5
                    );

                    featuredMovies = shuffledMovies.slice(0, 5);

                    if (featuredMovies.length) {
                        renderFeaturedIndicators();
                        showFeaturedMovie(0);
                        startFeaturedAutoplay();
                    } else if (featuredStatus) {
                        featuredStatus.textContent =
                            "No featured movies are available right now.";
                    }
                })
                .catch(error => {
                    console.error("Trending movies error:", error);
                    trendingRow.textContent = "Couldn't load trending movies.";

                    if (featuredStatus) {
                        featuredStatus.textContent =
                            "Couldn't load the featured film. Please refresh.";
                    }
                })
        );
    }

    if (popularRow) {
        requests.push(
            tmdbRequest("/movie/popular?language=en-US&page=1")
                .then(data => {
                    renderHorizontalRow(popularRow, data.results || []);
                })
                .catch(error => {
                    console.error("Popular movies error:", error);
                    popularRow.textContent = "Couldn't load popular movies.";
                })
        );
    }

    await Promise.all(requests);
}

// =========================
// EXTRA CATEGORIES
// =========================

const EXTRA_CATEGORIES = [
    {
        id: "kdramas",
        title: "K-Dramas",
        subtitle: "Korean stories worth getting hooked on",
        endpoint:
            "/discover/tv?with_original_language=ko" +
            "&with_origin_country=KR" +
            "&sort_by=first_air_date.desc" +
            "&first_air_date.lte=2026-10-20&page=1"
    },
    {
        id: "anime",
        title: "Anime",
        subtitle: "Discover your next animated obsession",
        endpoint:
            "/discover/tv?with_genres=16" +
            "&with_original_language=ja" +
            "&sort_by=first_air_date.desc" +
            "&first_air_date.lte=2026-10-20&page=1"
    },
    {
        id: "web-series",
        title: "Web Series",
        subtitle: "Binge-worthy stories from around the world",
        endpoint:
            "/discover/tv?sort_by=first_air_date.desc" +
            "&first_air_date.lte=2026-10-20" +
            "&language=en-US&page=1"
    },
    {
        id: "fantasy-series",
        title: "Fantasy & Epic Series",
        subtitle: "Epic worlds, legendary battles, unforgettable stories",
        endpoint:
            "/discover/tv?with_genres=10765" +
            "&sort_by=popularity.desc&language=en-US&page=1"
    },
    {
        id: "disney-animation",
        title: "Disney Animation Studios",
        subtitle: "Animated classics and modern favourites",
        endpoint:
            "/discover/movie?with_companies=2&with_genres=16" +
            "&sort_by=popularity.desc&language=en-US&page=1"
    },
    {
        id: "pixar-animation",
        title: "Pixar Animation Studios",
        subtitle: "Stories that stay with you",
        endpoint:
            "/discover/movie?with_companies=3&with_genres=16" +
            "&sort_by=popularity.desc&language=en-US&page=1"
    },
    {
        id: "dreamworks-animation",
        title: "DreamWorks Animation",
        subtitle: "Adventure, comedy and animated worlds",
        endpoint:
            "/discover/movie?with_companies=521&with_genres=16" +
            "&sort_by=popularity.desc&language=en-US&page=1"
    }
];

function normalizeCategoryMedia(item, mediaType) {
    return {
        ...item,
        media_type: mediaType,
        title:
            item.title || item.name || item.original_title ||
            item.original_name || "Untitled",
        original_title:
            item.original_title || item.original_name ||
            item.title || item.name || "Untitled",
        release_date: item.release_date || item.first_air_date || "",
        genre_ids: item.genre_ids || []
    };
}

// This deliberately reuses the original horizontal movie card.
// It avoids changing the homepage collection design.
function createCategoryCard(item, category) {
    const isTV = [
        "kdramas",
        "anime",
        "web-series",
        "fantasy-series"
    ].includes(category.id);

    const normalizedMovie = normalizeCategoryMedia(
        item,
        isTV ? "tv" : "movie"
    );

    return createHorizontalMovieCard(normalizedMovie);
}

function createExtraCategorySections() {
    if (document.getElementById("extra-categories")) return;

    const anchor =
        popularRow?.closest("section") ||
        popularRow?.parentElement;

    if (!anchor) {
        console.warn("Could not locate the homepage category insertion point.");
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "extra-categories";

    EXTRA_CATEGORIES.forEach(category => {
        const section = document.createElement("section");
        section.className = "extra-category-section";
        section.id = `section-${category.id}`;

        const heading = document.createElement("div");
        heading.className = "extra-category-heading";

        const textGroup = document.createElement("div");

        const title = document.createElement("h2");
        const words = category.title.split(" ");
title.innerHTML = words
    .slice(0, -1).join(" ") + ' <span>' + words.at(-1) + '</span>';

        const subtitle = document.createElement("p");
        subtitle.textContent = category.subtitle;

        textGroup.append(title, subtitle);

        const viewAll = document.createElement("a");
        viewAll.href =
            `discover.html?category=${encodeURIComponent(category.id)}`;
        viewAll.className = "extra-category-link";
        viewAll.textContent = "Explore";

        heading.append(textGroup, viewAll);

        const row = document.createElement("div");
        row.className = "cinema-horizontal-row";
        row.id = `row-${category.id}`;
        row.setAttribute("aria-label", category.title);

        const status = document.createElement("p");
        status.className = "cinema-row-message";
        status.textContent = `Loading ${category.title}…`;

        row.appendChild(status);
        section.append(heading, row);
        wrapper.appendChild(section);
    });

    anchor.insertAdjacentElement("afterend", wrapper);
}

async function loadExtraCategory(category) {
    const row = document.getElementById(`row-${category.id}`);
    if (!row) return;

    try {
        // Homepage category requests remain independent of Discover filters.
        const data = await tmdbRequest(category.endpoint);

        const isTV = [
            "kdramas",
            "anime",
            "web-series",
            "fantasy-series"
        ].includes(category.id);

        const results = (data.results || [])
            .map(item => normalizeCategoryMedia(
                item,
                isTV ? "tv" : "movie"
            ))
            .filter(item => item.poster_path || item.backdrop_path);

        row.replaceChildren();

        if (!results.length) {
            const message = document.createElement("p");
            message.className = "cinema-row-message";
            message.textContent =
                `No titles are available in ${category.title} right now.`;
            row.appendChild(message);
            return;
        }

        results.slice(0, 20).forEach(item => {
            row.appendChild(createCategoryCard(item, category));
        });
    } catch (error) {
        console.error(`${category.title} loading error:`, error);

        row.replaceChildren();

        const message = document.createElement("p");
        message.className = "cinema-row-message";
        message.textContent =
            `Couldn't load ${category.title}. Please refresh and try again.`;

        row.appendChild(message);
    }
}

function loadAllExtraCategories() {
    createExtraCategorySections();

    EXTRA_CATEGORIES.forEach(category => {
        loadExtraCategory(category);
    });
}

// =========================
// INDUSTRY FILTERS
// =========================

function setupIndustryFilters() {
    if (!industryContainer) return;

    industryContainer.querySelectorAll("[data-language]").forEach(button => {
        button.addEventListener("click", async () => {
            const selected = button.dataset.language || "all";

            industryContainer.querySelectorAll("[data-language]")
                .forEach(item => {
                    item.classList.toggle("selected", item === button);
                });

            selectedLanguage = selected;

            const category = EXTRA_CATEGORIES.find(
                item => item.id === selected
            );

            activeCategory = category || null;

            if (activeCategory) {
                const isTV = [
                    "kdramas",
                    "anime",
                    "web-series",
                    "fantasy-series"
                ].includes(activeCategory.id);

                if (movieStatus) {
                    movieStatus.textContent =
                        `Loading ${activeCategory.title}...`;
                }

                // Load the matching genre list for TV or movie categories.
                await loadGenres(isTV ? "tv" : "movie");
                await loadCollectionCategory(activeCategory);
                return;
            }

            selectedGenreId = null;
            await loadGenres("movie");
            loadMovies();
        });
    });
}

// =========================
// YEAR FILTER
// =========================

function setupYearFilter() {
    if (!movieGrid || document.getElementById("year-filter")) return;
    if (!movieGrid.parentElement) return;

    const wrapper = document.createElement("div");
    wrapper.className = "year-filter-wrapper";
    wrapper.style.cssText = "margin:16px 0;";

    const label = document.createElement("label");
    label.htmlFor = "year-filter";
    label.textContent = "Release year: ";
    label.style.marginRight = "8px";

    const select = document.createElement("select");
    select.id = "year-filter";
    select.style.cssText =
        "padding:9px;background:#19191c;color:#f4f1eb;" +
        "border:1px solid #888;border-radius:5px;";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All years";
    select.appendChild(allOption);

    for (let year = new Date().getFullYear(); year >= 1900; year--) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        select.appendChild(option);
    }

    select.addEventListener("change", () => {
        selectedYear = select.value;

        if (activeCategory) {
            loadCollectionCategory(activeCategory);
        } else {
            loadMovies();
        }
    });

    wrapper.append(label, select);
    movieGrid.parentElement.insertBefore(wrapper, movieGrid);
}

// =========================
// GENRE FILTERS
// =========================

function addGenreButton(name, genreId) {
    if (!genreContainer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.genreId = genreId === null ? "all" : String(genreId);

    if (genreId === selectedGenreId) {
        button.classList.add("selected");
    }

    button.addEventListener("click", () => {
        selectedGenreId = genreId;

        genreContainer.querySelectorAll("[data-genre-id]")
            .forEach(item => {
                item.classList.toggle("selected", item === button);
            });

        if (activeCategory) {
            loadCollectionCategory(activeCategory);
        } else {
            loadMovies();
        }
    });

    genreContainer.appendChild(button);
}
// =========================
// GENRE FILTERS
// =========================

// Only show useful genres in Abraham's Vault.
const ALLOWED_GENRES = [
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "History",
    "Horror",
    "Music",
    "Mystery",
    "Romance",
    "Science Fiction",
    "Thriller",
    "War",
    "Western"
];

function addGenreButton(name, genreId) {
    if (!genreContainer) return;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.genreId = genreId === null ? "all" : String(genreId);

    if (genreId === selectedGenreId) {
        button.classList.add("selected");
    }

    button.addEventListener("click", () => {
        selectedGenreId = genreId;

        genreContainer.querySelectorAll("[data-genre-id]")
            .forEach(item => {
                item.classList.toggle("selected", item === button);
            });

        if (activeCategory) {
            loadCollectionCategory(activeCategory);
        } else {
            loadMovies();
        }
    });

    genreContainer.appendChild(button);
}

async function loadGenres(type = "movie") {
    if (!genreContainer) return;

    try {
        const endpoint = type === "tv"
            ? "/genre/tv/list?language=en"
            : "/genre/movie/list?language=en";

        const data = await tmdbRequest(endpoint);

        currentGenreType = type;
        genres = data.genres || [];

        if (type === "tv") {
            tvGenres = genres;
        } else {
            movieGenres = genres;
        }

        // Keep only approved genres that exist in the selected TMDB list.
        const filteredGenres = genres.filter(genre =>
            ALLOWED_GENRES.includes(genre.name)
        );

        genreContainer.replaceChildren();

        addGenreButton("All Genres", null);

        filteredGenres
            .sort((a, b) =>
                ALLOWED_GENRES.indexOf(a.name) -
                ALLOWED_GENRES.indexOf(b.name)
            )
            .forEach(genre => {
                addGenreButton(
                    genre.name === "Science Fiction"
                        ? "Sci-Fi"
                        : genre.name,
                    genre.id
                );
            });

        // Clear a genre selection if it doesn't exist in this media type.
        if (
            selectedGenreId !== null &&
            !filteredGenres.some(genre => genre.id === selectedGenreId)
        ) {
            selectedGenreId = null;
            addGenreButton("All Genres", null);

            genreContainer.querySelectorAll("[data-genre-id]")
                .forEach(button => {
                    button.classList.toggle(
                        "selected",
                        button.dataset.genreId === "all"
                    );
                });
        }
    } catch (error) {
        console.error("Genre loading error:", error);
    }
}

// =========================
// BUILD MOVIE REQUEST
// =========================

function buildMovieEndpoint() {
    if (searchQuery) {
        const params = new URLSearchParams({
            query: searchQuery,
            include_adult: "false",
            language: "en-US",
            page: String(currentPage)
        });

        if (selectedYear !== "all") {
            params.set("year", selectedYear);
        }

        return `/search/movie?${params.toString()}`;
    }

    const params = new URLSearchParams({
        sort_by: "popularity.desc",
        include_adult: "false",
        language: "en-US",
        page: String(currentPage)
    });

    if (selectedLanguage !== "all") {
        params.set("with_original_language", selectedLanguage);
    }

    if (selectedGenreId !== null) {
        params.set("with_genres", String(selectedGenreId));
    }

    if (selectedYear !== "all") {
        params.set("primary_release_year", selectedYear);
    }

    return `/discover/movie?${params.toString()}`;
}

// =========================
// LOAD MAIN MOVIE COLLECTION
// =========================

async function loadMovies(append = false) {
    if (!movieGrid) return;
    if (append && isLoadingMore) return;

    if (!append) {
        currentPage = 1;
        requestNumber++;
        movies = [];
    } else {
        if (currentPage >= totalPages) return;
        currentPage++;
    }

    const currentRequest = requestNumber;
    isLoadingMore = true;

    if (movieStatus) movieStatus.textContent = "Loading movies...";

    const moreButton = document.getElementById("load-more-movies");
    if (moreButton) moreButton.disabled = true;

    try {
        const data = await tmdbRequest(buildMovieEndpoint());

        if (currentRequest !== requestNumber) return;

        totalPages = Math.min(data.total_pages || 1, 500);

        let results = data.results || [];

        if (searchQuery && selectedLanguage !== "all") {
            results = results.filter(
                movie => movie.original_language === selectedLanguage
            );
        }

        if (searchQuery && selectedGenreId !== null) {
            results = results.filter(
                movie => (movie.genre_ids || []).includes(selectedGenreId)
            );
        }

        if (searchQuery && selectedYear !== "all") {
            results = results.filter(
                movie => movie.release_date?.startsWith(selectedYear)
            );
        }

        movies = append ? [...movies, ...results] : results;

        renderMovies();

        if (movieStatus) {
            if (movies.length === 0) {
                movieStatus.textContent = searchQuery
                    ? `No movies found for "${searchQuery}". Try another search.`
                    : "No movies found. Try another filter.";
            } else {
                movieStatus.textContent =
                    `${movies.length} movies loaded` +
                    (searchQuery ? ` · Search: "${searchQuery}"` : "") +
                    (selectedLanguage !== "all"
                        ? ` · ${INDUSTRIES[selectedLanguage] || selectedLanguage}`
                        : searchQuery ? "" : " · All industries") +
                    (selectedYear !== "all" ? ` · ${selectedYear}` : "") +
                    (selectedGenreId !== null
                        ? ` · ${genres.find(g => g.id === selectedGenreId)?.name || "Selected genre"}`
                        : "") + ".";
            }
        }

        let loadMoreButton = document.getElementById("load-more-movies");

        if (!loadMoreButton) {
            loadMoreButton = document.createElement("button");
            loadMoreButton.id = "load-more-movies";
            loadMoreButton.type = "button";
            loadMoreButton.textContent = "Load More Movies";
            loadMoreButton.style.cssText =
                "display:block;margin:24px auto;padding:12px 24px;" +
                "background:#ffb547;color:#0b0b0d;border:0;" +
                "border-radius:5px;cursor:pointer;font-weight:bold;";

            loadMoreButton.addEventListener("click", () => loadMovies(true));
            movieGrid.insertAdjacentElement("afterend", loadMoreButton);
        }

        loadMoreButton.style.display =
            currentPage < totalPages && results.length > 0
                ? "block"
                : "none";

        loadMoreButton.disabled = false;
    } catch (error) {
        if (currentRequest !== requestNumber) return;

        console.error("Movie loading error:", error);

        if (movieStatus) {
            movieStatus.textContent =
                `Couldn't load movies: ${error.message}`;
        }
    } finally {
        if (currentRequest === requestNumber) {
            isLoadingMore = false;

            const button = document.getElementById("load-more-movies");
            if (button) button.disabled = false;
        }
    }
}

// =========================
// RENDER MAIN MOVIE CARDS
// =========================

function renderMovies() {
    if (!movieGrid) return;

    movieGrid.replaceChildren();

    if (movies.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-watchlist";
        message.textContent =
            "No movies found. Try another industry, genre, year, or search.";

        movieGrid.appendChild(message);
        return;
    }

    movies.forEach(movie => {
        const movieId = Number(movie.id);
        const title = movie.title || movie.original_title || "Untitled";
        const year = movie.release_date
            ? movie.release_date.slice(0, 4)
            : "Year unknown";
        const rating = Number(movie.vote_average || 0).toFixed(1);

        const card = document.createElement("article");
        card.className = "movie-card";
        card.style.cursor = "pointer";

        card.addEventListener("click", () => openMovieDetails(movie));

        const poster = document.createElement("div");
        poster.className = "poster";

        if (movie.poster_path) {
            const image = document.createElement("img");
            image.className = "poster-image";
            image.src = IMAGE_BASE_URL + movie.poster_path;
            image.alt = `${title} movie poster`;
            image.loading = "lazy";

            image.addEventListener("error", () => {
                image.remove();

                const fallback = document.createElement("div");
                fallback.className = "poster-fallback";
                fallback.textContent = title;
                poster.prepend(fallback);
            });

            poster.appendChild(image);
        } else {
            const fallback = document.createElement("div");
            fallback.className = "poster-fallback";
            fallback.textContent = title;
            poster.appendChild(fallback);
        }

        const watchButton = document.createElement("button");
        watchButton.type = "button";
        watchButton.className = "watchlist-btn";
        watchButton.dataset.id = movieId;
        watchButton.textContent = savedMovies.has(movieId) ? "✓" : "＋";

        if (savedMovies.has(movieId)) watchButton.classList.add("saved");

        watchButton.setAttribute(
            "aria-label",
            savedMovies.has(movieId)
                ? "Remove from watchlist"
                : "Add to watchlist"
        );

        watchButton.addEventListener("click", event => {
            event.stopPropagation();
            toggleWatchlist(movie, watchButton);
        });

        const overlay = document.createElement("div");
        overlay.className = "poster-overlay";

        const type = document.createElement("span");
        type.className = "movie-type";
        type.textContent = (movie.genre_ids || [])
            .map(id => genres.find(genre => genre.id === id)?.name)
            .filter(Boolean)
            .slice(0, 2)
            .map(name =>
                name === "Science Fiction" ? "SCI-FI" : name.toUpperCase()
            )
            .join(" · ") || "MOVIE";

        const heading = document.createElement("h3");
        heading.textContent = title;

        const details = document.createElement("p");
        details.append(document.createTextNode(`${year} · `));

        const ratingLabel = document.createElement("span");
        ratingLabel.className = "rating";
        ratingLabel.textContent = `★ ${rating}`;

        details.appendChild(ratingLabel);
        overlay.append(type, heading, details);
        poster.append(watchButton, overlay);
        card.appendChild(poster);
        movieGrid.appendChild(card);
    });
}

// =========================
// LOAD A SPECIAL CATEGORY IN DISCOVER
// =========================

async function loadCollectionCategory(category) {
    if (!movieGrid) return;

    if (movieStatus) {
        movieStatus.textContent = `Loading ${category.title}...`;
    }

    movieGrid.replaceChildren();

    const isTV = [
        "kdramas",
        "anime",
        "web-series",
        "fantasy-series"
    ].includes(category.id);

    const moreButton = document.getElementById("load-more-movies");
    if (moreButton) moreButton.style.display = "none";

    try {
        const url = new URL(category.endpoint, "https://tmdb-endpoint.local");

        // Keep any category-specific genres and add the selected genre.
        if (selectedGenreId !== null) {
            const existingGenres = (
                url.searchParams.get("with_genres") || ""
            ).split(",").filter(Boolean);

            const selectedId = String(selectedGenreId);

            if (!existingGenres.includes(selectedId)) {
                existingGenres.push(selectedId);
            }

            url.searchParams.set("with_genres", existingGenres.join(","));
        }

        if (selectedYear !== "all") {
            url.searchParams.set(
                isTV ? "first_air_date_year" : "primary_release_year",
                selectedYear
            );
        }

        const data = await tmdbRequest(url.pathname + url.search);

        let results = (data.results || [])
            .map(item => normalizeCategoryMedia(
                item,
                isTV ? "tv" : "movie"
            ))
            .filter(item => item.poster_path || item.backdrop_path);

        if (selectedGenreId !== null) {
            results = results.filter(item =>
                (item.genre_ids || []).includes(Number(selectedGenreId))
            );
        }

        if (!results.length) {
            if (movieStatus) {
                movieStatus.textContent =
                    `No ${category.title} titles match this genre and year.`;
            }
            return;
        }

        results.forEach(item => {
            movieGrid.appendChild(createCategoryCard(item, category));
        });

        if (movieStatus) {
            movieStatus.textContent =
                `${category.title} · ${results.length} matching titles`;
        }
    } catch (error) {
        console.error(
            `Collection category error (${category.title}):`,
            error
        );

        if (movieStatus) {
            movieStatus.textContent =
                `Couldn't load ${category.title}: ${error.message}`;
        }
    }
}

// =========================
// SEARCH AND LIVE SUGGESTIONS
// =========================

function setupMovieSearch() {
    if (!searchToggle) return;

    searchToggle.addEventListener("click", event => {
        event.stopPropagation();

        const existingContainer =
            document.getElementById("movie-search-container");

        if (existingContainer) {
            existingContainer.remove();
            return;
        }

        const navbar = document.querySelector(".navbar");
        if (!navbar) return;

        const container = document.createElement("div");
        container.id = "movie-search-container";
        container.style.cssText =
            "position:absolute;right:7%;top:72px;width:min(360px,90vw);" +
            "z-index:1000;background:#19191c;border:1px solid #444;" +
            "border-radius:9px;overflow:hidden;" +
            "box-shadow:0 12px 35px rgba(0,0,0,.45);";

        const search = document.createElement("input");
        search.id = "movie-search";
        search.type = "search";
        search.placeholder = "Search movies...";
        search.setAttribute("aria-label", "Search movies");
        search.autocomplete = "off";
        search.value = searchQuery;
        search.style.cssText =
            "width:100%;box-sizing:border-box;padding:14px 16px;" +
            "background:#19191c;color:#f4f1eb;border:none;" +
            "outline:none;font-size:15px;";

        const resultsBox = document.createElement("div");
        resultsBox.id = "movie-search-results";
        resultsBox.style.cssText =
            "max-height:420px;overflow-y:auto;display:none;" +
            "border-top:1px solid #38383d;";

        container.append(search, resultsBox);
        navbar.appendChild(container);

        let searchTimer = null;
        let localSuggestionRequest = 0;

        function showMessage(message) {
            resultsBox.replaceChildren();
            resultsBox.style.cssText =
                "max-height:420px;overflow-y:auto;display:block;" +
                "border-top:1px solid #38383d;padding:14px;" +
                "color:#b9b9c0;font-size:14px;";
            resultsBox.textContent = message;
        }

        function closeSearchPanel() {
            container.remove();
            document.removeEventListener("click", closeOnOutsideClick);
        }

        function closeOnOutsideClick(event) {
            if (
                !container.contains(event.target) &&
                event.target !== searchToggle &&
                !searchToggle.contains(event.target)
            ) {
                closeSearchPanel();
            }
        }

        async function searchMovies(query, currentRequest) {
            try {
                const data = await tmdbRequest(
                    `/search/multi?query=${encodeURIComponent(query)}` +
                    "&include_adult=false&language=en-US&page=1"
                );

                if (currentRequest !== localSuggestionRequest) return;
                if (!container.isConnected) return;

                const results = (Array.isArray(data.results) ? data.results : [])
                    .filter(item =>
                        (item.media_type === "movie" ||
                            item.media_type === "tv") &&
                        (item.title || item.name)
                    );

                resultsBox.replaceChildren();
                resultsBox.style.cssText =
                    "max-height:420px;overflow-y:auto;display:block;" +
                    "border-top:1px solid #38383d;padding:0;";

                if (!results.length) {
                    showMessage("No matching movies found.");
                    return;
                }

                results.slice(0, 7).forEach(movie => {
                    const item = document.createElement("button");
                    item.type = "button";
                    item.style.cssText =
                        "display:flex;align-items:center;gap:12px;width:100%;" +
                        "padding:10px 12px;background:#19191c;color:#f4f1eb;" +
                        "border:none;border-bottom:1px solid #303035;" +
                        "text-align:left;cursor:pointer;";

                    if (movie.poster_path) {
                        const poster = document.createElement("img");
                        poster.src =
                            "https://image.tmdb.org/t/p/w92" +
                            movie.poster_path;
                        poster.alt = "";
                        poster.loading = "lazy";
                        poster.style.cssText =
                            "width:42px;height:63px;object-fit:cover;" +
                            "border-radius:4px;flex-shrink:0;";
                        item.appendChild(poster);
                    }

                    const info = document.createElement("div");
                    info.style.cssText =
                        "min-width:0;display:flex;flex-direction:column;gap:5px;";

                    const title = document.createElement("span");
                    title.textContent =
                        movie.title || movie.name || movie.original_title ||
                        movie.original_name || "Untitled";
                    title.style.cssText =
                        "font-size:14px;font-weight:600;overflow-wrap:anywhere;";

                    const year = document.createElement("span");
                    const releaseDate =
                        movie.release_date || movie.first_air_date;

                    year.textContent = releaseDate
                        ? releaseDate.slice(0, 4)
                        : "Release year unavailable";
                    year.style.cssText = "font-size:12px;color:#aaa;";

                    info.append(title, year);
                    item.appendChild(info);

                    item.addEventListener("mouseenter", () => {
                        item.style.background = "#303036";
                    });

                    item.addEventListener("mouseleave", () => {
                        item.style.background = "#19191c";
                    });

                    item.addEventListener("click", () => {
                        clearTimeout(searchTimer);
                        localSuggestionRequest++;
                        suggestionRequestNumber++;
                        closeSearchPanel();
                        openMovieDetails(movie);
                    });

                    resultsBox.appendChild(item);
                });
            } catch (error) {
                if (currentRequest !== localSuggestionRequest) return;

                console.error("Live movie search error:", error);
                showMessage(
                    "Couldn't load movies. Please try again in a moment."
                );
            }
        }

        function submitSearch() {
            const query = search.value.trim();

            if (!query) {
                search.focus();
                return;
            }

            clearTimeout(searchTimer);
            localSuggestionRequest++;
            suggestionRequestNumber++;

            searchQuery = query;

            const currentPageName = window.location.pathname
                .split("/")
                .pop()
                .toLowerCase();

            if (currentPageName !== "discover.html") {
                closeSearchPanel();
                window.location.href =
                    `discover.html?q=${encodeURIComponent(query)}`;
                return;
            }

            selectedGenreId = null;
            selectedLanguage = "all";
            selectedYear = "all";
            activeCategory = null;

            if (industryContainer) {
                industryContainer.querySelectorAll("[data-language]")
                    .forEach(button => {
                        button.classList.toggle(
                            "selected",
                            (button.dataset.language || "all") === "all"
                        );
                    });
            }

            const yearFilter = document.getElementById("year-filter");
            if (yearFilter) yearFilter.value = "all";

            const url = new URL(window.location.href);
            url.searchParams.set("q", query);
            url.searchParams.delete("category");
            window.history.replaceState({}, "", url);

            closeSearchPanel();
            loadMovies();
        }

        search.addEventListener("input", () => {
            clearTimeout(searchTimer);

            const query = search.value.trim();
            const currentRequest = ++localSuggestionRequest;
            suggestionRequestNumber++;

            if (query.length < 2) {
                resultsBox.replaceChildren();
                resultsBox.style.display = "none";
                return;
            }

            showMessage("Searching movies...");

            searchTimer = setTimeout(() => {
                searchMovies(query, currentRequest);
            }, 250);
        });

        search.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                submitSearch();
            }

            if (event.key === "Escape") {
                closeSearchPanel();
            }
        });

        setTimeout(() => {
            if (container.isConnected) {
                document.addEventListener("click", closeOnOutsideClick);
            }
        }, 0);

        search.focus();
        search.select();
    });
}

// =========================
// INITIALIZE
// =========================

async function initializeApp() {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q");
    const initialCategory = params.get("category");

    if (initialQuery?.trim()) {
        searchQuery = initialQuery.trim();
    }

    setupIndustryFilters();
    setupYearFilter();
    setupFeaturedCarousel();
    setupMovieSearch();

    // These rows use their own endpoints and never inherit Discover filters.
    loadHomeRows();
    loadAllExtraCategories();

    await loadSavedMoviesFromDatabase();

    try {
        await loadGenres();

        // If Discover was opened from a category's Explore link, load it.
        if (movieGrid && initialCategory) {
            const category = EXTRA_CATEGORIES.find(
                item => item.id === initialCategory
            );

            if (category) {
                activeCategory = category;
                selectedLanguage = category.id;

                if (industryContainer) {
                    industryContainer.querySelectorAll("[data-language]")
                        .forEach(button => {
                            button.classList.toggle(
                                "selected",
                                button.dataset.language === category.id
                            );
                        });
                }

                const isTV = [
                    "kdramas",
                    "anime",
                    "web-series",
                    "fantasy-series"
                ].includes(category.id);

                if (isTV) {
                    await loadGenres("tv");
                }

                await loadCollectionCategory(category);
                return;
            }
        }

        await loadMovies();
    } catch (error) {
        console.error("Initialization error:", error);

        if (movieStatus) {
            movieStatus.textContent =
                `Couldn't initialize movies: ${error.message}`;
        }
    }
}

initializeApp();