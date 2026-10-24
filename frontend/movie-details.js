
const API_BASE_URL = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000/api"
    : "https://abrahams-vault-backend.onrender.com/api";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

const params = new URLSearchParams(window.location.search);
const rawUrlId = params.get("id");
const urlMovieId = Number(rawUrlId);

const requestedMediaType = params.get("type");
const mediaType = requestedMediaType === "tv" ? "tv" : "movie";

const savedMovieId = Number(
    sessionStorage.getItem("vaultSelectedMovieId")
);

const movieId =
    rawUrlId && Number.isSafeInteger(urlMovieId) && urlMovieId > 0
        ? urlMovieId
        : Number.isSafeInteger(savedMovieId) && savedMovieId > 0
            ? savedMovieId
            : NaN;

const itemTypeLabel = mediaType === "tv" ? "series" : "movie";
const detailsContainer = document.getElementById("movie-details");
const statusElement = document.getElementById("details-status");

let currentMovie = null;
let currentUserRating = null;
let communityRating = null;
let ratingCount = 0;
let isSavingRating = false;
let isInWatchlist = false;
let isWatched = false;
let ratingNotice = "";

let reviews = [];
let isSavingReview = false;
let reviewNotice = "";
let editingReview = false;

let journalEntry = null;
let journalNotice = "";
let isSavingJournal = false;
let journalLoaded = false;

// =====================================
// AUTHENTICATION AND API HELPERS
// =====================================

function getToken() {
    return sessionStorage.getItem("vaultToken");
}

function getUserId() {
    return sessionStorage.getItem("vaultUserId");
}

function getUsername() {
    return sessionStorage.getItem("vaultUsername");
}

function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
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

async function tmdbRequest(endpoint) {
    const url = new URL(endpoint, window.location.origin);
    const proxyParams = new URLSearchParams({
        path: url.pathname
    });

    url.searchParams.forEach((value, key) => {
        proxyParams.set(key, value);
    });

    const response = await fetch(
        `${API_BASE_URL}/tmdb?${proxyParams.toString()}`
    );

    return readResponse(response);
}

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    return readResponse(response);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function mediaTypeQuery() {
    return `mediaType=${encodeURIComponent(mediaType)}`;
}

