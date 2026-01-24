import { Hono } from 'hono'
import { AwsClient } from 'aws4fetch'
import { sign, verify } from 'hono/jwt'
import { Resend } from 'resend'
import type { Env,User } from '../type'

const app = new Hono<{ Bindings: Env }>()

// 验证码存储
const verificationCodes = new Map<string, { code: string; expires: number }>()

// 生成6位验证码
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

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
  
const checkPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  const hash = await hashPassword(password)
  return hash === hashedPassword
}

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// 发送验证码接口
app.post('/sendVeriCode', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ message: '无效的邮箱地址' }, 400)
    }

    if (!c.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY 未配置')
      return c.json({ message: '服务端未配置邮件服务' }, 500)
    }

    const code = generateVerificationCode()
    const expires = Date.now() + 5 * 60 * 1000
    verificationCodes.set(email, { code, expires })

    const resend = new Resend(c.env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send({
      from: 'Your App <noreply@scuigda.top>',
      to: email,
      subject: '邮箱验证码',
      html: `<h2>邮箱验证</h2><p>您的验证码：</p><h1>${code}</h1><p>5分钟内有效。</p>`,
    })

    if (error) {
      console.error('Resend send error:', error)
      return c.json({ message: '发送验证码失败', error: error.message ?? String(error) }, 500)
    }

    console.log('Email queued, id:', data?.id)
    return c.json({ message: '验证码已发送' })
  } catch (err) {
    console.error('Send verification code error:', err)
    return c.json({ message: '发送验证码失败', error: String(err) }, 500)
  }
})

// 验证验证码接口
app.post('/verifyCode', async (c) => {
  try {
    const { email, code } = await c.req.json<{ email: string; code: string }>()
    
    const stored = verificationCodes.get(email)
    
    if (!stored) {
      return c.json({ message: '验证码不存在或已过期' }, 400)
    }
    
    if (Date.now() > stored.expires) {
      verificationCodes.delete(email)
      return c.json({ message: '验证码已过期' }, 400)
    }
    
    if (stored.code !== code) {
      return c.json({ message: '验证码错误' }, 400)
    }
    
    // 验证成功,删除验证码
    verificationCodes.delete(email)
    
    return c.json({ message: '验证成功', valid: true })
  } catch (error) {
    console.error('Verify code error:', error)
    return c.json({ message: '验证失败', error: String(error) }, 500)
  }
})
  
app.get('/getInfo', async (c) => {
  const db = c.env.DB
  const payload = await c.req.json<{ id: number }>()
  const results = await db
    .prepare(
      'SELECT id, username, followers, followings, avatar, dynamicNum, permissionLevel FROM user WHERE id = ?',
    )
    .bind(payload.id)
    .first()
  return c.json(results ?? [])
})

app.post('/login', async (c) => {
  try {
    const payload = await c.req.json<{ password: string; email: string }>()
    if (!payload?.email || !payload?.password) {
      return c.json({ error: 'email and password are required' }, 400)
    }

    const db = c.env.DB
    if (!db) {
      console.error('Database not available in environment')
      return c.json({ message: '数据库连接失败' }, 500)
    }

    const result = await db
      .prepare('SELECT password FROM user WHERE email = ?')
      .bind(payload.email)
      .first()

    if (!result) {
      return c.json({ message: '不存在该用户' }, 401)
    }
    const hashedPassword = result.password as string
    if (!(await checkPassword(payload.password, hashedPassword))) {
      return c.json({ message: '密码错误' }, 401)
    }
    const userInfo = await db
      .prepare(
        'SELECT id, username, avatar, dynamicNum, permissionLevel, email FROM user WHERE email = ?',
      )
      .bind(payload.email)
      .first()

    if (!userInfo) {
      return c.json({ message: '获取用户信息失败' }, 500)
    }

    // 生成 S3 预签名 URL
    let avatar = userInfo.avatar as string

    // 如果有 avatar 路径，生成预签名 URL
    if (avatar) {
      try {
        avatar = await generatePresignedUrl(avatar, c.env)
      } catch (error) {
        console.error('Failed to generate signed URL:', error)
        // 如果签名失败，使用公开访问 URL
        const filePath = avatar.startsWith('/') ? avatar.substring(1) : avatar
        avatar = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/${filePath}`
      }
    } else {
      // 如果没有 avatar，使用默认头像
      avatar = '/userInfo/avatar/user_0.png'
      try {
        const aws = new AwsClient({
          accessKeyId: c.env.B2_KEY_ID,
          secretAccessKey: c.env.B2_APPLICATION_KEY,
          service: 's3',
          region: 'us-west-004',
        })

        const s3Url = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/userInfo/avatar/user_0.png`
        const signedRequest = await aws.sign(s3Url, {
          method: 'GET',
          aws: {
            signQuery: true,
          },
        })

        avatar = signedRequest.url.toString()
      } catch (error) {
        console.error('Failed to generate default avatar signed URL:', error)
        avatar = `https://${c.env.B2_BUCKET_NAME}.${c.env.B2_ENDPOINT}/userInfo/avatar/user_0.png`
      }
    }

    userInfo.avatar = avatar
    const userResponse: User = {
      userId: userInfo.id as number,
      username: userInfo.username as string,
      avatar: (userInfo.avatar as string) || '/userInfo/avatar/user_0.png',
      dynamicNum: (userInfo.dynamicNum as number) || 0,
      permissionLevel: (userInfo.permissionLevel as number) || 0,
      email: (userInfo.email as string) || '',
      isLogin: true,
    }

    const token = await sign(
      {
        userId: userResponse.userId,
        username: userResponse.username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      c.env.JWT_SECRET,
    )

    return c.json({ userResponse, token })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ message: '服务器错误', error: String(error) }, 500)
  }
})

