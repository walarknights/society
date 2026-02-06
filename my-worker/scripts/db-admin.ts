import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('错误: 未设置 DATABASE_URL 环境变量')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// 查询所有用户
async function listUsers() {
  console.log('\n=== 用户列表 ===')
  const users = await sql`SELECT * FROM "user" ORDER BY id`
  console.table(users)
  return users
}

// 查询所有文章
async function listArticles() {
  console.log('\n=== 文章列表 ===')
  const articles = await sql`
    SELECT 
      a.id, 
      a.title, 
      a.authorId, 
      u.username as author_name,
      a.category,
      a.likes,
      a.views,
      a.created_at
    FROM article a
    LEFT JOIN "user" u ON a.authorId = u.id
    ORDER BY a.id DESC
  `
  console.table(articles)
  return articles
}

// 根据ID查询文章详情
async function getArticle(id: number) {
  console.log(`\n=== 文章详情 (ID: ${id}) ===`)
  const article = await sql`
    SELECT 
      a.*,
      u.username as author_name,
      u.avatar as author_avatar
    FROM article a
    LEFT JOIN "user" u ON a.authorId = u.id
    WHERE a.id = ${id}
  `
  console.log(article[0] || '未找到文章')
  return article[0]
}

// 根据ID删除文章
async function deleteArticle(id: number) {
  console.log(`\n=== 删除文章 (ID: ${id}) ===`)
  const result = await sql`DELETE FROM article WHERE id = ${id}`
  console.log(`删除成功，影响行数: ${result.length}`)
  return result
}

// 根据ID删除用户
async function deleteUser(id: number) {
  console.log(`\n=== 删除用户 (ID: ${id}) ===`)
  try {
    // 先删除该用户的所有文章
    await sql`DELETE FROM article WHERE authorId = ${id}`
    // 再删除用户
    const result = await sql`DELETE FROM "user" WHERE id = ${id}`
    console.log(`删除成功，影响行数: ${result.length}`)
    return result
  } catch (error) {
    console.error('删除失败:', error)
    throw error
  }
}

// 创建用户
async function createUser(username: string, avatar?: string) {
  console.log(`\n=== 创建用户: ${username} ===`)
  const result = await sql`
    INSERT INTO "user" (username, avatar)
    VALUES (${username}, ${avatar || null})
    RETURNING *
  `
  console.log('创建成功:', result[0])
  return result[0]
}

// 清空所有数据
async function clearAllData() {
  console.log('\n=== 清空所有数据 ===')
  await sql`DELETE FROM article`
  await sql`DELETE FROM "user"`
  console.log('✓ 所有数据已清空')
}

// 执行自定义SQL
async function executeSQL(query: string) {
  console.log(`\n=== 执行SQL ===\n${query}`)
  try {
    // 使用 neonConfig 或直接使用 Pool 来执行原始 SQL
    const { Pool } = await import('@neondatabase/serverless')
    const pool = new Pool({ connectionString: DATABASE_URL })
    const result = await pool.query(query)
    console.log('执行结果:')
    console.table(result.rows)
    await pool.end()
    return result.rows
  } catch (error) {
    console.error('执行失败:', error)
    throw error
  }
}

// 统计信息
async function getStats() {
  console.log('\n=== 数据统计 ===')
  const userCount = await sql`SELECT COUNT(*) as count FROM "user"`
  const articleCount = await sql`SELECT COUNT(*) as count FROM article`
  const totalLikes = await sql`SELECT SUM(likes) as total FROM article`
  const totalViews = await sql`SELECT SUM(views) as total FROM article`
  
  console.log({
    用户总数: userCount[0].count,
    文章总数: articleCount[0].count,
    总点赞数: totalLikes[0].total || 0,
    总浏览量: totalViews[0].total || 0,
  })
}

// 主函数 - 解析命令行参数
async function main() {
  const command = process.argv[2]
  const arg1 = process.argv[3]
  const arg2 = process.argv[4]

  try {
    switch (command) {
      case 'list-users':
        await listUsers()
        break
      
      case 'list-articles':
        await listArticles()
        break
      
      case 'get-article':
        if (!arg1) {
          console.error('请提供文章ID')
          process.exit(1)
        }
        await getArticle(Number(arg1))
        break
      
      case 'delete-article':
        if (!arg1) {
          console.error('请提供文章ID')
          process.exit(1)
        }
        await deleteArticle(Number(arg1))
        break
      
      case 'delete-user':
        if (!arg1) {
          console.error('请提供用户ID')
          process.exit(1)
        }
        await deleteUser(Number(arg1))
        break
      
      case 'create-user':
        if (!arg1) {
          console.error('请提供用户名')
          process.exit(1)
        }
        await createUser(arg1, arg2)
        break
      
      case 'clear-all':
        await clearAllData()
        break
      
      case 'stats':
        await getStats()
        break
      
      case 'sql':
        if (!arg1) {
          console.error('请提供SQL语句')
          process.exit(1)
        }
        await executeSQL(arg1)
        break
      
      default:
        console.log(`
数据库管理工具使用说明：

查询操作:
  npm run db list-users              - 列出所有用户
  npm run db list-articles           - 列出所有文章
  npm run db get-article <id>        - 查询指定文章
  npm run db stats                   - 显示统计信息

删除操作:
  npm run db delete-article <id>     - 删除指定文章
  npm run db delete-user <id>        - 删除指定用户（及其文章）
  npm run db clear-all               - 清空所有数据

创建操作:
  npm run db create-user <username> [avatar]  - 创建用户

执行SQL:
  npm run db sql "SELECT * FROM article WHERE likes > 10"

示例:
  npm run db list-articles
  npm run db delete-article 1234567890
  npm run db create-user "张三" "https://example.com/avatar.jpg"
        `)
    }
  } catch (error) {
    console.error('操作失败:', error)
    process.exit(1)
  }
}

main()
