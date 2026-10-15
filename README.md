# 🎬 Abraham's Vault

**Discover movies. Explore stories. Build your watchlist.**

Abraham's Vault is a movie discovery web application that helps users explore films, view movie details, and keep track of movies they want to watch. The project combines a responsive web interface with a Node.js backend, MySQL database integration, and movie information from The Movie Database (TMDB) API.

🌐 **Live Website:** [https://abrahams-vault.onrender.com/](https://abrahams-vault.onrender.com/)
💻 **GitHub Repository:** [https://github.com/PThomas-01/abrahams-vault](https://github.com/PThomas-01/abrahams-vault)

## ✨ Features

- 🎥 **Movie Discovery** — Explore movies using data from the TMDB API.
- 🔍 **Movie Search** — Find movies and browse available collections.
- 🎞️ **Movie Details** — View movie information and available cast details.
- 🔐 **User Authentication** — Registration and login functionality.
- 📋 **Personal Watchlist** — Add and remove movies from your list.
- ⭐ **Ratings and Reviews** — Movie feedback functionality supported by the application.
- 📱 **Responsive Interface** — Browse the application on desktop and mobile devices.
- 🗄️ **Database Integration** — MySQL support for application data and backend features.

*Note: Feature availability on the live website depends on the deployed frontend, backend, database, and API configuration.*

🏠 Homepage
![alt text](homepage.png)

🎬 Movie Details
![alt text](movie-details.png)

🔐 Login Page
![alt text](loginpage.png)

📋 My Watchlist
![alt text](mywatchlist.png)


## 🛠️ Tech Stack

| Technology           | Purpose                                    |
| -------------------- | ------------------------------------------ |
| HTML5                | Web page structure                         |
| CSS3                 | Styling and responsive layouts             |
| JavaScript           | Frontend functionality                     |
| Node.js              | Backend runtime                            |
| Express.js           | Server and API routes                      |
| MySQL                | Relational database                        |
| MySQL2               | Node.js database connectivity              |
| bcrypt               | Password hashing                           |
| JSON Web Token (JWT) | Token-based authentication                 |
| TMDB API             | Movie information and metadata             |
| Render               | Web application hosting                    |
| Git and GitHub       | Version control and source code management |

## 📂 Project Structure

```text
abrahams-vault/
├── assets/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
├── screenshots/
├── index.html
├── login.html
├── signup.html
├── movie-details.html
├── movie-details.css
├── movie-details.js
├── my-list.html
├── navbar.js
├── script.js
├── style.css
├── watchlist.js
├── .gitignore
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- MySQL Server
- A TMDB API key
- A code editor such as Visual Studio Code
- Git

### 1. Clone the repository

```bash
git clone https://github.com/PThomas-01/abrahams-vault.git
cd abrahams-vault
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory. Use the environment variable names expected by `backend/server.js` and configure your local database credentials and API secrets.

Example configuration:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=abraham_vault

JWT_SECRET=your_secret_key
TMDB_API_KEY=your_tmdb_api_key
```

Replace the example values with your own configuration. Never commit real passwords, API keys, JWT secrets, or your `.env` file.

Create the required MySQL database and tables according to the application's database queries.

### 3. Start the backend

From the `backend` directory, run:

```bash
node server.js
```

The backend should start on the port configured in your environment, provided the dependencies, database, and configuration are correct.

### 4. Run the frontend

Open a second terminal in the project root and run:

```bash
npx serve . -l 62931
```

Open the local URL shown by the server, typically:

```text
http://localhost:62931/
```

Ensure the frontend API configuration points to the correct backend URL for authentication, watchlist, and other database-dependent features.

## 🔑 API Configuration

Abraham's Vault uses the TMDB API to retrieve movie information.

1. Visit [The Movie Database](https://www.themoviedb.org/).
2. Create an account and obtain the required API credentials.
3. Configure the API key according to the backend implementation.
4. Keep API credentials out of publicly committed source files.

## 🔒 Security

- Store secrets and database credentials in environment variables.
- Keep `.env` files out of version control.
- Hash user passwords rather than storing them as plain text.
- Protect authenticated routes and validate user input.
- Configure production environment variables securely.

## 🌱 Future Improvements

- Improve movie discovery with additional filters and sorting.
- Enhance cast and crew information on movie detail pages.
- Improve ratings and review experiences.
- Strengthen error handling and loading states.
- Expand mobile responsiveness and accessibility.
- Improve automated testing and production deployment.

##
