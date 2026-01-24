CREATE TABLE user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT '/usersInfo/avatar/user_0.png',
    dynamicNum INTEGER DEFAULT 0,
    permissionLevel INTEGER DEFAULT 0
)
