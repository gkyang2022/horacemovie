# 通知目标可配置设计文档

## 概述

当前系统在追剧更新时会同时通知到 Telegram 和 Discord，且通知目标固定。本设计将通知目标改为可配置，用户可以选择启用哪些通知目标类型。

## 设计目标

1. 支持全局配置通知目标
2. 支持4种通知目标类型：Telegram Chat、Telegram User、Discord Channel、Discord User
3. 使用复选框UI进行配置
4. 向后兼容现有配置

## 架构设计

### 数据模型

在 `settings` 表中添加新配置项：

- `notification_targets`: JSON数组，存储启用的通知目标类型
  - 示例：`["telegram_chat", "telegram_user", "discord_channel", "discord_user"]`
  - 默认值：`["telegram_chat", "discord_channel"]`（保持向后兼容）

### 配置项定义

```typescript
type NotificationTarget = 
  | 'telegram_chat' 
  | 'telegram_user' 
  | 'discord_channel' 
  | 'discord_user';

// 配置存储格式
interface NotificationConfig {
  notification_targets: NotificationTarget[];
}
```

### 组件修改

#### 1. 后端服务层

**TelegramService** (`telegram.service.ts`)
- 修改 `notify()` 方法，根据配置决定是否发送到 chat
- 添加 `notifyUser()` 方法，支持发送到用户私信

**DiscordService** (`discord.service.ts`)
- 修改 `notify()` 方法，根据配置决定是否发送到 channel
- 添加 `notifyUser()` 方法，支持发送到用户私信

**TrackerService** (`tracker.service.ts`)
- 修改 `executeTask()` 方法，读取 `notification_targets` 配置
- 根据配置调用相应的通知方法

#### 2. 前端UI层

**Settings.vue**
- 添加通知目标配置区域
- 使用复选框组选择启用的通知目标类型
- 保存时将选中的目标类型序列化为JSON数组

### 数据流

1. **配置保存流程**：
   ```
   前端复选框 → JSON数组 → settings表 → notification_targets
   ```

2. **通知发送流程**：
   ```
   追剧任务完成 → 读取notification_targets → 根据配置调用相应通知方法
   ```

### 错误处理

1. **配置解析错误**：
   - 如果 `notification_targets` 格式无效，使用默认值 `["telegram_chat", "discord_channel"]`
   - 记录警告日志

2. **通知发送失败**：
   - 单个通知目标失败不影响其他目标
   - 记录错误日志，继续执行

### 向后兼容

1. 如果 `notification_targets` 配置不存在，使用默认值
2. 现有的 `telegram_chat_ids`、`telegram_user_ids`、`discord_channel_ids`、`discord_user_ids` 配置保持不变
3. 新配置项优先级高于旧配置项

## 测试策略

1. **单元测试**：
   - 测试配置解析逻辑
   - 测试通知目标选择逻辑

2. **集成测试**：
   - 测试配置保存和读取
   - 测试通知发送流程

3. **UI测试**：
   - 测试复选框选择和保存
   - 测试配置加载和显示

## 实现步骤

1. 修改 `settings` 表，添加 `notification_targets` 配置项
2. 修改 `TelegramService`，添加 `notifyUser()` 方法
3. 修改 `DiscordService`，添加 `notifyUser()` 方法
4. 修改 `TrackerService`，根据配置调用通知方法
5. 修改 `Settings.vue`，添加通知目标配置UI
6. 添加错误处理和日志记录
7. 编写测试用例

## 风险评估

1. **低风险**：配置项添加，向后兼容
2. **中风险**：通知方法修改，需要充分测试
3. **低风险**：UI修改，不影响核心功能

## 成功标准

1. 用户可以在设置页面配置通知目标
2. 追剧更新时只发送到配置的目标
3. 现有功能不受影响
4. 配置保存和加载正常工作