function formatDate(dateString) {
    if (!dateString) return "Date unavailable";

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatRuntime(minutes) {
    if (!minutes) return "Runtime unavailable";

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (!hours) return `${remainingMinutes} min`;

    return `${hours}h ${remainingMinutes}m`;
}


async function openPersonDetails(personId) {
    if (!Number.isSafeInteger(personId) || personId <= 0) return;

    let modal = document.getElementById("person-details-modal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "person-details-modal";
        modal.className = "person-modal";
        modal.innerHTML = `
            <div class="person-modal-panel" role="dialog"
                aria-modal="true" aria-labelledby="person-modal-name">
                <button type="button" class="person-modal-close"
                    aria-label="Close person details">✕</button>
                <div class="person-modal-content">
                    <p>Loading person details...</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

       modal.querySelector(".person-modal-close").addEventListener("click", () => {
    modal.hidden = true;
});

modal.addEventListener("click", event => {
    if (event.target === modal) {
        modal.hidden = true;
    }
});

        modal.querySelector(".person-modal-panel")
            .addEventListener("click", event => event.stopPropagation());

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && modal && !modal.hidden) {
                modal.hidden = true;
            }
        });
    }

    modal.hidden = false;
    const content = modal.querySelector(".person-modal-content");
    content.innerHTML = "<p>Loading biography and filmography...</p>";

    try {
        const [person, credits] = await Promise.all([
            tmdbRequest(`/person/${personId}?language=en-US`),
            tmdbRequest(`/person/${personId}/combined_credits?language=en-US`)
        ]);

        const photo = person.profile_path
            ? `${IMAGE_BASE_URL}w500${person.profile_path}`
            : "";

        const filmography = [
            ...(credits.cast || []),
            ...(credits.crew || [])
        ]
            .filter(item => item.id && (item.title || item.name))
            .filter((item, index, array) =>
                array.findIndex(other =>
                    other.id === item.id &&
                    other.media_type === item.media_type
                ) === index
            )
            .sort((a, b) =>
                (b.popularity || 0) - (a.popularity || 0)
            )
            .slice(0, 18);

        content.innerHTML = `
            <div class="person-profile">
                <div class="person-profile-photo">
                    ${photo
                        ? `<img src="${photo}"
                            alt="${escapeHTML(person.name)}">`
                        : `<div class="cast-photo-placeholder">?</div>`
                    }
                </div>

                <div class="person-profile-info">
                    <h2 id="person-modal-name">
                        ${escapeHTML(person.name || "Unknown")}
                    </h2>
                    <p class="person-department">
                        ${escapeHTML(person.known_for_department || "Film professional")}
                        ${person.birthday
                            ? ` · Born ${escapeHTML(person.birthday)}`
                            : ""}
                    </p>
                    <h3>Biography</h3>
                    <p class="person-biography">
                        ${escapeHTML(
                            person.biography || "No biography is available."
                        )}
                    </p>
                </div>
            </div>

            <section class="person-filmography">
                <h3>Known Filmography</h3>
                <div class="person-film-grid">
                    ${filmography.length
                        ? filmography.map(item => {
                            const title = item.title || item.name;
                            const year = (
                                item.release_date || item.first_air_date || ""
                            ).slice(0, 4);
                            const poster = item.poster_path
                                ? `${IMAGE_BASE_URL}w185${item.poster_path}`
                                : "";

                            return `
                                <button type="button"
                                    class="person-film-card"
                                    data-film-id="${Number(item.id)}"
                                    data-film-type="${item.media_type === "tv" ? "tv" : "movie"}">
                                    ${poster
                                        ? `<img src="${poster}"
                                            alt="${escapeHTML(title)}"
                                            loading="lazy">`
                                        : `<div class="person-film-no-poster">No poster</div>`
                                    }
                                    <span>${escapeHTML(title)}</span>
                                    <small>${escapeHTML(year || "Year unknown")}</small>
                                </button>
                            `;
                        }).join("")
                        : "<p>No filmography is available.</p>"
                    }
                </div>
            </section>
        `;

        content.querySelectorAll(".person-film-card").forEach(button => {
            button.addEventListener("click", () => {
                const id = Number(button.dataset.filmId);
                const type = button.dataset.filmType === "tv" ? "tv" : "movie";

                if (Number.isSafeInteger(id) && id > 0) {
                    window.location.href =
                        `movie-details.html?id=${id}&type=${type}`;
                }
            });
        });
    } catch (error) {
        console.error("Person details error:", error);
        content.innerHTML = `
            <p>Could not load this person's details.
                Please try again.</p>
        `;
    }
}

// =====================================
// LOAD MOVIE OR TV DETAILS
// =====================================

async function loadMovieDetails() {
    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
        statusElement.textContent =
            "Invalid link. Return to the homepage and select a title again.";
        return;
    }

    try {
        statusElement.style.display = "block";
        statusElement.textContent =
            `Loading ${mediaType === "tv" ? "series" : "movie"} details...`;

        const tmdbType = mediaType === "tv" ? "tv" : "movie";

        const [item, videos, credits] = await Promise.all([
            tmdbRequest(`/${tmdbType}/${movieId}?language=en-US`),
            tmdbRequest(`/${tmdbType}/${movieId}/videos?language=en-US`),
            tmdbRequest(`/${tmdbType}/${movieId}/credits?language=en-US`)
        ]);

        // Normalize TV data so existing features can use movie.title.
        const movie = mediaType === "tv"
            ? {
                ...item,
                title: item.name,
                release_date: item.first_air_date,
                runtime: item.episode_run_time?.[0] || 0,
                director: (item.created_by || [])
                    .map(person => person.name)
                    .filter(Boolean)
                    .join(", ")
            }
            : item;

        currentMovie = movie;
        window.currentMovie = movie;

        const trailer = videos.results?.find(video =>
            video.site === "YouTube" &&
            video.type === "Trailer" &&
            video.official
        ) || videos.results?.find(video =>
            video.site === "YouTube" &&
            video.type === "Trailer"
        );

        const backdrop = movie.backdrop_path
            ? `${IMAGE_BASE_URL}original${movie.backdrop_path}`
            : "";

        const poster = movie.poster_path
            ? `${IMAGE_BASE_URL}w500${movie.poster_path}`
            : "";

        const genres = (movie.genres || [])
            .map(genre => escapeHTML(genre.name))
            .join(" · ");

        const cast = (credits.cast || []).slice(0, 12);
        const crew = credits.crew || [];

        const director = mediaType === "tv"
            ? (movie.director ? { name: movie.director } : null)
            : crew.find(person => person.job === "Director");

        const castMarkup = cast.length
            ? cast.map(person => {
                const profile = person.profile_path
                    ? `${IMAGE_BASE_URL}w185${person.profile_path}`
                    : "";

                return `
    <article class="cast-card"
        data-person-id="${Number(person.id)}"
        tabindex="0"
        role="button"
        aria-label="View ${escapeHTML(person.name || "person")} details">
                        <div class="cast-photo">
                            ${
                                profile
                                    ? `<img src="${profile}"
                                           alt="${escapeHTML(person.name)}"
                                           loading="lazy">`
                                    : `<div class="cast-photo-placeholder">?</div>`
                            }
                        </div>
                        <div class="cast-info">
                            <h3>${escapeHTML(person.name || "Unknown")}</h3>
                            <p>${escapeHTML(
                                person.character || "Role unavailable"
                            )}</p>
                        </div>
                    </article>
                `;
            }).join("")
            : `<p class="cast-unavailable">
                   Cast information is unavailable for this ${itemTypeLabel}.
               </p>`;

        const year = (movie.release_date || "").slice(0, 4);
        const runtimeText = mediaType === "tv" && movie.runtime
            ? `${movie.runtime} min/episode`
            : formatRuntime(movie.runtime);

        detailsContainer.innerHTML = `
            <section class="details-backdrop"
                style="${backdrop
                    ? `background-image: linear-gradient(to top, #0b0b0d 4%, rgba(11,11,13,.72) 58%, rgba(11,11,13,.2)), url('${backdrop}')`
                    : ""}">
            </section>

            <section class="details-content">
                <div class="details-poster">
                    ${
                        poster
                            ? `<img src="${poster}"
                                   alt="${escapeHTML(movie.title)} poster">`
                            : `<div class="rating-no-poster">
                                   No poster available
                               </div>`
                    }
                </div>

                <div class="details-info">
                    <h1>${escapeHTML(
                        movie.title ||
                        (mediaType === "tv" ? "Untitled TV Show" : "Untitled movie")
                    )}</h1>

                    ${movie.tagline
                        ? `<p class="details-tagline">
                               ${escapeHTML(movie.tagline)}
                           </p>`
                        : ""}

                    <div class="details-meta">
                        <span>
                            TMDB ★ ${
                                movie.vote_average
                                    ? Number(movie.vote_average).toFixed(1)
                                    : "N/A"
                            }
                        </span>

                        <span>
                            ${Number(movie.vote_count || 0).toLocaleString()}
                            TMDB votes
                        </span>

                        <span>${escapeHTML(year || "Year unknown")}</span>

                        <span>${escapeHTML(runtimeText)}</span>

                        ${mediaType === "tv" && movie.number_of_seasons
                            ? `<span>${Number(movie.number_of_seasons)}
                                   seasons</span>`
                            : ""}
                    </div>

                    <p class="details-genres">
                        ${genres || "Genres unavailable"}
                    </p>

                    ${director ? `
                        <p class="details-director">
                            <strong>${mediaType === "tv" ? "Created by:" : "Director:"}</strong>
                            ${escapeHTML(director.name)}
                        </p>
                    ` : ""}

                    <h2>Synopsis</h2>

                    <p class="details-overview">
                        ${escapeHTML(
                            movie.overview ||
                            `No synopsis is available for this ${itemTypeLabel}.`
                        )}
                    </p>

                    <div class="details-actions">
                        <button id="watchlist-button"
                            class="vault-action-button" type="button">
                            Checking My List...
                        </button>

                        <button id="watched-button"
                            class="vault-action-button" type="button">
                            Checking Watched Status...
                        </button>

                        <button id="journal-button"
                            class="vault-action-button" type="button">
                            Write in My Journal
                        </button>

                       ${
    trailer
        ? `<button id="watch-trailer-button"
              class="vault-action-button trailer-button"
              type="button">
              ▶ Watch Trailer
           </button>`
        : ""
}
                    </div>
                  ${trailer ? `
    <section id="trailer-player-section" hidden>
        <div class="trailer-player-header">
            <h2>Watch Trailer</h2>
            <button id="close-trailer-button" type="button"
                class="vault-action-button">
                ✕ Close Trailer
            </button>
        </div>

        <div class="trailer-video-wrapper">
            <iframe
                id="trailer-iframe"
                title="${escapeHTML(movie.title || "Movie")} trailer"
                src=""
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowfullscreen
                loading="lazy"
                referrerpolicy="strict-origin-when-cross-origin">
            </iframe>
        </div>
    </section>
` : ""}  
                </div>

                <section id="cast-section" class="cast-section">
                    <h2>Cast &amp; Crew</h2>
                    <p class="cast-subtitle">
                        ${mediaType === "tv"
                            ? "Meet the cast and creators behind this series."
                            : "Meet the people behind this movie."}
                    </p>
                    <div class="cast-grid">${castMarkup}</div>
                </section>

                <section id="movie-journal-section" class="movie-reviews">
                    <div class="reviews-heading">
                        <h2>My Journal</h2>
                        <p class="reviews-subtitle">
                            Your private thoughts and memories about this
                            ${itemTypeLabel}.
                        </p>
                    </div>

                    <div id="movie-journal-status" aria-live="polite">
                        Checking your journal...
                    </div>

                    <div id="movie-journal-form-container" hidden></div>
                </section>

                <section id="community-rating" class="community-rating">
                    <h2>Abraham's Vault Rating</h2>
                    <p class="rating-loading">Loading community ratings...</p>
                </section>

                <section id="movie-reviews" class="movie-reviews">
                    <div class="reviews-heading">
                        <h2>Community Reviews</h2>
                        <p class="reviews-subtitle">
                            Share your thoughts about this ${itemTypeLabel}.
                        </p>
                    </div>

                    <div id="review-form-container"></div>

                    <div id="reviews-status" aria-live="polite">
                        Loading reviews...
                    </div>

                    <div id="reviews-list"></div>
                </section>
            </section>
        `;

        // Top 5 remains a movie-only feature.
        if (mediaType === "movie" && window.VaultTop5) {
            await window.VaultTop5.addDetailsButton(movie);
        }

        statusElement.textContent = "";
        statusElement.style.display = "none";

        document.getElementById("watchlist-button")
            .addEventListener("click", toggleWatchlist);

        document.getElementById("watched-button")
            .addEventListener("click", toggleWatched);

        document.getElementById("journal-button")
            .addEventListener("click", openMovieJournal);
            const castGrid = document.querySelector(".cast-grid");

if (castGrid) {
    castGrid.addEventListener("click", event => {
        const card = event.target.closest("[data-person-id]");
        if (card) {
            openPersonDetails(Number(card.dataset.personId));
        }
    });

    castGrid.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;

        const card = event.target.closest("[data-person-id]");
        if (!card) return;

        event.preventDefault();
        openPersonDetails(Number(card.dataset.personId));
    });
}
       
const trailerButton = document.getElementById("watch-trailer-button");
const trailerSection = document.getElementById("trailer-player-section");
const trailerIframe = document.getElementById("trailer-iframe");
const closeTrailerButton = document.getElementById("close-trailer-button");

if (trailerButton && trailerSection && trailerIframe) {
    trailerButton.addEventListener("click", () => {
        trailerIframe.src =
            `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`;

        trailerSection.hidden = false;

        trailerSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
}

function stopTrailer() {
    if (!trailerIframe || !trailerSection) return;

    trailerIframe.src = "about:blank";
    trailerSection.hidden = true;
}

if (closeTrailerButton) {
    closeTrailerButton.addEventListener("click", stopTrailer);
}
   

        await Promise.allSettled([
            loadCommunityRating(),
            loadPersonalRating(),
            loadWatchlistStatus(),
            loadWatchedStatus(),
            loadReviews(),
            loadJournalEntry()
        ]);
    } catch (error) {
        console.error("Details loading error:", error);
        statusElement.style.display = "block";
        statusElement.textContent =
            error.message || "Could not load details.";
    }
}

// =====================================
// COMMUNITY AND PERSONAL RATINGS
// =====================================

async function loadCommunityRating() {
    try {
        const data = await apiRequest(
            `/ratings/${movieId}?${mediaTypeQuery()}`
        );

        communityRating = data.averageRating ?? null;
        ratingCount = Number(data.totalRatings ?? data.ratingCount ?? 0);

        renderRatingSection();
    } catch (error) {
        console.error("Community rating error:", error);

        const section = document.getElementById("community-rating");

        if (section) {
            section.innerHTML = `
                <h2>Abraham's Vault Rating</h2>
                <p class="rating-message">
                    Community ratings are temporarily unavailable.
                </p>
            `;
        }
    }
}

async function loadPersonalRating() {
    if (!getToken()) {
        currentUserRating = null;
        renderRatingSection();
        return;
    }

    try {
        const data = await apiRequest(
            `/ratings/${movieId}/mine?${mediaTypeQuery()}`
        );

        currentUserRating = data.rating ?? null;
    } catch (error) {
        console.error("Personal rating error:", error);
        currentUserRating = null;
    }

    renderRatingSection();
}

function renderRatingSection() {
    const section = document.getElementById("community-rating");
    if (!section) return;

    const hasToken = Boolean(getToken());

    const averageText =
        communityRating === null || communityRating === undefined
            ? "Not rated yet"
            : `${Number(communityRating).toFixed(1)} / 5`;

    const starDisplay =
        communityRating === null || communityRating === undefined
            ? ""
            : renderStars(Math.round(Number(communityRating)));

    const personalText = currentUserRating
        ? `Your rating: ${currentUserRating}/5`
        : hasToken
            ? `You haven't rated this ${itemTypeLabel} yet.`
            : "Log in to submit your rating.";

    section.innerHTML = `
        <h2>Abraham's Vault Rating</h2>

        <div class="community-rating-summary">
            <div class="community-average">${escapeHTML(averageText)}</div>
            <div class="community-average-stars">${starDisplay}</div>

            <p class="rating-vote-count">
                ${ratingCount.toLocaleString()}
                ${ratingCount === 1 ? "community vote" : "community votes"}
            </p>
        </div>

        <div class="personal-rating">
            <h3>Rate this ${itemTypeLabel}</h3>

            <div class="rating-star-picker" role="group"
                aria-label="Choose a rating from 1 to 5 stars">
                ${[1, 2, 3, 4, 5].map(star => `
                    <button type="button"
                        class="rating-star ${
                            Number(currentUserRating) >= star ? "selected" : ""
                        }"
                        data-rating="${star}"
                        aria-label="${star} out of 5 stars"
                        aria-pressed="${Number(currentUserRating) === star}"
                        ${!hasToken || isSavingRating ? "disabled" : ""}>★</button>
                `).join("")}
            </div>

            <p class="rating-message" aria-live="polite">
                ${escapeHTML(
                    ratingNotice ||
                    (hasToken
                        ? personalText
                        : "Sign in to Abraham's Vault to rate this title.")
                )}
            </p>
        </div>
    `;

    section.querySelectorAll(".rating-star").forEach(button => {
        button.addEventListener("click", () => {
            saveRating(Number(button.dataset.rating));
        });
    });
}

