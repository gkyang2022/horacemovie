<template>
  <div v-loading="loading" class="detail-page">
    <div v-if="detail" class="detail-container">
      <div class="left">
        <el-image :src="detail.poster" fit="cover" class="main-poster" />
      </div>
      <div class="right">
        <h1 class="title">{{ detail.title }} <span class="year">({{ detail.year }})</span></h1>
        <div class="meta">
          <div class="rating-info">
            <el-rate 
              :model-value="detail.rating / 2" 
              :max="5" 
              disabled 
              score-template="{value}" 
              :colors="['#99A9BF', '#F7BA2A', '#FF9900']"
            />
            <span class="score-text">{{ detail.rating }} 分</span>
            <span class="rating-count" v-if="detail.rating_count">({{ detail.rating_count }}人评价)</span>
          </div>
          
          <div class="info-list">
            <div v-if="detail.directors?.length" class="info-item">
              <span class="label">导演:</span>
              <span class="value">{{ detail.directors.join(' / ') }}</span>
            </div>
            <div v-if="detail.actors?.length" class="info-item">
              <span class="label">主演:</span>
              <span class="value">{{ detail.actors.slice(0, 10).join(' / ') }}</span>
            </div>
            <div v-if="detail.genres?.length" class="info-item">
              <span class="label">类型:</span>
              <span class="value">
                <el-tag v-for="g in detail.genres" :key="g" size="small" class="genre-tag">{{ g }}</el-tag>
              </span>
            </div>
            <div v-if="detail.countries?.length" class="info-item">
              <span class="label">地区:</span>
              <span class="value">{{ detail.countries.join(' / ') }}</span>
            </div>
            <div v-if="detail.languages?.length" class="info-item">
              <span class="label">语言:</span>
              <span class="value">{{ detail.languages.join(' / ') }}</span>
            </div>
            <div v-if="detail.pubdate?.length" class="info-item">
              <span class="label">上映:</span>
              <span class="value">{{ detail.pubdate.join(' / ') }}</span>
            </div>
            <div v-if="detail.durations?.length" class="info-item">
              <span class="label">片长:</span>
              <span class="value">{{ detail.durations.join(' / ') }}</span>
            </div>
            <div v-if="detail.episodes_count && detail.episodes_count > 0" class="info-item">
              <span class="label">集数:</span>
              <span class="value">{{ detail.episodes_count }}</span>
            </div>
            <div v-if="detail.url" class="info-item">
              <span class="label">豆瓣:</span>
              <el-link :href="detail.url" target="_blank" type="primary" :underline="false">查看原链接</el-link>
            </div>
          </div>
        </div>
        <div class="intro">
          <h3>简介</h3>
          <p>{{ detail.description }}</p>
        </div>
        <div class="actions">
          <el-button type="primary" @click="handleSearchResource">搜索网盘资源</el-button>
        </div>
      </div>
    </div>

    <!-- Resource Search Results -->
    <el-dialog v-model="resourceDialog" width="85%" class="resource-dialog">
      <template #header>
        <div class="resource-dialog-header">
          <span class="resource-dialog-title">资源搜索结果</span>
          <el-button class="resource-refresh-button" :icon="Refresh" circle size="small" :loading="searchLoading" :disabled="!detail" @click="handleRefreshResource" />
        </div>
      </template>
      <el-tabs v-model="activeTab" class="resource-tabs">
        <el-tab-pane v-for="tab in resourceTabsWithCounts" :key="tab.key" :label="tab.label" :name="tab.key">
          <el-table :data="filteredResources" v-loading="searchLoading" height="500">
            <el-table-column property="name" label="文件名" min-width="250" show-overflow-tooltip />
            <el-table-column property="time" label="发布日期" width="120">
              <template #default="scope">
                {{ formatDate(scope.row.time) }}
              </template>
            </el-table-column>
            <el-table-column property="url" label="链接" min-width="200">
              <template #default="scope">
                <el-link type="primary" :href="scope.row.url" target="_blank" class="resource-link">
                  {{ scope.row.url }}
                </el-link>
              </template>
            </el-table-column>
            <el-table-column property="source" label="来源" width="120" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <div class="op-buttons">
                  <el-button 
                    v-if="canSave(scope.row)"
                    type="primary" 
                    size="small" 
                    @click="handleSave(scope.row)"
                  >
                    一键转存
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 追剧设置对话框 -->
    <el-dialog v-model="trackerConfigDialog" title="是否开启追剧（资源追踪）？" width="400px">
      <div style="margin-bottom: 20px; color: var(--app-text-muted); font-size: 14px;">
        开启后，系统将定期检查该分享链接是否有新内容并自动转存。
      </div>
      <el-form :model="trackerConfigForm" label-width="80px">
        <el-form-item label="检查频率">
          <div style="display: flex; gap: 10px; align-items: center">
            <el-input-number v-model="trackerConfigForm.interval_value" :min="1" style="width: 120px" />
            <el-select v-model="trackerConfigForm.interval_unit" style="width: 90px">
              <el-option label="分钟" value="minute" />
              <el-option label="小时" value="hour" />
              <el-option label="天" value="day" />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="trackerConfigDialog = false">暂不需要</el-button>
        <el-button type="primary" @click="confirmCreateTracker" :loading="trackerSubmitting">开启追剧</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDetail, type DoubanMedia } from '../api/douban';
