
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =========================
// DATABASE CONNECTION
// =========================

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "abraham_vault",

    // DB_SSL_CA should contain the contents of ca.pem on Render.
    // Locally, leave DB_SSL_CA unset if using local MySQL.
    ssl: {
    ca: require("fs").readFileSync("C:/Users/P Thomas Abraham/Downloads/ca.pem", "utf8"),
    rejectUnauthorized: true
},

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

app.post("/api/register", async (req, res) => {
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

app.post("/api/login", async (req, res) => {
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
    "/search/movie",
    "/discover/movie",
    "/genre/movie/list",
    "/movie/popular",
    "/movie/top_rated",
    "/movie/now_playing",
    "/movie/upcoming",
    "/trending/movie/day",
    "/trending/movie/week"
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
    "vote_count.gte",
    "with_release_type",
    "include_adult",
    "include_video",
    "region",
    "language"
]);

function isAllowedTmdbPath(path) {
    if (allowedFixedPaths.has(path)) {
        return true;
    }

    return (
        /^\/movie\/\d+$/.test(path) ||
        /^\/movie\/\d+\/videos$/.test(path) ||
        /^\/movie\/\d+\/credits$/.test(path)
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

                if (!/^\/movie\/\d+$/.test(path)) {
                    return res.status(400).json({
                        error: "TMDB append option is not allowed for this endpoint"
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
            error: "Unable to retrieve movie data"
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

            const title =
                req.body.title ?? req.body.movie_title;

            const posterPath =
                req.body.posterPath ??
                req.body.poster_path ??
                null;

            if (
                !Number.isInteger(movieId) ||
                movieId <= 0 ||
                typeof title !== "string" ||
                !title.trim()
            ) {
                return res.status(400).json({
                    error: "A valid movie ID and title are required"
                });
            }

            const [existing] = await pool.execute(
                `SELECT id FROM watchlist
                 WHERE user_id = ? AND tmdb_movie_id = ?`,
                [userId, movieId]
            );

            if (existing.length > 0) {
                return res.status(409).json({
                    error: "This movie is already in My List"
                });
            }

            await pool.execute(
                `INSERT INTO watchlist
                    (user_id, tmdb_movie_id, movie_title, poster_path)
                 VALUES (?, ?, ?, ?)`,
                [userId, movieId, title.trim(), posterPath]
            );

            res.status(201).json({
                message: "Movie added to My List",
                movieId,
                title: title.trim(),
                posterPath
            });
        } catch (error) {
            console.error("Add watchlist error:", error.message);

            res.status(500).json({
                error: "Failed to add movie"
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

            if (!Number.isInteger(movieId) || movieId <= 0) {
                return res.status(400).json({
                    error: "Invalid movie ID"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM watchlist
                 WHERE user_id = ? AND tmdb_movie_id = ?`,
                [req.user.id, movieId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Movie not found in My List"
                });
            }

            res.json({
                message: "Movie removed from My List"
            });
        } catch (error) {
            console.error("Remove watchlist error:", error.message);

            res.status(500).json({
                error: "Failed to remove movie"
            });
        }
    }
);

 // =========================
 // WATCHED MOVIES LOG
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
                error: "Failed to load watched movies"
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

            const title =
                req.body.title ?? req.body.movie_title;

            const posterPath =
                req.body.posterPath ??
                req.body.poster_path ??
                null;

            if (
                !Number.isInteger(movieId) ||
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
                )
            ) {
                return res.status(400).json({
                    error: "Valid movie details are required"
                });
            }

            await pool.execute(
                `INSERT INTO watched_movies
                    (user_id, tmdb_movie_id, movie_title, poster_path)
                 VALUES (?, ?, ?, ?)`,
                [userId, movieId, title.trim(), posterPath]
            );

            res.status(201).json({
                message: "Movie added to your watched log",
                movieId,
                title: title.trim(),
                posterPath
            });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    error: "This movie is already in your watched log"
                });
            }

            console.error("Add watched movie error:", error.message);

            res.status(500).json({
                error: "Failed to add movie to watched log"
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

            if (!Number.isInteger(movieId) || movieId <= 0) {
                return res.status(400).json({
                    error: "Invalid movie ID"
                });
            }

            const [result] = await pool.execute(
                `DELETE FROM watched_movies
                 WHERE user_id = ? AND tmdb_movie_id = ?`,
                [req.user.id, movieId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Movie not found in your watched log"
                });
            }

            res.json({
                message: "Movie removed from your watched log"
            });
        } catch (error) {
            console.error("Remove watched movie error:", error.message);

            res.status(500).json({
                error: "Failed to remove movie from watched log"
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
                     movie_title AS title,
                     poster_path AS posterPath,
                     journal_text AS journalText,
                     created_at AS createdAt,
                     updated_at AS updatedAt
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

             const validMovieId = Number(movieId);

             if (
                 !Number.isSafeInteger(validMovieId) ||
                 validMovieId <= 0 ||
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
                     error: "Provide valid movie details and a journal entry of up to 10,000 characters"
                 });
             }

             await pool.execute(
                 `INSERT INTO movie_journal
                     (user_id, tmdb_movie_id, movie_title,
                      poster_path, journal_text)
                  VALUES (?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE
                     movie_title = VALUES(movie_title),
                     poster_path = VALUES(poster_path),
                     journal_text = VALUES(journal_text)`,
                 [
                     req.user.id,
                     validMovieId,
                     title.trim(),
                     posterPath || null,
                     journalText.trim()
                 ]
             );

             res.json({
                 message: "Journal entry saved successfully"
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

             if (!Number.isSafeInteger(movieId) || movieId <= 0) {
                 return res.status(400).json({
                     error: "Invalid movie ID"
                 });
             }

             const [result] = await pool.execute(
                 `DELETE FROM movie_journal
                  WHERE user_id = ? AND tmdb_movie_id = ?`,
                 [req.user.id, movieId]
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
// MOVIE RATINGS
// =========================

app.get("/api/ratings/:movieId", async (req, res) => {
    try {
        const movieId = Number(req.params.movieId);

        if (!Number.isInteger(movieId) || movieId <= 0) {
            return res.status(400).json({
                error: "Invalid movie ID"
            });
        }

        const [rows] = await pool.execute(
            `SELECT AVG(rating) AS averageRating,
                    COUNT(*) AS totalRatings
             FROM movie_ratings
             WHERE tmdb_movie_id = ?`,
            [movieId]
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

            if (!Number.isInteger(movieId) || movieId <= 0) {
                return res.status(400).json({
                    error: "Invalid movie ID"
                });
            }

            const [rows] = await pool.execute(
                `SELECT rating
                 FROM movie_ratings
                 WHERE user_id = ? AND tmdb_movie_id = ?`,
                [req.user.id, movieId]
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

        if (
            !Number.isInteger(movieId) ||
            movieId <= 0 ||
            !Number.isFinite(rating) ||
            rating < 1 ||
            rating > 10
        ) {
            return res.status(400).json({
                error: "Movie ID and a rating from 1 to 10 are required"
            });
        }

        await pool.execute(
            `INSERT INTO movie_ratings
                (user_id, tmdb_movie_id, rating)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [req.user.id, movieId, rating]
        );

        res.json({
            message: "Rating saved",
            movieId,
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
// COMMUNITY REVIEWS
// =========================

app.get("/api/reviews/:movieId", async (req, res) => {
    try {
        const movieId = Number(req.params.movieId);

        if (!Number.isInteger(movieId) || movieId <= 0) {
            return res.status(400).json({
                error: "Invalid movie ID"
            });
        }

        const [reviews] = await pool.execute(
            `SELECT
                r.id,
                r.user_id AS userId,
                r.tmdb_movie_id AS movieId,
                r.review_text AS reviewText,
                r.created_at AS createdAt,
                r.updated_at AS updatedAt,
                u.username
             FROM movie_reviews r
             JOIN users u ON u.id = r.user_id
             WHERE r.tmdb_movie_id = ?
             ORDER BY r.updated_at DESC`,
            [movieId]
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

        if (
            !Number.isInteger(movieId) ||
            movieId <= 0 ||
            typeof reviewText !== "string" ||
            !reviewText.trim()
        ) {
            return res.status(400).json({
                error: "Movie ID and review text are required"
            });
        }

        await pool.execute(
            `INSERT INTO movie_reviews
                (user_id, tmdb_movie_id, review_text)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                review_text = VALUES(review_text),
                updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, movieId, reviewText.trim()]
        );

        res.json({
            message: "Review saved successfully"
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

            if (!Number.isInteger(reviewId) || reviewId <= 0) {
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

         // Test the database connection
         await pool.query("SELECT 1");

         // Create the journal table if it doesn't exist
         await pool.query(`
             CREATE TABLE IF NOT EXISTS movie_journal (
                 id INT AUTO_INCREMENT PRIMARY KEY,
                 user_id INT NOT NULL,
                 tmdb_movie_id INT NOT NULL,
                 movie_title VARCHAR(255) NOT NULL,
                 poster_path VARCHAR(255),
                 journal_text TEXT NOT NULL,
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,
                 UNIQUE KEY unique_user_movie
                     (user_id, tmdb_movie_id)
             )
         `);

         // Start accepting requests
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
