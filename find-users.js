
const USERS_API_BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://abrahams-vault-backend.onrender.com/api";

const userSearchForm = document.getElementById("userSearchForm");
const usernameSearch = document.getElementById("usernameSearch");
const searchUsersButton = document.getElementById("searchUsersButton");
const userSearchResults = document.getElementById("userSearchResults");

function showSearchMessage(message) {
    const paragraph = document.createElement("p");
    paragraph.className = "search-message";
    paragraph.textContent = message;
    userSearchResults.replaceChildren(paragraph);
}

function renderUsers(users) {
    userSearchResults.replaceChildren();

    if (!users.length) {
        showSearchMessage("No users found. Try another username.");
        return;
    }

    users.forEach(user => {
        const row = document.createElement("article");
        row.className = "user-result";

        const info = document.createElement("div");
        info.className = "user-result-info";

        const usernameLink = document.createElement("a");
        usernameLink.className = "user-result-name";
        usernameLink.textContent = user.username;
        usernameLink.href =
            `profile.html?id=${encodeURIComponent(user.id)}`;

        const label = document.createElement("div");
        label.className = "user-result-label";
        label.textContent = "Abraham's Vault member";

        info.append(usernameLink, label);

        const profileLink = document.createElement("a");
        profileLink.className = "view-profile-button";
        profileLink.href =
            `profile.html?id=${encodeURIComponent(user.id)}`;
        profileLink.textContent = "View Profile";

        row.append(info, profileLink);
        userSearchResults.appendChild(row);
    });
}

userSearchForm.addEventListener("submit", async event => {
    event.preventDefault();

    const query = usernameSearch.value.trim();

    if (query.length < 2) {
        showSearchMessage("Enter at least two characters.");
        return;
    }

    searchUsersButton.disabled = true;
    searchUsersButton.textContent = "Searching...";
    showSearchMessage("Searching for users...");

    try {
        const response = await fetch(
            `${USERS_API_BASE}/users/search?q=${encodeURIComponent(query)}`
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || `Search failed (${response.status}).`
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("The server returned an unexpected response.");
        }

        renderUsers(data);
    } catch (error) {
        console.error("Find Users error:", error);
        showSearchMessage(
            `${error.message} Please try again.`
        );
    } finally {
        searchUsersButton.disabled = false;
        searchUsersButton.textContent = "Search";
    }
});
