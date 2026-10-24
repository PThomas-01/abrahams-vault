
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));


const fs = require("fs");

// =========================
// DATABASE CONNECTION
// =========================

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "abraham_vault",

    // Enable SSL only when a CA certificate is configured.
    ssl: process.env.DB_SSL_CA
        ? {
            ca: process.env.DB_SSL_CA,
            rejectUnauthorized: true
        }
        : undefined,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// =========================
// AUTHENTICATION
// =========================

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            error: "Please log in first"
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            error: "Authentication is not configured"
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                error: "Invalid or expired token"
            });
        }

        req.user = { id: Number(decoded.userId) };
        next();
    });
}

function checkUserAccess(req, res) {
    const requestedUserId = Number(req.params.userId);

    if (
        !Number.isInteger(requestedUserId) ||
        requestedUserId <= 0
    ) {
        res.status(400).json({ error: "Invalid user ID" });
        return false;
    }

    if (requestedUserId !== req.user.id) {
        res.status(403).json({ error: "Access denied" });
        return false;
    }

    return true;
}

// =========================
// HEALTH CHECKS
// =========================

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Abraham's Vault backend is running"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "OK",
            database: "Connected"
        });
    } catch (error) {
        console.error("Database test error:", error.message);

        res.status(500).json({
            error: "Database connection failed"
        });
    }
});

// =========================
// REGISTER
// =========================

app.post(
    ["/api/register", "/api/auth/register"],
    async (req, res) => {
    
    try {
        const { username, email, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !email.trim() ||
            password.length < 6
        ) {
            return res.status(400).json({
                error: "Enter a username, valid email, and password of at least 6 characters"
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error: "Authentication is not configured"
            });
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.trim();

        const [existing] = await pool.execute(
            `SELECT id FROM users
             WHERE username = ? OR email = ?`,
            [cleanUsername, cleanEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                error: "Username or email already exists"
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            `INSERT INTO users (username, email, password_hash)
             VALUES (?, ?, ?)`,
            [cleanUsername, cleanEmail, passwordHash]
        );

        res.status(201).json({
            message: "Registration successful",
            userId: result.insertId,
            username: cleanUsername
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "Username or email already exists"
            });
        }

        res.status(500).json({
            error: "Registration failed"
        });
    }
});

// =========================
// LOGIN
// =========================

app.post(
    ["/api/login", "/api/auth/login"],
    async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                error: "Email and password are required"
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                error: "Authentication is not configured"
            });
        }

        const [users] = await pool.execute(
            `SELECT id, username, email, password_hash
             FROM users
             WHERE email = ?`,
            [email.trim()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const user = users[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({
            message: "Login successful",
            token,
            userId: user.id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error("Login error:", error.message);

        res.status(500).json({
            error: "Login failed"
        });
    }
});

// =========================
// TMDB API PROXY
// =========================


const allowedFixedPaths = new Set([
    // Movie discovery
    "/search/movie",
    "/discover/movie",
    "/genre/movie/list",
    "/movie/popular",
    "/movie/top_rated",
    "/movie/now_playing",
    "/movie/upcoming",
    "/trending/movie/day",
    "/trending/movie/week",

    // TV discovery
    "/search/tv",
    "/discover/tv",
    "/genre/tv/list",
    "/tv/popular",
    "/tv/top_rated",
    "/tv/on_the_air",
    "/tv/airing_today",
    "/trending/tv/day",
    "/trending/tv/week",

    // Combined movie and TV search/trending
    "/search/multi",
    "/trending/all/day",
    "/trending/all/week"
]);

const allowedQueryKeys = new Set([
    "page",
    "query",
    "with_genres",
    "with_original_language",
    "with_origin_country",
    "sort_by",
    "year",
    "primary_release_year",
    "primary_release_date.gte",
    "primary_release_date.lte",
    "first_air_date_year",
    "first_air_date.gte",
    "first_air_date.lte",
    "vote_count.gte",
    "with_release_type",
    "with_networks",
    "with_companies",
    "with_watch_providers",
    "watch_region",
    "include_adult",
    "include_video",
    "region",
    "language",
    "air_date.gte",
    "air_date.lte",
    "timezone",
    "screened_theatrically",
    "certification",
    "certification_country",
    "vote_average.gte",
    "vote_average.lte",
    "with_runtime.gte",
    "with_runtime.lte",
    "without_genres",
    "without_keywords",
    "with_keywords",
    "with_status",
    "with_type"
]);



function isAllowedTmdbPath(path) {
    if (allowedFixedPaths.has(path)) {
        return true;
    }

    return (
        /^\/movie\/\d+$/.test(path) ||
        /^\/movie\/\d+\/videos$/.test(path) ||
        /^\/movie\/\d+\/credits$/.test(path) ||
        /^\/tv\/\d+$/.test(path) ||
        /^\/tv\/\d+\/videos$/.test(path) ||
        /^\/tv\/\d+\/credits$/.test(path) ||
        /^\/person\/\d+$/.test(path) ||
        /^\/person\/\d+\/combined_credits$/.test(path)
    );
}



app.get("/api/tmdb", async (req, res) => {
    try {
        const apiKey = process.env.TMDB_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "TMDB API key is not configured"
            });
        }

        const path = req.query.path;

        if (
            typeof path !== "string" ||
            !isAllowedTmdbPath(path)
        ) {
            return res.status(400).json({
                error: "TMDB endpoint is not allowed"
            });
        }

        const params = new URLSearchParams();
        params.set("api_key", apiKey);

        for (const [key, value] of Object.entries(req.query)) {
            if (key === "path" || typeof value !== "string") {
                continue;
            }

            if (key === "append_to_response") {
                const allowedAppendValues = new Set([
                    "videos",
                    "credits"
                ]);

                const requestedValues = value.split(",");

                if (
                    requestedValues.some(
                        item => !allowedAppendValues.has(item)
                    ) ||
                    new Set(requestedValues).size !==
                        requestedValues.length
                ) {
                    return res.status(400).json({
                        error: "TMDB append option is not allowed"
                    });
                }

                const isMovieDetails = /^\/movie\/\d+$/.test(path);
                const isTvDetails = /^\/tv\/\d+$/.test(path);

                if (!isMovieDetails && !isTvDetails) {
                    return res.status(400).json({
                        error:
                            "TMDB append option is not allowed for this endpoint"
                    });
                }

                params.set(key, requestedValues.join(","));
                continue;
            }

            if (allowedQueryKeys.has(key)) {
                params.set(key, value);
            }
        }

        const url =
            `https://api.themoviedb.org/3${path}?${params.toString()}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.status_message || "TMDB request failed"
            });
        }

        res.json(data);
    } catch (error) {
        console.error("TMDB error:", error.message);

        res.status(500).json({
            error: "Unable to retrieve movie or TV data"
        });
    }
});


 // =========================
 // WATCHLIST
 // =========================

app.get(
    "/api/watchlist/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const [rows] = await pool.execute(
                `SELECT
                    id,
                    user_id AS userId,
                    tmdb_movie_id AS movieId,
                    media_type AS mediaType,
                    movie_title AS title,
                    poster_path AS posterPath,
                    added_at AS addedAt
                 FROM watchlist
                 WHERE user_id = ?
                 ORDER BY added_at DESC`,
                [req.user.id]
            );

            res.json(rows);
        } catch (error) {
            console.error("Load watchlist error:", error.message);
            res.status(500).json({
                error: "Failed to load watchlist"
            });
        }
    }
);

app.post(
    "/api/watchlist/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const userId = req.user.id;
            const movieId = Number(
                req.body.movieId ??
                req.body.tmdb_movie_id ??
                req.body.id
            );

            const mediaType =
                req.body.mediaType ?? req.body.media_type ?? "movie";

            const title = req.body.title ?? req.body.movie_title;
            const posterPath =
                req.body.posterPath ?? req.body.poster_path ?? null;

            if (
                !Number.isInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType) ||
                typeof title !== "string" ||
                !title.trim() ||
                title.trim().length > 255 ||
                (posterPath !== null &&
                    (typeof posterPath !== "string" ||
                     posterPath.length > 255))
            ) {
                return res.status(400).json({
                    error: "Valid movie or TV-show details are required"
                });
            }

            const [existing] = await pool.execute(
                `SELECT id FROM watchlist
                 WHERE user_id = ?
                   AND media_type = ?
                   AND tmdb_movie_id = ?`,
                [userId, mediaType, movieId]
            );

            if (existing.length > 0) {
                return res.status(409).json({
                    error: "This item is already in My List"
                });
            }

            await pool.execute(
                `INSERT INTO watchlist
                    (user_id, tmdb_movie_id, media_type,
                     movie_title, poster_path)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, movieId, mediaType, title.trim(), posterPath]
            );

            res.status(201).json({
                message: "Item added to My List",
                movieId,
                mediaType,
                title: title.trim(),
                posterPath
            });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "This item is already in My List"
                });
            }

            console.error("Add watchlist error:", error.message);
            res.status(500).json({
                error: "Failed to add item to My List"
            });
        }
    }
);

