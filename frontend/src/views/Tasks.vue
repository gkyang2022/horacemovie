<template>
  <div class="tasks-container">
    <div class="header">
      <div class="tabs-titles">
        <span 
          class="tab-title" 
          :class="{ active: activeMainTab === 'sync' }"
          @click="handleTabChange('sync')"
        >同步任务</span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeMainTab === 'tracker' }"
          @click="handleTabChange('tracker')"
        >追剧任务</span>
      </div>
    </div>

    <div v-if="activeMainTab === 'sync'" class="tab-content">
      <el-tabs v-model="activeSyncTab" class="task-tabs">
        <el-tab-pane label="进行中" name="undone">
          <div class="batch-ops">
            <el-button 
              size="small" 
              type="primary" 
              :disabled="selectedUndone.length === 0"
              @click="handleBatchOp('retry', 'undone')"
            >重试已选</el-button>
            <el-button 
              size="small" 
              type="danger" 
              :disabled="selectedUndone.length === 0"
              @click="handleBatchOp('cancel', 'undone')"
            >取消已选</el-button>
          </div>
          <el-table 
            ref="undoneTableRef"
            :data="syncTasks.undone" 
            v-loading="syncLoading" 
            style="width: 100%" 
            row-key="id"
            @selection-change="(val: any[]) => selectedUndone = val"
          >
            <el-table-column type="selection" width="55" />
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
                  <el-button size="small" type="danger" @click="handleSyncOp('cancel', row.id)">取消</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="已完成" name="done">
          <div class="batch-ops">
            <el-button size="small" type="warning" @click="handleFullClear('retry_failed')">重试失败项</el-button>
            <el-button size="small" type="danger" @click="handleFullClear('clear_done')">删除所有</el-button>
            <el-button size="small" type="danger" plain @click="handleFullClear('clear_succeeded')">删除已成功</el-button>
            <el-button 
              size="small" 
              type="primary" 
              :disabled="selectedDone.length === 0"
              @click="handleBatchOp('retry', 'done')"
            >重试已选</el-button>
            <el-button 
              size="small" 
              type="danger" 
              :disabled="selectedDone.length === 0"
              @click="handleBatchOp('delete', 'done')"
            >删除已选</el-button>
          </div>
          <el-table 
            ref="doneTableRef"
            :data="syncTasks.done" 
            v-loading="syncLoading" 
            style="width: 100%" 
            row-key="id"
            @selection-change="(val: any[]) => selectedDone = val"
          >
            <el-table-column type="selection" width="55" />
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
                  <el-button size="small" type="danger" @click="handleSyncOp('delete', row.id)">删除</el-button>
                  <el-button size="small" type="primary" @click="handleSyncOp('retry', row.id)" v-if="row.state === 7 || row.state === 4">重试</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <div v-if="activeMainTab === 'tracker'" class="tab-content">
      <el-table :data="trackerTasks" v-loading="trackerLoading" style="width: 100%">
        <el-table-column prop="name" label="任务名称" min-width="200" />
        <el-table-column label="分享链接" min-width="250">
          <template #default="{ row }">
            <el-link :href="row.share_url" target="_blank" type="primary" :underline="false">
              {{ row.share_url }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="检查间隔" width="150">
          <template #default="{ row }">
            {{ row.interval_value }} {{ getUnitLabel(row.interval_unit) }}
          </template>
        </el-table-column>
        <el-table-column label="最后运行时间" width="200">
          <template #default="{ row }">
            {{ row.last_run_at ? new Date(row.last_run_at).toLocaleString() : '未运行' }}
          </template>
        </el-table-column>
        <el-table-column label="运行结果" width="120">
          <template #default="{ row }">
            <el-tag :type="getRunTagType(row.last_run_status)">
              {{ getRunStatusText(row.last_run_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果详情" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.last_run_message || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '进行中' : '已暂停' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="handleTrackerRunNow(row)">立即运行</el-button>
            <el-button 
              size="small" 
              :type="row.status === 'active' ? 'warning' : 'success'"
              @click="toggleTrackerStatus(row)"
            >
              {{ row.status === 'active' ? '暂停' : '开启' }}
            </el-button>
            <el-button size="small" type="primary" @click="handleTrackerEdit(row)">修改</el-button>
            <el-button size="small" type="danger" @click="handleTrackerDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 追剧任务修改对话框 -->
    <el-dialog v-model="showTrackerEditDialog" title="修改追剧任务" width="500px">
      <el-form :model="trackerForm" label-width="100px">
        <el-form-item label="任务名称">
          <el-input v-model="trackerForm.name" placeholder="例如: 凡人修仙传" />
        </el-form-item>
        <el-form-item label="分享链接">
          <el-input v-model="trackerForm.share_url" placeholder="仅支持夸克网盘分享链接" />
        </el-form-item>
        <el-form-item label="检查间隔">
          <div style="display: flex; gap: 10px; align-items: center">
            <el-input-number v-model="trackerForm.interval_value" :min="1" />
            <el-select v-model="trackerForm.interval_unit" style="width: 100px">
              <el-option label="小时" value="hour" />
              <el-option label="天" value="day" />
              <el-option label="月" value="month" />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTrackerEditDialog = false">取消</el-button>
        <el-button type="primary" @click="submitTrackerEdit" :loading="trackerSubmitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { 
  getUserTasks, 
  taskOp, 
  batchCancelTasks, 
  batchDeleteTasks, 
  batchRetryTasks, 
  clearDoneTasks, 
  clearSucceededTasks, 
  retryFailedTasks,
  type UserTasks 
} from '../api/tasks';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../api/request';

const route = useRoute();
const router = useRouter();

// --- 通用状态 ---
const activeMainTab = ref('sync');

const initFromQuery = () => {
  const type = route.query.type as string;
  if (type === 'tracker') {
    activeMainTab.value = 'tracker';
  } else {
    activeMainTab.value = 'sync';
  }
};

const handleTabChange = (tab: string) => {
  if (activeMainTab.value === tab) return;
  activeMainTab.value = tab;
  router.replace({ query: { ...route.query, type: tab } });
};

// --- 同步任务逻辑 ---
const activeSyncTab = ref('undone');
const syncLoading = ref(false);
const syncTasks = ref<UserTasks>({ undone: [], done: [] });
const undoneTableRef = ref();
const doneTableRef = ref();
const selectedUndone = ref<any[]>([]);
const selectedDone = ref<any[]>([]);
const lastUndoneData = ref<Record<string, { bytes: number, time: number }>>({});
let syncTimer: any = null;

const fetchSyncTasks = async () => {
  try {
    const data = await getUserTasks();
    const now = Date.now();
    
    const processTasks = (list: any[], isUndone: boolean) => {
      return (list || []).map(task => {
        const parsed = parseSyncTaskInfo(task.name);
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
            
            if (timeDiff >= 1) {
              if (bytesDiff > 0) {
                const speedBytesPerSec = bytesDiff / timeDiff;
                calculatedSpeed = formatSpeedFromBytes(speedBytesPerSec);
              } else {
                calculatedSpeed = '0 B/s';
              }
              lastUndoneData.value[task.id] = { bytes: currentProcessed, time: now };
            } else {
              const oldTask = syncTasks.value.undone.find(t => t.id === task.id);
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

    const undone = processTasks(data.undone, true).sort((a, b) => {
      const timeA = a.start_time ? new Date(a.start_time).getTime() : 0;
      const timeB = b.start_time ? new Date(b.start_time).getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA; // start_time 倒序
      }
      return (a.name || '').localeCompare(b.name || ''); // name 正序
    });

    const done = processTasks(data.done, false).sort((a, b) => {
      return (a.name || '').localeCompare(b.name || ''); // name 正序
    });

    const undoneIds = new Set(selectedUndone.value.map(t => t.id));
    const doneIds = new Set(selectedDone.value.map(t => t.id));

    syncTasks.value = { undone, done };

    // 恢复勾选状态
    setTimeout(() => {
      if (undoneTableRef.value) {
        undone.forEach(row => {
          if (undoneIds.has(row.id)) {
            undoneTableRef.value.toggleRowSelection(row, true);
          }
        });
      }
      if (doneTableRef.value) {
        done.forEach(row => {
          if (doneIds.has(row.id)) {
            doneTableRef.value.toggleRowSelection(row, true);
          }
        });
      }
    }, 0);
  } catch (error) {
    console.error('Fetch sync tasks failed:', error);
  }
};

const handleSyncOp = async (op: 'cancel' | 'delete' | 'retry', tid: string) => {
  try {
    await taskOp(op, tid);
    ElMessage.success('操作成功');
    fetchSyncTasks();
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '操作失败');
  }
};

const handleBatchOp = async (op: 'cancel' | 'delete' | 'retry', tab: 'undone' | 'done') => {
  const selected = tab === 'undone' ? selectedUndone.value : selectedDone.value;
  if (selected.length === 0) return;
  
  const tids = selected.map(t => t.id);
  try {
    let res;
    if (op === 'cancel') res = await batchCancelTasks(tids);
    else if (op === 'delete') res = await batchDeleteTasks(tids);
    else if (op === 'retry') res = await batchRetryTasks(tids);
    
    if (res && res.code === 200) {
      ElMessage.success('批量操作成功');
      fetchSyncTasks();
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '批量操作失败');
  }
};

const handleFullClear = async (type: 'clear_done' | 'clear_succeeded' | 'retry_failed') => {
  try {
    let res;
    if (type === 'clear_done') res = await clearDoneTasks();
    else if (type === 'clear_succeeded') res = await clearSucceededTasks();
    else if (type === 'retry_failed') res = await retryFailedTasks();
    
    if (res && res.code === 200) {
      ElMessage.success('全量操作成功');
      fetchSyncTasks();
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '全量操作失败');
  }
};

const parseSyncTaskInfo = (name: string) => {
  if (!name || !name.startsWith('copy [')) {
    return { displayName: name, displaySrc: '', displayDst: '' };
  }
  try {
    const content = name.substring(6, name.length - 1);
    const parts = content.split(") to [");
    const p0 = parts[0];
    const p1 = parts[1];
    if (parts.length !== 2 || !p0 || !p1) return { displayName: name, displaySrc: '', displayDst: '' };

    const srcParts = p0.split("](");
    const dstParts = p1.split("](");
    const s0 = srcParts[0], s1 = srcParts[1], d0 = dstParts[0], d1 = dstParts[1];

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

const getStateText = (state: number) => {
  const states: Record<number, string> = {
    0: '排队中', 1: '运行中', 2: '成功', 3: '取消中', 4: '已取消',
    5: '重试中', 6: '失败中', 7: '失败', 8: '等待重试', 9: '重试前'
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
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
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

// --- 追剧任务逻辑 ---
const trackerTasks = ref<any[]>([]);
const trackerLoading = ref(false);
const showTrackerEditDialog = ref(false);
const trackerSubmitting = ref(false);
const currentTrackerId = ref<number | null>(null);
const trackerForm = ref({
  name: '',
  share_url: '',
  interval_value: 6,
  interval_unit: 'hour'
});

const getUnitLabel = (unit: string) => {
  const labels: Record<string, string> = {
    minute: '分钟', hour: '小时', day: '天', month: '月'
  };
  return labels[unit] || '小时';
};

const getRunStatusText = (status?: string) => {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'skipped') return '跳过';
  return '未知';
};

const getRunTagType = (status?: string) => {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  return 'info';
};

const fetchTrackerTasks = async () => {
  trackerLoading.value = true;
  try {
    const data = await request.get<any, any[]>('/tracker/tasks');
    trackerTasks.value = data;
  } catch (error) {
    ElMessage.error('获取追剧任务失败');
  } finally {
    trackerLoading.value = false;
  }
};

const handleTrackerRunNow = async (row: any) => {
  try {
    await request.post(`/tracker/tasks/${row.id}/run`);
    ElMessage.success('任务已启动');
    fetchTrackerTasks();
  } catch (error) {
    ElMessage.error('启动失败');
  }
};

const handleTrackerEdit = (row: any) => {
  currentTrackerId.value = row.id;
  trackerForm.value = {
    name: row.name,
    share_url: row.share_url,
    interval_value: row.interval_value,
    interval_unit: row.interval_unit || 'hour'
  };
  showTrackerEditDialog.value = true;
};

const submitTrackerEdit = async () => {
  if (!trackerForm.value.name || !trackerForm.value.share_url) {
    return ElMessage.warning('请填写完整信息');
  }
  if (trackerForm.value.share_url.includes('115.com')) {
    return ElMessage.warning('115网盘不支持追剧功能（链接为快照形式，无法检测更新）');
  }
  if (!trackerForm.value.share_url.includes('quark.cn')) {
    return ElMessage.warning('目前追剧功能仅支持夸克网盘');
  }
  trackerSubmitting.value = true;
  try {
    await request.put(`/tracker/tasks/${currentTrackerId.value}`, {
      ...trackerForm.value,
      status: trackerTasks.value.find(t => t.id === currentTrackerId.value)?.status || 'active'
    });
    ElMessage.success('更新成功');
    showTrackerEditDialog.value = false;
    fetchTrackerTasks();
  } catch (error) {
    ElMessage.error('更新失败');
  } finally {
    trackerSubmitting.value = false;
  }
};

const toggleTrackerStatus = async (row: any) => {
  const newStatus = row.status === 'active' ? 'paused' : 'active';
  try {
    await request.put(`/tracker/tasks/${row.id}`, {
      status: newStatus,
      interval_value: row.interval_value,
      interval_unit: row.interval_unit || 'hour'
    });
    ElMessage.success('状态已更新');
    fetchTrackerTasks();
  } catch (error) {
    ElMessage.error('更新失败');
  }
};

const handleTrackerDelete = (row: any) => {
  ElMessageBox.confirm('确定删除该追剧任务吗?', '提示', { type: 'warning' })
    .then(async () => {
      try {
        await request.delete(`/tracker/tasks/${row.id}`);
        ElMessage.success('已删除');
        fetchTrackerTasks();
      } catch (error) {
        ElMessage.error('删除失败');
      }
    });
};

// --- 初始化与定时器 ---
let trackerTimer: any = null;

const startPolling = () => {
  fetchSyncTasks();
  fetchTrackerTasks();
  syncTimer = setInterval(() => {
    if (activeMainTab.value === 'sync') {
      fetchSyncTasks();
    }
  }, 5000);
  trackerTimer = setInterval(() => {
    if (activeMainTab.value === 'tracker') {
      fetchTrackerTasks();
    }
  }, 5000);
};

onMounted(() => {
  initFromQuery();
  syncLoading.value = true;
  Promise.all([fetchSyncTasks(), fetchTrackerTasks()]).finally(() => {
    syncLoading.value = false;
  });
  startPolling();
});

watch(() => route.query.type, () => {
  initFromQuery();
});

onUnmounted(() => {
  if (syncTimer) clearInterval(syncTimer);
  if (trackerTimer) clearInterval(trackerTimer);
});
</script>

<style scoped>
.tasks-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  margin-bottom: 30px;
}

.task-tabs {
  margin-top: 10px;
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

.batch-ops {
  margin-bottom: 15px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.error-text {
  color: var(--el-color-danger);
}

:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}

.main-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

@media (max-width: 500px) {
  .tasks-container {
    padding: 12px;
  }
  .header {
    margin-bottom: 16px;
  }
  .task-tabs {
    margin-top: 6px;
  }
  .batch-ops {
    gap: 8px;
  }
  .op-buttons {
    flex-wrap: wrap;
    gap: 8px;
  }
  .task-detail {
    padding: 8px 12px;
  }
  :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }
}
</style>
