import { Hono } from 'hono'
import { AwsClient } from 'aws4fetch'
import type { Env } from '../type'

const app = new Hono<{ Bindings: Env }>()
const generatePresignedUrl = async (path: string, env: Env): Promise<string> => {
    if (!path) return ''
    if (path.startsWith('http')) return path
  
    try {
      const aws = new AwsClient({
        accessKeyId: env.B2_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
        service: 's3',
        region: 'us-west-004',
      })
  
      const filePath = path.startsWith('/') ? path.substring(1) : path
      const s3Url = `https://${env.B2_BUCKET_NAME}.${env.B2_ENDPOINT}/${filePath}`
  
      const signedRequest = await aws.sign(s3Url, {
        method: 'GET',
        aws: { signQuery: true },
      })
      return signedRequest.url
    } catch (error) {
      console.error('Failed to generate signed URL:', error)
      const filePath = path.startsWith('/') ? path.substring(1) : path
      return `https://${env.B2_BUCKET_NAME}.${env.B2_ENDPOINT}/${filePath}`
    }
  }
  
// 发布文章
app.post('/setArticle', async (c) => {
    console.log('=== Set article request received ===')
    try {
      const header = c.req.header('Content-Type')
      console.log('Content-Type header:', header)
      
      if (!header || typeof header !== 'string' || !header.includes('multipart/form-data')) {
        return c.json({ message: '不支持的内容类型，需要 multipart/form-data' }, 415)
      }
      const body = await c.req.parseBody()
      const authorId = body.authorId ? Number(body.authorId) : null
      const title = body.title as string
      const summary = body.summary as string
      const content = body.content as string
      const date = body.date as string
      const category = body.category as string


      const file = body.file

      if (!authorId || !title) {
        return c.json({ message: '无效的请求参数' }, 400)
      }
  
      if (!(file instanceof File)) {
        return c.json({ message: '缺少封面文件' }, 400)
      }
  
      const db = c.env.DB
      if (!db) {
        return c.json({ message: '数据库连接失败' }, 500)
      }
      const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(authorId).first()
      if (!user) {
        return c.json({ message: '用户Id错误' }, 401)
      }
      const aws = new AwsClient({
        accessKeyId: c.env.B2_KEY_ID,
        secretAccessKey: c.env.B2_APPLICATION_KEY,
        service: 's3',
        region: 'us-west-004',
      })
      const arrayBuffer = await file.arrayBuffer()
      // 上传封面到 B2
      const fileName = `cover_${Date.now()}.${file.name.split('.').pop()}`
      const filePath = `articleCover/${fileName}`
      const uploadUrl = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/${filePath}`
      console.log('Uploading cover to:', uploadUrl)
      
      const uploadResponse = await aws.fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: arrayBuffer,
      })
      
      if (!uploadResponse.ok) {
        return c.json({ message: '封面上传失败' }, 500)
      }
  
      // 根据 date 生成随机时间戳作为主键 id
      const baseTimestamp = date ? new Date(date).getTime() : Date.now()
      const randomOffset = Math.floor(Math.random() * 1000) // 添加 0-999 的随机偏移
      const articleId = baseTimestamp + randomOffset
  
      // 插入文章记录
      const articleResult = await db
        .prepare(
          'INSERT INTO article (id, authorId, content, title, category, summary, date, likes, views, coverUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(articleId, authorId, content, title, category, summary, date, 0, 0, filePath)
        .run()
  
      if (articleResult.success) {
        return c.json({ message: '发布成功' }, 200)
      }
      return c.json({ message: '发布失败' }, 500)
    } catch (error) {
      console.error('SetArticle error:', error)
      return c.json({ message: '服务器内部错误', error: String(error) }, 500)
    }
  })


app.post('/editArticle', async (c) => {
    console.log('=== Edit article request received ===')
    try {
      const header = c.req.header('Content-Type')
      if (!header || typeof header !== 'string' || !header.includes('multipart/form-data')) {
        return c.json({ message: '不支持的内容类型，需要 multipart/form-data' }, 415)
      }

      const body = await c.req.parseBody()
      const articleId = body.articleId
      const permissionLevel = body.permissionLevel
      const authorId = body.authorId ? Number(body.authorId) : null

      if (!articleId || !authorId) {
        return c.json({ message: '无效的请求参数' }, 400)
      }

      const db = c.env.DB
      if (!db) {
        return c.json({ message: '数据库连接失败' }, 500)
      }

      const exists = await db.prepare('SELECT id FROM article WHERE id = ?')
        .bind(articleId)
        .first()
      if (!exists) {
        return c.json({ message: '文章不存在' }, 403)
      }
      const allow1 = await db.prepare('SELECT id FROM article WHERE id = ? AND authorId = ?')
      .bind(articleId, authorId )
      .first()
      if (!allow1 || permissionLevel !== 'admin') {
        return c.json({ message: '无权修改' }, 403)
      }
      const updates: string[] = []
      const values: any[] = []

      if (body.title) {
        updates.push('title = ?')
        values.push(body.title)
      }
      if (body.summary) {
        updates.push('summary = ?')
        values.push(body.summary)
      }
      if (body.content) {
        updates.push('content = ?')
        values.push(body.content)
      }
      if (body.category) {
        updates.push('category = ?')
        values.push(body.category)
      }

      const file = body.file
      if (file instanceof File) {
        const aws = new AwsClient({
          accessKeyId: c.env.B2_KEY_ID,
          secretAccessKey: c.env.B2_APPLICATION_KEY,
          service: 's3',
          region: 'us-west-004',
        })
        const arrayBuffer = await file.arrayBuffer()
        const res = await db.prepare('SELECT coverUrl FROM article WHERE id = ?').bind(articleId).first()
        if(!res) {
          return c.json({ message: '文章不存在' }, 404)
        }
        let fileName = `cover_${Date.now()}.${file.name.split('.').pop()}`
        if (res.coverUrl) {
          fileName = res.coverUrl as string
        }
        const filePath = `articleCover/${fileName}`
        const uploadUrl = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/${filePath}`
        
        const uploadResponse = await aws.fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
          },
          body: arrayBuffer,
        })
        
        if (uploadResponse.ok) {
           updates.push('coverUrl = ?')
           values.push(filePath)
        } else {
           console.error('Failed to upload new cover')
        }
      }

      if (updates.length === 0) {
          return c.json({ message: '没有需要更新的内容' }, 200)
      }

      values.push(articleId)
      const query = `UPDATE article SET ${updates.join(', ')} WHERE id = ?`
      
      const result = await db.prepare(query)
        .bind(...values)
        .run()

      if (result.success) {
        return c.json({ message: '更新成功' }, 200)
      }
      return c.json({ message: '更新失败' }, 500)

    } catch (error) {
       console.error('EditArticle error:', error)
       return c.json({ message: '服务器内部错误', error: String(error) }, 500)
    }
})