app.delete(
    "/api/watchlist/:userId/:movieId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const movieId = Number(req.params.movieId);
            const mediaType = req.query.mediaType ?? "movie";

            if (
                !Number.isInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType)
            ) {
                return res.status(400).json({
                    error: "Invalid item ID or media type"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM watchlist
                 WHERE user_id = ?
                   AND tmdb_movie_id = ?
                   AND media_type = ?`,
                [req.user.id, movieId, mediaType]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Item not found in My List"
                });
            }

            res.json({ message: "Item removed from My List" });
        } catch (error) {
            console.error("Remove watchlist error:", error.message);
            res.status(500).json({
                error: "Failed to remove item from My List"
            });
        }
    }
);


// =========================
// WATCHED LOG
// =========================

app.get(
    "/api/watched/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const [rows] = await pool.execute(
                `SELECT
                    id,
                    user_id AS userId,
                    tmdb_movie_id AS movieId,
                    media_type AS mediaType,
                    movie_title AS title,
                    poster_path AS posterPath,
                    watched_at AS watchedAt
                 FROM watched_movies
                 WHERE user_id = ?
                 ORDER BY watched_at DESC`,
                [req.user.id]
            );

            res.json(rows);
        } catch (error) {
            console.error("Load watched log error:", error.message);
            res.status(500).json({
                error: "Failed to load watched log"
            });
        }
    }
);

app.post(
    "/api/watched/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const userId = req.user.id;
            const movieId = Number(
                req.body.movieId ??
                req.body.tmdb_movie_id ??
                req.body.id
            );

            const mediaType =
                req.body.mediaType ?? req.body.media_type ?? "movie";

            const title = req.body.title ?? req.body.movie_title;
            const posterPath =
                req.body.posterPath ?? req.body.poster_path ?? null;

            if (
                !Number.isInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType) ||
                typeof title !== "string" ||
                !title.trim() ||
                title.trim().length > 255 ||
                (posterPath !== null &&
                    (typeof posterPath !== "string" ||
                     posterPath.length > 255))
            ) {
                return res.status(400).json({
                    error: "Valid movie or TV-show details are required"
                });
            }

            await pool.execute(
                `INSERT INTO watched_movies
                    (user_id, tmdb_movie_id, media_type,
                     movie_title, poster_path)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, movieId, mediaType, title.trim(), posterPath]
            );

            res.status(201).json({
                message: "Item added to your watched log",
                movieId,
                mediaType,
                title: title.trim(),
                posterPath
            });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "This item is already in your watched log"
                });
            }

            console.error("Add watched item error:", error.message);
            res.status(500).json({
                error: "Failed to add item to watched log"
            });
        }
    }
);

