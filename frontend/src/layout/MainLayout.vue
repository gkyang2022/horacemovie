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
</style>
