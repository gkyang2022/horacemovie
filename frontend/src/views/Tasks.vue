<template>
  <div class="tasks-container">
    <div class="header">
      <h2>任务进度</h2>
      <el-button :icon="Refresh" circle @click="fetchTasks" :loading="loading" />
    </div>

    <el-tabs v-model="activeTab" class="task-tabs">
      <el-tab-pane label="进行中" name="undone">
        <el-table :data="tasks.undone" v-loading="loading" style="width: 100%" row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="task-detail">
                <p><strong>用时:</strong> {{ formatDuration(row.start_time, row.end_time || new Date().toISOString()) }}</p>
                <p><strong>源路径:</strong> {{ row.displaySrc || '-' }}</p>
                <p><strong>目标路径:</strong> {{ row.displayDst || '-' }}</p>
                <p><strong>状态详情:</strong> {{ row.status || '-' }}</p>
                <p v-if="row.error" class="error-text"><strong>错误:</strong> {{ row.error }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="displayName" label="名称" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="task-name">{{ row.displayName }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStateTagType(row.state)" size="small" class="status-tag">
                {{ getStateText(row.state) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="160">
            <template #default="{ row }">
              <el-progress 
                :percentage="Math.round(row.progress * 100) / 100" 
                :status="getProgressStatus(row.state)"
                :stroke-width="8"
                :show-text="false"
                striped
                striped-flow
              />
            </template>
          </el-table-column>
          <el-table-column label="速度" width="100">
            <template #default="{ row }">
              {{ row.calculatedSpeed || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="开始时间" width="170">
            <template #default="{ row }">
              {{ formatTime(row.start_time) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <div class="op-buttons">
                <el-button link type="danger" @click="handleOp('cancel', row.id)">取消</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="已完成" name="done">
        <el-table :data="tasks.done" v-loading="loading" style="width: 100%" row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="task-detail">
                <p><strong>用时:</strong> {{ formatDuration(row.start_time, row.end_time) }}</p>
                <p><strong>源路径:</strong> {{ row.displaySrc || '-' }}</p>
                <p><strong>目标路径:</strong> {{ row.displayDst || '-' }}</p>
                <p><strong>状态详情:</strong> {{ row.status || '-' }}</p>
                <p v-if="row.error" class="error-text"><strong>错误:</strong> {{ row.error }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="displayName" label="名称" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="task-name">{{ row.displayName }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStateTagType(row.state)" size="small" class="status-tag">
                {{ getStateText(row.state) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="结束时间" width="170">
            <template #default="{ row }">
              {{ formatTime(row.end_time) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <div class="op-buttons">
                <el-button link type="danger" @click="handleOp('delete', row.id)">删除</el-button>
                <el-button link type="primary" @click="handleOp('retry', row.id)" v-if="row.state === 7 || row.state === 4">重试</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { getUserTasks, taskOp, type UserTasks } from '../api/tasks';
import { ElMessage } from 'element-plus';

const activeTab = ref('undone');
const loading = ref(false);
const tasks = ref<UserTasks>({ undone: [], done: [] });
const lastUndoneData = ref<Record<string, { bytes: number, time: number }>>({});
let timer: any = null;

const fetchTasks = async () => {
  try {
    const data = await getUserTasks();
    const now = Date.now();
    
    const processTasks = (list: any[], isUndone: boolean) => {
      return (list || []).map(task => {
        const parsed = parseTaskInfo(task.name);
        let calculatedSpeed = '-';

        if (isUndone && task.state === 1) { // 运行中
          const currentProcessed = (task.total_bytes * task.progress) / 100;
          const last = lastUndoneData.value[task.id];
          
          if (!last) {
            lastUndoneData.value[task.id] = { bytes: currentProcessed, time: now };
            calculatedSpeed = '计算中...';
          } else {
            const bytesDiff = currentProcessed - last.bytes;
            const timeDiff = (now - last.time) / 1000;
            
            if (timeDiff >= 1) { // 至少间隔1秒再计算，避免抖动
              if (bytesDiff > 0) {
                const speedBytesPerSec = bytesDiff / timeDiff;
                calculatedSpeed = formatSpeedFromBytes(speedBytesPerSec);
              } else {
                calculatedSpeed = '0 B/s';
              }
              // 更新数据用于下次计算
              lastUndoneData.value[task.id] = { bytes: currentProcessed, time: now };
            } else {
              // 时间间隔太短，保持上次的速度显示
              // 这里可以从 tasks.value 中找到旧值，或者简单处理
              const oldTask = tasks.value.undone.find(t => t.id === task.id);
              calculatedSpeed = oldTask?.calculatedSpeed || '0 B/s';
            }
          }
        }

        return {
          ...task,
          ...parsed,
          calculatedSpeed
        };
      });
    };

    // 排序逻辑
    const undone = processTasks(data.undone, true).sort((a, b) => {
      const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
      const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
      return timeB - timeA; // 开始时间倒序
    });

    const done = processTasks(data.done, false).sort((a, b) => {
      const timeA = a.end_time ? new Date(a.end_time).getTime() : 0;
      const timeB = b.end_time ? new Date(b.end_time).getTime() : 0;
      return timeB - timeA; // 完成时间倒序
    });

    tasks.value = { undone, done };
  } catch (error) {
    console.error('Fetch tasks failed:', error);
  }
};

const formatSpeedFromBytes = (bytesPerSec: number) => {
  if (bytesPerSec <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0;
  while (bytesPerSec >= 1024 && i < units.length - 1) {
    bytesPerSec /= 1024;
    i++;
  }
  return `${bytesPerSec.toFixed(1)} ${units[i]}`;
};

const parseTaskInfo = (name: string) => {
  if (!name || !name.startsWith('copy [')) {
    return { displayName: name, displaySrc: '', displayDst: '' };
  }

  try {
    // 格式: copy [/src_dir](/src_path) to [/dst_dir](/dst_path)
    const content = name.substring(6, name.length - 1);
    const parts = content.split(") to [");
    const p0 = parts[0];
    const p1 = parts[1];
    if (parts.length !== 2 || !p0 || !p1) return { displayName: name, displaySrc: '', displayDst: '' };

    const srcParts = p0.split("](");
    const dstParts = p1.split("](");
    
    const s0 = srcParts[0];
    const s1 = srcParts[1];
    const d0 = dstParts[0];
    const d1 = dstParts[1];

    if (srcParts.length !== 2 || dstParts.length !== 2 || !s0 || !s1 || !d0 || !d1) {
      return { displayName: name, displaySrc: '', displayDst: '' };
    }

    const fullSrcPath = (s0 + s1).replace(/\/+/g, '/');
    const fullDstPath = (d0 + d1).replace(/\/+/g, '/');
    const displayName = fullSrcPath.split('/').pop() || name;

    return { displayName, displaySrc: fullSrcPath, displayDst: fullDstPath };
  } catch (e) {
    return { displayName: name, displaySrc: '', displayDst: '' };
  }
};

const handleOp = async (op: 'cancel' | 'delete' | 'retry', tid: string) => {
  try {
    await taskOp(op, tid);
    ElMessage.success('操作成功');
    fetchTasks();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '操作失败');
  }
};

const startPolling = () => {
  fetchTasks();
  timer = setInterval(fetchTasks, 1000);
};

onMounted(() => {
  loading.value = true;
  fetchTasks().finally(() => {
    loading.value = false;
  });
  startPolling();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const getStateText = (state: number) => {
  const states: Record<number, string> = {
    0: '排队中',
    1: '运行中',
    2: '成功',
    3: '取消中',
    4: '已取消',
    5: '重试中',
    6: '失败中',
    7: '失败',
    8: '等待重试',
    9: '重试前'
  };
  return states[state] || '未知';
};

const getStateTagType = (state: number) => {
  switch (state) {
    case 1: return 'primary';
    case 2: return 'success';
    case 4: return 'info';
    case 7: return 'danger';
    default: return 'warning';
  }
};

const getProgressStatus = (state: number) => {
  if (state === 2) return 'success';
  if (state === 7) return 'exception';
  return '';
};

const formatTime = (time: string) => {
  if (!time || time.startsWith('0001')) return '-';
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const formatDuration = (start: string, end: string) => {
  if (!start || !end || start.startsWith('0001') || end.startsWith('0001')) return '-';
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const diffSeconds = Math.floor((endTime - startTime) / 1000);
  
  if (diffSeconds < 60) return `${diffSeconds}秒`;
  const minutes = Math.floor(diffSeconds / 60);
  const seconds = diffSeconds % 60;
  return `${minutes}分${seconds}秒`;
};
</script>

<style scoped>
.tasks-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
}

.task-tabs {
  margin-top: 20px;
}

.task-detail {
  padding: 10px 20px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}

.task-detail p {
  margin: 5px 0;
  font-size: 13px;
  line-height: 1.6;
}

.task-detail strong {
  color: var(--el-text-color-primary);
}

.task-name {
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.op-buttons {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
}

.status-tag {
  font-weight: bold;
}

.error-text {
  color: var(--el-color-danger);
}

.status-text {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-top: 4px;
}

:deep(.narrow-progress .el-progress__text) {
  font-size: 12px !important;
  min-width: 40px;
}
</style>