app.delete(
    "/api/watched/:userId/:movieId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const movieId = Number(req.params.movieId);
            const mediaType = req.query.mediaType ?? "movie";

            if (
                !Number.isInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType)
            ) {
                return res.status(400).json({
                    error: "Invalid item ID or media type"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM watched_movies
                 WHERE user_id = ?
                   AND tmdb_movie_id = ?
                   AND media_type = ?`,
                [req.user.id, movieId, mediaType]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Item not found in watched log"
                });
            }

            res.json({
                message: "Item removed from watched log"
            });
        } catch (error) {
            console.error("Remove watched item error:", error.message);
            res.status(500).json({
                error: "Failed to remove item from watched log"
            });
        }
    }
);


 // =========================
 // MY JOURNAL
 // =========================

 // Get all journal entries belonging to the logged-in user
app.get(
    "/api/journal/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;
const [entries] = await pool.execute(
    `SELECT
        id,
        tmdb_movie_id AS movieId,
        media_type AS mediaType,
        movie_title AS title,
        poster_path AS posterPath,
        journal_text AS journalText,
        created_at AS createdAt,
        updated_at AS updatedAt,
        is_public AS isPublic
     FROM movie_journal
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [req.user.id]
);

            res.json(entries);
        } catch (error) {
            console.error("Load journal error:", error.message);
            res.status(500).json({
                error: "Failed to load journal entries"
            });
        }
    }
);


// Create a journal entry or update an existing one
app.post(
    "/api/journal/:userId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

           const { movieId, title, posterPath, journalText } = req.body;
const isPublic = req.body.isPublic !== false;

            const validMovieId = Number(movieId);
            const mediaType =
                req.body.mediaType ?? req.body.media_type ?? "movie";

            if (
                !Number.isSafeInteger(validMovieId) ||
                validMovieId <= 0 ||
                !["movie", "tv"].includes(mediaType) ||
                typeof title !== "string" ||
                !title.trim() ||
                title.trim().length > 255 ||
                typeof journalText !== "string" ||
                !journalText.trim() ||
                journalText.length > 10000 ||
                (
                    posterPath != null &&
                    (
                        typeof posterPath !== "string" ||
                        posterPath.length > 255
                    )
                )
            ) {
                return res.status(400).json({
                    error: "Provide valid movie or TV-show details and a journal entry of up to 10,000 characters"
                });
            }

            await pool.execute(
    `INSERT INTO movie_journal
        (user_id, tmdb_movie_id, media_type,
         movie_title, poster_path, journal_text, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        movie_title = VALUES(movie_title),
        poster_path = VALUES(poster_path),
        journal_text = VALUES(journal_text),
        is_public = VALUES(is_public)`,
    [
        req.user.id,
        validMovieId,
        mediaType,
        title.trim(),
        posterPath || null,
        journalText.trim(),
        isPublic ? 1 : 0
    ]
);

            res.json({
                message: "Journal entry saved successfully",
                movieId: validMovieId,
                mediaType
            });
        } catch (error) {
            console.error("Save journal error:", error.message);
            res.status(500).json({
                error: "Failed to save journal entry"
            });
        }
    }
);


