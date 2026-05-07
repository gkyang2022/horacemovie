# 通知目标可配置实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现追剧更新通知目标的可配置功能，支持 Telegram Chat、Telegram User、Discord Channel、Discord User 四种通知目标类型

**Architecture:** 在 settings 表中添加 notification_targets 配置项（JSON数组），修改 TrackerService 根据配置调用相应通知方法，在前端 Settings.vue 添加复选框 UI

**Tech Stack:** TypeScript, Express, SQLite, Vue 3, Element Plus

---

## 文件结构

### 后端文件
- `backend/src/services/telegram.service.ts` - 添加 notifyUser() 方法
- `backend/src/services/discord.service.ts` - 添加 notifyUser() 方法
- `backend/src/services/tracker.service.ts` - 修改 executeTask() 方法读取配置
- `backend/src/db/index.ts` - 添加 notification_targets 配置项支持

### 前端文件
- `frontend/src/views/Settings.vue` - 添加通知目标配置 UI

### 测试文件
- `backend/src/services/__tests__/notification.test.ts` - 通知配置测试

---

## Task 1: 添加 notification_targets 配置项支持

**Files:**
- Modify: `backend/src/db/index.ts`

- [ ] **Step 1: 在 db/index.ts 中添加 notification_targets 默认值**

在 `initDb()` 函数中添加 notification_targets 配置项的初始化逻辑：

```typescript
// 在 initDb() 函数中，timezone_fixed 迁移之后添加
const notificationTargetsFixed = await db.get('SELECT value FROM settings WHERE key = "notification_targets"');
if (!notificationTargetsFixed) {
    logger.info('[Db] Setting default notification_targets');
    await db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        'notification_targets',
        JSON.stringify(['telegram_chat', 'discord_channel'])
    );
}
```

- [ ] **Step 2: 验证配置项添加成功**

运行后端服务，检查数据库中是否存在 notification_targets 配置项：

```bash
cd backend && npm run dev
```

检查日志输出，确认没有错误。

- [ ] **Step 3: 提交更改**

```bash
git add backend/src/db/index.ts
git commit -m "feat: add notification_targets config support"
```

---

## Task 2: 修改 TelegramService 添加 notifyUser 方法

**Files:**
- Modify: `backend/src/services/telegram.service.ts`

- [ ] **Step 1: 添加 notifyUser() 方法**

在 TelegramService 类中添加 notifyUser() 方法：

```typescript
public async notifyUser(message: string) {
    if (this.bot) {
        try {
            const { userIds } = await this.getTelegramConfig();
            if (userIds.length > 0) {
                logger.info('[TelegramService] Sending Telegram user notification', { count: userIds.length, length: message.length });
                for (const userId of userIds) {
                    this.bot.telegram.sendMessage(userId, message).catch(err => logger.error('[TelegramService] Notify user failed', { error: err }));
                }
            } else {
                logger.warn('[TelegramService] telegram_user_ids not configured, cannot send user notification');
            }
        } catch (error: any) {
            logger.error('[TelegramService] Failed to fetch user_id for notification', { error });
        }
    }
}
```

- [ ] **Step 2: 验证方法添加成功**

检查 TypeScript 编译是否通过：

```bash
cd backend && npm run build
```

确认没有编译错误。

- [ ] **Step 3: 提交更改**

```bash
git add backend/src/services/telegram.service.ts
git commit -m "feat: add notifyUser method to TelegramService"
```

---

## Task 3: 修改 DiscordService 添加 notifyUser 方法

**Files:**
- Modify: `backend/src/services/discord.service.ts`

- [ ] **Step 1: 添加 notifyUser() 方法**

在 DiscordService 类中添加 notifyUser() 方法：

```typescript
public async notifyUser(message: string) {
    if (!this.client) return;
    const { userIds } = await this.getDiscordConfig();
    if (userIds.length === 0) {
        logger.warn('[DiscordService] discord_user_ids not configured, cannot send user notification');
        return;
    }
    for (const userId of userIds) {
        try {
            const user = await this.client.users.fetch(userId);
            if (user) {
                await user.send(message);
            }
        } catch (error: any) {
            logger.error('[DiscordService] Notify user failed', { error });
        }
    }
}
```

- [ ] **Step 2: 验证方法添加成功**

检查 TypeScript 编译是否通过：

```bash
cd backend && npm run build
```

确认没有编译错误。

- [ ] **Step 3: 提交更改**

```bash
git add backend/src/services/discord.service.ts
git commit -m "feat: add notifyUser method to DiscordService"
```

---

## Task 4: 修改 TrackerService 根据配置调用通知方法

**Files:**
- Modify: `backend/src/services/tracker.service.ts`

