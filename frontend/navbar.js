
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

    // Apply authentication state only on pages that have these elements.
    if (!authLinks || !userLinks || !welcomeUser) {
        return;
    }

    // Both values are needed for a valid logged-in session.
    const isLoggedIn = Boolean(userId && token);

    if (isLoggedIn) {
        authLinks.style.setProperty("display", "none", "important");
        userLinks.style.setProperty("display", "inline-flex", "important");

        welcomeUser.textContent = `Hi, ${username || "there"}`;

        if (profileLink) {
            profileLink.href =
                `profile.html?id=${encodeURIComponent(userId)}`;
            profileLink.style.display = "inline-flex";
        }

        if (logoutBtn) {
            logoutBtn.style.display = "inline-flex";
        }
    } else {
        authLinks.style.setProperty("display", "inline-flex", "important");
        userLinks.style.setProperty("display", "none", "important");

        if (profileLink) {
            profileLink.style.display = "none";
        }

        if (logoutBtn) {
            logoutBtn.style.display = "none";
        }

        welcomeUser.textContent = "";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    applyVaultTheme();
    updateNavbar();
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
