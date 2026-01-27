# HoraceMovie

一个简洁、强大的个人影视资源管理与追踪系统。

## 🚀 功能特性

- **豆瓣联动**：支持热门电影/电视剧浏览，实时搜索豆瓣影视信息。
- **资源搜索**：集成 Pansou API，一键搜索全网网盘资源（115、夸克、阿里、百度等）。
- **智能追踪**：支持 Telegram Bot 订阅追踪，新资源上线自动提醒。
- **云端转存**：支持将搜索到的资源一键转存至个人云盘（开发中）。
- **极简 UI**：基于 Vue 3 + Element Plus 构建，支持响应式布局。

## 🛠️ 技术栈

- **Frontend**: Vue 3, TypeScript, Vite, Element Plus, Pinia
- **Backend**: Node.js (Express), TypeScript, SQLite (Better-SQLite3)
- **Tools**: Docker, Telegram Bot API, Frodo (Douban API)

## 📦 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/your-username/horacemovie.git
cd horacemovie
```

### 2. 后端配置
进入 `backend` 目录：
1. `npm install` 安装依赖。
2. 复制 `.env.example` 为 `.env`（如果存在）并配置环境变量。
3. `npm run dev` 启动开发服务器。

### 3. 前端配置
进入 `frontend` 目录：
1. `npm install` 安装依赖。
2. `npm run dev` 启动前端。

### 4. Docker 部署
使用根目录的 `docker-compose.yml` 一键启动：
```bash
docker-compose up -d
```

## 📝 配置说明

- **豆瓣代理**：默认使用 `cmliussss` 源以解决海报 404 问题。
- **Pansou API**：请在系统设置中配置有效的 Pansou 接口地址。

## ⚖️ 许可证

MIT License
