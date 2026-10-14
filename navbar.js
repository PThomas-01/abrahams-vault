
function updateNavbar() {
    const userId = sessionStorage.getItem("vaultUserId");
    const username = sessionStorage.getItem("vaultUsername");

    const authLinks = document.getElementById("auth-links");
    const userLinks = document.getElementById("user-links");
    const welcomeUser = document.getElementById("welcome-user");
    const logoutBtn = document.getElementById("logout-btn");

    if (!authLinks || !userLinks || !welcomeUser || !logoutBtn) {
        console.error("Navbar elements are missing.");
        return;
    }

    if (userId && username) {
        authLinks.style.setProperty("display", "none", "important");
        userLinks.style.setProperty("display", "inline-flex", "important");
        welcomeUser.textContent = `Hi, ${username}`;
    } else {
        authLinks.style.setProperty("display", "inline-flex", "important");
        userLinks.style.setProperty("display", "none", "important");
        welcomeUser.textContent = "";
    }

    logoutBtn.onclick = function () {
        sessionStorage.removeItem("vaultUserId");
        sessionStorage.removeItem("vaultUsername");
        window.location.href = "login.html";
    };
}

document.addEventListener("DOMContentLoaded", updateNavbar);