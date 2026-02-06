import { Hono } from "hono";
import type { Env,Article } from "../type";
import { AwsClient } from 'aws4fetch'
const app = new Hono<{Bindings: Env}>();
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


  app.get('/getPersonalInfo/:id',async (c) => {
    const userId = c.req.param('id');
    if (!userId) return c.json({ message: '缺少用户id' }, 400)
    const db = c.env.DB;
    try {
        const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        if (!user) return c.json({ message: '用户不存在' }, 404);
        return c.json({ message: '获取用户信息成功', user }, 200);
    } catch (error) {
        return c.json({ message: '获取用户信息失败', error }, 500);
    }
})


app.get('/getPersonalArticle/:id',async (c) => {
    const userId = c.req.param('id');
    if (!userId) return c.json({ message: '缺少用户id' }, 400)
    const db = c.env.DB;
    try {
        const articleIds = await db.prepare('SELECT id WHERE authorId = ?').bind(userId).all();
        const idList = articleIds.results.map(item => item.id);
        const articles: Article[] = [];
        for (const id of idList) {
            const article = await db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
            if(article?.coverUrl){
                article.coverUrl = await generatePresignedUrl(article.coverUrl, c.env);
            }else{
                return c.json({ message: '文章封面不存在' }, 404);
            }
            if (article) {
                articles.push(article);
            }
        }
        return c.json({ message: '获取文章成功', articles }, 200);
    }catch (error) {
        return c.json({ message: '获取文章失败', error }, 500);
    }
})


app.get('/getPersonalFavorites/:id',async (c) => {
    const userId = c.req.param('id');
    if (!userId) return c.json({ message: '缺少用户id' }, 400)
    const db = c.env.DB;
    try {
        const favoritesId = await db.prepare('SELECT articleId FROM favorites WHERE userId = ?').bind(userId).all();
        const idList = favoritesId.results.map(item => item.articleId);
        const favorites: Article[] = [];
        for (const id of idList) {
            const article = await db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
            if(article?.coverUrl){
                article.coverUrl = await generatePresignedUrl(article.coverUrl, c.env);
            }else{
                return c.json({ message: '文章封面不存在' }, 404);
            }
            if (article) {
                favorites.push(article);
            }
        }
        return c.json({ message: '获取用户收藏成功', favorites }, 200);
    } catch (error) {
        return c.json({ message: '获取用户收藏失败', error }, 500);
    }
})

app.get('/personalHis/:id',async (c) => {
    const userId = c.req.param('id');
    if (!userId) return c.json({ message: '缺少用户id' }, 400)
    const db = c.env.DB;
    try {
        const historyId = await db.prepare('SELECT articleId FROM history WHERE userId = ? ORDER BY viewedAt DESC').bind(userId).all();
        const idList = historyId.results.map(item => item.articleId);
        const history: Article[] = [];
        for (const id of idList) {
            const article = await db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
            if(article?.coverUrl){
                article.coverUrl = await generatePresignedUrl(article.coverUrl, c.env);
            }else{
                return c.json({ message: '文章封面不存在' }, 404);
            }
            if (article) {
                history.push(article);
            }
        }
        return c.json({ message: '获取用户历史记录成功', history }, 200);
    } catch (error) {
        return c.json({ message: '获取用户历史记录失败', error }, 500);
    }  
})

export default app;