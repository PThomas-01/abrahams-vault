
const API_BASE_URL = "https://abrahams-vault-backend.onrender.com/api";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const grid = document.getElementById("watched-movies-grid");
const status = document.getElementById("watched-status");

function getAuthHeaders() {
    const token = sessionStorage.getItem("vaultToken");

    return token
        ? { Authorization: `Bearer ${token}` }
        : {};
}

function getCurrentUserId() {
    return sessionStorage.getItem("vaultUserId");
}

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            ...getAuthHeaders(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}

async function loadWatchedMovies() {
    grid.replaceChildren();

    const userId = getCurrentUserId();
    const token = sessionStorage.getItem("vaultToken");

    if (!userId || !token) {
        status.textContent = "Please log in to view your Watched Log. ";

        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "Log in";
        status.appendChild(loginLink);
        return;
    }

    status.textContent = "Loading your Watched Log...";

    try {
        const movies = await apiRequest(
            `/watched/${encodeURIComponent(userId)}`
        );

        if (!Array.isArray(movies)) {
            throw new Error("Unexpected watched-movies response.");
        }

        renderWatchedMovies(movies);
    } catch (error) {
        console.error("Watched Log loading error:", error);
        status.textContent =
            `Could not load your Watched Log: ${error.message}`;
    }
}

function renderWatchedMovies(movies) {
    grid.replaceChildren();

    if (movies.length === 0) {
        status.textContent =
            "Your Watched Log is empty. Open a movie and select Add to Watched Log!";
        return;
    }

    status.textContent =
        `${movies.length} watched movie${movies.length === 1 ? "" : "s"}`;

    movies.forEach(movie => {
        const movieId = Number(
            movie.movieId ?? movie.tmdb_movie_id ?? movie.id
        );

        const title = movie.title ?? movie.movie_title ?? "Untitled";
        const posterPath =
            movie.posterPath ?? movie.poster_path ?? null;

        const card = document.createElement("article");
        card.className = "movie-card";

        const poster = document.createElement("div");
        poster.className = "poster";

        if (posterPath) {
            const image = document.createElement("img");
            image.className = "poster-image";
            image.src = IMAGE_BASE_URL + posterPath;
            image.alt = `${title} poster`;
            image.loading = "lazy";
            poster.appendChild(image);
        } else {
            const fallback = document.createElement("div");
            fallback.className = "poster-fallback";
            fallback.textContent = title;
            poster.appendChild(fallback);
        }

        const overlay = document.createElement("div");
        overlay.className = "poster-overlay";

        const heading = document.createElement("h3");
        heading.textContent = title;

        const watchedDate = document.createElement("p");
        watchedDate.className = "watchlist-meta";

        const rawDate = movie.watchedAt ?? movie.watched_at;

        if (rawDate) {
            const date = new Date(rawDate);

            watchedDate.textContent = Number.isNaN(date.getTime())
                ? "Watched"
                : `Watched: ${date.toLocaleDateString()}`;
        } else {
            watchedDate.textContent = "Watched";
        }

        const actions = document.createElement("div");
        actions.className = "watchlist-actions";

        const detailsLink = document.createElement("a");
        detailsLink.className = "watchlist-action-btn";
        detailsLink.href =
            `movie-details.html?id=${encodeURIComponent(movieId)}`;
        detailsLink.textContent = "View Details";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "watchlist-btn";
        removeButton.textContent = "Remove";
        removeButton.setAttribute(
            "aria-label",
            `Remove ${title} from Watched Log`
        );

        removeButton.addEventListener("click", async () => {
            if (removeButton.disabled) return;

            removeButton.disabled = true;
            removeButton.textContent = "Removing...";

            try {
                await apiRequest(
                    `/watched/${encodeURIComponent(getCurrentUserId())}/${encodeURIComponent(movieId)}`,
                    { method: "DELETE" }
                );

                await loadWatchedMovies();
            } catch (error) {
                console.error("Remove watched movie error:", error);
                status.textContent =
                    `Could not remove movie: ${error.message}`;

                removeButton.disabled = false;
                removeButton.textContent = "Remove";
            }
        });

        actions.appendChild(detailsLink);
actions.appendChild(removeButton);

overlay.append(heading, watchedDate);
poster.appendChild(overlay);

card.appendChild(poster);
card.appendChild(actions);
grid.appendChild(card);
    });
}

loadWatchedMovies();
