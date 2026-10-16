
const API_BASE_URL = "https://abrahams-vault-backend.onrender.com/api";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

const params = new URLSearchParams(window.location.search);
const rawUrlId = params.get("id");
const urlMovieId = Number(rawUrlId);
const savedMovieId = Number(sessionStorage.getItem("vaultSelectedMovieId"));

const movieId =
    rawUrlId && Number.isSafeInteger(urlMovieId) && urlMovieId > 0
        ? urlMovieId
        : Number.isSafeInteger(savedMovieId) && savedMovieId > 0
            ? savedMovieId
            : NaN;

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
            data.error || data.message || `Request failed (${response.status}).`
        );
    }

    return data;
}

async function tmdbRequest(endpoint) {
    const url = new URL(endpoint, window.location.origin);
    const proxyParams = new URLSearchParams({ path: url.pathname });

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

function formatDate(dateString) {
    if (!dateString) return "Date unavailable";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Date unavailable";

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

// =====================================
// LOAD MOVIE DETAILS, CAST AND CREW
// =====================================

async function loadMovieDetails() {
    if (!Number.isSafeInteger(movieId) || movieId <= 0) {
        statusElement.textContent =
            "Invalid movie link. Return to the homepage and select a movie again.";
        return;
    }

    try {
        statusElement.style.display = "block";
        statusElement.textContent = "Loading movie details...";

        const [movie, videos, credits] = await Promise.all([
            tmdbRequest(`/movie/${movieId}?language=en-US`),
            tmdbRequest(`/movie/${movieId}/videos?language=en-US`),
            tmdbRequest(`/movie/${movieId}/credits?language=en-US`)
        ]);

        currentMovie = movie;

        const trailer = videos.results?.find(video =>
            video.site === "YouTube" &&
            video.type === "Trailer" &&
            video.official
        ) || videos.results?.find(video =>
            video.site === "YouTube" && video.type === "Trailer"
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
        const director = crew.find(person => person.job === "Director");

        const castMarkup = cast.length
            ? cast.map(person => {
                const profile = person.profile_path
                    ? `${IMAGE_BASE_URL}w185${person.profile_path}`
                    : "";

                return `
                    <article class="cast-card">
                        <div class="cast-photo">
                            ${
                                profile
                                    ? `<img src="${profile}" alt="${escapeHTML(person.name)}" loading="lazy">`
                                    : `<div class="cast-photo-placeholder">?</div>`
                            }
                        </div>
                        <div class="cast-info">
                            <h3>${escapeHTML(person.name || "Unknown")}</h3>
                            <p>${escapeHTML(person.character || "Role unavailable")}</p>
                        </div>
                    </article>
                `;
            }).join("")
            : `<p class="cast-unavailable">Cast information is unavailable for this movie.</p>`;

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
                            ? `<img src="${poster}" alt="${escapeHTML(movie.title)} poster">`
                            : `<div class="rating-no-poster">No poster available</div>`
                    }
                </div>

                <div class="details-info">
                    <h1>${escapeHTML(movie.title || "Untitled movie")}</h1>

                    ${movie.tagline
                        ? `<p class="details-tagline">${escapeHTML(movie.tagline)}</p>`
                        : ""}

                    <div class="details-meta">
                        <span>TMDB ★ ${
                            movie.vote_average
                                ? Number(movie.vote_average).toFixed(1)
                                : "N/A"
                        }</span>

                        <span>
                            ${Number(movie.vote_count || 0).toLocaleString()}
                            TMDB votes
                        </span>

                        <span>
                            ${escapeHTML(
                                (movie.release_date || "").slice(0, 4) ||
                                "Year unknown"
                            )}
                        </span>

                        <span>${escapeHTML(formatRuntime(movie.runtime))}</span>
                    </div>

                    <p class="details-genres">
                        ${genres || "Genres unavailable"}
                    </p>

                    ${director ? `
                        <p class="details-director">
                            <strong>Director:</strong>
                            ${escapeHTML(director.name)}
                        </p>
                    ` : ""}

                    <h2>Synopsis</h2>

                    <p class="details-overview">
                        ${escapeHTML(
                            movie.overview ||
                            "No synopsis is available for this movie."
                        )}
                    </p>

                    <div class="details-actions">
                        <button
                            id="watchlist-button"
                            class="vault-action-button"
                            type="button">
                            Checking My List...
                        </button>

                        <button
                            id="watched-button"
                            class="vault-action-button"
                            type="button">
                            Checking Watched Status...
                        </button>

                        ${
                            trailer
                                ? `<a class="vault-action-button trailer-button"
                                      href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}"
                                      target="_blank"
                                      rel="noopener noreferrer">
                                      Watch Trailer
                                   </a>`
                                : ""
                        }
                    </div>
                </div>

                <section id="cast-section" class="cast-section">
                    <h2>Cast &amp; Crew</h2>
                    <p class="cast-subtitle">
                        Meet the people behind this movie.
                    </p>
                    <div class="cast-grid">
                        ${castMarkup}
                    </div>
                </section>

                <section id="community-rating" class="community-rating">
                    <h2>Abraham's Vault Rating</h2>
                    <p class="rating-loading">Loading community ratings...</p>
                </section>

                <section id="movie-reviews" class="movie-reviews">
                    <div class="reviews-heading">
                        <h2>Community Reviews</h2>
                        <p class="reviews-subtitle">
                            Share your thoughts about this movie.
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

        statusElement.textContent = "";
        statusElement.style.display = "none";

        document.getElementById("watchlist-button")
            .addEventListener("click", toggleWatchlist);

        document.getElementById("watched-button")
            .addEventListener("click", toggleWatched);

        await Promise.allSettled([
            loadCommunityRating(),
            loadPersonalRating(),
            loadWatchlistStatus(),
            loadWatchedStatus(),
            loadReviews()
        ]);
    } catch (error) {
        console.error("Movie details error:", error);
        statusElement.style.display = "block";
        statusElement.textContent =
            error.message || "Could not load movie details.";
    }
}

// =====================================
// COMMUNITY RATINGS
// =====================================

async function loadCommunityRating() {
    try {
        const data = await apiRequest(`/ratings/${movieId}`);

        communityRating = data.averageRating ?? null;
        ratingCount = Number(data.ratingCount || 0);

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
        const data = await apiRequest(`/ratings/${movieId}/mine`);
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
            ? "You haven't rated this movie yet."
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
            <h3>Rate this movie</h3>

            <div class="rating-star-picker" role="group"
                 aria-label="Choose a rating from 1 to 5 stars">
                ${[1, 2, 3, 4, 5].map(star => `
                    <button
                        type="button"
                        class="rating-star ${
                            Number(currentUserRating) >= star ? "selected" : ""
                        }"
                        data-rating="${star}"
                        aria-label="${star} out of 5 stars"
                        aria-pressed="${Number(currentUserRating) === star}"
                        ${!hasToken || isSavingRating ? "disabled" : ""}
                    >★</button>
                `).join("")}
            </div>

            <p class="rating-message" aria-live="polite">
                ${escapeHTML(
                    ratingNotice ||
                    (hasToken
                        ? personalText
                        : "Sign in to Abraham's Vault to rate this movie.")
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
        ratingNotice = "Please log in before rating a movie.";
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
            body: JSON.stringify({ movieId, rating })
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
// MYSQL WATCHLIST
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
        const movies = await apiRequest(`/watchlist/${userId}`);

        isInWatchlist = Array.isArray(movies) && movies.some(movie =>
            Number(movie.movieId ?? movie.tmdb_movie_id ?? movie.id) === movieId
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
    if (!button) return;

    if (!getToken() || !getUserId()) {
        button.textContent = "Please log in first";
        return;
    }

    if (!currentMovie || button.disabled) return;

    const userId = encodeURIComponent(getUserId());
    const movieIdPath = encodeURIComponent(String(movieId));

    button.disabled = true;

    try {
        if (isInWatchlist) {
            await apiRequest(
                `/watchlist/${userId}/${movieIdPath}`,
                { method: "DELETE" }
            );

            isInWatchlist = false;
        } else {
            await apiRequest(`/watchlist/${userId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movieId,
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
        button.textContent = "My List update failed";
        window.alert(`Could not update My List: ${error.message}`);
    } finally {
        button.disabled = false;
    }
}

// =====================================
// WATCHED MOVIES LOG
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
        const movies = await apiRequest(`/watched/${userId}`);

        isWatched = Array.isArray(movies) && movies.some(movie =>
            Number(movie.movieId ?? movie.tmdb_movie_id ?? movie.id) === movieId
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
    const movieIdPath = encodeURIComponent(String(movieId));

    button.disabled = true;
    button.textContent = isWatched ? "Removing..." : "Adding...";

    try {
        if (isWatched) {
            await apiRequest(
                `/watched/${userId}/${movieIdPath}`,
                { method: "DELETE" }
            );

            isWatched = false;
        } else {
            await apiRequest(`/watched/${userId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movieId,
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
// COMMUNITY REVIEWS
// =====================================

async function loadReviews() {
    const status = document.getElementById("reviews-status");
    const list = document.getElementById("reviews-list");

    if (!status || !list) return;

    status.textContent = "Loading reviews...";
    list.innerHTML = "";

    try {
        const data = await apiRequest(`/reviews/${movieId}`);
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
                <p>Please log in to write a review for this movie.</p>
                <a class="vault-action-button" href="login.html">Log In</a>
            </div>
        `;
        return;
    }

    const ownReview = getOwnReview();
    const initialText = editingReview && ownReview ? ownReview.reviewText : "";

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
                placeholder="What did you think of this movie?"
                required
            >${escapeHTML(initialText)}</textarea>

            <p class="review-help">Share your thoughts in 10–3000 characters.</p>

            <p class="review-form-message" id="review-form-message"
               aria-live="polite">${escapeHTML(reviewNotice)}</p>

            <div class="review-form-actions">
                <button type="submit" class="vault-action-button"
                    id="submit-review-button" ${isSavingReview ? "disabled" : ""}>
                    ${escapeHTML(isSavingReview ? "Saving..." : buttonText)}
                </button>

                ${editingReview ? `
                    <button type="button" id="cancel-review-edit"
                        class="review-cancel-button">Cancel</button>
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
                            ${escapeHTML((review.username || "U").charAt(0).toUpperCase())}
                        </div>

                        <div>
                            <h3>${escapeHTML(review.username || "Vault user")}</h3>
                            <p class="review-date">
                                ${escapeHTML(formatDate(review.updatedAt || review.createdAt))}
                                ${wasEdited ? " · Edited" : ""}
                            </p>
                        </div>
                    </div>

                    ${isOwnReview ? `<span class="review-owner-label">Your review</span>` : ""}
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
    const reviewText = textarea ? textarea.value.trim() : "";

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
            body: JSON.stringify({ movieId, reviewText })
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
