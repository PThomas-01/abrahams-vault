
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