// Delete a journal entry
app.delete(
    "/api/journal/:userId/:movieId",
    authenticateToken,
    async (req, res) => {
        try {
            if (!checkUserAccess(req, res)) return;

            const movieId = Number(req.params.movieId);
            const mediaType = req.query.mediaType ?? "movie";

            if (
                !Number.isSafeInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType)
            ) {
                return res.status(400).json({
                    error: "Invalid item ID or media type"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM movie_journal
                 WHERE user_id = ?
                   AND tmdb_movie_id = ?
                   AND media_type = ?`,
                [req.user.id, movieId, mediaType]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Journal entry not found"
                });
            }

            res.json({
                message: "Journal entry deleted successfully"
            });
        } catch (error) {
            console.error("Delete journal error:", error.message);
            res.status(500).json({
                error: "Failed to delete journal entry"
            });
        }
    }
);

 
 // =========================
 // USER TOP 5 MOVIES
 // =========================

// Public: retrieve a user's Top 5 movies for their profile
app.get("/api/top-movies/:userId", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({
                error: "Invalid user ID"
            });
        }

        const [users] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        const [movies] = await pool.execute(
            `SELECT
                tmdb_movie_id AS movieId,
                movie_title AS title,
                poster_path AS posterPath,
                rank_position AS rankPosition
             FROM user_top_movies
             WHERE user_id = ?
             ORDER BY rank_position ASC`,
            [userId]
        );

        res.json(movies);
    } catch (error) {
        console.error("Load Top 5 error:", error);

        res.status(500).json({
            error: "Failed to load Top 5 movies"
        });
    }
});


// Private write access: save or replace the logged-in user's Top 5
app.put(
    "/api/top-movies/:userId",
    authenticateToken,
    async (req, res) => {
        let connection;

        try {
            if (!checkUserAccess(req, res)) return;

            const movies = req.body.movies;

            if (!Array.isArray(movies) || movies.length > 5) {
                return res.status(400).json({
                    error: "Provide a list of up to 5 movies"
                });
            }

            const seenMovieIds = new Set();

            for (const movie of movies) {
                const movieId = Number(movie?.movieId);
                const title = movie?.title;
                const posterPath = movie?.posterPath ?? null;

                if (
                    !Number.isSafeInteger(movieId) ||
                    movieId <= 0 ||
                    typeof title !== "string" ||
                    !title.trim() ||
                    title.trim().length > 255 ||
                    (
                        posterPath !== null &&
                        (
                            typeof posterPath !== "string" ||
                            posterPath.length > 255
                        )
                    ) ||
                    seenMovieIds.has(movieId)
                ) {
                    return res.status(400).json({
                        error: "Each movie must have a valid, unique movie ID, title, and optional poster path"
                    });
                }

                seenMovieIds.add(movieId);
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // Replace the existing rankings with the submitted list
            await connection.execute(
                "DELETE FROM user_top_movies WHERE user_id = ?",
                [req.user.id]
            );

            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];

                await connection.execute(
                    `INSERT INTO user_top_movies
                        (user_id, tmdb_movie_id, movie_title,
                         poster_path, rank_position)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        req.user.id,
                        Number(movie.movieId),
                        movie.title.trim(),
                        movie.posterPath ?? null,
                        i + 1
                    ]
                );
            }

            await connection.commit();

            res.json({
                message: "Top 5 movies saved successfully",
                total: movies.length
            });
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("Save Top 5 error:", error.message);

            res.status(500).json({
                error: "Failed to save Top 5 movies"
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);


 // =========================
 // MOVIE AND TV RATINGS
 // =========================

app.get("/api/ratings/:movieId", async (req, res) => {
    try {
        const movieId = Number(req.params.movieId);
        const mediaType = req.query.mediaType ?? "movie";

        if (
            !Number.isSafeInteger(movieId) ||
            movieId <= 0 ||
            !["movie", "tv"].includes(mediaType)
        ) {
            return res.status(400).json({
                error: "Invalid item ID or media type"
            });
        }

        const [rows] = await pool.execute(
            `SELECT AVG(rating) AS averageRating,
                    COUNT(*) AS totalRatings
             FROM movie_ratings
             WHERE tmdb_movie_id = ?
               AND media_type = ?`,
            [movieId, mediaType]
        );

        res.json({
            averageRating: Number(rows[0].averageRating || 0),
            totalRatings: Number(rows[0].totalRatings || 0)
        });
    } catch (error) {
        console.error("Get ratings error:", error.message);
        res.status(500).json({
            error: "Failed to load ratings"
        });
    }
});


app.get(
    "/api/ratings/:movieId/mine",
    authenticateToken,
    async (req, res) => {
        try {
            const movieId = Number(req.params.movieId);
            const mediaType = req.query.mediaType ?? "movie";

            if (
                !Number.isSafeInteger(movieId) ||
                movieId <= 0 ||
                !["movie", "tv"].includes(mediaType)
            ) {
                return res.status(400).json({
                    error: "Invalid item ID or media type"
                });
            }

            const [rows] = await pool.execute(
                `SELECT rating
                 FROM movie_ratings
                 WHERE user_id = ?
                   AND tmdb_movie_id = ?
                   AND media_type = ?`,
                [req.user.id, movieId, mediaType]
            );

            res.json({
                rating: rows.length
                    ? Number(rows[0].rating)
                    : null
            });
        } catch (error) {
            console.error("Get personal rating error:", error.message);
            res.status(500).json({
                error: "Failed to load your rating"
            });
        }
    }
);


app.post("/api/ratings", authenticateToken, async (req, res) => {
    try {
        const movieId = Number(
            req.body.movieId ?? req.body.tmdb_movie_id
        );

        const rating = Number(req.body.rating);
        const mediaType =
            req.body.mediaType ?? req.body.media_type ?? "movie";

        if (
            !Number.isSafeInteger(movieId) ||
            movieId <= 0 ||
            !["movie", "tv"].includes(mediaType) ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {
            return res.status(400).json({
                error: "Valid item details and a whole-number rating from 1 to 5 are required"
            });
        }

        await pool.execute(
            `INSERT INTO movie_ratings
                (user_id, tmdb_movie_id, media_type, rating)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                rating = VALUES(rating)`,
            [req.user.id, movieId, mediaType, rating]
        );

        res.json({
            message: "Rating saved",
            movieId,
            mediaType,
            rating
        });
    } catch (error) {
        console.error("Save rating error:", error.message);
        res.status(500).json({
            error: "Failed to save rating"
        });
    }
});


// =========================
// MOVIE AND TV COMMUNITY REVIEWS
// =========================

app.get("/api/reviews/:movieId", async (req, res) => {
    try {
        const movieId = Number(req.params.movieId);
        const mediaType = req.query.mediaType ?? "movie";

        if (
            !Number.isSafeInteger(movieId) ||
            movieId <= 0 ||
            !["movie", "tv"].includes(mediaType)
        ) {
            return res.status(400).json({
                error: "Invalid item ID or media type"
            });
        }

        const [reviews] = await pool.execute(
            `SELECT
                r.id,
                r.user_id AS userId,
                r.tmdb_movie_id AS movieId,
                r.media_type AS mediaType,
                r.review_text AS reviewText,
                r.created_at AS createdAt,
                r.updated_at AS updatedAt,
                u.username
             FROM movie_reviews r
             JOIN users u ON u.id = r.user_id
             WHERE r.tmdb_movie_id = ?
               AND r.media_type = ?
             ORDER BY r.updated_at DESC`,
            [movieId, mediaType]
        );

        res.json(reviews);
    } catch (error) {
        console.error("Load reviews error:", error.message);
        res.status(500).json({
            error: "Failed to load reviews"
        });
    }
});


app.post("/api/reviews", authenticateToken, async (req, res) => {
    try {
        const movieId = Number(
            req.body.movieId ?? req.body.tmdb_movie_id
        );

        const reviewText =
            req.body.reviewText ?? req.body.review_text;

        const mediaType =
            req.body.mediaType ?? req.body.media_type ?? "movie";

        if (
            !Number.isSafeInteger(movieId) ||
            movieId <= 0 ||
            !["movie", "tv"].includes(mediaType) ||
            typeof reviewText !== "string" ||
            !reviewText.trim() ||
            reviewText.trim().length > 10000
        ) {
            return res.status(400).json({
                error: "Valid item details and review text of up to 10,000 characters are required"
            });
        }

        await pool.execute(
            `INSERT INTO movie_reviews
                (user_id, tmdb_movie_id, media_type, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                review_text = VALUES(review_text),
                updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, movieId, mediaType, reviewText.trim()]
        );

        res.json({
            message: "Review saved successfully",
            movieId,
            mediaType
        });
    } catch (error) {
        console.error("Save review error:", error.message);
        res.status(500).json({
            error: "Failed to save review"
        });
    }
});


app.delete(
    "/api/reviews/:reviewId",
    authenticateToken,
    async (req, res) => {
        try {
            const reviewId = Number(req.params.reviewId);

            if (
                !Number.isSafeInteger(reviewId) ||
                reviewId <= 0
            ) {
                return res.status(400).json({
                    error: "Invalid review ID"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM movie_reviews
                 WHERE id = ? AND user_id = ?`,
                [reviewId, req.user.id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Review not found or you cannot delete it"
                });
            }

            res.json({
                message: "Review deleted successfully"
            });
        } catch (error) {
            console.error("Delete review error:", error.message);
            res.status(500).json({
                error: "Failed to delete review"
            });
        }
    }
);


 // =========================
 // FOLLOW / UNFOLLOW SYSTEM
 // =========================

// Follow a user
app.post("/api/follow/:userId", authenticateToken, async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);
        const currentUserId = req.user.id;

        if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        if (targetUserId === currentUserId) {
            return res.status(400).json({
                error: "You cannot follow yourself"
            });
        }

        const [users] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [targetUserId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const [result] = await pool.execute(
            `INSERT IGNORE INTO follows (follower_id, following_id)
             VALUES (?, ?)`,
            [currentUserId, targetUserId]
        );

        res.json({
            message: result.affectedRows
                ? "User followed successfully"
                : "You are already following this user",
            following: true
        });
    } catch (error) {
        console.error("Follow user error:", error.message);
        res.status(500).json({ error: "Failed to follow user" });
    }
});

// Unfollow a user
app.delete("/api/follow/:userId", authenticateToken, async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);

        if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        if (targetUserId === req.user.id) {
            return res.status(400).json({
                error: "You cannot unfollow yourself"
            });
        }

        const [result] = await pool.execute(
            `DELETE FROM follows
             WHERE follower_id = ? AND following_id = ?`,
            [req.user.id, targetUserId]
        );

        res.json({
            message: result.affectedRows
                ? "User unfollowed successfully"
                : "You were not following this user",
            following: false
        });
    } catch (error) {
        console.error("Unfollow user error:", error.message);
        res.status(500).json({ error: "Failed to unfollow user" });
    }
});

