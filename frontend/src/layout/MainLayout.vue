<template>
  <el-container class="layout-container">
    <el-header class="header">
      <div class="logo" @click="$router.push('/')">HoraceMovie</div>
      <el-menu mode="horizontal" :router="true" :default-active="$route.path" class="menu">
        <el-menu-item index="/">首页</el-menu-item>
        <el-menu-item index="/search">搜索</el-menu-item>
        <el-menu-item index="/rank">排行榜</el-menu-item>
        <el-menu-item index="/tasks">任务管理</el-menu-item>
        <el-menu-item index="/settings">设置</el-menu-item>
      </el-menu>
      <div class="theme-toggle">
        <el-button circle size="small" :icon="isDark ? Sunny : Moon" @click="toggleTheme" />
      </div>
      <div class="user-info" v-if="user">
        <el-dropdown @command="handleCommand">
          <span class="el-dropdown-link">
            {{ user.username }} ({{ user.role === 'admin' ? '管理员' : '访客' }}) <el-icon><arrow-down /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, Moon, Sunny } from '@element-plus/icons-vue';
import { logout } from '../api/auth';

const router = useRouter();
const user = ref<{ username: string; role: string } | null>(null);
const isDark = ref(false);

onMounted(() => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    user.value = JSON.parse(userStr);
  }
  isDark.value = document.documentElement.classList.contains('dark');
});

const handleCommand = async (command: string) => {
  if (command === 'logout') {
    try {
      await logout();
    } catch {}
    localStorage.removeItem('user');
    router.push('/login');
  }
};

const toggleTheme = () => {
  isDark.value = !isDark.value;
  const nextTheme = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', nextTheme);
  document.documentElement.classList.toggle('dark', isDark.value);
  document.documentElement.setAttribute('data-theme', nextTheme);
};
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface);
  --el-menu-bg-color: var(--app-surface);
  --el-menu-hover-bg-color: var(--app-surface);
  --el-menu-active-color: var(--app-primary);
  padding: 0 20px;
}
.logo {
  font-size: 20px;
  font-weight: bold;
  margin-right: 40px;
  cursor: pointer;
  color: var(--app-primary);
}
.menu {
  display: flex;
  align-items: center;
  flex: 1;
  border-bottom: none;
  background-color: var(--app-surface);
}
.menu :deep(.el-menu) {
  background-color: var(--app-surface);
  border-bottom: none;
}
.menu :deep(.el-menu-item) {
  background-color: transparent;
}
.menu :deep(.el-menu-item.is-active) {
  background-color: transparent;
}
.menu :deep(.el-menu-item:not(.is-disabled):hover) {
  background-color: transparent;
}
.theme-toggle {
  margin-right: 12px;
}
.user-info {
  margin-left: 20px;
}

@media (max-width: 500px) {
  .header {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-areas:
      "logo logo logo"
      "menu theme user";
    align-items: center;
    padding: 8px 12px;
    height: auto;
    row-gap: 6px;
    column-gap: 8px;
  }
  .logo {
    grid-area: logo;
    margin-right: 0;
    font-size: 18px;
  }
  .menu {
    grid-area: menu;
    width: 100%;
    overflow-x: auto;
  }
  .menu :deep(.el-menu) {
    width: max-content;
    min-width: 100%;
    display: inline-flex;
    overflow-x: auto;
  }
  .menu :deep(.el-menu-item) {
    padding: 0 8px;
    font-size: 13px;
    height: 40px;
    line-height: 40px;
    flex: 0 0 auto;
  }
  .theme-toggle {
    grid-area: theme;
    margin-right: 0;
  }
  .user-info {
    grid-area: user;
    width: auto;
    margin-left: 0;
    padding-bottom: 0;
    justify-self: end;
  }
  .user-info :deep(.el-dropdown-link) {
    font-size: 12px;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu :deep(.el-menu::-webkit-scrollbar) {
    height: 0;
  }
}
</style>
