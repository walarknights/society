import { Hono } from "Hono";
import type { Env,orgToken,UserInfo } from "../type";
import { AwsClient } from 'aws4fetch';
const app = new Hono<{ Bindings: Env }>();

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

app.get('getTokens',async(c) => {
    const db = c.env.DB;
    const orgToken = await db
      .prepare('SELECT * FROM orgTokens')
      .all()
    const results: orgToken[] = []
    for(const item of orgToken.results){
      const user = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(item.createBy)
        .first()
      if (user) {
        if(user.avatar){
            user.avatar = await generatePresignedUrl(user.avatar as string, c.env)
        }
        const userInfo: UserInfo = {
          userId: user.id as number,
          username: user.username as string,
          avatar: user.avatar as string,
          bio: user.bio as string,
          organization: user.organization as string,
          updatedAt: user.updatedAt as string,
          permissionLevel: user.permissionLevel as number,
          email: user.email as string,
        }
        results.push({
          tokenCode: item.tokenCode as string,
          targetOrgName: item.targetOrgName as string,
          createBy: userInfo,
          isActive: item.isActive as boolean,

        })
      }
    }
    return c.json(results ?? [])
  })

app.post('/addTokens', async (c) => {
try {

    const payload = await c.req.json<{ code: string, orgName: string, adminId: number }>()
    const { code, orgName, adminId } = payload
    if (!code || !orgName) {
    return c.json({ message: '口令与组织名不能为空' }, 400)
    }

    const db = c.env.DB
    const result = await db.prepare(
    'INSERT INTO orgTokens (tokenCode, targetOrgName, createBy, isActive) VALUES (?, ?, ?, ?)'
    ).bind(code, orgName, adminId, true).run()

    if (result.success) {
    return c.json({ message: '创建成功' })
    }
    return c.json({ message: '创建失败' }, 500)
} catch (e) {
    console.error(e)
    return c.json({ message: '服务器错误', error: String(e) }, 500)
}
})

app.delete('/tokens/:id', async (c) => {
try {
    const id = c.req.param('id')
    const db = c.env.DB
    const result = await db.prepare(
    'DELETE FROM orgTokens WHERE id = ?'
    ).bind(id).run()

    if (result.success) {
    return c.json({ message: '删除成功' })
    }
    return c.json({ message: '删除失败' }, 500)  
} catch (e) {
    console.error(e)
    return c.json({ message: '服务器错误', error: String(e) }, 500)
}
})