-- 建表语句
CREATE TABLE favorites (
    userId TEXT NOT NULL,
    articleId TEXT NOT NULL,
    PRIMARY KEY (userId, articleId),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (articleId) REFERENCES articles(id)
);