// Check whether the logged-in user follows a profile
app.get(
    "/api/follow/:userId/status",
    authenticateToken,
    async (req, res) => {
        try {
            const targetUserId = Number(req.params.userId);

            if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
                return res.status(400).json({ error: "Invalid user ID" });
            }

            const [users] = await pool.execute(
                "SELECT id FROM users WHERE id = ?",
                [targetUserId]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            const [rows] = await pool.execute(
                `SELECT 1 FROM follows
                 WHERE follower_id = ? AND following_id = ?
                 LIMIT 1`,
                [req.user.id, targetUserId]
            );

            res.json({
                following: rows.length > 0,
                isSelf: req.user.id === targetUserId
            });
        } catch (error) {
            console.error("Follow status error:", error.message);
            res.status(500).json({ error: "Failed to check follow status" });
        }
    }
);

// Get follower and following counts for a profile
app.get("/api/follow/:userId/counts", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const [users] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const [rows] = await pool.execute(
            `SELECT
                (SELECT COUNT(*) FROM follows
                 WHERE following_id = ?) AS followers,
                (SELECT COUNT(*) FROM follows
                 WHERE follower_id = ?) AS following`,
            [userId, userId]
        );

        res.json({
            followers: Number(rows[0].followers),
            following: Number(rows[0].following)
        });
    } catch (error) {
        console.error("Follow counts error:", error.message);
        res.status(500).json({ error: "Failed to load follow counts" });
    }
});

