
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const API_BASE_URL = "https://abrahams-vault-backend.onrender.com/api";

const movieGrid = document.getElementById("movie-grid");
const movieStatus = document.getElementById("movie-status");
const industryContainer = document.getElementById("industry-filters");
const genreContainer = document.getElementById("genre-filters");
const watchlistContainer = document.getElementById("watchlist-items");

const savedMovies = new Map();

let movies = [];
let genres = [];
let selectedGenreId = null;
let selectedLanguage = "all";
let selectedYear = "all";
let searchQuery = "";
let currentPage = 1;
let totalPages = 1;
let requestNumber = 0;
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
// TMDB API
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

// =========================
// WATCHLIST: LOAD FROM MYSQL
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

            if (!Number.isFinite(id) || id <= 0) return;

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
}

// =========================
// WATCHLIST: ADD OR REMOVE
// =========================

async function toggleWatchlist(movie, button) {
    if (!requireLogin()) return;

    const userId = sessionStorage.getItem("vaultUserId");
    const movieId = Number(movie.id);
    const alreadySaved = savedMovies.has(movieId);

    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
        alert("Invalid movie ID. Please refresh the page and try again.");
        return;
    }

    button.disabled = true;

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
        button.disabled = false;
    }
}

function updateWatchlistButtons(movieId) {
    document.querySelectorAll(
        `.watchlist-btn[data-id="${Number(movieId)}"]`
    ).forEach(button => {
        const isSaved = savedMovies.has(Number(movieId));

        button.classList.toggle("saved", isSaved);
        button.textContent = isSaved ? "✓" : "＋";
        button.setAttribute(
            "aria-label",
            isSaved ? "Remove from watchlist" : "Add to watchlist"
        );
    });
}

// =========================
// WATCHLIST: DISPLAY AND REMOVE
// =========================

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
// INDUSTRY FILTERS
// =========================

function setupIndustryFilters() {
    if (!industryContainer) return;

    industryContainer.querySelectorAll("[data-language]").forEach(button => {
        button.addEventListener("click", () => {
            selectedLanguage = button.dataset.language || "all";

            industryContainer.querySelectorAll("[data-language]")
                .forEach(item => {
                    item.classList.toggle("selected", item === button);
                });

            loadMovies();
        });
    });
}

// =========================
// YEAR FILTER
// =========================

function setupYearFilter() {
    if (!movieGrid || document.getElementById("year-filter")) return;

    const wrapper = document.createElement("div");
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
        loadMovies();
    });

    wrapper.append(label, select);
    movieGrid.parentElement.insertBefore(wrapper, movieGrid);
}

// =========================
// GENRE FILTERS
// =========================

async function loadGenres() {
    const data = await tmdbRequest("/genre/movie/list?language=en");
    genres = data.genres || [];

    if (!genreContainer) return;

    genreContainer.replaceChildren();
    addGenreButton("All Genres", null);

    genres.forEach(genre => {
        addGenreButton(
            genre.name === "Science Fiction" ? "Sci-Fi" : genre.name,
            genre.id
        );
    });
}

function addGenreButton(label, genreId) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "filter-pill";
    button.textContent = label;
    button.dataset.genreId = genreId ?? "all";

    button.addEventListener("click", () => {
        selectedGenreId = genreId;

        genreContainer.querySelectorAll("[data-genre-id]")
            .forEach(item => {
                item.classList.toggle("selected", item === button);
            });

        loadMovies();
    });

    genreContainer.appendChild(button);
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
// LOAD MOVIES
// =========================

async function loadMovies(append = false) {
    if (isLoadingMore) return;

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
            movieStatus.textContent =
                `${movies.length} movies loaded` +
                (selectedLanguage !== "all"
                    ? ` · ${INDUSTRIES[selectedLanguage]}`
                    : " · All industries") +
                (selectedYear !== "all" ? ` · ${selectedYear}` : "") +
                (selectedGenreId !== null
                    ? ` · ${genres.find(g => g.id === selectedGenreId)?.name || "Selected genre"}`
                    : "") + ".";
        }

        let moreButton = document.getElementById("load-more-movies");

        if (!moreButton && movieGrid) {
            moreButton = document.createElement("button");
            moreButton.id = "load-more-movies";
            moreButton.type = "button";
            moreButton.textContent = "Load More Movies";
            moreButton.style.cssText =
                "display:block;margin:24px auto;padding:12px 24px;" +
                "background:#ffb547;color:#0b0b0d;border:0;" +
                "border-radius:5px;cursor:pointer;font-weight:bold;";

            moreButton.addEventListener("click", () => loadMovies(true));
            movieGrid.insertAdjacentElement("afterend", moreButton);
        }

        if (moreButton) {
            moreButton.style.display =
                currentPage < totalPages ? "block" : "none";
            moreButton.disabled = false;
        }
    } catch (error) {
        if (currentRequest !== requestNumber) return;

        console.error("Movie loading error:", error);

        if (movieStatus) {
            movieStatus.textContent =
                `Couldn't load movies: ${error.message}`;
        }
    } finally {
        isLoadingMore = false;
    }
}

