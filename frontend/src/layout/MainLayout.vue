<template>
  <el-container class="layout-container">
    <el-header class="header">
      <div class="logo" @click="$router.push('/')">HoraceMovie</div>
      <el-menu mode="horizontal" :router="true" :default-active="$route.path" class="menu">
        <el-menu-item index="/">首页</el-menu-item>
        <el-menu-item index="/search">搜索</el-menu-item>
        <el-menu-item index="/tracker">资源追踪</el-menu-item>
        <el-menu-item index="/settings">设置</el-menu-item>
      </el-menu>
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
import { ArrowDown } from '@element-plus/icons-vue';

const router = useRouter();
const user = ref<{ username: string; role: string } | null>(null);

onMounted(() => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    user.value = JSON.parse(userStr);
  }
});

const handleCommand = (command: string) => {
  if (command === 'logout') {
    localStorage.removeItem('user');
    router.push('/login');
  }
};
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #dcdfe6;
  padding: 0 20px;
}
.logo {
  font-size: 20px;
  font-weight: bold;
  margin-right: 40px;
  cursor: pointer;
  color: #409eff;
}
.menu {
  flex: 1;
  border-bottom: none;
}
.user-info {
  margin-left: 20px;
}
</style>
