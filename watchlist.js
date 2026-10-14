
const API_BASE_URL = "http://localhost:3000/api";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const grid = document.getElementById("saved-movies-grid");
const status = document.getElementById("watchlist-status");

// ===============================
// AUTHENTICATION
// ===============================

function getAuthHeaders() {
    const token = sessionStorage.getItem("vaultToken");

    return token
        ? { Authorization: `Bearer ${token}` }
        : {};
}

function getCurrentUserId() {
    return sessionStorage.getItem("vaultUserId");
}

// ===============================
// TMDB REQUEST
// ===============================

async function tmdbRequest(endpoint) {
    const parsedUrl = new URL(endpoint, "https://tmdb-endpoint.local");
    const query = new URLSearchParams();

    query.set("path", parsedUrl.pathname);

    parsedUrl.searchParams.forEach((value, key) => {
        query.set(key, value);
    });

    const response = await fetch(
        `${API_BASE_URL}/tmdb?${query.toString()}`
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || data.message ||
            `Movie request failed: ${response.status}`
        );
    }

    return data;
}

// ===============================
// LOAD WATCHLIST
// ===============================

async function loadWatchlist() {
    if (!grid || !status) {
        console.error("Watchlist HTML elements were not found.");
        return;
    }

    const userId = getCurrentUserId();
    const token = sessionStorage.getItem("vaultToken");

    if (!userId || !token) {
        grid.replaceChildren();
        status.textContent = "Please log in to view your watchlist. ";

        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "Log in";
        status.appendChild(loginLink);
        return;
    }

    status.textContent = "Loading your watchlist...";
    grid.replaceChildren();

    try {
        const response = await fetch(
            `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}`,
            {
                headers: getAuthHeaders()
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || data.message ||
                `Could not load watchlist (${response.status})`
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("Unexpected watchlist response.");
        }

        if (data.length === 0) {
            renderWatchlist([]);
            return;
        }

        const enrichedMovies = await Promise.all(
            data.map(async movie => {
                const movieId =
                    movie.movieId ??
                    movie.tmdb_movie_id ??
                    movie.id;

                const savedMovie = {
                    ...movie,
                    id: Number(movieId),
                    title: movie.title ?? movie.movie_title ?? "Untitled",
                    poster_path:
                        movie.poster_path ??
                        movie.posterPath ??
                        movie.posterpath ??
                        null
                };

                try {
                    const [details, videos] = await Promise.all([
                        tmdbRequest(
                            `/movie/${movieId}?language=en-US`
                        ),
                        tmdbRequest(
                            `/movie/${movieId}/videos?language=en-US`
                        )
                    ]);

                    const videoList = videos.results || [];

                    const trailer =
                        videoList.find(video =>
                            video.site === "YouTube" &&
                            video.type === "Trailer" &&
                            video.official &&
                            video.key
                        ) ||
                        videoList.find(video =>
                            video.site === "YouTube" &&
                            video.type === "Trailer" &&
                            video.key
                        );

                    return {
                        ...savedMovie,
                        ...details,
                        id: Number(movieId),
                        trailerKey: trailer ? trailer.key : null
                    };
                } catch (error) {
                    console.error(
                        `Could not load movie ${movieId}:`,
                        error.message
                    );

                    return {
                        ...savedMovie,
                        trailerKey: null,
                        detailsUnavailable: true
                    };
                }
            })
        );

        renderWatchlist(enrichedMovies);
    } catch (error) {
        console.error("Watchlist loading error:", error);

        grid.replaceChildren();
        status.textContent =
            `Could not load your watchlist: ${error.message}`;
    }
}

// ===============================
// RENDER WATCHLIST
// ===============================

function renderWatchlist(movies) {
    grid.replaceChildren();

    if (movies.length === 0) {
        status.textContent =
            "Your watchlist is empty. Discover a movie and add it to your list!";
        return;
    }

    status.textContent =
        `${movies.length} saved movie${movies.length === 1 ? "" : "s"}`;

    movies.forEach(movie => {
        const movieId = movie.id;

        const card = document.createElement("article");
        card.className = "movie-card";

        const poster = document.createElement("div");
        poster.className = "poster";

        if (movie.poster_path) {
            const image = document.createElement("img");
            image.className = "poster-image";
            image.src = IMAGE_BASE_URL + movie.poster_path;
            image.alt = `${movie.title || "Movie"} poster`;
            image.loading = "lazy";
            poster.appendChild(image);
        } else {
            const fallback = document.createElement("div");
            fallback.className = "poster-fallback";
            fallback.textContent = movie.title || "Movie";
            poster.appendChild(fallback);
        }

        const overlay = document.createElement("div");
        overlay.className = "poster-overlay";

        const heading = document.createElement("h3");
        heading.textContent = movie.title || "Untitled";

        const year = movie.release_date
            ? movie.release_date.slice(0, 4)
            : "Year unknown";

        const rating = movie.vote_average != null
            ? `★ ${Number(movie.vote_average).toFixed(1)}/10`
            : "Rating unavailable";

        const details = document.createElement("p");
        details.className = "watchlist-meta";
        details.textContent = `${year} · ${rating}`;

        const actions = document.createElement("div");
        actions.className = "watchlist-actions";

        const detailsLink = document.createElement("a");
        detailsLink.className = "watchlist-action-btn";
        detailsLink.href =
            `movie-details.html?id=${encodeURIComponent(movieId)}`;
        detailsLink.textContent = "View Details";
        actions.appendChild(detailsLink);

        const trailerLink = document.createElement("a");
        trailerLink.className = "watchlist-action-btn";

        if (movie.trailerKey) {
            trailerLink.href =
                `https://www.youtube.com/watch?v=${encodeURIComponent(movie.trailerKey)}`;
            trailerLink.target = "_blank";
            trailerLink.rel = "noopener noreferrer";
            trailerLink.textContent = "▶ Watch Trailer";
        } else {
            trailerLink.href = "#";
            trailerLink.textContent = "Trailer unavailable";
            trailerLink.setAttribute("aria-disabled", "true");

            trailerLink.addEventListener("click", event => {
                event.preventDefault();
            });
        }

        actions.appendChild(trailerLink);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "watchlist-btn";
        removeButton.textContent = "Remove";
        removeButton.setAttribute(
            "aria-label",
            `Remove ${heading.textContent} from watchlist`
        );

        removeButton.addEventListener("click", async () => {
            if (removeButton.disabled) return;

            const userId = getCurrentUserId();

            if (!userId || !sessionStorage.getItem("vaultToken")) {
                status.textContent = "Please log in again.";
                return;
            }

            removeButton.disabled = true;
            removeButton.textContent = "Removing...";

            try {
                const response = await fetch(
                    `${API_BASE_URL}/watchlist/${encodeURIComponent(userId)}/${encodeURIComponent(movieId)}`,
                    {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    }
                );

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(
                        result.error || result.message ||
                        `Could not remove movie (${response.status})`
                    );
                }

                await loadWatchlist();
            } catch (error) {
                console.error("Remove movie error:", error);
                status.textContent =
                    `Could not remove the movie: ${error.message}`;

                removeButton.disabled = false;
                removeButton.textContent = "Remove";
            }
        });

        overlay.append(heading, details, actions, removeButton);
        poster.appendChild(overlay);
        card.appendChild(poster);
        grid.appendChild(card);
    });
}

// ===============================
// START
// ===============================

loadWatchlist();
