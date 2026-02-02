<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <h3 style="text-align: center; margin: 0">HoraceMovie 登录</h3>
      </template>
      <el-form :model="form" label-width="0">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" show-password @keyup.enter="handleLogin">
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" style="width: 100%" @click="handleLogin" :loading="loading">登录</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { login } from '../api/auth';

const router = useRouter();
const loading = ref(false);
const form = ref({
  username: '',
  password: ''
});

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) {
    return ElMessage.warning('请输入用户名和密码');
  }
  loading.value = true;
  try {
    const data = await login(form.value);
    localStorage.setItem('user', JSON.stringify(data));
    ElMessage.success('登录成功');
    router.push('/');
  } catch (error: any) {
    // 错误处理已在 request.ts 拦截器中处理
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--app-bg);
}
.login-card {
  width: 400px;
}
</style>