import { searchPansou, saveToCloud } from '../api/system';
import request from '../api/request';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const detail = ref<DoubanMedia | null>(null);
const loading = ref(false);

const resourceDialog = ref(false);
const searchLoading = ref(false);
const resources = ref<any[]>([]);
const activeTab = ref('115');

// 追剧相关状态
const trackerConfigDialog = ref(false);
const trackerSubmitting = ref(false);
const currentResourceForTracker = ref<any>(null);
const trackerConfigForm = ref({
  interval_value: 6,
  interval_unit: 'hour'
});

const resourceTabs = [
  { label: '115网盘', key: '115' },
  { label: '夸克网盘', key: 'quark' }
];

const resourceTabsWithCounts = computed(() => {
  return resourceTabs.map(tab => {
    const count = resources.value.filter(r => r.type === tab.key).length;
    return {
      ...tab,
      label: `${tab.label} (${count})`
    };
  });
});

const filteredResources = computed(() => {
  return resources.value.filter(r => r.type === activeTab.value);
});

const getCloudTypeFromResource = (row: any): string => {
  if (row.type && (row.type === '115' || row.type === 'quark')) {
    return row.type;
  }
  
  const url = row.url || '';
  if (url.includes('115.com') || url.includes('anxia.com')) {
    return '115';
  }
  if (url.includes('quark.cn')) {
    return 'quark';
  }
  
  return row.type || '';
};

const formatDate = (timeStr: string) => {
  if (!timeStr) return '-';
  // Extract YYYY-MM-DD using regex or simple split
  const match = timeStr.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : timeStr;
};

const canSave = (row: any) => {
  const type = getCloudTypeFromResource(row);
  return type === '115' || type === 'quark';
};

// keep helper to avoid future reference warnings

const fetchData = async () => {
  const { id, type } = route.params;
  loading.value = true;
  try {
    detail.value = await getDetail(type as string, id as string);
  } finally {
    loading.value = false;
  }
};

const executeResourceSearch = async (forceRefresh = false) => {
  if (!detail.value) return;
  resourceDialog.value = true;
  searchLoading.value = true;
  resources.value = [];
  try {
    const data = await searchPansou(detail.value.title, forceRefresh);
    resources.value = (data as any[]).map(item => ({
      ...item,
      type: getCloudTypeFromResource(item)
    }));
    if (data.length === 0) {
      ElMessage.warning('未找到相关网盘资源');
    }
  } catch (error: any) {
    console.error('Pansou search failed:', error);
    const errorCode = error?.response?.data?.code || '';
    const errorMsg = error?.response?.data?.error || error?.message || '搜索失败';
    if (errorCode === 'PANSOU_NOT_CONFIGURED') {
      ElMessageBox.confirm(
        '未配置盘搜 API，请在设置页填写 pansou_url',
        '盘搜未配置',
        {
          confirmButtonText: '去设置',
          cancelButtonText: '知道了',
          type: 'warning'
        }
      ).then(() => {
        router.push('/settings');
      }).catch(() => {});
      resourceDialog.value = false;
      return;
    }
    ElMessage.error(errorMsg);
  } finally {
    searchLoading.value = false;
  }
};

const handleSearchResource = async () => {
  await executeResourceSearch(false);
};

const handleRefreshResource = async () => {
  await executeResourceSearch(true);
};

