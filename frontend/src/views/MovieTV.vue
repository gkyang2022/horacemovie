<template>
  <div class="tv-container">
    <div class="tv-header">
      <div class="tabs-titles">
        <h1 class="page-title tab-title" :class="{ active: activeTab === 'popular' }" @click="handleTabChange('popular')">热门剧集</h1>
        <span class="tab-divider">|</span>
        <h1 class="page-title tab-title" :class="{ active: activeTab === 'all' }" @click="handleTabChange('all')">全部</h1>
      </div>

      <!-- 热门子选项卡 -->
      <div v-if="activeTab === 'popular'" class="sub-tabs">
        <span 
          v-for="sub in hotSubTabs" 
          :key="sub.value"
          class="sub-tab-item"
          :class="{ active: activeHotSubTab === sub.value }"
          @click="handleHotSubTabChange(sub.value)"
        >
          {{ sub.label }}
        </span>
      </div>

      <!-- 筛选器 (仅在“全部” Tab 显示) -->
      <div v-if="activeTab === 'all'" class="filters-section">
        <div class="filter-group">
          <div class="filter-label">类型</div>
          <div class="filter-options">
            <span 
              v-for="item in genres" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.category === item.value }"
              @click="handleFilterChange('category', item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">地区</div>
          <div class="filter-options">
            <span 
              v-for="item in regions" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.region === item.value }"
              @click="handleFilterChange('region', item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">年代</div>
          <div class="filter-options">
            <span 
              v-for="item in years" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.year === item.value }"
              @click="handleFilterChange('year', item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">平台</div>
          <div class="filter-options">
            <span 
              v-for="item in platforms" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.platform === item.value }"
              @click="handleFilterChange('platform', item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <div class="filter-group sort-group">
          <div class="filter-label">排序</div>
          <div class="filter-options">
            <span 
              v-for="sort in sortOptions" 
              :key="sort.value"
              class="filter-item"
              :class="{ active: currentSort === sort.value }"
              @click="handleSortChange(sort.value)"
            >
              {{ sort.label }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 内容展示 -->
    <div v-loading="loading" class="tv-content">
      <div v-if="items.length > 0" class="media-grid">
        <div 
          v-for="item in items" 
          :key="item.id" 
          class="media-card" 
          @click="goToDetail(item)"
        >
          <div class="poster-wrapper">
            <el-image :src="item.poster" fit="cover" class="poster" loading="lazy">
              <template #placeholder>
                <div class="image-slot">加载中...</div>
              </template>
              <template #error>
                <div class="image-slot">无海报</div>
              </template>
            </el-image>
            <div class="rating">{{ item.rating || '暂无' }}</div>
          </div>
          <div class="info">
            <div class="title" :title="item.title">{{ item.title }}</div>
            <div class="subtitle" :title="item.card_subtitle || item.year">
              {{ item.card_subtitle || item.year }}
            </div>
          </div>
        </div>
      </div>
      <el-empty v-else-if="!loading" description="暂无内容" />
      
      <!-- 加载更多 -->
      <div v-if="items.length > 0" class="load-more">
        <el-button 
          :loading="loadingMore" 
          :disabled="noMore"
          @click="fetchData(true)"
        >
          {{ noMore ? '没有更多了' : '加载更多' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { getPopular, getRecommendations, type DoubanMedia } from '../api/douban';

const router = useRouter();
const route = useRoute();

const activeTab = ref<'popular' | 'all'>((route.query.tab as 'popular' | 'all') || 'popular');
const activeHotSubTab = ref<string>((route.query.sub_type as string) || '');
const loading = ref(false);
const loadingMore = ref(false);
const items = ref<DoubanMedia[]>([]);
const start = ref(0);
const count = 20;
const noMore = ref(false);

const hotSubTabs = [
  { label: '综合', value: '' },
  { label: '国产剧', value: 'tv_domestic' },
  { label: '欧美剧', value: 'tv_american' },
  { label: '日剧', value: 'tv_japanese' },
  { label: '韩剧', value: 'tv_korean' },
  { label: '动画', value: 'tv_animation' },
  { label: '纪录片', value: 'tv_documentary' }
];

const genres = [
  { label: '全部', value: 'all' },
  { label: '喜剧', value: '喜剧' },
  { label: '爱情', value: '爱情' },
  { label: '悬疑', value: '悬疑' },
  { label: '动画', value: '动画' },
  { label: '武侠', value: '武侠' },
  { label: '古装', value: '古装' },
  { label: '家庭', value: '家庭' },
  { label: '犯罪', value: '犯罪' },
  { label: '科幻', value: '科幻' },
  { label: '恐怖', value: '恐怖' },
  { label: '历史', value: '历史' },
  { label: '战争', value: '战争' },
  { label: '动作', value: '动作' },
  { label: '冒险', value: '冒险' },
  { label: '传记', value: '传记' },
  { label: '剧情', value: '剧情' },
  { label: '奇幻', value: '奇幻' },
  { label: '惊悚', value: '惊悚' },
  { label: '灾难', value: '灾难' },
  { label: '歌舞', value: '歌舞' },
  { label: '音乐', value: '音乐' }
];

const regions = [
  { label: '全部', value: 'all' },
  { label: '华语', value: '华语' },
  { label: '欧美', value: '欧美' },
  { label: '国外', value: '国外' },
  { label: '韩国', value: '韩国' },
  { label: '日本', value: '日本' },
  { label: '中国大陆', value: '中国大陆' },
  { label: '中国香港', value: '中国香港' },
  { label: '美国', value: '美国' },
  { label: '英国', value: '英国' },
  { label: '泰国', value: '泰国' },
  { label: '中国台湾', value: '中国台湾' },
  { label: '意大利', value: '意大利' },
  { label: '法国', value: '法国' },
  { label: '德国', value: '德国' },
  { label: '西班牙', value: '西班牙' },
  { label: '俄罗斯', value: '俄罗斯' },
  { label: '瑞典', value: '瑞典' },
  { label: '巴西', value: '巴西' },
  { label: '丹麦', value: '丹麦' },
  { label: '印度', value: '印度' },
  { label: '加拿大', value: '加拿大' },
  { label: '爱尔兰', value: '爱尔兰' },
  { label: '澳大利亚', value: '澳大利亚' }
];

const years = [
  { label: '全部', value: 'all' },
  { label: '2020年代', value: '2020年代' },
  { label: '2025', value: '2025' },
  { label: '2024', value: '2024' },
  { label: '2023', value: '2023' },
  { label: '2022', value: '2022' },
  { label: '2021', value: '2021' },
  { label: '2020', value: '2020' },
  { label: '2019', value: '2019' },
  { label: '2010年代', value: '2010年代' },
  { label: '2000年代', value: '2000年代' },
  { label: '90年代', value: '90年代' },
  { label: '80年代', value: '80年代' },
  { label: '70年代', value: '70年代' },
  { label: '60年代', value: '60年代' },
  { label: '更早', value: '更早' }
];

const platforms = [
  { label: '全部', value: 'all' },
  { label: '腾讯视频', value: '腾讯视频' },
  { label: '爱奇艺', value: '爱奇艺' },
  { label: '优酷', value: '优酷' },
  { label: '湖南卫视', value: '湖南卫视' },
  { label: 'Netflix', value: 'Netflix' },
  { label: 'HBO', value: 'HBO' },
  { label: 'BBC', value: 'BBC' },
  { label: 'NHK', value: 'NHK' },
  { label: 'CBS', value: 'CBS' },
  { label: 'NBC', value: 'NBC' },
  { label: 'tvN', value: 'tvN' }
];

const sortOptions = [
  { label: '综合排序', value: 'T' },
  { label: '近期热度', value: 'U' },
  { label: '首播时间', value: 'R' },
  { label: '高分优先', value: 'G' }
];

const currentFilters = reactive({
  category: 'all',
  region: 'all',
  year: 'all',
  platform: 'all'
});
const currentSort = ref('T');

const handleTabChange = (tab: 'popular' | 'all') => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
  refreshData();
};

const handleHotSubTabChange = (value: string) => {
  if (activeHotSubTab.value === value) return;
  activeHotSubTab.value = value;
  router.replace({ query: { ...route.query, sub_type: value || undefined } });
  refreshData();
};

const handleFilterChange = (key: 'category' | 'region' | 'year' | 'platform', value: string) => {
  if (currentFilters[key] === value) return;
  currentFilters[key] = value;
  refreshData();
};

const handleSortChange = (value: string) => {
  if (currentSort.value === value) return;
  currentSort.value = value;
  refreshData();
};

const refreshData = () => {
  start.value = 0;
  items.value = [];
  noMore.value = false;
  fetchData();
};

const fetchData = async (isMore = false) => {
  if (isMore) {
    loadingMore.value = true;
  } else {
    loading.value = true;
  }

  try {
    let res: DoubanMedia[] = [];
    if (activeTab.value === 'popular') {
      res = await getPopular('tv', start.value, count, activeHotSubTab.value);
    } else {
      res = await getRecommendations({
        kind: 'tv',
        category: currentFilters.category === 'all' ? undefined : currentFilters.category,
        region: currentFilters.region === 'all' ? undefined : currentFilters.region,
        year: currentFilters.year === 'all' ? undefined : currentFilters.year,
        platform: currentFilters.platform === 'all' ? undefined : currentFilters.platform,
        sort: currentSort.value,
        start: start.value,
        count: count
      });
    }

    if (res.length < count) {
      noMore.value = true;
    }
    
    if (isMore) {
      items.value = [...items.value, ...res];
    } else {
      items.value = res;
    }
    
    start.value += res.length;
  } catch (error) {
    console.error('Failed to fetch TV data:', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const goToDetail = (item: DoubanMedia) => {
  router.push(`/detail/${item.type || 'tv'}/${item.id}`);
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.tv-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.tv-header {
  margin-bottom: 30px;
}

.tabs-titles {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

.tab-title {
  cursor: pointer;
  color: #909399;
  transition: all 0.3s;
  margin-bottom: 0;
  font-size: 24px;
}

.tab-title:hover {
  color: #409eff;
}

.tab-title.active {
  color: #303133;
  font-weight: 600;
}

.tab-divider {
  color: #dcdfe6;
  font-size: 20px;
}

.sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.sub-tab-item {
  font-size: 15px;
  color: #606266;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 20px;
  background: #f5f7fa;
  transition: all 0.3s;
}

.sub-tab-item:hover {
  color: #409eff;
  background: #ecf5ff;
}

.sub-tab-item.active {
  background: #409eff;
  color: #fff;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

.filters-section {
  background: #f8f9fb;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.filter-group {
  display: flex;
  align-items: flex-start;
  margin-bottom: 15px;
}

.filter-group:last-child {
  margin-bottom: 0;
}

.filter-label {
  font-size: 14px;
  color: #909399;
  width: 60px;
  flex-shrink: 0;
  padding-top: 4px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-item {
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 4px;
  transition: all 0.2s;
}

.filter-item:hover {
  color: #409eff;
}

.filter-item.active {
  background-color: #409eff;
  color: #fff;
  font-weight: 500;
}

.sort-group {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ebedf0;
}

.tv-content {
  min-height: 400px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 25px;
  margin-bottom: 40px;
}

.media-card {
  cursor: pointer;
  transition: all 0.3s;
}

.media-card:hover {
  transform: translateY(-8px);
}

.poster-wrapper {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.poster {
  width: 100%;
  height: 100%;
  transition: transform 0.5s ease;
}

.media-card:hover .poster {
  transform: scale(1.05);
}

.rating {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  color: #ff9900;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.info {
  margin-top: 10px;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
  font-size: 14px;
}

@media (max-width: 768px) {
  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }
  
  .tab-title {
    font-size: 20px;
  }
}
</style>
