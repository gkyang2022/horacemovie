<template>
  <div class="explore-container">
    <div class="explore-header">
      <h1 class="page-title">选电影/电视剧</h1>
      
      <!-- 主类型选择 -->
      <div class="filter-group">
        <div class="filter-label">类型</div>
        <div class="filter-options">
          <span 
            v-for="cat in mainCategories" 
            :key="cat.value"
            class="filter-item"
            :class="{ active: currentMainCategory === cat.value }"
            @click="handleMainCategoryChange(cat.value)"
          >
            {{ cat.label }}
          </span>
        </div>
      </div>

      <!-- 子分类/排序选择 -->
      <div class="filter-group">
        <div class="filter-label">排序</div>
        <div class="filter-options">
          <span 
            v-for="sub in subCategories" 
            :key="sub.value"
            class="filter-item"
            :class="{ active: currentSubCategory === sub.value }"
            @click="handleSubCategoryChange(sub.value)"
          >
            {{ sub.label }}
          </span>
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
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getPopular, type DoubanMedia } from '../api/douban';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const loadingMore = ref(false);
const items = ref<DoubanMedia[]>([]);
const start = ref(0);
const count = 20;
const noMore = ref(false);

const mainCategories = [
  { label: '电影', value: 'movie' },
  { label: '电视剧', value: 'tv' },
  { label: '综艺', value: 'variety' },
  { label: '动漫', value: 'animation' },
  { label: '纪录片', value: 'documentary' },
];

const movieSubCategories = [
  { label: '热门', value: 'movie' },
  { label: '最新', value: 'movie_latest' },
  { label: '高分', value: 'movie_score' },
  { label: '冷门', value: 'movie_unpopular' },
  { label: '正在上映', value: 'showing' },
  { label: '即将上映', value: 'soon' },
];

const tvSubCategories = [
  { label: '热门', value: 'tv' },
  { label: '最新', value: 'tv_latest' },
  { label: '高分', value: 'tv_score' },
];

const otherSubCategories = [
  { label: '热门', value: 'hot' },
];

const currentMainCategory = ref('movie');
const currentSubCategory = ref('movie');
const subCategories = ref(movieSubCategories);

const initFromQuery = () => {
  const type = route.query.type as string;
  if (type) {
    if (['showing', 'soon', 'movie', 'movie_latest', 'movie_score', 'movie_unpopular'].includes(type)) {
      currentMainCategory.value = 'movie';
      currentSubCategory.value = type;
    } else if (['tv', 'tv_latest', 'tv_score'].includes(type)) {
      currentMainCategory.value = 'tv';
      currentSubCategory.value = type;
    } else if (['variety', 'animation', 'documentary'].includes(type)) {
      currentMainCategory.value = type;
      currentSubCategory.value = 'hot';
    }
    updateSubCategories();
  }
};

const updateSubCategories = () => {
  if (currentMainCategory.value === 'movie') {
    subCategories.value = movieSubCategories;
  } else if (currentMainCategory.value === 'tv') {
    subCategories.value = tvSubCategories;
  } else {
    subCategories.value = otherSubCategories;
  }
};

const handleMainCategoryChange = (val: string) => {
  currentMainCategory.value = val;
  updateSubCategories();
  // 默认选中该分类下的第一个子分类
  const firstSub = subCategories.value[0];
  if (firstSub) {
    currentSubCategory.value = firstSub.value;
  }
  refreshData();
};

const handleSubCategoryChange = (val: string) => {
  currentSubCategory.value = val;
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
    // 映射请求类型
    let requestType = currentSubCategory.value;
    if (requestType === 'hot') {
      requestType = currentMainCategory.value;
    }

    const res = await getPopular(requestType, start.value, count);
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
  router.push(`/detail/${item.type || currentMainCategory.value}/${item.id}`);
};

onMounted(() => {
  initFromQuery();
  fetchData();
});

watch(() => route.query.type, () => {
  initFromQuery();
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

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 25px;
}

.filter-group {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.filter-label {
  font-size: 14px;
  color: #909399;
  width: 60px;
  flex-shrink: 0;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.filter-item {
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  transition: all 0.2s;
}

.filter-item:hover {
  color: #409eff;
}

.filter-item.active {
  background-color: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.explore-content {
  min-height: 400px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
  font-size: 15px;
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
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 15px;
  }
}
</style>
