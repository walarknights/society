CREATE TABLE article (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    authorId TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    likes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    coverUrl TEXT,
    FOREIGN KEY (authorId) REFERENCES users(id)
);