- [ ] **Step 1: 添加读取 notification_targets 配置的辅助方法**

在 TrackerService 类中添加辅助方法：

```typescript
private async getNotificationTargets(): Promise<string[]> {
    const db = getDb();
    try {
        const row = await db.get('SELECT value FROM settings WHERE key = ?', 'notification_targets');
        if (row?.value) {
            const targets = JSON.parse(row.value);
            if (Array.isArray(targets)) {
                return targets;
            }
        }
    } catch (error: any) {
        logger.error('[TrackerService] Failed to parse notification_targets', { error });
    }
    // 默认值
    return ['telegram_chat', 'discord_channel'];
}
```

- [ ] **Step 2: 修改 executeTask() 方法中的通知逻辑**

找到 executeTask() 方法中发送通知的代码（约第 180-181 行），替换为：

```typescript
// 获取通知目标配置
const notificationTargets = await this.getNotificationTargets();

// 根据配置发送通知
if (notificationTargets.includes('telegram_chat')) {
    await TelegramService.getInstance().notify(`追剧成功：${task.name} 发现 ${newFiles.length} 个新内容${filesText}，已转存到 ${type}`);
}
if (notificationTargets.includes('telegram_user')) {
    await TelegramService.getInstance().notifyUser(`追剧成功：${task.name} 发现 ${newFiles.length} 个新内容${filesText}，已转存到 ${type}`);
}
if (notificationTargets.includes('discord_channel')) {
    await DiscordService.getInstance().notify(`追剧成功：${task.name} 发现 ${newFiles.length} 个新内容${filesText}，已转存到 ${type}`);
}
if (notificationTargets.includes('discord_user')) {
    await DiscordService.getInstance().notifyUser(`追剧成功：${task.name} 发现 ${newFiles.length} 个新内容${filesText}，已转存到 ${type}`);
}
```

- [ ] **Step 3: 验证修改成功**

检查 TypeScript 编译是否通过：

```bash
cd backend && npm run build
```

确认没有编译错误。

- [ ] **Step 4: 提交更改**

```bash
git add backend/src/services/tracker.service.ts
git commit -m "feat: implement notification targets config in TrackerService"
```

---

## Task 5: 修改前端 Settings.vue 添加通知目标配置 UI

**Files:**
- Modify: `frontend/src/views/Settings.vue`

- [ ] **Step 1: 添加 notification_targets 到 form 数据**

在 form reactive 对象中添加 notification_targets 字段：

```typescript
const form = reactive({
    pansou_url: '',
    openlist_url: '',
    openlist_username: '',
    openlist_password: '',
    openlist_default_path: '',
    cookie_115: '',
    folder_id_115: '',
    openlist_path_115: '',
    cookie_quark: '',
    folder_id_quark: '',
    openlist_path_quark: '',
    telegram_bot_token: '',
    telegram_chat_ids: '',
    telegram_user_ids: '',
    discord_bot_token: '',
    discord_channel_ids: '',
    discord_user_ids: '',
    notification_targets: ['telegram_chat', 'discord_channel'] as string[]
});
```

- [ ] **Step 2: 添加通知目标配置 UI**

在 Discord Bot 配置区域之后，用户管理区域之前添加：

```vue
<el-divider content-position="left">通知目标配置</el-divider>
<el-form-item label="通知目标">
    <el-checkbox-group v-model="form.notification_targets">
        <el-checkbox label="telegram_chat">Telegram 群聊</el-checkbox>
        <el-checkbox label="telegram_user">Telegram 私信</el-checkbox>
        <el-checkbox label="discord_channel">Discord 频道</el-checkbox>
        <el-checkbox label="discord_user">Discord 私信</el-checkbox>
    </el-checkbox-group>
</el-form-item>
```

- [ ] **Step 3: 修改 fetchData 函数处理 notification_targets**

在 fetchData 函数中添加 JSON 解析逻辑：

```typescript
const fetchData = async () => {
    loading.value = true;
    try {
        const data = await getSettings();
        Object.assign(form, data);
        // 解析 notification_targets JSON
        if (data.notification_targets && typeof data.notification_targets === 'string') {
            try {
                form.notification_targets = JSON.parse(data.notification_targets);
            } catch {
                form.notification_targets = ['telegram_chat', 'discord_channel'];
            }
        }
        if (isAdmin.value) {
            fetchUsers();
        }
    } finally {
        loading.value = false;
    }
};
```

- [ ] **Step 4: 修改 handleSave 函数序列化 notification_targets**

在 handleSave 函数中添加 JSON 序列化逻辑：

