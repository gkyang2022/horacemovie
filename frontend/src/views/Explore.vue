<template>
  <div class="explore-container">
    <div class="explore-header">
      <div class="tabs-titles">
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'popular' }" 
          @click="handleTabChange('popular')"
        >
          热门{{ currentKind === 'movie' ? '电影' : '电视剧' }}
        </span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'all' }" 
          @click="handleTabChange('all')"
        >全部</span>
      </div>
      
      <!-- 主类型切换 (电影/电视剧) -->
      <div class="main-type-tabs">
        <span 
          class="type-tab" 
          :class="{ active: currentKind === 'movie' }"
          @click="handleKindChange('movie')"
        >电影</span>
        <span class="tab-sep">/</span>
        <span 
          class="type-tab" 
          :class="{ active: currentKind === 'tv' }"
          @click="handleKindChange('tv')"
        >电视剧</span>
      </div>

      <!-- 多级筛选器 (仅在“全部” Tab 显示) -->
      <div v-if="activeTab === 'all'" class="filters-section">
        <div class="filter-group">
          <div class="filter-label">形式</div>
          <div class="filter-options">
            <span 
              v-for="item in formats" 
              :key="item.value"
              class="filter-item"
              :class="{ active: currentFilters.format === item.value }"
              @click="handleFilterChange('format', item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <div class="filter-group">
          <div class="filter-label">类型</div>
          <div class="filter-options">
            <span 
              v-for="item in categories" 
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
import { ref, onMounted, reactive, watch } from 'vue';
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

const currentKind = ref<'movie' | 'tv'>((route.query.kind as 'movie' | 'tv') || 'movie');
const activeTab = ref<'popular' | 'all'>((route.query.tab as 'popular' | 'all') || 'all');
const currentSort = ref('T');

const formats = [
  { label: '全部', value: 'all' },
  { label: '电影', value: '电影' },
  { label: '电视剧', value: '电视剧' },
  { label: '综艺', value: '综艺' },
  { label: '动画', value: '动画' },
  { label: '纪录片', value: '纪录片' },
  { label: '短片', value: '短片' }
];

const categories = [
  { label: '全部', value: 'all' },
  { label: '剧情', value: '剧情' },
  { label: '喜剧', value: '喜剧' },
  { label: '动作', value: '动作' },
  { label: '爱情', value: '爱情' },
  { label: '科幻', value: '科幻' },
  { label: '动画', value: '动画' },
  { label: '悬疑', value: '悬疑' },
  { label: '惊悚', value: '惊悚' },
  { label: '恐怖', value: '恐怖' },
  { label: '纪录片', value: '纪录片' },
  { label: '犯罪', value: '犯罪' },
  { label: '奇幻', value: '奇幻' },
  { label: '冒险', value: '冒险' },
  { label: '灾难', value: '灾难' },
  { label: '武侠', value: '武侠' },
  { label: '古装', value: '古装' },
  { label: '家庭', value: '家庭' },
  { label: '传记', value: '传记' },
  { label: '历史', value: '历史' },
  { label: '战争', value: '战争' },
  { label: '歌舞', value: '歌舞' },
  { label: '音乐', value: '音乐' },
  { label: '西部', value: '西部' },
  { label: '运动', value: '运动' },
  { label: '传记', value: '传记' }
];

const regions = [
  { label: '全部', value: 'all' },
  { label: '中国大陆', value: '中国大陆' },
  { label: '美国', value: '美国' },
  { label: '日本', value: '日本' },
  { label: '韩国', value: '韩国' },
  { label: '英国', value: '英国' },
  { label: '法国', value: '法国' },
  { label: '德国', value: '德国' },
  { label: '意大利', value: '意大利' },
  { label: '西班牙', value: '西班牙' },
  { label: '印度', value: '印度' },
  { label: '泰国', value: '泰国' },
  { label: '俄罗斯', value: '俄罗斯' },
  { label: '伊朗', value: '伊朗' },
  { label: '加拿大', value: '加拿大' },
  { label: '澳大利亚', value: '澳大利亚' },
  { label: '爱尔兰', value: '爱尔兰' },
  { label: '瑞典', value: '瑞典' },
  { label: '巴西', value: '巴西' },
  { label: '丹麦', value: '丹麦' }
];

const years = [
  { label: '全部', value: 'all' },
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
  { label: '芒果TV', value: '芒果TV' },
  { label: '哔哩哔哩', value: '哔哩哔哩' },
  { label: '电影网', value: '电影网' },
  { label: '乐视', value: '乐视' },
  { label: 'Netflix', value: 'Netflix' },
  { label: 'Disney+', value: 'Disney+' },
  { label: 'Apple TV+', value: 'Apple TV+' },
  { label: 'HBO', value: 'HBO' },
  { label: 'Amazon', value: 'Amazon' },
  { label: 'Paramount+', value: 'Paramount+' },
  { label: 'Hulu', value: 'Hulu' },
  { label: 'YouTube', value: 'YouTube' }
];

const sortOptions = [
  { label: '综合排序', value: 'T' },
  { label: '近期热度', value: 'U' },
  { label: '首播时间', value: 'R' },
  { label: '高分优先', value: 'G' }
];

const currentFilters = reactive({
  format: 'all',
  category: 'all',
  region: 'all',
  year: 'all',
  platform: 'all'
});

const handleKindChange = (kind: 'movie' | 'tv') => {
  if (currentKind.value === kind) return;
  currentKind.value = kind;
  router.replace({ query: { ...route.query, kind } });
  refreshData();
};

const handleTabChange = (tab: 'popular' | 'all') => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
  refreshData();
};

const handleFilterChange = (key: keyof typeof currentFilters, value: string) => {
  if (currentFilters[key] === value) return;
  (currentFilters[key] as string) = value;
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
      res = await getPopular(currentKind.value, start.value, count);
    } else {
      res = await getRecommendations({
        kind: currentKind.value,
        category: currentFilters.category === 'all' ? undefined : currentFilters.category,
        format: currentFilters.format === 'all' ? undefined : currentFilters.format,
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
    console.error('Failed to fetch explore data:', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const goToDetail = (item: DoubanMedia) => {
  router.push(`/detail/${item.type || currentKind.value}/${item.id}`);
};

onMounted(() => {
  const type = route.query.type as string;
  if (type === 'tv') {
    currentKind.value = 'tv';
  } else if (['variety', 'animation', 'documentary'].includes(type)) {
    // 映射到 category
    const map: Record<string, string> = {
      'variety': '综艺',
      'animation': '动画',
      'documentary': '纪录片'
    };
    const category = map[type];
    if (category) {
      currentFilters.category = category;
    }
    // 动画和纪录片可能是电影也可能是电视剧，这里默认选电影，用户可切
  }
  fetchData();
});

watch(() => route.query.type, (newType) => {
  if (newType === 'movie' || newType === 'tv') {
    currentKind.value = newType as 'movie' | 'tv';
  }
  refreshData();
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

.main-type-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
  font-size: 18px;
}

.type-tab {
  cursor: pointer;
  color: #909399;
  transition: all 0.3s;
}

.type-tab.active {
  color: #303133;
  font-weight: 600;
}

.tab-sep {
  color: #dcdfe6;
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
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebedf0;
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
}
</style>