function renderStars(rating) {
    return [1, 2, 3, 4, 5].map(star => `
        <span class="${star <= rating ? "star-filled" : "star-empty"}">★</span>
    `).join("");
}

async function saveRating(rating) {
    if (!getToken()) {
        ratingNotice = "Please log in before rating this title.";
        renderRatingSection();
        return;
    }

    if (
        isSavingRating ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
    ) {
        return;
    }

    isSavingRating = true;
    ratingNotice = "Saving your rating...";
    renderRatingSection();

    try {
        await apiRequest("/ratings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ movieId, rating, mediaType })
        });

        currentUserRating = rating;
        await loadCommunityRating();

        ratingNotice = "Your rating has been saved!";
    } catch (error) {
        console.error("Save rating error:", error);
        ratingNotice = error.message || "Could not save your rating.";
    } finally {
        isSavingRating = false;
        renderRatingSection();
    }
}

// =====================================
// MY LIST / WATCHLIST
// =====================================

async function loadWatchlistStatus() {
    const button = document.getElementById("watchlist-button");
    if (!button) return;

    if (!getToken() || !getUserId()) {
        isInWatchlist = false;
        button.textContent = "Log in to use My List";
        return;
    }

    try {
        const userId = encodeURIComponent(getUserId());
        const entries = await apiRequest(`/watchlist/${userId}`);

        isInWatchlist = Array.isArray(entries) && entries.some(entry =>
            Number(entry.movieId ?? entry.tmdb_movie_id ?? entry.id) === movieId &&
            (entry.mediaType ?? entry.media_type ?? "movie") === mediaType
        );

        button.textContent = isInWatchlist
            ? "Remove from My List"
            : "Add to My List";
    } catch (error) {
        console.error("Watchlist status error:", error);
        button.textContent = "My List unavailable";
    }
}

