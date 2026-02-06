import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from '../src/server/type'
import userApi from '../src/server/user'
import articleApi from '../src/server/article'
import personalApi from '../src/server/personal'

interface WorkerEnv extends Env {
    ASSETS: { fetch: (request: Request | string) => Promise<Response> }
}
const app = new Hono<{ Bindings: WorkerEnv }>()

  
app.use(
    '/*',
    cors({
      origin: (origin) => origin, // 在生产环境中，允许请求来源（通常前端和后端同源），或者您可以指定具体的生产域名
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Length', 'Content-Type', 'Authorization'], // 添加 Authorization
      exposeHeaders: ['Content-Length', 'Content-Type'],
      maxAge: 600,
      credentials: true,
    }),
  )

app.get('/', (c) => c.text('OK'))
app.route('/user', userApi)
app.route('/article', articleApi)
app.route('/personal',personalApi)

app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
}