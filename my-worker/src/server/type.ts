import { Hono } from 'hono'

export interface Env {
  DB: D1Database
  B2_ENDPOINT: string
  B2_KEY_ID: string
  B2_APPLICATION_KEY: string
  B2_BUCKET_NAME: string
  JWT_SECRET: string
  RESEND_API_KEY: string // 添加 Resend API Key
}
// article 类型定义
export interface Article {
  id: number
  title: string
  content: string
  authorId: number
  createdAt: string
  abstract: string
  coverUrl: string
}

export interface ArticleSimpleInfo {
  id: number
  title: string
  abstract: string
  coverUrl: string
}


// user 类型定义
export interface User {
  userId: number
  username: string
  avatar: string
  bio: string
  organization: string
  updatedAt: string
  permissionLevel: string
  email: string
  isLogin: boolean
}
export interface UserInfo {
  userId: number
  username: string
  avatar: string
  bio: string
  organization: string
  updatedAt: string
  permissionLevel: number
  email: string
}

export interface UserInfoSet {
  id: number
  username: string
  password: string
  followers: number
  followings: number
  avatar: string
  dynamicNum: number
  isLogin: boolean
}

export interface orgToken {
  tokenCode: string
  targetOrgName: string
  isActive: boolean
  createBy: UserInfo
}

export interface ActiveResponse {
  author: UserInfo
  title: string
  content: string
  abstract: string
  createAt: string
  coverUrl: string
  likes: number
  comments: number
  
}

export type HonoApp = Hono<{ Bindings: Env }>
