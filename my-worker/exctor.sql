

CREATE TABLE active (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organizerId TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    abstract TEXT NOT NULL,
    createAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    coverUrl TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    FOREIGN KEY (organizerId) REFERENCES users(id)
);