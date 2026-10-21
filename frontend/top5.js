
(() => {
   const API =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://abrahams-vault-backend.onrender.com/api";
    const selected = new Map();

    const token = () => sessionStorage.getItem("vaultToken");
    const userId = () => sessionStorage.getItem("vaultUserId");

    function authHeaders() {
        return {
            "Content-Type": "application/json",
            ...(token() ? { Authorization: `Bearer ${token()}` } : {})
        };
    }

    async function load() {
        if (!userId()) return [];

        const response = await fetch(
            `${API}/top-movies/${encodeURIComponent(userId())}`,
            { headers: authHeaders() }
        );

        if (!response.ok) throw new Error("Could not load Top 5.");

        const movies = await response.json();

        selected.clear();
        movies.forEach(movie => {
            selected.set(Number(movie.movieId), movie);
        });

        return movies;
    }

    async function save(movies) {
        if (!userId() || !token()) {
            alert("Please log in to manage your Top 5.");
            return false;
        }

        if (movies.length > 5) {
            alert("Your Top 5 can contain only five movies.");
            return false;
        }

        const response = await fetch(
            `${API}/top-movies/${encodeURIComponent(userId())}`,
            {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({
                    movies: movies.map(movie => ({
                        movieId: Number(movie.movieId ?? movie.id),
                        title: movie.title || "Untitled",
                        posterPath:
                            movie.posterPath ?? movie.poster_path ?? null
                    }))
                })
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Could not save Top 5.");
        }

        await load();
        return true;
    }

    function movieFromCard(card) {
        const link = card.querySelector(
            'a[href*="movie-details.html?id="]'
        );

        const id = Number(
            card.dataset.movieId ||
            link?.href.match(/[?&]id=(\d+)/)?.[1]
        );

        const heading = card.querySelector("h3");
        const image = card.querySelector(".poster-image, .poster img");

        if (!Number.isSafeInteger(id) || id <= 0 || !heading) {
            return null;
        }

        let posterPath = null;

        if (image?.src) {
            const match = image.src.match(
                /\/t\/p\/(?:w\d+|original)(\/.*)$/
            );

            if (match) posterPath = match[1];
        }

        return {
            movieId: id,
            title: heading.textContent.trim(),
            posterPath
        };
    }

    async function toggleMovie(movie, button) {
        button.disabled = true;

        try {
            const current = await load();
            const id = Number(movie.movieId ?? movie.id);

            const exists = current.some(
                item => Number(item.movieId) === id
            );

            let next;

            if (exists) {
                next = current.filter(
                    item => Number(item.movieId) !== id
                );
            } else {
                if (current.length >= 5) {
                    alert(
                        "Your Top 5 is full. Remove a movie from your profile first."
                    );
                    return;
                }

                next = [...current, movie];
            }

            if (await save(next)) {
                refreshButtons();
                button.textContent = exists
                    ? "＋ Add to Top 5"
                    : "✓ In My Top 5";
            }
        } catch (error) {
            console.error("Top 5 error:", error);
            alert(error.message);
        } finally {
            button.disabled = false;
        }
    }

    function makeButton(movie) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "top5-action";
        button.textContent = selected.has(Number(movie.movieId))
            ? "✓ In My Top 5"
            : "＋ Add to Top 5";

        button.style.cssText =
            "display:block;width:100%;padding:9px 7px;margin-top:8px;" +
            "border:1px solid #b99a58;border-radius:6px;" +
            "background:#202020;color:#f5f1e8;cursor:pointer;font-size:12px;";

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            toggleMovie(movie, button);
        });

        return button;
    }

    function enhanceCards() {
        document.querySelectorAll(".movie-card").forEach(card => {
            if (card.dataset.top5Ready === "1") return;

            const movie = movieFromCard(card);
            if (!movie) return;

            card.dataset.top5Ready = "1";

            const button = makeButton(movie);
            const actions = card.querySelector(".watchlist-actions");

            if (actions) {
                actions.appendChild(button);
            } else {
                card.appendChild(button);
            }
        });
    }

    function refreshButtons() {
        document.querySelectorAll(".top5-action").forEach(button => {
            const detailsButton = button.id === "details-top5-button";

            let movie;

            if (detailsButton) {
                movie = window.currentMovie;
            } else {
                const card = button.closest(".movie-card");
                movie = card && movieFromCard(card);
            }

            if (!movie) return;

            const id = Number(movie.movieId ?? movie.id);

            button.textContent = selected.has(id)
                ? "✓ In My Top 5"
                : "＋ Add to Top 5";
        });
    }

    async function addDetailsButton(movie = window.currentMovie) {
        const container = document.getElementById("movie-details");
        const heading = container?.querySelector(".details-info h1");

        if (!heading || !movie) {
            console.error(
                "Top 5: movie title or current movie is missing."
            );
            return;
        }

        const movieData = {
            movieId: Number(movie.movieId ?? movie.id),
            title: movie.title,
            posterPath: movie.posterPath ?? movie.poster_path ?? null
        };

        if (!movieData.movieId) return;

        const existingButton = document.getElementById(
            "details-top5-button"
        );

        if (existingButton) {
            existingButton.remove();
        }

        try {
            await load();
        } catch (error) {
            console.error("Could not load Top 5:", error);
        }

        const button = makeButton(movieData);
        button.id = "details-top5-button";

        heading.insertAdjacentElement("afterend", button);
    }

    async function init() {
        if (!userId() || !token()) return;

        try {
            await load();
            enhanceCards();
            refreshButtons();

            new MutationObserver(() => {
                enhanceCards();
            }).observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (error) {
            console.error("Top 5 initialization error:", error);
        }
    }

    window.VaultTop5 = {
        load,
        save,
        enhanceCards,
        refreshButtons,
        addDetailsButton,
        makeButton,
        getSelected: () => [...selected.values()]
    };

    document.addEventListener("DOMContentLoaded", init);
})();
