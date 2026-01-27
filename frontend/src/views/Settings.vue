<template>
  <div class="settings">
    <h1>系统设置</h1>
    <el-form :model="form" label-width="140px" style="max-width: 800px" v-loading="loading">
      <el-divider content-position="left">Pansou 配置</el-divider>
      <el-form-item label="Pansou API 地址">
        <el-input v-model="form.pansou_url" placeholder="https://api.pansou.com" />
      </el-form-item>

      <el-divider content-position="left">OpenList 配置</el-divider>
      <el-form-item label="OpenList API 地址">
        <el-input v-model="form.openlist_url" placeholder="http://nas-ip:5244" />
      </el-form-item>
      <el-form-item label="用户名">
        <el-input v-model="form.openlist_username" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.openlist_password" type="password" show-password />
      </el-form-item>
      <el-form-item label="默认同步路径">
        <el-input v-model="form.openlist_default_path" placeholder="/volume1/Media" />
      </el-form-item>

      <el-divider content-position="left">网盘 Cookie 配置</el-divider>
      <el-form-item label="115 Cookie">
        <el-input v-model="form.cookie_115" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="夸克 Cookie">
        <el-input v-model="form.cookie_quark" type="textarea" :rows="3" />
      </el-form-item>

      <el-divider content-position="left">Telegram Bot 配置</el-divider>
      <el-form-item label="Bot Token">
        <el-input v-model="form.telegram_bot_token" placeholder="123456789:ABCDEF..." />
      </el-form-item>

      <el-divider content-position="left" v-if="isAdmin">用户管理</el-divider>
      <el-table :data="users" v-if="isAdmin" style="margin-bottom: 20px">
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="role" label="角色" />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button type="danger" size="small" @click="handleDeleteUser(row.id)" :disabled="row.username === 'admin'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button v-if="isAdmin" type="success" size="small" @click="showAddUser = true" style="margin-bottom: 20px">添加用户</el-button>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </el-form-item>
    </el-form>

    <el-dialog v-model="showAddUser" title="添加用户" width="400px">
      <el-form :model="userForm" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="userForm.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="userForm.password" type="password" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role">
            <el-option label="管理员" value="admin" />
            <el-option label="访客" value="guest" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddUser = false">取消</el-button>
        <el-button type="primary" @click="addUser">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getSettings, updateSettings, updateCloudAccount } from '../api/system';
import { getUsers, createUser, deleteUser } from '../api/auth';

const loading = ref(false);
const users = ref<any[]>([]);
const showAddUser = ref(false);
const userForm = reactive({ username: '', password: '', role: 'guest' });

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
const isAdmin = computed(() => currentUser.role === 'admin');

const form = reactive({
  pansou_url: '',
  openlist_url: '',
  openlist_username: '',
  openlist_password: '',
  openlist_default_path: '',
  cookie_115: '',
  cookie_quark: '',
  telegram_bot_token: ''
});

const fetchData = async () => {
  loading.value = true;
  try {
    const data = await getSettings();
    Object.assign(form, data);
    if (isAdmin.value) {
      fetchUsers();
    }
  } finally {
    loading.value = false;
  }
};

const fetchUsers = async () => {
  const data = await getUsers();
  users.value = data;
};

const addUser = async () => {
  await createUser(userForm);
  ElMessage.success('用户添加成功');
  showAddUser.value = false;
  fetchUsers();
};

const handleDeleteUser = (id: number) => {
  ElMessageBox.confirm('确定删除吗?').then(async () => {
    await deleteUser(id);
    ElMessage.success('已删除');
    fetchUsers();
  });
};

const handleSave = async () => {
  loading.value = true;
  try {
    await updateSettings({
      pansou_url: form.pansou_url,
      openlist_url: form.openlist_url,
      openlist_username: form.openlist_username,
      openlist_password: form.openlist_password,
      openlist_default_path: form.openlist_default_path,
      telegram_bot_token: form.telegram_bot_token
    });

    if (form.cookie_115) {
      await updateCloudAccount({ type: '115', cookie: form.cookie_115, name: '115主账号' });
    }
    if (form.cookie_quark) {
      await updateCloudAccount({ type: 'quark', cookie: form.cookie_quark, name: '夸克主账号' });
    }

    ElMessage.success('配置已成功保存');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.settings {
  padding: 20px;
}
</style>
