import { Hono } from 'hono'
import type { ActiveResponse, Env, UserInfo } from '../type'
import { AwsClient } from 'aws4fetch'

const app = new Hono<{ Bindings: Env }>()

const generatePresignedUrl = async (path: string, env: Env): Promise<string> => {
    if (!path) return ''
    if (path.startsWith('http')) return path

    const filePath = path.startsWith('/') ? path.substring(1) : path
    const s3Url = `https://${env.B2_BUCKET_NAME}.${env.B2_ENDPOINT}/${filePath}`

    try {
      const aws = new AwsClient({
        accessKeyId: env.B2_KEY_ID,
        secretAccessKey: env.B2_APPLICATION_KEY,
        service: 's3',
        region: 'us-west-004',
      })

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

app.get('/list', async (c) => {
    const db = c.env.DB
    try {
        const results = await db.prepare('SELECT * FROM active').all()
        if (!results || results.results.length === 0) {
            return c.json({ message: '没有活动' }, 404)
        }

        const response: ActiveResponse[] = []
        for (const item of results.results) {
            if(!item){
                return c.json({ message: '活动不存在' }, 404)
            }
            const author = await db.prepare('SELECT * FROM users WHERE id = ?').bind(item.organizerId).first()
            if (!author) {
                return c.json({ message: '活动组织者不存在' }, 404)
            }
            const authorInfo = {
                userId: author.id as number,
                username: author.username as string,
                avatar: author.avatar as string,
                bio: author.bio as string,
                organization: author.organization as string,
                updatedAt: author.updatedAt as string,
                permissionLevel: author.permissionLevel as number,
                email: author.email as string,
            }
 
            if(author.avatar){
                author.avatar = await generatePresignedUrl(author.avatar as string, c.env)
            }else{
                return c.json({ message: '用户头像不存在' }, 404)
            }
            if(item.coverUrl){
                item.coverUrl = await generatePresignedUrl(item.coverUrl as string, c.env)
            }else{
                return c.json({ message: '活动封面不存在' }, 404)
            }

            response.push({
                author: authorInfo,
                title: item.title as string,
                content: item.content as string,
                abstract: item.abstract as string,
                createAt: item.createAt as string,
                coverUrl: item.coverUrl as string,
                likes: item.likes as number,
                comments: item.comments as number
            })
        }
        return c.json(response)
    } catch (error) {
        console.error('Failed to list users:', error)
        return c.json({ message: 'Failed to list users' }, 500)
    }
})

app.post('/set', async (c) => {
    const header = c.req.header('Content-Type')
    console.log('Content-Type header:', header)
    
    if (!header || typeof header !== 'string' || !header.includes('multipart/form-data')) {
      return c.json({ message: '不支持的内容类型，需要 multipart/form-data' }, 415)
    }
    const body = await c.req.parseBody()
    const file = body.file
    const organizerId = body.organizerId
    const title = body.title
    const content = body.content
    const abstract = body.abstract

    if (!(file instanceof File)) {
        return c.json({ message: '缺少封面文件' }, 400)
      }
      const aws = new AwsClient({
        accessKeyId: c.env.B2_KEY_ID,
        secretAccessKey: c.env.B2_APPLICATION_KEY,
        service: 's3',
        region: 'us-west-004',
      })
      const arrayBuffer = await file.arrayBuffer()
      // 上传封面到 B2
      const fileName = `active_${Date.now()}.${file.name.split('.').pop()}`
      const filePath = `activeCover/${fileName}`
      const uploadUrl = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/${filePath}`
      console.log('Uploading cover to:', uploadUrl)
    
      const uploadResponse = await aws.fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: arrayBuffer,
      })
      if(!uploadResponse.ok){
         return c.json({ message: '头像上传失败' }, 500)
      }
      
    const db = c.env.DB
    const createAt = new Date().toISOString()
    try {
        const result = await db.prepare('INSERT INTO active (organizerId, title, content, abstract, coverUrl, createAt, likes, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(organizerId, title, content, abstract, filePath, createAt, 0, 0).run()
        if (!result) {
            return c.json({ message: '创建活动失败' }, 500)
        }
        return c.json({ message: '创建活动成功' }, 200)
    } catch (error) {
        console.error('Failed to create activity:', error)
        return c.json({ message: 'Failed to create activity' }, 500)
    }
})

app.get('/getActivity', async (c) => {
    const { id } = await c.req.json<{ id: number }>()
    const db = c.env.DB
    let authorInfo = {}
    try {
        const result = await db.prepare('SELECT * FROM active WHERE id = ?').bind(id).first()
        if (!result) {
            return c.json({ message: '活动不存在' }, 404)
        }
        if(result.coverUrl){
            result.coverUrl = await generatePresignedUrl(result.coverUrl as string, c.env)
        }else{
            return c.json({ message: '活动封面不存在' }, 404)
        }
        if(result.organizerId){
            const author = await db.prepare('SELECT * FROM users WHERE id = ?').bind(result.organizerId).first()
            if (!author) {
                return c.json({ message: '活动组织者不存在' }, 404)
            }
            if(author.avatar){
                author.avatar = await generatePresignedUrl(author.avatar as string, c.env)
                authorInfo = {
                    userId: author.id as number,
                    username: author.username as string,
                    avatar: author.avatar as string,
                    bio: author.bio as string,
                    organization: author.organization as string,
                    updatedAt: author.updatedAt as string,
                    permissionLevel: author.permissionLevel as number,
                    email: author.email as string
                }
            }else{
                return c.json({ message: '用户头像不存在' }, 404)
            }
        }
     
        const active:ActiveResponse = {
  
            author: authorInfo as UserInfo,
            title: result.title as string,
            content: result.content as string,
            abstract: result.abstract as string,
            coverUrl: result.coverUrl as string,
            createAt: result.createAt as string,
            likes: result.likes as number,
            comments: result.comments as number
        }
        return c.json(active, 200)
    } catch (error) {
        console.error('Failed to get activity:', error)
        return c.json({ message: 'Failed to get activity' }, 500)
    }
})

app.delete('/delete', async (c) => {
    const { id } = await c.req.json<{ id: number }>()
    const db = c.env.DB
    try {
        const result = await db.prepare('DELETE FROM active WHERE id = ?').bind(id).run()
        if (!result) {
            return c.json({ message: '删除活动失败' }, 500)
        }
        return c.json({ message: '删除活动成功' }, 200)
    } catch (error) {
        console.error('Failed to delete activity:', error)
        return c.json({ message: 'Failed to delete activity' }, 500)
    }
})

app.post('/update', async (c) => {
    const header = c.req.header('Content-Type')
    console.log('Content-Type header:', header)
    
    if (!header || typeof header !== 'string' || !header.includes('multipart/form-data')) {
      return c.json({ message: '不支持的内容类型，需要 multipart/form-data' }, 415)
    }
    const body = await c.req.parseBody()
    const activityId = body.activityId
    const file = body.file
    const organizerId = body.organizerId
    const title = body.title
    const content = body.content
    const abstract = body.abstract

    if (!(file instanceof File)) {
        return c.json({ message: '缺少封面文件' }, 400)
      }
      const aws = new AwsClient({
        accessKeyId: c.env.B2_KEY_ID,
        secretAccessKey: c.env.B2_APPLICATION_KEY,
        service: 's3',
        region: 'us-west-004',
      })
      const arrayBuffer = await file.arrayBuffer()
      // 上传封面到 B2
      const db = c.env.DB
      const coverUrlResult = await db.prepare('SELECT coverUrl FROM active WHERE id = ?').bind(activityId).first()
      if(!coverUrlResult){
        return c.json({ message: '活动不存在' }, 404)
      }
      const filePath = `activeCover/${coverUrlResult.coverUrl as string}`
      const uploadUrl = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/${filePath}`
      console.log('Uploading cover to:', uploadUrl)
    
      const uploadResponse = await aws.fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: arrayBuffer,
      })
      if(!uploadResponse.ok){
         return c.json({ message: '封面上传失败' }, 500)
      }
      

    const createAt = new Date().toISOString()
    try {
        const result = await db.prepare('UPDATE active SET organizerId = ?, title = ?, content = ?, abstract = ?, coverUrl = ?, createAt = ? WHERE id = ?').bind(organizerId, title, content, abstract, filePath, createAt, activityId).run()
        if (!result) {
            return c.json({ message: '更新活动失败' }, 500)
        }
        return c.json({ message: '更新活动成功' }, 200)
    } catch (error) {
        console.error('Failed to update activity:', error)
        return c.json({ message: 'Failed to update activity' }, 500)
    }
})

export { app }