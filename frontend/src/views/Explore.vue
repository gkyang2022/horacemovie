<template>
  <div class="explore-container">
    <div class="explore-header">
      <div class="tabs-titles">
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'popular' }" 
          @click="handleTabChange('popular')"
        >
          热门电影
        </span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'latest' }" 
          @click="handleTabChange('latest')"
        >
          最新电影
        </span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'top' }" 
          @click="handleTabChange('top')"
        >
          豆瓣高分
        </span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'unpopular' }" 
          @click="handleTabChange('unpopular')"
        >
          冷门佳片
        </span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'all' }" 
          @click="handleTabChange('all')"
        >全部</span>
      </div>

      <!-- 热门/最新/高分/冷门电影的子标签 (在对应 Tab 显示) -->
      <div v-if="activeTab === 'popular' || activeTab === 'latest' || activeTab === 'top' || activeTab === 'unpopular'" class="sub-tabs">
        <span 
          v-for="tab in hotSubTabs" 
          :key="tab.value"
          class="sub-tab-item"
          :class="{ active: activeHotSubTab === tab.value }"
          @click="handleHotSubTabChange(tab.value)"
        >
          {{ tab.label }}
        </span>
      </div>

      <!-- 多级筛选器 (仅在“全部” Tab 显示) -->
      <div v-if="activeTab === 'all'" class="filters-section">
        <div class="filter-group">
          <div class="filter-label">类型</div>
          <div class="filter-options">
            <span 
              v-for="item in genres" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.genre === item.value }"
              @click="handleFilterChange('genre', item.value)"
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
    <div v-loading="loading" class="explore-content">
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
import { useRoute, useRouter } from 'vue-router';
import { getRecommendations, getPopular, type DoubanMedia } from '../api/douban';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const loadingMore = ref(false);
const items = ref<DoubanMedia[]>([]);
const start = ref(0);
const count = 20;
const noMore = ref(false);

const currentKind = ref<'movie' | 'tv'>('movie');
const activeTab = ref<'popular' | 'latest' | 'top' | 'unpopular' | 'all'>((route.query.tab as 'popular' | 'latest' | 'top' | 'unpopular' | 'all') || 'popular');
const activeHotSubTab = ref<string>((route.query.sub_type as string) || '全部');
const currentSort = ref('T');

const hotSubTabs = [
  { label: '全部', value: '全部' },
  { label: '华语', value: '华语' },
  { label: '欧美', value: '欧美' },
  { label: '韩国', value: '韩国' },
  { label: '日本', value: '日本' }
];

const genres = [
  { label: '全部', value: 'all' },
  { label: '喜剧', value: '喜剧' },
  { label: '爱情', value: '爱情' },
  { label: '动作', value: '动作' },
  { label: '科幻', value: '科幻' },
  { label: '动画', value: '动画' },
  { label: '悬疑', value: '悬疑' },
  { label: '犯罪', value: '犯罪' },
  { label: '惊悚', value: '惊悚' },
  { label: '冒险', value: '冒险' },
  { label: '音乐', value: '音乐' },
  { label: '历史', value: '历史' },
  { label: '奇幻', value: '奇幻' },
  { label: '恐怖', value: '恐怖' },
  { label: '战争', value: '战争' },
  { label: '传记', value: '传记' },
  { label: '歌舞', value: '歌舞' },
  { label: '武侠', value: '武侠' },
  { label: '情色', value: '情色' },
  { label: '灾难', value: '灾难' },
  { label: '西部', value: '西部' },
  { label: '纪录片', value: '纪录片' },
  { label: '短片', value: '短片' }
];