app.post('/deleteArticle', async (c) => {
try {
  const articleId = await c.req.json<{ articleId: number }>()
  if (!articleId) {
    return c.json({ message: '缺少文章ID' }, 400)
  }

  const db = c.env.DB
  if (!db) {
    return c.json({ message: '数据库连接失败' }, 500)
  }

  const exists = await db.prepare('SELECT id FROM article WHERE id = ?')
    .bind(articleId)
    .first()
  if (!exists) {
    return c.json({ message: '文章不存在' }, 403)
  }

  const result = await db.prepare('DELETE FROM article WHERE id = ?')
    .bind(articleId)
    .run()

  if (result.success) {
    return c.json({ message: '删除成功' }, 200)
  }
  return c.json({ message: '删除失败' }, 500)

}catch (error) {
  console.error('DeleteArticle error:', error)
  return c.json({ message: '请求格式错误，需要 JSON 格式', error: String(error) }, 400)
}
})

// 获取文章列表
app.get('/list', async (c) => {
  const db = c.env.DB
  if (!db) {
    console.error('Database connection failed')
    return c.json({ message: '数据库连接失败' }, 500)
  } else {
    console.log('Database connection successful')
  }
  try {
    const { results } = await db
      .prepare(
        'SELECT id, authorId, title, content, category, summary, date, likes, views, coverUrl FROM article ORDER BY date DESC LIMIT 10',
      )
      .all()
    if (!results || results.length === 0) {
      console.log('No articles found')

      return c.json({ message: '暂无文章' }, 200)
    }
    const articles = []
    for (const article of results) {
      const author = await db
        .prepare(
          'SELECT username, avatarUrl FROM users WHERE id = ?',
        )
        .bind(article.authorId)
        .first()
      if (!author) {
        console.log(
          `Author not found for article ${article.id as string}, authorId: ${article.authorId as string}`,
        )
        return c.json({ message: '未找到对应作者' }, 404)
      }
      let coverUrl = article.coverUrl as string
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = await generatePresignedUrl(coverUrl, c.env)
        article.coverUrl = coverUrl
      }

      let avatar = author?.avatarUrl as string
      if (avatar && !avatar.startsWith('http')) {
        avatar = await generatePresignedUrl(avatar, c.env)
        author.avatarUrl = avatar
      }

      articles.push({
        ...article,
        author: { ...author },
      })
    }
    return c.json(articles, 202)
  } catch (error) {
    console.error('GetArticleList error:', error)
    return c.json({ message: '服务器内部错误' }, 500)
  }
})