// Get a profile's followers
app.get("/api/follow/:userId/followers", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const [users] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const [rows] = await pool.execute(
            `SELECT u.id AS userId, u.username, f.created_at AS followedAt
             FROM follows f
             JOIN users u ON u.id = f.follower_id
             WHERE f.following_id = ?
             ORDER BY f.created_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (error) {
        console.error("Load followers error:", error.message);
        res.status(500).json({ error: "Failed to load followers" });
    }
});

// Get the accounts a profile follows
app.get("/api/follow/:userId/following", async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const [users] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const [rows] = await pool.execute(
            `SELECT u.id AS userId, u.username, f.created_at AS followedAt
             FROM follows f
             JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = ?
             ORDER BY f.created_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (error) {
        console.error("Load following list error:", error.message);
        res.status(500).json({ error: "Failed to load following list" });
    }
});


 // =========================
 // FIND USERS
 // =========================

app.get("/api/users/search", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();

        if (q.length < 2) {
            return res.json([]);
        }

        const [users] = await pool.execute(
            `SELECT id, username, avatar_id AS avatarId
             FROM users
             WHERE username LIKE ?
             ORDER BY username ASC
             LIMIT 20`,
            [`%${q}%`]
        );

        res.set("Cache-Control", "no-store");
        return res.status(200).json(users);
    } catch (error) {
        console.error("Find users error:", error.message);
        return res.status(500).json({
            error: "Unable to search users"
        });
    }
});


// =========================
// PUBLIC USER PROFILE
// =========================

