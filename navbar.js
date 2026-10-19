
function updateNavbar() {
    const userId = sessionStorage.getItem("vaultUserId");
    const username = sessionStorage.getItem("vaultUsername");

    const authLinks = document.getElementById("auth-links");
    const userLinks = document.getElementById("user-links");
    const welcomeUser = document.getElementById("welcome-user");
    const logoutBtn = document.getElementById("logout-btn");
    const profileLink = document.getElementById("profile-link");

    if (!authLinks || !userLinks || !welcomeUser) {
        console.error("Navbar elements are missing.");
        return;
    }

    if (userId && username) {
        authLinks.style.setProperty("display", "none", "important");
        userLinks.style.setProperty("display", "inline-flex", "important");
        welcomeUser.textContent = `Hi, ${username}`;

        if (profileLink) {
            profileLink.href = `profile.html?id=${encodeURIComponent(userId)}`;
            profileLink.style.display = "inline-flex";
        }
    } else {
        authLinks.style.setProperty("display", "inline-flex", "important");
        userLinks.style.setProperty("display", "none", "important");

        if (profileLink) {
            profileLink.style.display = "none";
        }

        welcomeUser.textContent = "";
    }

    // Logout is now handled on the Profile page.
    if (logoutBtn) {
        logoutBtn.style.display = "none";
        logoutBtn.onclick = null;
    }
}

document.addEventListener("DOMContentLoaded", updateNavbar);