app.get('/specific/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ message: '缺少文章id' }, 400)

  const db = c.env.DB
  try {
    const article = await db
      .prepare(
        'SELECT id, authorId, content, title, category, summary, likes, views, coverUrl,date FROM article WHERE id = ?',
      )
      .bind(id)
      .first()

    if (!article) {
      return c.json({ message: '未找到对应文章' }, 404)
    }

    const author = await db
      .prepare('SELECT username, avatarUrl FROM users WHERE id = ?')
      .bind(article.authorId)
      .first()

  if (!author) {
      console.log(`Author not found for article ${article.id as string}, authorId: ${article.authorId as string}`)
      return c.json({ message: '未找到对应作者' }, 404)
  }
    let coverUrl = '' as string
    if (article.coverUrl === null) {
      coverUrl = ''
    } else {
      coverUrl = article.coverUrl as string
    }

    if (coverUrl) {
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = await generatePresignedUrl(coverUrl, c.env)
        article.coverUrl = coverUrl
      }
    }

    let avatar = author?.avatarUrl as string
    if (avatar && !avatar.startsWith('http')) {
      avatar = await generatePresignedUrl(avatar, c.env)
      author.avatarUrl = avatar
    }

    return c.json({
      ...article,
      author: {
        ...author,
      },
    })
  } catch (error) {
    console.error('GetArticle error:', error)
    return c.json({ message: '服务器内部错误' }, 500)
  }
})
app.post('/addView', async (c) => {
  const body = await c.req.parseBody()
  const articleId = body.articleId
  if (!articleId) {
    return c.json({ message: '缺少文章ID' }, 400)
  }

  const db = c.env.DB
  try {
    const result = await db
      .prepare('UPDATE article SET views = views + 1 WHERE id = ?')
      .bind(articleId)
      .run()

    if (!result.success) {
      return c.json({ message: '未找到对应文章' }, 404)
    }

    return c.json({ message: '阅读量增加成功' }, 200)
  } catch (error) {
    console.error('AddView error:', error)
    return c.json({ message: '服务器内部错误' }, 500)
  }
})

app.post('/addLike', async (c) => {
  const body = await c.req.parseBody()
  const articleId = body.articleId
  if (!articleId) {
    return c.json({ message: '缺少文章ID' }, 400)
  }

  const db = c.env.DB
  try {
    const result = await db
      .prepare('UPDATE article SET likes = likes + 1 WHERE id = ?')
      .bind(articleId)
      .run()

    if (!result.success) {
      return c.json({ message: '未找到对应文章' }, 404)
    }

    return c.json({ message: '点赞成功' }, 200)
  } catch (error) {
    console.error('AddLike error:', error)
    return c.json({ message: '服务器内部错误' }, 500)
  }
})

app.post('/test', async (c) => {
   const db = c.env.DB
   if (!db) {
     return c.json({ message: '数据库连接失败' }, 500)
   }
   return c.json({ message: 'Test route working' })
})

export default app