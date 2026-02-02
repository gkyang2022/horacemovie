<template>
  <div class="home-container">
    <div class="home-main">
      <!-- 电影上映 Tab 区域 -->
      <div class="section movie-tabs-section">
        <div class="section-header tabs-header">
          <div class="tabs-titles">
            <h2 
              class="section-title tab-title" 
              :class="{ active: activeMovieTab === 'showing' }"
              @click="activeMovieTab = 'showing'"
            >正在上映</h2>
            <span class="tab-divider">|</span>
            <h2 
              class="section-title tab-title" 
              :class="{ active: activeMovieTab === 'soon' }"
              @click="activeMovieTab = 'soon'"
            >即将上映</h2>
          </div>
          <el-button link type="primary" class="view-more" @click="goToExplore(activeMovieTab === 'showing' ? 'showing' : 'soon')">
            查看更多 <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
        
        <div class="media-row-container" v-loading="loading[activeMovieTab]">
          <div class="media-row">
            <div 
              v-for="item in data[activeMovieTab]" 
              :key="item.id" 
              class="media-card-mini" 
              @click="goToDetail(item, activeMovieTab === 'showing' ? 'movie' : 'movie')"
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
                <div v-if="activeMovieTab === 'showing'" class="rating">{{ item.rating }}</div>
                <div v-else-if="item.pubdate && item.pubdate.length" class="pubdate-tag">
                  {{ formatPubdate(item.pubdate[0] || '') }}
                </div>
              </div>
              <div class="info">
                <div class="title" :title="item.title">{{ item.title }}</div>
                <div class="subtitle" :title="item.card_subtitle || item.year">
                  {{ item.card_subtitle || item.year }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 其他常规 Section -->
      <div v-for="section in otherSections" :key="section.type" class="section">
        <div class="section-header">
          <h2 class="section-title">{{ section.title }}</h2>
          <el-button link type="primary" class="view-more" @click="goToExplore(section.type)">
            查看更多 <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
        
        <div class="media-row-container" v-loading="loading[section.type]">
          <div class="media-row">
            <div 
              v-for="item in data[section.type]" 
              :key="item.id" 
              class="media-card-mini" 
              @click="goToDetail(item, section.type)"
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
                <div class="rating">{{ item.rating }}</div>
              </div>
              <div class="info">
                <div class="title" :title="item.title">{{ item.title }}</div>
                <div class="subtitle" :title="item.card_subtitle || item.year">
                  {{ item.card_subtitle || item.year }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧榜单列 -->
    <div class="home-sidebar">
      <div class="sidebar-section" v-loading="loadingCharts">
        <div class="sidebar-header">
          <h3 class="sidebar-title">一周口碑榜</h3>
        </div>
        <div class="chart-list">
          <div 
            v-for="(item, index) in charts.weekly" 
            :key="item.id" 
            class="chart-item"
            @click="goToDetail(item, 'movie')"
          >
            <span class="chart-rank" :class="{ 'top-three': index < 3 }">{{ index + 1 }}</span>
            <div class="chart-item-info">
              <span class="chart-item-title">{{ item.title }}</span>
              <span class="chart-item-subtitle">{{ item.card_subtitle || item.year }}</span>
            </div>
            <span class="chart-item-rating">{{ item.rating }}</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section" v-loading="loadingCharts">
        <div class="sidebar-header">
          <h3 class="sidebar-title">豆瓣新片榜</h3>
        </div>
        <div class="chart-list">
          <div 
            v-for="(item, index) in charts.new" 
            :key="item.id" 
            class="chart-item"
            @click="goToDetail(item, 'movie')"
          >
            <span class="chart-rank" :class="{ 'top-three': index < 3 }">{{ index + 1 }}</span>
            <div class="chart-item-info">
              <span class="chart-item-title">{{ item.title }}</span>
              <span class="chart-item-subtitle">{{ item.card_subtitle || item.year }}</span>
            </div>
            <span class="chart-item-rating">{{ item.rating }}</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section" v-loading="loadingCharts">
        <div class="sidebar-header">
          <h3 class="sidebar-title">华语口碑剧集榜</h3>
        </div>
        <div class="chart-list">
          <div 
            v-for="(item, index) in charts.tvChinese" 
            :key="item.id" 
            class="chart-item"
            @click="goToDetail(item, 'tv')"
          >
            <span class="chart-rank" :class="{ 'top-three': index < 3 }">{{ index + 1 }}</span>
            <div class="chart-item-info">
              <span class="chart-item-title">{{ item.title }}</span>
              <span class="chart-item-subtitle">{{ item.card_subtitle || item.year }}</span>
            </div>
            <span class="chart-item-rating">{{ item.rating }}</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section" v-loading="loadingCharts">
        <div class="sidebar-header">
          <h3 class="sidebar-title">全球口碑剧集榜</h3>
        </div>
        <div class="chart-list">
          <div 
            v-for="(item, index) in charts.tvGlobal" 
            :key="item.id" 
            class="chart-item"
            @click="goToDetail(item, 'tv')"
          >
            <span class="chart-rank" :class="{ 'top-three': index < 3 }">{{ index + 1 }}</span>
            <div class="chart-item-info">
              <span class="chart-item-title">{{ item.title }}</span>
              <span class="chart-item-subtitle">{{ item.card_subtitle || item.year }}</span>
            </div>
            <span class="chart-item-rating">{{ item.rating }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@element-plus/icons-vue';
import { getPopular, getCharts, type DoubanMedia } from '../api/douban';

const router = useRouter();

type Category = 'movie' | 'tv' | 'variety' | 'animation' | 'documentary' | 'showing' | 'soon';

interface Section {
  title: string;
  type: Category;
}

const activeMovieTab = ref<'showing' | 'soon'>('showing');

const sections: Section[] = [
  { title: '正在上映', type: 'showing' },
  { title: '即将上映', type: 'soon' },
  { title: '热门电影', type: 'movie' },
  { title: '热门电视剧', type: 'tv' },
  { title: '热门综艺', type: 'variety' },
  { title: '热门纪录片', type: 'documentary' },
  { title: '热门动画', type: 'animation' },
];

const otherSections = computed(() => sections.filter(s => s.type !== 'showing' && s.type !== 'soon'));

const data = reactive<Record<Category, DoubanMedia[]>>({
  movie: [],
  tv: [],
  variety: [],
  animation: [],
  documentary: [],
  showing: [],
  soon: [],
});

const charts = reactive<{ 
  weekly: DoubanMedia[], 
  new: DoubanMedia[],
  tvChinese: DoubanMedia[],
  tvGlobal: DoubanMedia[]
}>({
  weekly: [],
  new: [],
  tvChinese: [],
  tvGlobal: [],
});

const loading = reactive<Record<Category, boolean>>({
  movie: false,
  tv: false,
  variety: false,
  animation: false,
  documentary: false,
  showing: false,
  soon: false,
});

const loadingCharts = ref(false);

const formatPubdate = (pubdate: string) => {
  if (!pubdate) return '';
  // 匹配日期格式 YYYY-MM-DD
  const match = pubdate.match(/(\d{4}-\d{2}-\d{2})/);
  if (match && match[1]) {
    const date = new Date(match[1]);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return pubdate;
};

const fetchSectionData = async (type: Category) => {
  loading[type] = true;
  try {
    data[type] = await getPopular(type, 0, 18);
  } catch (error) {
    console.error(`Failed to fetch ${type}:`, error);
  } finally {
    loading[type] = false;
  }
};

const fetchChartsData = async () => {
  loadingCharts.value = true;
  try {
    const res = await getCharts();
    charts.weekly = res.weekly;
    charts.new = res.new;
    charts.tvChinese = res.tvChinese;
    charts.tvGlobal = res.tvGlobal;
  } catch (error) {
    console.error('Failed to fetch charts:', error);
  } finally {
    loadingCharts.value = false;
  }
};

const goToDetail = (item: DoubanMedia, defaultType: string) => {
  router.push(`/detail/${item.type || defaultType}/${item.id}`);
};

const goToExplore = (type: string) => {
  if (type === 'showing' || type === 'soon') {
    router.push(`/showing?type=${type}`);
  } else if (type === 'documentary') {
    router.push('/documentary');
  } else if (type === 'animation') {
    router.push('/animation');
  } else if (type === 'variety') {
    router.push('/variety');
  } else if (type === 'tv') {
    router.push('/tv');
  } else {
    router.push(`/explore?type=${type}`);
  }
};

onMounted(() => {
  sections.forEach(s => fetchSectionData(s.type));
  fetchChartsData();
});
</script>

<style scoped>
.home-container {
  display: flex;
  gap: 30px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
}

.home-main {
  flex: 1;
  min-width: 0; /* 防止 flex 子元素溢出 */
}

.home-sidebar {
  width: 320px;
  flex-shrink: 0;
}

.section {
  margin-bottom: 25px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--app-text-primary);
  position: relative;
  padding-left: 15px;
}

.section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 20px;
  background: var(--app-primary);
  border-radius: 2px;
}

.view-more {
  font-size: 14px;
  font-weight: normal;
  color: var(--app-primary);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.3s;
}

.view-more:hover {
  opacity: 0.8;
  transform: translateX(4px);
}

.media-row-container {
  width: 100%;
  overflow: hidden;
}

.media-row {
  display: flex;
  overflow-x: auto;
  gap: 20px;
  padding: 5px 0 15px 0;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border) transparent;
}

.media-row::-webkit-scrollbar {
  height: 6px;
}

.media-row::-webkit-scrollbar-thumb {
  background-color: var(--app-border);
  border-radius: 3px;
}

.media-row::-webkit-scrollbar-track {
  background: transparent;
}

.media-card-mini {
  flex: 0 0 225px;
  width: 225px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
}

.media-card-mini:hover {
  transform: translateY(-8px);
}

  /* Movie Tabs Section Styles */
  .movie-tabs-section {
    margin-bottom: 30px;
  }
  
  .tabs-header {
    margin-bottom: 20px;
  }
  
  .tabs-titles {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .tab-title {
    cursor: pointer;
    padding: 0;
    margin: 0;
    font-size: 22px;
    color: var(--app-text-muted);
    transition: all 0.3s;
    position: relative;
    padding-left: 0;
  }
  
  .tab-title::before {
    display: none;
  }
  
  .tab-title.active {
    color: var(--app-text-primary);
    font-weight: 600;
  }
  
  .tab-title.active::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 0;
    width: 100%;
    height: 3px;
    background: var(--app-primary);
    border-radius: 2px;
  }
  
  .tab-divider {
    font-size: 20px;
    color: var(--app-border);
    font-weight: 300;
  }
  
  .pubdate-tag {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 103, 0, 0.9);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .poster-wrapper {
    position: relative;
    width: 225px;
    height: 338px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  .poster {
    width: 100%;
    height: 100%;
    transition: transform 0.5s ease;
  }
  
  .media-card-mini:hover .poster {
    transform: scale(1.05);
    filter: brightness(0.8);
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
    font-size: 14px;
    font-weight: 600;
    color: var(--app-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }
  
  .subtitle {
    font-size: 12px;
    color: var(--app-text-muted);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  
  /* Sidebar Styles */
  .sidebar-section {
    background: var(--app-surface);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 25px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  }
  
  .sidebar-header {
    margin-bottom: 15px;
    border-bottom: 1px solid var(--app-border-light);
    padding-bottom: 10px;
  }
  
  .sidebar-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--app-text-primary);
  }
  
  .chart-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .chart-item {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    padding: 0;
    margin-bottom: 0;
    transition: color 0.2s;
    border-bottom: 1px solid var(--app-border-light);
  }
  
  .chart-item:last-child {
    border-bottom: none;
  }
  
  .chart-item:hover {
    color: var(--app-primary);
  }
  
  .chart-rank {
    width: 24px;
    height: 48px; /* 增加高度以适应无 padding 的样式 */
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    color: var(--app-text-muted);
    background: var(--app-surface-muted);
    border-radius: 4px;
    flex-shrink: 0;
  }
  
  .chart-rank.top-three {
    background: var(--app-rank-top-bg);
    color: var(--app-rank-top-text);
  }
  
  .chart-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  
  .chart-item-title {
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .chart-item-subtitle {
    font-size: 12px;
    color: var(--app-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .chart-item-rating {
    font-size: 13px;
    font-weight: bold;
    color: #ff9900;
    min-width: 25px;
    text-align: right;
  }
  
  .image-slot {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    background: var(--app-surface-muted);
    color: var(--app-text-muted);
    font-size: 12px;
  }
  
  @media (max-width: 1200px) {
    .home-sidebar {
      display: none;
    }
  }
  </style>
