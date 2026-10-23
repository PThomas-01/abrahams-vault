
const API_BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://abrahams-vault-backend.onrender.com/api";

const token = sessionStorage.getItem("vaultToken");
const userId = sessionStorage.getItem("vaultUserId");

const entriesContainer = document.getElementById("journal-entries");
const emptySection = document.getElementById("journal-empty");
const messageBox = document.getElementById("journal-message");

function showMessage(message, isError = false) {
    messageBox.textContent = message;
    messageBox.style.color = isError ? "#ff8c8c" : "#b89cff";
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
}

async function apiRequest(url, options = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
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

function createEmojiPicker(textarea) {
    const toolbar = createElement("div", "journal-emoji-toolbar");

    const toggle = createElement("button", "journal-emoji-toggle", "😀");
    toggle.type = "button";
    toggle.title = "Insert emoji";
    toggle.setAttribute("aria-label", "Insert emoji");
    toggle.setAttribute("aria-expanded", "false");

    const picker = createElement("div", "journal-emoji-picker");
    picker.hidden = true;
    picker.setAttribute("aria-label", "Choose an emoji");

    const emojis = [
        "😀", "😂", "🥹", "😍", "🥰",
        "😎", "😭", "😮", "🤔", "😡",
        "❤️", "💔", "💯", "👏", "🔥",
        "🎬", "🍿", "⭐", "✨", "🙌"
    ];

    emojis.forEach(emoji => {
        const option = createElement("button", "", emoji);
        option.type = "button";
        option.title = emoji;
        option.setAttribute("aria-label", `Insert ${emoji}`);

        option.addEventListener("click", () => {
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;

            textarea.setRangeText(emoji, start, end, "end");
            textarea.focus();

            toggle.setAttribute("aria-expanded", "false");
            picker.hidden = true;
        });

        picker.appendChild(option);
    });

    toggle.addEventListener("click", () => {
        picker.hidden = !picker.hidden;
        toggle.setAttribute("aria-expanded", String(!picker.hidden));
    });

    toolbar.append(toggle, picker);
    return toolbar;
}

function renderEntry(entry) {
    const card = createElement("article", "journal-card");

    const poster = createElement("img", "journal-poster");
    poster.alt = entry.title
        ? `${entry.title} poster`
        : "Poster unavailable";
    poster.loading = "lazy";

    if (entry.posterPath) {
        poster.src = `https://image.tmdb.org/t/p/w500${entry.posterPath}`;
    }

    poster.addEventListener("error", () => {
        poster.removeAttribute("src");
        poster.alt = "Poster unavailable";
    }, { once: true });

    const content = createElement("div", "journal-card-content");
    const title = createElement("h2", "", entry.title || "Untitled");

    const date = createElement(
        "p",
        "journal-date",
        `Last updated: ${formatDate(entry.updatedAt)}`
    );

    const journalText = createElement(
        "p",
        "journal-text",
        entry.journalText || ""
    );

    const actions = createElement("div", "journal-actions");

    const editButton = createElement("button", "", "Edit Entry");
    const deleteButton = createElement(
        "button",
        "journal-delete",
        "Delete Entry"
    );

    editButton.type = "button";
    deleteButton.type = "button";

    editButton.addEventListener("click", () => {
        showEditor(entry, content);
    });

    deleteButton.addEventListener("click", async () => {
        if (!window.confirm(
            `Delete your journal entry for "${entry.title}"?`
        )) return;

        deleteButton.disabled = true;

        try {
            await apiRequest(
                `/journal/${encodeURIComponent(userId)}/${encodeURIComponent(entry.movieId)}`,
                { method: "DELETE" }
            );

            showMessage("Journal entry deleted.");
            await loadJournal();
        } catch (error) {
            showMessage(error.message, true);
            deleteButton.disabled = false;
        }
    });

    actions.append(editButton, deleteButton);
    content.append(title, date, journalText, actions);
    card.append(poster, content);

    return card;
}

function showEditor(entry, content) {
    content.replaceChildren();

    const title = createElement("h2", "", entry.title || "Untitled");

    const visibilityLabel = createElement(
        "label",
        "",
        "Who can see this entry?"
    );

    const visibilitySelect = createElement("select", "journal-visibility");

    const privateOption = createElement("option", "", "Private — only me");
    privateOption.value = "false";

    const publicOption = createElement("option", "", "Public — others can see");
    publicOption.value = "true";

    visibilitySelect.append(privateOption, publicOption);

    const isPublic =
        entry.isPublic === true ||
        entry.isPublic === 1 ||
        entry.isPublic === "1" ||
        entry.isPublic === "true";

    visibilitySelect.value = String(isPublic);
    visibilitySelect.id = `journal-visibility-${entry.movieId}`;
    visibilityLabel.htmlFor = visibilitySelect.id;

    const label = createElement(
        "label",
        "",
        "Your thoughts and memories"
    );

    const textarea = createElement("textarea", "journal-editor");
    textarea.value = entry.journalText || "";
    textarea.maxLength = 10000;
    textarea.required = true;
    textarea.setAttribute("aria-label", "Your journal entry");
    textarea.id = `journal-editor-${entry.movieId}`;
    label.htmlFor = textarea.id;

    const emojiToolbar = createEmojiPicker(textarea);

    const saveButton = createElement(
        "button",
        "journal-save",
        "Save Changes"
    );

    const cancelButton = createElement("button", "", "Cancel");

    saveButton.type = "button";
    cancelButton.type = "button";
    cancelButton.style.marginLeft = "10px";
    cancelButton.style.padding = "10px";
    cancelButton.style.cursor = "pointer";

    saveButton.addEventListener("click", async () => {
        const journalText = textarea.value.trim();

        if (!journalText) {
            showMessage("Please write something before saving.", true);
            textarea.focus();
            return;
        }

        saveButton.disabled = true;
        cancelButton.disabled = true;
        showMessage("Saving your changes...");

        try {
            await apiRequest(`/journal/${encodeURIComponent(userId)}`, {
                method: "POST",
                body: JSON.stringify({
                    movieId: entry.movieId,
                    title: entry.title,
                    posterPath: entry.posterPath,
                    journalText,
                    isPublic: visibilitySelect.value === "true"
                })
            });

            showMessage("Your journal entry has been updated.");
            await loadJournal();
        } catch (error) {
            showMessage(error.message, true);
            saveButton.disabled = false;
            cancelButton.disabled = false;
        }
    });

    cancelButton.addEventListener("click", () => {
        loadJournal();
    });

    content.append(
        title,
        visibilityLabel,
        visibilitySelect,
        label,
        textarea,
        emojiToolbar,
        document.createElement("br"),
        saveButton,
        cancelButton
    );

    textarea.focus();
}

async function loadJournal() {
    entriesContainer.replaceChildren();
    emptySection.hidden = true;

    if (!token || !userId) {
        entriesContainer.append(
            createElement(
                "p",
                "journal-loading",
                "Please log in to view My Journal."
            )
        );

        showMessage(
            "Your session may have expired. Please log in again.",
            true
        );
        return;
    }

    entriesContainer.append(
        createElement("p", "journal-loading", "Loading your journal...")
    );

    try {
        const entries = await apiRequest(
            `/journal/${encodeURIComponent(userId)}`
        );

        entriesContainer.replaceChildren();

        if (!Array.isArray(entries) || entries.length === 0) {
            emptySection.hidden = false;
            return;
        }

        entries.forEach(entry => {
            entriesContainer.append(renderEntry(entry));
        });
    } catch (error) {
        entriesContainer.replaceChildren();
        showMessage(error.message, true);
    }
}

loadJournal();
