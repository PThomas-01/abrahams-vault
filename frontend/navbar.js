
function applyVaultTheme() {
    const theme = localStorage.getItem("vaultTheme") || "dark";
    document.documentElement.dataset.theme = theme;

    if (document.body) {
        document.body.dataset.theme = theme;
    }
}

function updateNavbar() {
    const userId = sessionStorage.getItem("vaultUserId");
    const token = sessionStorage.getItem("vaultToken");
    const username = sessionStorage.getItem("vaultUsername");

    const authLinks = document.getElementById("auth-links");
    const userLinks = document.getElementById("user-links");
    const welcomeUser = document.getElementById("welcome-user");
    const logoutBtn = document.getElementById("logout-btn");
    const profileLink = document.getElementById("profile-link");

    if (!authLinks || !userLinks || !welcomeUser) return;

    const isLoggedIn = Boolean(userId && token);

    if (isLoggedIn) {
        authLinks.style.setProperty("display", "none", "important");
        userLinks.style.setProperty("display", "inline-flex", "important");
        welcomeUser.textContent = `Hi, ${username || "there"}`;

        if (profileLink) {
            profileLink.href = `profile.html?id=${encodeURIComponent(userId)}`;
            profileLink.style.display = "inline-flex";
        }

        if (logoutBtn) {
            logoutBtn.style.display = "inline-flex";
        }
    } else {
        authLinks.style.setProperty("display", "inline-flex", "important");
        userLinks.style.setProperty("display", "none", "important");

        if (profileLink) profileLink.style.display = "none";
        if (logoutBtn) logoutBtn.style.display = "none";

        welcomeUser.textContent = "";
    }
}

function addVaultBackButton() {
    // The homepage does not need a Back button.
    const currentPage = window.location.pathname.split("/").pop().toLowerCase();

    if (currentPage === "" || currentPage === "index.html") {
        return;
    }

    const navbar = document.querySelector(".navbar");
    if (!navbar || navbar.querySelector(".vault-back-btn")) return;

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "vault-back-btn";
    backButton.textContent = "← Back";
    backButton.setAttribute("aria-label", "Go back to the previous page");

    backButton.addEventListener("click", () => {
        if (window.history.length > 1 && document.referrer) {
            window.history.back();
        } else {
            window.location.href = "index.html";
        }
    });

    navbar.insertBefore(backButton, navbar.querySelector(".nav-links"));
}
async function loadSharedNavbar() {
    const existingNavbars = [
        ...document.querySelectorAll("header.navbar, nav.navbar")
    ];

    try {
        const response = await fetch("navbar.html", {
            cache: "no-cache"
        });

        if (!response.ok) {
            throw new Error(`Could not load navbar.html: ${response.status}`);
        }

        const html = await response.text();
        const template = document.createElement("template");
        template.innerHTML = html.trim();

        const sharedNavbar = template.content.querySelector("header.navbar");

        if (!sharedNavbar) {
            throw new Error("No header.navbar found in navbar.html");
        }

        if (existingNavbars.length > 0) {
            existingNavbars[0].replaceWith(sharedNavbar);

            existingNavbars.slice(1).forEach(navbar => navbar.remove());
        } else {
            document.body.prepend(sharedNavbar);
        }

        applyVaultTheme();
        updateNavbar();
    } catch (error) {
        console.error("Shared navbar could not be loaded:", error);
    }
}


document.addEventListener("DOMContentLoaded", async () => {
    await loadSharedNavbar();
    addVaultBackButton();
    setupSharedSearch();
});

