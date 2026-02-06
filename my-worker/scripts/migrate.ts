import { neon } from '@neondatabase/serverless'

// 从环境变量获取数据库连接字符串
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('错误: 未设置 DATABASE_URL 环境变量')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function migrate() {
  try {
    console.log('开始数据库迁移...')

    // 创建 user 表
    await sql`
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    console.log('✓ user 表创建成功')

    // 创建 article 表
    await sql`
      CREATE TABLE IF NOT EXISTS article (
        id BIGINT PRIMARY KEY,
        authorId INTEGER NOT NULL,
        content TEXT NOT NULL,
        title VARCHAR(500) NOT NULL,
        category VARCHAR(100),
        summary TEXT,
        date VARCHAR(50),
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        coverUrl TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (authorId) REFERENCES "user"(id)
      )
    `
    console.log('✓ article 表创建成功')

    // 创建索引
    await sql`
      CREATE INDEX IF NOT EXISTS idx_article_authorId ON article(authorId)
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_article_id_desc ON article(id DESC)
    `
    console.log('✓ 索引创建成功')

    console.log('数据库迁移完成！')
  } catch (error) {
    console.error('迁移失败:', error)
    process.exit(1)
  }
}

migrate()
