
const TOP100_API = "https://abrahams-vault-backend.onrender.com/api";
const TOP100_IMAGE = "https://image.tmdb.org/t/p/w500";

const grid = document.getElementById("top100-grid");
const status = document.getElementById("top100-status");
const pageLabel = document.getElementById("top100-page-label");
const prevButton = document.getElementById("top100-prev");
const nextButton = document.getElementById("top100-next");

const PAGE_SIZE = 20;
const TOTAL_PAGES = 5;

let currentPage = 1;
let topMovies = [];
let savedIds = new Set();
let loading = false;

function authHeaders() {
    const token = sessionStorage.getItem("vaultToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }

    return data;
}

async function loadSavedIds() {
    const userId = sessionStorage.getItem("vaultUserId");
    const token = sessionStorage.getItem("vaultToken");

    savedIds.clear();

    if (!userId || !token) return;

    try {
        const data = await apiRequest(
            `${TOP100_API}/watchlist/${encodeURIComponent(userId)}`,
            { headers: authHeaders() }
        );

        if (!Array.isArray(data)) return;

        data.forEach(movie => {
            const id = Number(movie.movieId ?? movie.tmdb_movie_id ?? movie.id);
            if (Number.isSafeInteger(id) && id > 0) savedIds.add(id);
        });
    } catch (error) {
        console.error("Top 100 watchlist loading error:", error);
    }
}

function openMovie(movie) {
    const id = Number(movie.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;

    sessionStorage.setItem("vaultSelectedMovieId", String(id));
    window.location.href = `movie-details.html?id=${encodeURIComponent(id)}`;
}

async function toggleSaved(movie, button) {
    const userId = sessionStorage.getItem("vaultUserId");
    const token = sessionStorage.getItem("vaultToken");

    if (!userId || !token) {
        alert("Please log in to manage your watchlist.");
        window.location.href = "login.html";
        return;
    }

    if (button.disabled) return;

    const id = Number(movie.id);
    const wasSaved = savedIds.has(id);
    button.disabled = true;

    try {
        if (wasSaved) {
            await apiRequest(
                `${TOP100_API}/watchlist/${encodeURIComponent(userId)}/${id}`,
                { method: "DELETE", headers: authHeaders() }
            );
            savedIds.delete(id);
        } else {
            await apiRequest(
                `${TOP100_API}/watchlist/${encodeURIComponent(userId)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders()
                    },
                    body: JSON.stringify({
                        movieId: id,
                        title: movie.title || movie.original_title || "Untitled",
                        posterPath: movie.poster_path || null
                    })
                }
            );
            savedIds.add(id);
        }

        renderPage();
    } catch (error) {
        console.error("Top 100 watchlist update error:", error);
        alert(error.message || "Couldn't update My List.");
        button.disabled = false;
    }
}

function createCard(movie, rank) {
    const card = document.createElement("article");
    card.className = "top100-card";

    const posterLink = document.createElement("a");
    posterLink.className = "top100-poster-link";
    posterLink.href = `movie-details.html?id=${encodeURIComponent(movie.id)}`;
    posterLink.setAttribute("aria-label", `View ${movie.title} details`);
    posterLink.addEventListener("click", event => {
        event.preventDefault();
        openMovie(movie);
    });

    if (movie.poster_path) {
        const image = document.createElement("img");
        image.className = "top100-poster";
        image.src = TOP100_IMAGE + movie.poster_path;
        image.alt = `${movie.title || "Movie"} poster`;
        image.loading = "lazy";
        posterLink.appendChild(image);
    } else {
        const fallback = document.createElement("div");
        fallback.className = "top100-poster";
        fallback.style.cssText =
            "display:grid;place-items:center;padding:12px;text-align:center;color:#aaa;";
        fallback.textContent = movie.title || "Poster unavailable";
        posterLink.appendChild(fallback);
    }

    const rankBadge = document.createElement("span");
    rankBadge.className = "top100-rank";
    rankBadge.textContent = `#${rank}`;
    posterLink.appendChild(rankBadge);

    const info = document.createElement("div");
    info.className = "top100-info";

    const title = document.createElement("a");
    title.className = "top100-title";
    title.href = posterLink.href;
    title.textContent = movie.title || movie.original_title || "Untitled";
    title.addEventListener("click", event => {
        event.preventDefault();
        openMovie(movie);
    });

    const year = movie.release_date
        ? movie.release_date.slice(0, 4)
        : "Year unknown";

    const meta = document.createElement("div");
    meta.className = "top100-meta";
    meta.textContent = `${year} · ★ ${Number(movie.vote_average || 0).toFixed(1)}`;

    const actions = document.createElement("div");
    actions.className = "top100-actions";

    const details = document.createElement("a");
    details.className = "top100-details";
    details.href = posterLink.href;
    details.textContent = "View Details";
    details.addEventListener("click", event => {
        event.preventDefault();
        openMovie(movie);
    });

    const save = document.createElement("button");
    save.type = "button";
    save.className = "top100-list-button";
    save.classList.toggle("saved", savedIds.has(Number(movie.id)));
    save.textContent = savedIds.has(Number(movie.id)) ? "✓" : "＋";
    save.setAttribute(
        "aria-label",
        savedIds.has(Number(movie.id)) ? "Remove from My List" : "Add to My List"
    );
    save.addEventListener("click", () => toggleSaved(movie, save));

    actions.append(details, save);
    info.append(title, meta, actions);
    card.append(posterLink, info);

    return card;
}

function renderPage() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageMovies = topMovies.slice(start, start + PAGE_SIZE);

    grid.replaceChildren();

    pageMovies.forEach((movie, index) => {
        grid.appendChild(createCard(movie, start + index + 1));
    });

    pageLabel.textContent = `Page ${currentPage} of ${TOTAL_PAGES}`;
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === TOTAL_PAGES;
}

async function loadTop100() {
    if (loading) return;
    loading = true;
    status.textContent = "Loading the Top 100...";
    grid.replaceChildren();

    try {
        const pages = await Promise.all(
            Array.from({ length: TOTAL_PAGES }, (_, index) =>
                apiRequest(
                    `${TOP100_API}/tmdb?path=${encodeURIComponent("/movie/top_rated")}` +
                    `&language=en-US&page=${index + 1}`
                )
            )
        );

        const unique = new Map();

        pages.forEach(page => {
            (page.results || []).forEach(movie => {
                if (movie?.id && !unique.has(Number(movie.id))) {
                    unique.set(Number(movie.id), movie);
                }
            });
        });

        topMovies = Array.from(unique.values()).slice(0, 100);

        if (!topMovies.length) {
            status.textContent = "No movies were returned. Please try again.";
            return;
        }

        status.textContent =
            `Showing ${topMovies.length} top-rated movies from TMDB.`;

        renderPage();
    } catch (error) {
        console.error("Top 100 loading error:", error);
        status.textContent =
            `Couldn't load the Top 100: ${error.message}. Please refresh and try again.`;
    } finally {
        loading = false;
    }
}

prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
});

nextButton.addEventListener("click", () => {
    if (currentPage < TOTAL_PAGES) {
        currentPage++;
        renderPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
});

async function initializeTop100() {
    await loadSavedIds();
    await loadTop100();
}

initializeTop100();