async function toggleWatchlist() {
    const button = document.getElementById("watchlist-button");
    if (!button || button.disabled) return;

    if (!getToken() || !getUserId()) {
        button.textContent = "Please log in first";
        return;
    }

    if (!currentMovie) return;

    const userId = encodeURIComponent(getUserId());
    const idPath = encodeURIComponent(String(movieId));

    button.disabled = true;

    try {
        if (isInWatchlist) {
            await apiRequest(
                `/watchlist/${userId}/${idPath}?${mediaTypeQuery()}`,
                { method: "DELETE" }
            );

            isInWatchlist = false;
        } else {
            await apiRequest(`/watchlist/${userId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movieId,
                    mediaType,
                    title: currentMovie.title,
                    posterPath: currentMovie.poster_path || null
                })
            });

            isInWatchlist = true;
        }

        button.textContent = isInWatchlist
            ? "Remove from My List"
            : "Add to My List";
    } catch (error) {
        console.error("Watchlist update error:", error);
        window.alert(`Could not update My List: ${error.message}`);
        await loadWatchlistStatus();
    } finally {
        button.disabled = false;
    }
}

// =====================================
// WATCHED LOG
// =====================================

async function loadWatchedStatus() {
    const button = document.getElementById("watched-button");
    if (!button) return;

    if (!getToken() || !getUserId()) {
        isWatched = false;
        button.textContent = "Log in to use Watched Log";
        return;
    }

    button.disabled = true;
    button.textContent = "Checking Watched Status...";

    try {
        const userId = encodeURIComponent(getUserId());
        const entries = await apiRequest(`/watched/${userId}`);

        isWatched = Array.isArray(entries) && entries.some(entry =>
            Number(entry.movieId ?? entry.tmdb_movie_id ?? entry.id) === movieId &&
            (entry.mediaType ?? entry.media_type ?? "movie") === mediaType
        );

        button.textContent = isWatched
            ? "Remove from Watched Log"
            : "Add to Watched Log";
    } catch (error) {
        console.error("Watched status error:", error);
        button.textContent = "Watched Log unavailable";
    } finally {
        button.disabled = false;
    }
}

async function toggleWatched() {
    const button = document.getElementById("watched-button");
    if (!button || button.disabled) return;

    if (!getToken() || !getUserId()) {
        button.textContent = "Please log in first";
        return;
    }

    if (!currentMovie) return;

    const userId = encodeURIComponent(getUserId());
    const idPath = encodeURIComponent(String(movieId));

    button.disabled = true;
    button.textContent = isWatched ? "Removing..." : "Adding...";

    try {
        if (isWatched) {
            await apiRequest(
                `/watched/${userId}/${idPath}?${mediaTypeQuery()}`,
                { method: "DELETE" }
            );

            isWatched = false;
        } else {
            await apiRequest(`/watched/${userId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movieId,
                    mediaType,
                    title: currentMovie.title,
                    posterPath: currentMovie.poster_path || null
                })
            });

            isWatched = true;
        }

        button.textContent = isWatched
            ? "Remove from Watched Log"
            : "Add to Watched Log";
    } catch (error) {
        console.error("Watched Log update error:", error);
        window.alert(`Could not update Watched Log: ${error.message}`);
        await loadWatchedStatus();
    } finally {
        button.disabled = false;
    }
}