const confirmCreateTracker = async () => {
  if (!currentResourceForTracker.value) return;
  const row = currentResourceForTracker.value;
  const panType = getCloudTypeFromResource(row);
  
  const url = row.url || '';
  const shareCodeMatch = url.match(/\/s\/([a-zA-Z0-9]+)/);
  const shareIdMatch = url.match(/[?&]share_id=([a-zA-Z0-9]+)/);
  const shareCodeParamMatch = url.match(/[?&]share_code=([a-zA-Z0-9]+)/);
  const shareCode = shareCodeMatch?.[1] || shareIdMatch?.[1] || shareCodeParamMatch?.[1] || 'unknown';
  const resolvedType = panType || 'quark';
  const taskName = `${resolvedType}-${shareCode}`;
  
  trackerSubmitting.value = true;
  try {
    await request.post('/tracker/tasks', {
      name: taskName,
      share_url: row.url,
      pan_type: panType,
      interval_value: trackerConfigForm.value.interval_value,
      interval_unit: trackerConfigForm.value.interval_unit
    });
    ElMessage.success(`追剧任务创建成功`);
    trackerConfigDialog.value = false;
  } catch (error) {
    // Error handled by interceptor
  } finally {
    trackerSubmitting.value = false;
  }
};

const handleSave = async (row: any) => {
  const type = getCloudTypeFromResource(row);
  if (!type) return;
  
  try {
    const res = await saveToCloud({
      shareUrl: row.url,
      type,
      mediaName: detail.value?.title || '未知'
    });
    
    ElNotification({
      title: '转存成功',
      message: h('div', null, [
        h('span', null, res.message || '同步任务已提交'),
        h('br'),
        h('span', { 
          style: 'color: #409eff; cursor: pointer; text-decoration: underline; margin-top: 8px; display: inline-block;',
          onClick: () => {
            router.push('/tasks');
          }
        }, '点击前往“任务”页查看进度')
      ]),
      type: 'success',
      duration: 5000
    });

    // 转存成功后，如果是夸克网盘，询问是否开启追剧
    if (type === 'quark') {
      setTimeout(() => {
        ElMessageBox.confirm(
          '转存成功！该资源是夸克链接，是否需要开启追剧（资源追踪）功能？',
          '追剧提醒',
          {
            confirmButtonText: '开启追剧',
            cancelButtonText: '暂不需要',
            type: 'info',
          }
        ).then(() => {
          currentResourceForTracker.value = row;
          trackerConfigDialog.value = true;
        }).catch(() => {
          // 用户选择不追剧
        });
      }, 500);
    }
  } catch (e) {
    const errorMsg = (e as any)?.response?.data?.error || (e as any)?.message || '转存失败';
    ElNotification({
      title: '转存失败',
      message: errorMsg,
      type: 'error',
      duration: 3500
    });
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.detail-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.detail-container {
  display: flex;
  gap: 40px;
  background: var(--app-surface);
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
}

.left {
  flex-shrink: 0;
}

.main-poster {
  width: 300px;
  height: 450px;
  border-radius: 4px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.right {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.title {
  margin: 0 0 15px 0;
  font-size: 28px;
  color: var(--app-text-primary);
}

.year {
  color: var(--app-text-muted);
  font-weight: normal;
  font-size: 20px;
}

.meta {
  margin-bottom: 25px;
}

.rating-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.score-text {
  font-size: 22px;
  font-weight: bold;
  color: #ff9900;
}

.rating-count {
  font-size: 13px;
  color: var(--app-text-muted);
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  font-size: 14px;
  line-height: 1.5;
}

.label {
  color: var(--app-text-muted);
  width: 50px;
  flex-shrink: 0;
}

.value {
  color: var(--app-text-primary);
  flex-grow: 1;
}

.genre-tag {
  margin-right: 6px;
  margin-bottom: 4px;
}

:deep(.el-rate__icon) {
  font-size: 22px;
  margin-right: 2px;
}

.intro {
  margin: 20px 0 30px 0;
  border-top: 1px solid var(--app-border-light);
  padding-top: 20px;
}

.intro h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: var(--app-text-primary);
}

.intro p {
  line-height: 1.8;
  color: var(--app-text-secondary);
  font-size: 14px;
  margin: 0;
  white-space: pre-wrap;
}

.actions {
  display: flex;
  gap: 15px;
  margin-top: auto;
  padding-top: 20px;
}

.resource-link {
  word-break: break-all;
  font-size: 12px;
}

.resource-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.resource-dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text-primary);
}

.resource-refresh-button {
  margin-left: 4px;
}

.resource-tabs {
  margin-top: -10px;
}

.resource-loading {
  padding: 24px 16px;
  color: var(--app-text-muted);
  font-size: 14px;
}

.op-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.text-gray {
  color: var(--app-text-muted);
  font-size: 12px;
}

:deep(.resource-dialog .el-dialog__body) {
  padding-top: 10px;
}
</style>