app.post('/verifyToken', async (c) => {
  try {
    const payload = await c.req.json<{ token: string }>()
    if (!payload?.token) {
      return c.json({ valid: false, message: 'Token is required' }, 400)
    }

    const decoded = await verify(payload.token, c.env.JWT_SECRET, 'HS256') 

    const db = c.env.DB
    const userInfo = await db
      .prepare(
        'SELECT id, username, avatar, dynamicNum, permissionLevel,email FROM user WHERE id = ?',
      )
      .bind(decoded.userId)
      .first()

    if (!userInfo) {
      return c.json({ valid: false, message: 'User not found' }, 404)
    }

    let avatar = userInfo.avatar as string
    if (!avatar) {
      avatar = '/userInfo/avatar/user_0.png'
    }

    avatar = await generatePresignedUrl(avatar, c.env)

    const userResponse: User = {
      userId: userInfo.id as number,
      username: userInfo.username as string,
      avatar: avatar,
      dynamicNum: (userInfo.dynamicNum as number) || 0,
      permissionLevel: (userInfo.permissionLevel as number) || 0,
      email: (userInfo.email as string) || '',
      isLogin: true,
    }

    return c.json({ valid: true, userResponse })
  } catch (error) {
    console.error('Verify Token error:', error)
    return c.json({ valid: false, message: '无效的 Token 或验证失败', error: String(error) }, 401)
  }
})

app.post('/setUser', async (c) => {
  console.log('SetUser called');
  
  try {
    // 解析请求体
    let payload: { username: string; password: string; email:string, verificationCode: string } | null = null

    try {
      payload = await c.req.json<{ username: string; password: string; email: string, verificationCode: string }>()
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return c.json({ message: '请求格式错误，需要 JSON 格式', error: String(parseError) }, 400)
    }

    if (!payload?.username || !payload?.password || !payload?.email || !payload?.verificationCode) {
      return c.json({ message: 'username , password , email , verificationCode 是必填项' }, 400)
    }

    const db = c.env.DB
    if (!db) {
      console.error('Database not available in environment')
      return c.json({ message: '数据库连接失败' }, 500)
    }

    // 检查邮箱是否已存在
    const existingUser = await db
      .prepare('SELECT id FROM user WHERE email = ?')
      .bind(payload.email)
      .first()

    if (existingUser) {
      return c.json({ message: '邮箱已存在' }, 409)
    }
    // 验证验证码
    const stored = verificationCodes.get(payload.email)
    if (!stored || stored.code !== payload.verificationCode || Date.now() > stored.expires) {
      return c.json({ message: '无效或过期的验证码' }, 400)
    }

    // 插入新用户
    const insertResult = await db
      .prepare(
        'INSERT INTO user (username, password, avatar, dynamicNum, permissionLevel, email) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(
        payload.username,
        await hashPassword(payload.password),
        '/userInfo/avatar/user_0.png',
        0,
        0,
        payload.email
      )
      .run()

    if (!insertResult.success) {
      return c.json({ message: '用户创建失败' }, 500)
    }

    // 获取新创建的用户信息
    const result = await db
      .prepare('SELECT id FROM user WHERE email = ?')
      .bind(payload.email)
      .first()

    if (!result) {
      return c.json({ message: '用户创建失败' }, 500)
    }

    const userResponse: User = {
      userId: result.id as number,
      username: payload.username,
      avatar: '/userInfo/avatar/user_0.png',
      dynamicNum: 0,
      permissionLevel: 0,
      email: payload.email,
      isLogin: true,
    }

    const jwtToken = await sign(
      {
        userId: userResponse.userId,
        username: userResponse.username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
      },
      c.env.JWT_SECRET,
    )

    return c.json({ message: '注册成功', user: userResponse, token: jwtToken })
  } catch (error) {
    console.error('SetUser error:', error)
    return c.json({ message: '服务器错误', error: String(error) }, 500)
  }
})

export default app