// =====================================
// MY JOURNAL
// =====================================

async function loadJournalEntry() {
    const button = document.getElementById("journal-button");
    const status = document.getElementById("movie-journal-status");

    if (!button || !status) return;

    if (!getToken() || !getUserId()) {
        journalEntry = null;
        journalLoaded = false;
        button.textContent = "Write in My Journal";
        status.textContent = "Log in to write in your private journal.";
        return;
    }

    try {
        const userId = encodeURIComponent(getUserId());
        const entries = await apiRequest(`/journal/${userId}`);

        journalEntry = Array.isArray(entries)
            ? entries.find(entry =>
                Number(entry.movieId ?? entry.tmdb_movie_id) === movieId &&
                (entry.mediaType ?? entry.media_type ?? "movie") === mediaType
            ) || null
            : null;

        journalLoaded = true;

        button.textContent = journalEntry
            ? "Edit My Journal Entry"
            : "Write in My Journal";

        status.textContent = journalEntry
            ? `You have a journal entry for this ${itemTypeLabel}.`
            : `You haven't written about this ${itemTypeLabel} yet.`;
    } catch (error) {
        console.error("Load journal entry error:", error);
        status.textContent = "Could not load your journal entry.";
    }
}

async function openMovieJournal() {
    const section = document.getElementById("movie-journal-section");
    const container = document.getElementById(
        "movie-journal-form-container"
    );
    const status = document.getElementById("movie-journal-status");

    if (!section || !container || !status) return;

    if (!getToken() || !getUserId()) {
        status.textContent = "Please log in to write in My Journal.";
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    if (!journalLoaded) {
        status.textContent = "Loading your journal entry...";
        await loadJournalEntry();

        if (!journalLoaded) return;
    }

    journalNotice = "";
    container.hidden = false;
    renderMovieJournalForm();

    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMovieJournalForm() {
    const container = document.getElementById(
        "movie-journal-form-container"
    );

    if (!container) return;

    const savedText = journalEntry?.journalText || "";

    container.innerHTML = `
        <form id="movie-journal-form" class="review-form">
            <label for="movie-journal-text">
                Your private thoughts about ${escapeHTML(
                    currentMovie?.title || `this ${itemTypeLabel}`
                )}
            </label>

            <textarea
                id="movie-journal-text"
                name="journalText"
                rows="7"
                maxlength="10000"
                placeholder="Record your memories, favourite moments, and personal reflections..."
                required
            >${escapeHTML(savedText)}</textarea>

            <p class="review-help">
                Up to 10,000 characters. Your journal is separate from public reviews.
            </p>

            <p class="review-form-message" aria-live="polite">
                ${escapeHTML(journalNotice)}
            </p>

            <div class="review-form-actions">
                <button type="submit" class="vault-action-button"
                    ${isSavingJournal ? "disabled" : ""}>
                    ${isSavingJournal
                        ? "Saving..."
                        : journalEntry
                            ? "Update Journal Entry"
                            : "Save to My Journal"}
                </button>

                ${journalEntry ? `
                    <button type="button" id="delete-journal-entry"
                        class="review-delete-button"
                        ${isSavingJournal ? "disabled" : ""}>
                        Delete Entry
                    </button>
                ` : ""}

                <button type="button" id="cancel-movie-journal"
                    class="review-cancel-button"
                    ${isSavingJournal ? "disabled" : ""}>
                    Cancel
                </button>
            </div>
        </form>
    `;

    document.getElementById("movie-journal-form")
        .addEventListener("submit", saveMovieJournalEntry);

    document.getElementById("cancel-movie-journal")
        .addEventListener("click", () => {
            if (isSavingJournal) return;
            container.hidden = true;
            journalNotice = "";
        });

    const deleteButton = document.getElementById("delete-journal-entry");

    if (deleteButton) {
        deleteButton.addEventListener("click", deleteMovieJournalEntry);
    }
}

async function saveMovieJournalEntry(event) {
    event.preventDefault();

    if (!getToken() || !getUserId()) {
        journalNotice = "Please log in again.";
        renderMovieJournalForm();
        return;
    }

    if (isSavingJournal) return;

    const textarea = document.getElementById("movie-journal-text");
    const journalText = textarea?.value.trim() || "";

    if (!journalText) {
        journalNotice = "Please write something before saving.";
        renderMovieJournalForm();
        return;
    }

    if (journalText.length > 10000) {
        journalNotice = "Your entry must not exceed 10,000 characters.";
        renderMovieJournalForm();
        return;
    }

    isSavingJournal = true;
    journalNotice = "Saving your journal entry...";
    renderMovieJournalForm();

    try {
        const userId = encodeURIComponent(getUserId());

        await apiRequest(`/journal/${userId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                movieId,
                mediaType,
                title: currentMovie.title,
                posterPath: currentMovie.poster_path || null,
                journalText,
                isPublic: true

            })
        });

        journalEntry = {
            ...(journalEntry || {}),
            movieId,
            mediaType,
            title: currentMovie.title,
            posterPath: currentMovie.poster_path || null,
            journalText,
            isPublic: true
        };

        journalLoaded = true;
        journalNotice = "Your journal entry has been saved!";

        const status = document.getElementById("movie-journal-status");
        if (status) {
            status.textContent = "Your journal entry is saved privately.";
        }

        const button = document.getElementById("journal-button");
        if (button) button.textContent = "Edit My Journal Entry";
    } catch (error) {
        console.error("Save journal entry error:", error);
        journalNotice = error.message || "Could not save your journal entry.";
    } finally {
        isSavingJournal = false;
        renderMovieJournalForm();
    }
}

async function deleteMovieJournalEntry() {
    if (!journalEntry || isSavingJournal) return;

    if (!window.confirm("Delete this private journal entry?")) return;

    if (!getToken() || !getUserId()) {
        journalNotice = "Please log in again.";
        renderMovieJournalForm();
        return;
    }

    isSavingJournal = true;
    journalNotice = "Deleting your journal entry...";
    renderMovieJournalForm();

    try {
        const userId = encodeURIComponent(getUserId());
        const idPath = encodeURIComponent(String(movieId));

        await apiRequest(
            `/journal/${userId}/${idPath}?${mediaTypeQuery()}`,
            { method: "DELETE" }
        );

        journalEntry = null;
        journalLoaded = true;
        journalNotice = "Your journal entry has been deleted.";

        const button = document.getElementById("journal-button");
        if (button) button.textContent = "Write in My Journal";

        const status = document.getElementById("movie-journal-status");
        if (status) {
            status.textContent =
                `You haven't written about this ${itemTypeLabel} yet.`;
        }
    } catch (error) {
        console.error("Delete journal entry error:", error);
        journalNotice = error.message || "Could not delete your journal entry.";
    } finally {
        isSavingJournal = false;
        renderMovieJournalForm();
    }
}

// =====================================
// COMMUNITY REVIEWS
// =====================================

async function loadReviews() {
    const status = document.getElementById("reviews-status");
    const list = document.getElementById("reviews-list");

    if (!status || !list) return;

    status.textContent = "Loading reviews...";
    list.innerHTML = "";

    try {
        const data = await apiRequest(
            `/reviews/${movieId}?${mediaTypeQuery()}`
        );

        reviews = Array.isArray(data) ? data : [];

        status.textContent = reviews.length
            ? `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`
            : "No reviews yet. Be the first to share your thoughts!";

        renderReviewForm();
        renderReviews();
    } catch (error) {
        console.error("Load reviews error:", error);
        status.textContent = "Could not load reviews. Please try refreshing.";
        renderReviewForm();
    }
}

function getOwnReview() {
    const username = getUsername();
    if (!username) return null;

    return reviews.find(review => review.username === username) || null;
}

function renderReviewForm() {
    const container = document.getElementById("review-form-container");
    if (!container) return;

    if (!getToken()) {
        container.innerHTML = `
            <div class="review-login-prompt">
                <p>Please log in to write a review for this ${itemTypeLabel}.</p>
                <a class="vault-action-button" href="login.html">Log In</a>
            </div>
        `;
        return;
    }

    const ownReview = getOwnReview();
    const initialText =
        editingReview && ownReview ? ownReview.reviewText : "";

    const buttonText = ownReview
        ? (editingReview ? "Update Review" : "Edit Your Review")
        : "Publish Review";

    container.innerHTML = `
        <form id="review-form" class="review-form">
            <label for="review-text">
                ${ownReview ? "Your review" : "Write a review"}
            </label>

            <textarea
                id="review-text"
                name="reviewText"
                rows="5"
                minlength="10"
                maxlength="3000"
                placeholder="What did you think of this ${itemTypeLabel}?"
                required
            >${escapeHTML(initialText)}</textarea>

            <p class="review-help">
                Share your thoughts in 10–3000 characters.
            </p>

            <p class="review-form-message" id="review-form-message"
                aria-live="polite">${escapeHTML(reviewNotice)}</p>

            <div class="review-form-actions">
                <button type="submit" class="vault-action-button"
                    id="submit-review-button"
                    ${isSavingReview ? "disabled" : ""}>
                    ${escapeHTML(isSavingReview ? "Saving..." : buttonText)}
                </button>

                ${editingReview ? `
                    <button type="button" id="cancel-review-edit"
                        class="review-cancel-button">
                        Cancel
                    </button>
                ` : ""}
            </div>
        </form>
    `;

    document.getElementById("review-form")
        .addEventListener("submit", submitReview);

    const cancelButton = document.getElementById("cancel-review-edit");

    if (cancelButton) {
        cancelButton.addEventListener("click", () => {
            editingReview = false;
            reviewNotice = "";
            renderReviewForm();
        });
    }
}

function renderReviews() {
    const list = document.getElementById("reviews-list");
    if (!list) return;

    if (!reviews.length) {
        list.innerHTML = "";
        return;
    }

    const ownReview = getOwnReview();

    list.innerHTML = reviews.map(review => {
        const isOwnReview = ownReview &&
            Number(review.id) === Number(ownReview.id);

        const createdTime = new Date(review.createdAt).getTime();
        const updatedTime = new Date(review.updatedAt).getTime();

        const wasEdited =
            Number.isFinite(createdTime) &&
            Number.isFinite(updatedTime) &&
            updatedTime > createdTime + 1000;

        return `
            <article class="review-card">
                <div class="review-card-header">
                    <div class="review-author">
                        <div class="review-avatar">
                            ${escapeHTML(
                                (review.username || "U").charAt(0).toUpperCase()
                            )}
                        </div>

                        <div>
                            <h3>${escapeHTML(review.username || "Vault user")}</h3>
                            <p class="review-date">
                                ${escapeHTML(
                                    formatDate(review.updatedAt || review.createdAt)
                                )}
                                ${wasEdited ? " · Edited" : ""}
                            </p>
                        </div>
                    </div>

                    ${isOwnReview
                        ? `<span class="review-owner-label">Your review</span>`
                        : ""}
                </div>

                <p class="review-body">${escapeHTML(review.reviewText)}</p>

                ${isOwnReview ? `
                    <div class="review-card-actions">
                        <button type="button" class="review-edit-button"
                            data-action="edit" data-id="${Number(review.id)}">
                            Edit
                        </button>

                        <button type="button" class="review-delete-button"
                            data-action="delete" data-id="${Number(review.id)}">
                            Delete
                        </button>
                    </div>
                ` : ""}
            </article>
        `;
    }).join("");

    list.querySelectorAll("[data-action='edit']").forEach(button => {
        button.addEventListener("click", () => {
            editingReview = true;
            reviewNotice = "";
            renderReviewForm();

            const textarea = document.getElementById("review-text");

            if (textarea) {
                textarea.focus();
                textarea.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        });
    });

    list.querySelectorAll("[data-action='delete']").forEach(button => {
        button.addEventListener("click", () => {
            deleteReview(Number(button.dataset.id));
        });
    });
}

async function submitReview(event) {
    event.preventDefault();

    if (!getToken()) {
        reviewNotice = "Please log in before submitting a review.";
        renderReviewForm();
        return;
    }

    if (isSavingReview) return;

    const textarea = document.getElementById("review-text");
    const reviewText = textarea?.value.trim() || "";

    if (reviewText.length < 10 || reviewText.length > 3000) {
        const message = document.getElementById("review-form-message");

        if (message) {
            message.textContent =
                "Your review must be between 10 and 3000 characters.";
        }
        return;
    }

    isSavingReview = true;
    reviewNotice = "Saving your review...";
    renderReviewForm();

    try {
        await apiRequest("/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                movieId,
                mediaType,
                reviewText
            })
        });

        editingReview = false;
        reviewNotice = "Your review has been saved!";
        await loadReviews();
    } catch (error) {
        console.error("Save review error:", error);
        reviewNotice = error.message || "Could not save your review.";
    } finally {
        isSavingReview = false;
        renderReviewForm();
    }
}

async function deleteReview(reviewId) {
    if (!getToken()) {
        reviewNotice = "Please log in again.";
        renderReviewForm();
        return;
    }

    if (!window.confirm("Are you sure you want to delete your review?")) {
        return;
    }

    try {
        await apiRequest(`/reviews/${reviewId}`, {
            method: "DELETE"
        });

        editingReview = false;
        reviewNotice = "Your review has been deleted.";

        await loadReviews();
        renderReviewForm();
    } catch (error) {
        console.error("Delete review error:", error);
        reviewNotice = error.message || "Could not delete your review.";
        renderReviewForm();
    }
}

// =====================================
// START
// =====================================

if (detailsContainer && statusElement) {
    loadMovieDetails();
} else {
    console.error(
        "Movie details page needs #movie-details and #details-status elements."
    );
}