```typescript
const handleSave = async () => {
    loading.value = true;
    let saveErrorMessage = '';
    try {
        await updateSettings({
            pansou_url: form.pansou_url,
            openlist_url: form.openlist_url,
            openlist_username: form.openlist_username,
            openlist_password: form.openlist_password,
            openlist_default_path: form.openlist_default_path,
            telegram_bot_token: form.telegram_bot_token,
            telegram_chat_ids: form.telegram_chat_ids,
            telegram_user_ids: form.telegram_user_ids,
            discord_bot_token: form.discord_bot_token,
            discord_channel_ids: form.discord_channel_ids,
            discord_user_ids: form.discord_user_ids,
            cookie_115: form.cookie_115,
            folder_id_115: form.folder_id_115,
            openlist_path_115: form.openlist_path_115,
            cookie_quark: form.cookie_quark,
            folder_id_quark: form.folder_id_quark,
            openlist_path_quark: form.openlist_path_quark,
            notification_targets: JSON.stringify(form.notification_targets)
        });
    } catch (error: any) {
        saveErrorMessage = error.response?.data?.error || '配置保存失败';
    } finally {
        loading.value = false;
    }
    if (saveErrorMessage) {
        ElNotification({
            title: '保存失败',
            message: saveErrorMessage,
            type: 'error',
            duration: 3500
        });
    } else {
        ElNotification({
            title: '保存成功',
            message: '配置已成功保存',
            type: 'success',
            duration: 2500
        });
    }
};
```

- [ ] **Step 5: 验证前端修改成功**

运行前端开发服务器：

```bash
cd frontend && npm run dev
```

打开浏览器访问设置页面，确认通知目标配置区域显示正常。

- [ ] **Step 6: 提交更改**

```bash
git add frontend/src/views/Settings.vue
git commit -m "feat: add notification targets config UI"
```

---

## Task 6: 测试通知配置功能

**Files:**
- Create: `backend/src/services/__tests__/notification.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrackerService } from '../tracker.service';

describe('Notification Targets Config', () => {
    it('should return default targets when config not exists', async () => {
        // 测试默认配置
        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'discord_channel']);
    });

    it('should parse valid JSON config', async () => {
        // 测试有效 JSON 配置解析
        const mockDb = {
            get: vi.fn().mockResolvedValue({ value: '["telegram_chat", "telegram_user"]' })
        };
        // 模拟 getDb 返回
        vi.spyOn(await import('../db/index.js'), 'getDb').mockReturnValue(mockDb as any);
        
        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'telegram_user']);
    });

    it('should return default on invalid JSON', async () => {
        // 测试无效 JSON 配置
        const mockDb = {
            get: vi.fn().mockResolvedValue({ value: 'invalid json' })
        };
        vi.spyOn(await import('../db/index.js'), 'getDb').mockReturnValue(mockDb as any);
        
        const service = TrackerService.getInstance();
        const targets = await (service as any).getNotificationTargets();
        expect(targets).toEqual(['telegram_chat', 'discord_channel']);
    });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && npm test -- notification.test.ts
```

确认所有测试通过。

- [ ] **Step 3: 提交测试文件**

```bash
git add backend/src/services/__tests__/notification.test.ts
git commit -m "test: add notification targets config tests"
```

---

## Task 7: 最终验证和提交

- [ ] **Step 1: 运行完整测试套件**

```bash
cd backend && npm test
```

确认所有测试通过。

- [ ] **Step 2: 检查 TypeScript 编译**

```bash
cd backend && npm run build
cd frontend && npm run build
```

确认前后端编译都没有错误。

- [ ] **Step 3: 提交所有更改**

```bash
git add .
git commit -m "feat: implement notification targets configuration"
```

- [ ] **Step 4: 推送到远程仓库**

```bash
git push origin main
```

---

## 自检清单

1. **规格覆盖**：
   - ✅ 支持全局配置通知目标
   - ✅ 支持4种通知目标类型
   - ✅ 使用复选框UI进行配置
   - ✅ 向后兼容现有配置

2. **占位符扫描**：
   - ✅ 没有 TBD、TODO 或不完整的部分
   - ✅ 所有步骤都包含实际代码

3. **类型一致性**：
   - ✅ notification_targets 类型在所有地方都是 string[]
   - ✅ 方法名称在前后端保持一致

4. **向后兼容**：
   - ✅ 默认值保持现有行为
   - ✅ 配置不存在时使用默认值

---

## 执行选择

**计划完成并保存到 `docs/superpowers/plans/2026-05-07-notification-config.md`。两种执行选项：**

**1. Subagent-Driven（推荐）** - 每个任务分发一个新的子代理，任务之间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

**选择哪种方式？**