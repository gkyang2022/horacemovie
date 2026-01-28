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
          <el-button type="success" plain @click="handleTrack">一键追踪</el-button>
        </div>
      </div>
    </div>

    <!-- Resource Search Results -->
    <el-dialog v-model="resourceDialog" title="资源搜索结果" width="85%" class="resource-dialog">
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
                <el-button 
                  v-if="canSave(scope.row)"
                  type="primary" 
                  size="small" 
                  @click="handleSave(scope.row)"
                >
                  转存到{{ getSaveTargetName(scope.row) }}
                </el-button>
                <span v-else class="text-gray">不支持转存</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { getDetail, type DoubanMedia } from '../api/douban';
import { searchPansou, saveToCloud } from '../api/system';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const detail = ref<DoubanMedia | null>(null);
const loading = ref(false);

const resourceDialog = ref(false);
const searchLoading = ref(false);
const resources = ref<any[]>([]);
const activeTab = ref('115');

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

const getSaveTargetName = (row: any) => {
  const type = getCloudTypeFromResource(row);
  return type === '115' ? '115' : '夸克';
};

const fetchData = async () => {
  const { id, type } = route.params;
  loading.value = true;
  try {
    detail.value = await getDetail(type as string, id as string);
  } finally {
    loading.value = false;
  }
};

const handleSearchResource = async () => {
  if (!detail.value) return;
  resourceDialog.value = true;
  searchLoading.value = true;
  resources.value = []; // Clear previous results
  try {
    const data = await searchPansou(detail.value.title);
    resources.value = (data as any[]).map(item => ({
      ...item,
      type: getCloudTypeFromResource(item)
    }));
    if (data.length === 0) {
      ElMessage.warning('未找到相关网盘资源');
    }
  } catch (error) {
    console.error('Pansou search failed:', error);
    // Error is already shown by request interceptor, 
    // we just need to make sure the UI reflects the failure
    resourceDialog.value = false; // Close dialog on error to avoid showing empty state
  } finally {
    searchLoading.value = false;
  }
};

const handleTrack = () => {
  ElMessageBox.prompt('请输入追踪关键词（默认影视名）', '一键追踪', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: detail.value?.title
  }).then(({ value }) => {
    ElMessage.success(`已开始追踪关键词: ${value}`);
  });
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
    ElMessage.success(res.message || '已提交转存任务');
  } catch (e) {
    // Error handled by interceptor
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
  background: #fff;
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
  color: #303133;
}

.year {
  color: #909399;
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
  color: #909399;
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
  color: #909399;
  width: 50px;
  flex-shrink: 0;
}

.value {
  color: #303133;
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
  border-top: 1px solid #ebeef5;
  padding-top: 20px;
}

.intro h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: #303133;
}

.intro p {
  line-height: 1.8;
  color: #606266;
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

.resource-tabs {
  margin-top: -10px;
}

.text-gray {
  color: #909399;
  font-size: 12px;
}

:deep(.resource-dialog .el-dialog__body) {
  padding-top: 10px;
}
</style>