// =========================
// RENDER MOVIE CARDS
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

        // FIX: validate and save the selected ID before navigating.
        card.addEventListener("click", () => {
            if (!Number.isSafeInteger(movieId) || movieId <= 0) {
                console.error("Invalid movie ID:", movie.id);
                return;
            }

            sessionStorage.setItem(
                "vaultSelectedMovieId",
                String(movieId)
            );

            window.location.href =
                `movie-details.html?id=${encodeURIComponent(movieId)}`;
        });

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

        if (savedMovies.has(movieId)) {
            watchButton.classList.add("saved");
        }

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
// SEARCH
// =========================

const searchToggle = document.getElementById("search-toggle");


if (searchToggle) {
    searchToggle.addEventListener("click", () => {
        const existingContainer = document.getElementById("movie-search-container");

        // Close the search bar
        if (existingContainer) {
            existingContainer.remove();
            searchQuery = "";
            loadMovies();
            return;
        }

        const navbar = document.querySelector(".navbar");
        if (!navbar) return;

        // Search container
        const container = document.createElement("div");
        container.id = "movie-search-container";
        container.style.cssText =
            "position:absolute;right:7%;top:72px;width:min(340px,85vw);" +
            "z-index:100;background:#19191c;border:1px solid #444;" +
            "border-radius:7px;overflow:hidden;";

        // Search input
        const search = document.createElement("input");
        search.id = "movie-search";
        search.type = "search";
        search.placeholder = "Search movies...";
        search.setAttribute("aria-label", "Search movies");
        search.autocomplete = "off";
        search.style.cssText =
            "width:100%;box-sizing:border-box;padding:14px 16px;" +
            "background:#19191c;color:#f4f1eb;border:none;" +
            "outline:none;font-size:15px;";

        // Live suggestions dropdown
        const resultsBox = document.createElement("div");
        resultsBox.id = "movie-search-results";
        resultsBox.style.cssText =
            "max-height:420px;overflow-y:auto;display:none;" +
            "border-top:1px solid #38383d;";

        container.append(search, resultsBox);
        navbar.appendChild(container);

        let searchTimer;
        let requestNumber = 0;

        function showMessage(message) {
            resultsBox.replaceChildren();
            resultsBox.textContent = message;
            resultsBox.style.cssText +=
                ";display:block;padding:14px;color:#b9b9c0;font-size:14px;";
        }

        async function searchMovies(query, currentRequest) {
            try {
                const response = await fetch(
                    "http://localhost:3000/api/tmdb?path=/search/movie&query=" +
                    encodeURIComponent(query) +
                    "&include_adult=false"
                );

                if (!response.ok) {
                    throw new Error("Movie search failed");
                }

                const data = await response.json();

                // Ignore older requests if the user has typed more
                if (currentRequest !== requestNumber) return;

                const movies = Array.isArray(data.results)
                    ? data.results
                    : Array.isArray(data.data?.results)
                        ? data.data.results
                        : [];

                resultsBox.replaceChildren();
                resultsBox.style.display = "block";
                resultsBox.style.padding = "0";

                if (movies.length === 0) {
                    showMessage("No matching movies found.");
                    return;
                }

                movies.slice(0, 7).forEach(movie => {
                    const item = document.createElement("button");
                    item.type = "button";
                    item.style.cssText =
                        "display:flex;align-items:center;gap:12px;width:100%;" +
                        "padding:10px 12px;background:#19191c;color:#f4f1eb;" +
                        "border:none;border-bottom:1px solid #303035;" +
                        "text-align:left;cursor:pointer;";

                    // Movie poster
                    if (movie.poster_path) {
                        const poster = document.createElement("img");
                        poster.src =
                            "https://image.tmdb.org/t/p/w92" + movie.poster_path;
                        poster.alt = "";
                        poster.style.cssText =
                            "width:42px;height:63px;object-fit:cover;" +
                            "border-radius:3px;flex-shrink:0;";
                        item.appendChild(poster);
                    }

                    // Movie title and release year
                    const info = document.createElement("div");
                    info.style.cssText =
                        "min-width:0;display:flex;flex-direction:column;gap:5px;";

                    const title = document.createElement("span");
                    title.textContent = movie.title || "Untitled movie";
                    title.style.cssText =
                        "font-size:14px;font-weight:600;";

                    const year = document.createElement("span");
                    year.textContent = movie.release_date
                        ? movie.release_date.slice(0, 4)
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
                        window.location.href =
                            "movie-details.html?id=" +
                            encodeURIComponent(movie.id);
                    });

                    resultsBox.appendChild(item);
                });
            } catch (error) {
                if (currentRequest !== requestNumber) return;
                console.error("Live movie search error:", error);
                showMessage("Couldn't load movies. Check that your backend is running.");
            }
        }

        search.addEventListener("input", () => {
            clearTimeout(searchTimer);

            const query = search.value.trim();
            const currentRequest = ++requestNumber;

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

        // Close suggestions when clicking outside the search
        document.addEventListener("click", function closeSearch(event) {
            if (
                !container.contains(event.target) &&
                event.target !== searchToggle
            ) {
                container.remove();
                document.removeEventListener("click", closeSearch);
            }
        });

        search.focus();
    });
}

// =========================
// INITIALIZE
// =========================

async function initializeApp() {
    setupIndustryFilters();
    setupYearFilter();

    await loadSavedMoviesFromDatabase();

    try {
        await loadGenres();
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