window.addEventListener("storage", event => {
    if (event.key === "vaultTheme") {
        applyVaultTheme();
    }

    if (
        event.key === "vaultUserId" ||
        event.key === "vaultUsername" ||
        event.key === "vaultToken"
    ) {
        updateNavbar();
    }
});
function setupSharedSearch() {
    const page = window.location.pathname.split("/").pop().toLowerCase();

    // Home and Discover already have their own search implementation.
    if (page === "" || page === "index.html" || page === "discover.html") {
        return;
    }

    const button = document.getElementById("search-toggle");
    if (!button || button.dataset.sharedSearchReady === "true") return;

    button.dataset.sharedSearchReady = "true";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:absolute;right:0;top:100%;width:min(380px,85vw);z-index:9999;background:#171717;border:1px solid #444;border-radius:10px;padding:12px;margin-top:10px;";
    wrapper.hidden = true;

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search movies and TV shows...";
    input.setAttribute("aria-label", "Search movies and TV shows");
    input.style.cssText = "box-sizing:border-box;width:100%;padding:11px;background:#252525;color:white;border:1px solid #555;border-radius:7px;";

    const results = document.createElement("div");
    results.style.cssText = "max-height:350px;overflow-y:auto;margin-top:8px;";

    wrapper.append(input, results);

    const actions = button.parentElement;
    if (!actions) return;

    actions.style.position = "relative";
    actions.appendChild(wrapper);

    let timer;
    let requestId = 0;

    button.addEventListener("click", event => {
        event.preventDefault();
        wrapper.hidden = !wrapper.hidden;

        if (!wrapper.hidden) input.focus();
    });

    document.addEventListener("click", event => {
        if (!actions.contains(event.target)) wrapper.hidden = true;
    });

    input.addEventListener("keydown", event => {
        if (event.key === "Escape") wrapper.hidden = true;

        if (event.key === "Enter" && input.value.trim()) {
            window.location.href =
                `discover.html?q=${encodeURIComponent(input.value.trim())}`;
        }
    });

    input.addEventListener("input", () => {
        clearTimeout(timer);

        const query = input.value.trim();
        const currentId = ++requestId;
        results.replaceChildren();

        if (query.length < 2) return;

        results.textContent = "Searching...";

        timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({
                    path: "/search/multi",
                    query,
                    include_adult: "false",
                    language: "en-US",
                    page: "1"
                });

                const API_BASE_URL =
                    window.location.hostname === "localhost" ||
                    window.location.hostname === "127.0.0.1"
                        ? "http://localhost:3000/api"
                        : "https://abrahams-vault-backend.onrender.com/api";

                const response = await fetch(
                    `${API_BASE_URL}/tmdb?${params.toString()}`
                );

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (currentId !== requestId) return;

                results.replaceChildren();

                const matches = (data.results || [])
                    .filter(item =>
                        ["movie", "tv"].includes(item.media_type) &&
                        (item.title || item.name)
                    )
                    .slice(0, 8);

                if (!matches.length) {
                    results.textContent = "No results found.";
                    return;
                }

                matches.forEach(item => {
                    const resultButton = document.createElement("button");
                    resultButton.type = "button";
                    resultButton.style.cssText =
                        "display:block;width:100%;padding:10px;text-align:left;color:white;background:transparent;border:0;cursor:pointer;";

                    const poster = document.createElement("img");
poster.alt = "";
poster.style.cssText =
    "width:44px;height:64px;object-fit:cover;border-radius:5px;flex-shrink:0;";

if (item.poster_path) {
    poster.src = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
} else {
    poster.style.display = "none";
}

const title = document.createElement("span");
const year = (item.release_date || item.first_air_date || "").slice(0, 4);

title.textContent =
    `${item.title || item.name}${year ? ` (${year})` : ""}`;

title.style.cssText = "align-self:center;";

resultButton.style.cssText =
    "display:flex;align-items:center;gap:12px;width:100%;padding:9px;text-align:left;color:white;background:transparent;border:0;border-radius:7px;cursor:pointer;";

resultButton.append(poster, title);

                    resultButton.addEventListener("click", () => {
                        const id = Number(item.id);
                        if (!Number.isSafeInteger(id) || id <= 0) return;

                        const type = item.media_type === "tv" ? "tv" : "movie";

                        sessionStorage.setItem("vaultSelectedMovieId", String(id));
                        sessionStorage.setItem("vaultSelectedMediaType", type);

                        window.location.href =
                            `movie-details.html?id=${encodeURIComponent(id)}&type=${type}`;
                    });

                    results.appendChild(resultButton);
                });
            } catch (error) {
                if (currentId !== requestId) return;
                console.error("Shared search failed:", error);
                results.textContent = "Search failed. Please try again.";
            }
        }, 250);
    });
}

