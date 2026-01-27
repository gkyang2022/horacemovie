<template>
  <div class="tracker-container">
    <div class="header">
      <h2>资源追踪 (追剧/追番)</h2>
      <el-button type="primary" @click="showAddDialog = true">添加追踪任务</el-button>
    </div>

    <el-table :data="tasks" v-loading="loading" style="width: 100%; margin-top: 20px">
      <el-table-column prop="name" label="任务名称" />
      <el-table-column prop="keyword" label="关键词" />
      <el-table-column prop="interval_hours" label="检查间隔 (小时)" width="150" />
      <el-table-column label="最后运行时间" width="200">
        <template #default="{ row }">
          {{ row.last_run_at ? new Date(row.last_run_at).toLocaleString() : '未运行' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '进行中' : '已暂停' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button 
            size="small" 
            :type="row.status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '暂停' : '开启' }}
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加任务对话框 -->
    <el-dialog v-model="showAddDialog" title="添加追踪任务" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="任务名称">
          <el-input v-model="form.name" placeholder="例如: 凡人修仙传" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="用于搜索的关键词" />
        </el-form-item>
        <el-form-item label="检查间隔">
          <el-input-number v-model="form.interval_hours" :min="1" :max="168" />
          <span style="margin-left: 10px">小时</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="submitAdd" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';

const tasks = ref([]);
const loading = ref(false);
const showAddDialog = ref(false);
const submitting = ref(false);
const form = ref({
  name: '',
  keyword: '',
  interval_hours: 6
});

const fetchTasks = async () => {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/tracker/tasks');
    tasks.value = data;
  } catch (error) {
    ElMessage.error('获取任务列表失败');
  } finally {
    loading.value = false;
  }
};

const submitAdd = async () => {
  if (!form.value.name || !form.value.keyword) {
    return ElMessage.warning('请填写完整信息');
  }
  submitting.value = true;
  try {
    await axios.post('/api/tracker/tasks', form.value);
    ElMessage.success('添加成功');
    showAddDialog.value = false;
    form.value = { name: '', keyword: '', interval_hours: 6 };
    fetchTasks();
  } catch (error) {
    ElMessage.error('添加失败');
  } finally {
    submitting.value = false;
  }
};

const toggleStatus = async (row: any) => {
  const newStatus = row.status === 'active' ? 'paused' : 'active';
  try {
    await axios.put(`/api/tracker/tasks/${row.id}`, {
      status: newStatus,
      interval_hours: row.interval_hours
    });
    ElMessage.success('状态已更新');
    fetchTasks();
  } catch (error) {
    ElMessage.error('更新失败');
  }
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm('确定删除该追踪任务吗?', '提示', {
    type: 'warning'
  }).then(async () => {
    try {
      await axios.delete(`/api/tracker/tasks/${row.id}`);
      ElMessage.success('已删除');
      fetchTasks();
    } catch (error) {
      ElMessage.error('删除失败');
    }
  });
};

onMounted(fetchTasks);
</script>

<style scoped>
.tracker-container {
  padding: 20px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