app.get("/api/users/:id", async (req, res) => {
    try {
        const userId = Number(req.params.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(400).json({
                error: "Invalid user ID"
            });
        }

        const [users] = await pool.execute(
            `SELECT id, username, avatar_id AS avatarId
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        res.set("Cache-Control", "no-store");
        return res.status(200).json(users[0]);
    } catch (error) {
        console.error("Get user profile error:", error.message);
        return res.status(500).json({
            error: "Unable to load user profile"
        });
    }
});


// =========================
// SAVE PROFILE AVATAR
// =========================


const ALLOWED_AVATARS = [
    "cat", "dog", "fox", "bear", "panda", "rabbit",
    "tiger", "lion", "wolf", "frog", "koala", "raccoon",
    ...Array.from({ length: 20 }, (_, i) =>
        `anime-${String(i + 1).padStart(2, "0")}`
    )
];


app.patch(
    "/api/users/:id/avatar",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const avatarId = String(req.body.avatarId || "");

            if (!Number.isSafeInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    error: "Invalid user ID"
                });
            }

            if (req.user.id !== userId) {
                return res.status(403).json({
                    error: "You can only change your own avatar"
                });
            }

            if (!ALLOWED_AVATARS.includes(avatarId)) {
                return res.status(400).json({
                    error: "Invalid avatar selection"
                });
            }

            const [result] = await pool.execute(
                "UPDATE users SET avatar_id = ? WHERE id = ?",
                [avatarId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "User not found"
                });
            }

            return res.json({
                success: true,
                avatarId
            });
        } catch (error) {
            console.error("Save avatar error:", error.message);
            return res.status(500).json({
                error: "Unable to save avatar"
            });
        }
    }
);


// =========================
// PUBLIC USER JOURNAL
// Supports numeric user IDs and usernames.
// =========================

app.get("/api/users/:id/journal", async (req, res) => {
    try {
        const identifier = String(req.params.id || "").trim();

        if (!identifier) {
            return res.status(400).json({
                error: "A user ID or username is required"
            });
        }

        const [users] = /^\d+$/.test(identifier)
            ? await pool.execute(
                "SELECT id FROM users WHERE id = ? LIMIT 1",
                [Number(identifier)]
            )
            : await pool.execute(
                `SELECT id FROM users
                 WHERE LOWER(username) = LOWER(?)
                 LIMIT 1`,
                [identifier]
            );

        if (users.length === 0) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        const [entries] = await pool.execute(
    `SELECT
        id,
        tmdb_movie_id AS movieId,
        media_type AS mediaType,
        movie_title AS title,
        poster_path AS posterPath,
        journal_text AS journalText,
        created_at AS createdAt,
        updated_at AS updatedAt
     FROM movie_journal
     WHERE user_id = ?
       AND is_public = 1
     ORDER BY updated_at DESC`,
    [users[0].id]
);

        res.set("Cache-Control", "no-store");
        return res.status(200).json(entries);
    } catch (error) {
        console.error("Public user journal error:", error.message);
        return res.status(500).json({
            error: "Unable to load this user's journal"
        });
    }
});


/* =========================
   PUBLIC JOURNAL LIKES & COMMENTS
   ========================= */

// Get likes, comments, and the logged-in user's like status.
app.get("/api/journal/:journalId/social", async (req, res) => {
    try {
        const journalId = Number(req.params.journalId);

        if (!Number.isSafeInteger(journalId) || journalId <= 0) {
            return res.status(400).json({ error: "Invalid journal ID" });
        }

        const [entries] = await pool.execute(
            `SELECT id FROM movie_journal
             WHERE id = ? AND is_public = 1`,
            [journalId]
        );

        if (!entries.length) {
            return res.status(404).json({
                error: "Public journal entry not found"
            });
        }

        const [likes] = await pool.execute(
            `SELECT COUNT(*) AS count
             FROM journal_likes WHERE journal_id = ?`,
            [journalId]
        );

        const [comments] = await pool.execute(
            `SELECT
                c.id,
                c.user_id AS userId,
                u.username,
                c.comment_text AS commentText,
                c.created_at AS createdAt
             FROM journal_comments c
             JOIN users u ON u.id = c.user_id
             WHERE c.journal_id = ?
             ORDER BY c.created_at ASC`,
            [journalId]
        );

        let viewerId = null;
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (token && process.env.JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                viewerId = Number(decoded.userId);
            } catch {
                // Public counts and comments remain available to logged-out users.
            }
        }

        let liked = false;

        if (viewerId) {
            const [existingLike] = await pool.execute(
                `SELECT id FROM journal_likes
                 WHERE journal_id = ? AND user_id = ?`,
                [journalId, viewerId]
            );

            liked = existingLike.length > 0;
        }

        res.set("Cache-Control", "no-store");

        return res.json({
            likeCount: Number(likes[0].count),
            commentCount: comments.length,
            liked,
            comments
        });
    } catch (error) {
        console.error("Load journal interactions error:", error.message);
        return res.status(500).json({
            error: "Unable to load journal interactions"
        });
    }
});


// Like or unlike a public journal entry.
app.post(
    "/api/journal/:journalId/like",
    authenticateToken,
    async (req, res) => {
        try {
            const journalId = Number(req.params.journalId);

            if (!Number.isSafeInteger(journalId) || journalId <= 0) {
                return res.status(400).json({ error: "Invalid journal ID" });
            }

            const [entries] = await pool.execute(
                `SELECT id FROM movie_journal
                 WHERE id = ? AND is_public = 1`,
                [journalId]
            );

            if (!entries.length) {
                return res.status(404).json({
                    error: "Public journal entry not found"
                });
            }

            const [existing] = await pool.execute(
                `SELECT id FROM journal_likes
                 WHERE journal_id = ? AND user_id = ?`,
                [journalId, req.user.id]
            );

            let liked;

            if (existing.length) {
                await pool.execute(
                    `DELETE FROM journal_likes
                     WHERE journal_id = ? AND user_id = ?`,
                    [journalId, req.user.id]
                );
                liked = false;
            } else {
                await pool.execute(
                    `INSERT IGNORE INTO journal_likes (journal_id, user_id)
                     VALUES (?, ?)`,
                    [journalId, req.user.id]
                );
                liked = true;
            }

            const [counts] = await pool.execute(
                `SELECT COUNT(*) AS count
                 FROM journal_likes WHERE journal_id = ?`,
                [journalId]
            );

            return res.json({
                liked,
                likeCount: Number(counts[0].count)
            });
        } catch (error) {
            console.error("Toggle journal like error:", error.message);
            return res.status(500).json({
                error: "Unable to update like"
            });
        }
    }
);


// Add a comment to a public journal entry.
app.post(
    "/api/journal/:journalId/comments",
    authenticateToken,
    async (req, res) => {
        try {
            const journalId = Number(req.params.journalId);
            const commentText = req.body.commentText;

            if (!Number.isSafeInteger(journalId) || journalId <= 0) {
                return res.status(400).json({ error: "Invalid journal ID" });
            }

            if (
                typeof commentText !== "string" ||
                !commentText.trim() ||
                commentText.trim().length > 1000
            ) {
                return res.status(400).json({
                    error: "Comment must contain 1–1000 characters"
                });
            }

            const [entries] = await pool.execute(
                `SELECT id FROM movie_journal
                 WHERE id = ? AND is_public = 1`,
                [journalId]
            );

            if (!entries.length) {
                return res.status(404).json({
                    error: "Public journal entry not found"
                });
            }

            const [result] = await pool.execute(
                `INSERT INTO journal_comments
                    (journal_id, user_id, comment_text)
                 VALUES (?, ?, ?)`,
                [journalId, req.user.id, commentText.trim()]
            );

            const [comments] = await pool.execute(
                `SELECT
                    c.id,
                    c.user_id AS userId,
                    u.username,
                    c.comment_text AS commentText,
                    c.created_at AS createdAt
                 FROM journal_comments c
                 JOIN users u ON u.id = c.user_id
                 WHERE c.id = ?`,
                [result.insertId]
            );

            return res.status(201).json({
                message: "Comment added",
                comment: comments[0]
            });
        } catch (error) {
            console.error("Add journal comment error:", error.message);
            return res.status(500).json({
                error: "Unable to add comment"
            });
        }
    }
);


// Delete a comment if you're its author or own the journal entry.
app.delete(
    "/api/journal/comments/:commentId",
    authenticateToken,
    async (req, res) => {
        try {
            const commentId = Number(req.params.commentId);

            if (!Number.isSafeInteger(commentId) || commentId <= 0) {
                return res.status(400).json({ error: "Invalid comment ID" });
            }

            const [rows] = await pool.execute(
                `SELECT
                    c.id,
                    c.user_id AS commentOwnerId,
                    j.user_id AS journalOwnerId
                 FROM journal_comments c
                 JOIN movie_journal j ON j.id = c.journal_id
                 WHERE c.id = ?`,
                [commentId]
            );

            if (!rows.length) {
                return res.status(404).json({ error: "Comment not found" });
            }

            const comment = rows[0];

            if (
                Number(comment.commentOwnerId) !== req.user.id &&
                Number(comment.journalOwnerId) !== req.user.id
            ) {
                return res.status(403).json({
                    error: "You cannot delete this comment"
                });
            }

            await pool.execute(
                `DELETE FROM journal_comments WHERE id = ?`,
                [commentId]
            );

            return res.json({ message: "Comment deleted" });
        } catch (error) {
            console.error("Delete journal comment error:", error.message);
            return res.status(500).json({
                error: "Unable to delete comment"
            });
        }
    }
);


// =========================
// UPDATE USERNAME
// =========================

app.patch(
    "/api/account/:userId/username",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = Number(req.params.userId);
            const username = String(req.body.username || "").trim();

            if (
                !Number.isSafeInteger(userId) ||
                userId <= 0 ||
                userId !== req.user.id
            ) {
                return res.status(403).json({
                    error: "You can only update your own username."
                });
            }

            if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
                return res.status(400).json({
                    error: "Username must be 3–30 characters using letters, numbers, or underscores."
                });
            }

            const [existing] = await pool.execute(
                `SELECT id FROM users
                 WHERE username = ? AND id <> ?`,
                [username, userId]
            );

            if (existing.length > 0) {
                return res.status(409).json({
                    error: "That username is already taken."
                });
            }

            await pool.execute(
                "UPDATE users SET username = ? WHERE id = ?",
                [username, userId]
            );

            return res.json({
                message: "Username updated successfully.",
                username
            });
        } catch (error) {
            console.error("Username update error:", error.message);

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "That username is already taken."
                });
            }

            return res.status(500).json({
                error: "Unable to update username."
            });
        }
    }
);



 // =========================
 // START SERVER
 // =========================

async function startServer() {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing");
        }

        if (
            process.env.NODE_ENV === "production" &&
            !process.env.DB_SSL_CA
        ) {
            throw new Error("DB_SSL_CA is required in production");
        }

        await pool.query("SELECT 1");

        // Create the journal table if it does not exist.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS movie_journal (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                tmdb_movie_id INT NOT NULL,
                media_type VARCHAR(10) NOT NULL DEFAULT 'movie',
                movie_title VARCHAR(255) NOT NULL,
                poster_path VARCHAR(255),
                journal_text TEXT NOT NULL,
                is_public TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_movie
                    (user_id, tmdb_movie_id)
            )
        `);

        // Add media_type to existing journal tables if needed.
        const [journalMediaColumn] = await pool.execute(
            "SHOW COLUMNS FROM movie_journal LIKE 'media_type'"
        );

        if (journalMediaColumn.length === 0) {
            await pool.query(`
                ALTER TABLE movie_journal
                ADD COLUMN media_type VARCHAR(10)
                NOT NULL DEFAULT 'movie'
                AFTER tmdb_movie_id
            `);
        }

        // Add public/private visibility if needed.
        const [journalVisibilityColumn] = await pool.execute(
            "SHOW COLUMNS FROM movie_journal LIKE 'is_public'"
        );

        if (journalVisibilityColumn.length === 0) {
            await pool.query(`
                ALTER TABLE movie_journal
                ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1
            `);
        } else {
            await pool.query(`
                ALTER TABLE movie_journal
                MODIFY COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1
            `);
        }

        // Create likes table.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS journal_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                journal_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_journal_like (journal_id, user_id),
                INDEX idx_journal_likes_entry (journal_id)
            )
        `);

        // Create comments table.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS journal_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                journal_id INT NOT NULL,
                user_id INT NOT NULL,
                comment_text VARCHAR(1000) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_journal_comments_entry (journal_id)
            )
        `);

        // Add avatar_id to existing user tables if needed.
        const [avatarColumn] = await pool.execute(
            "SHOW COLUMNS FROM users LIKE 'avatar_id'"
        );

        if (avatarColumn.length === 0) {
            await pool.query(`
                ALTER TABLE users
                ADD COLUMN avatar_id VARCHAR(20)
                NOT NULL DEFAULT 'cat'
            `);
        }

        app.listen(PORT, "0.0.0.0", () => {
            console.log(
                `Abraham's Vault backend listening on port ${PORT}`
            );
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