const regions = [
  { label: '全部', value: 'all' },
  { label: '华语', value: '华语' },
  { label: '欧美', value: '欧美' },
  { label: '韩国', value: '韩国' },
  { label: '日本', value: '日本' },
  { label: '中国大陆', value: '中国大陆' },
  { label: '中国香港', value: '中国香港' },
  { label: '美国', value: '美国' },
  { label: '英国', value: '英国' },
  { label: '泰国', value: '泰国' },
  { label: '中国台湾', value: '中国台湾' },
  { label: '法国', value: '法国' },
  { label: '德国', value: '德国' },
  { label: '意大利', value: '意大利' },
  { label: '西班牙', value: '西班牙' },
  { label: '俄罗斯', value: '俄罗斯' },
  { label: '加拿大', value: '加拿大' },
  { label: '澳大利亚', value: '澳大利亚' },
  { label: '巴西', value: '巴西' },
  { label: '丹麦', value: '丹麦' }
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

const sortOptions = [
  { label: '综合排序', value: 'T' },
  { label: '近期热度', value: 'U' },
  { label: '首播时间', value: 'R' },
  { label: '高分优先', value: 'S' }
];

const currentFilters = reactive({
  genre: 'all',
  region: 'all',
  year: 'all'
});

const handleHotSubTabChange = (value: string) => {
  if (activeHotSubTab.value === value) return;
  activeHotSubTab.value = value;
  router.replace({ query: { ...route.query, sub_type: value } });
  refreshData();
};

const handleTabChange = (tab: 'popular' | 'latest' | 'top' | 'unpopular' | 'all') => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  // 切换大 Tab 时，重置子 Tab 为“全部”
  if (tab === 'popular' || tab === 'latest' || tab === 'top' || tab === 'unpopular') {
    activeHotSubTab.value = '全部';
    router.replace({ query: { ...route.query, tab, sub_type: undefined } });
  } else {
    router.replace({ query: { ...route.query, tab } });
  }
  refreshData();
};

const handleFilterChange = (key: 'genre' | 'region' | 'year', value: string) => {
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
    if (activeTab.value === 'popular' || activeTab.value === 'latest' || activeTab.value === 'top' || activeTab.value === 'unpopular') {
      const categoryMap: Record<string, string> = {
        'popular': '热门',
        'latest': '最新',
        'top': '豆瓣高分',
        'unpopular': '冷门佳片'
      };
      const category = categoryMap[activeTab.value];
      res = await getPopular('movie', start.value, count, activeHotSubTab.value, category);
    } else {
      res = await getRecommendations({
        kind: currentKind.value,
        category: currentFilters.genre === 'all' ? undefined : currentFilters.genre,
        region: currentFilters.region === 'all' ? undefined : currentFilters.region,
        year: currentFilters.year === 'all' ? undefined : currentFilters.year,
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
    console.error('Failed to fetch explore data:', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const goToDetail = (item: DoubanMedia) => {
  const detailUrl = router.resolve(`/detail/${item.type || currentKind.value}/${item.id}`);
  window.open(detailUrl.href, '_blank');
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.explore-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.explore-header {
  margin-bottom: 30px;
}

.sub-tabs {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  padding: 0 5px;
}

.sub-tab-item {
  font-size: 15px;
  color: var(--app-text-secondary);
  cursor: pointer;
  padding: 4px 0;
  position: relative;
  transition: all 0.2s;
}

.sub-tab-item:hover {
  color: var(--app-primary);
}

.sub-tab-item.active {
  color: var(--app-primary);
  font-weight: 600;
}

.sub-tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--app-primary);
  border-radius: 2px;
}

.filters-section {
  background: var(--app-surface-alt);
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
  color: var(--app-text-muted);
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
  color: var(--app-text-secondary);
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 4px;
  transition: all 0.2s;
}

.filter-item:hover {
  color: var(--app-primary);
}

.filter-item.active {
  background-color: var(--app-primary);
  color: var(--app-surface);
  font-weight: 500;
}

.explore-content {
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
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle {
  font-size: 13px;
  color: var(--app-text-muted);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
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
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  font-size: 14px;
}

@media (max-width: 768px) {
  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }
}
</style>
