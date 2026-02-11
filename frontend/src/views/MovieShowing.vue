<template>
  <div class="showing-container">
    <div class="showing-header">
      <div class="tabs-titles">
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'showing' }"
          @click="handleTabChange('showing')"
        >正在上映</span>
        <span class="tab-divider">|</span>
        <span 
          class="tab-title" 
          :class="{ active: activeTab === 'soon' }"
          @click="handleTabChange('soon')"
        >即将上映</span>
      </div>
    </div>

    <!-- 内容展示 -->
    <div v-loading="loading" class="showing-content">
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
            <div v-if="activeTab === 'showing'" class="rating">{{ item.rating || '暂无' }}</div>
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

const activeTab = ref<'showing' | 'soon'>('showing');
const loading = ref(false);
const loadingMore = ref(false);
const items = ref<DoubanMedia[]>([]);
const start = ref(0);
const count = 20;
const noMore = ref(false);

const initFromQuery = () => {
  const type = route.query.type as string;
  if (type === 'soon') {
    activeTab.value = 'soon';
  } else {
    activeTab.value = 'showing';
  }
};

const handleTabChange = (tab: 'showing' | 'soon') => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  // 更新 URL 方便刷新或分享
  router.replace({ query: { ...route.query, type: tab } });
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
    const response = await getPopular(activeTab.value, start.value, count);
    const res = response.items;
    const responseLength = response.rawCount;
    if (responseLength < count) {
      noMore.value = true;
    }
    
    if (isMore) {
      items.value = [...items.value, ...res];
    } else {
      items.value = res;
    }
    
    start.value += responseLength;
  } catch (error) {
    console.error('Failed to fetch showing data:', error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const formatPubdate = (pubdate: string) => {
  if (!pubdate) return '';
  const match = pubdate.match(/(\d{4}-\d{2}-\d{2})/);
  if (match && match[1]) {
    const date = new Date(match[1]);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return pubdate;
};

const goToDetail = (item: DoubanMedia) => {
  const detailUrl = router.resolve(`/detail/movie/${item.id}`);
  window.open(detailUrl.href, '_blank');
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
.showing-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.showing-header {
  margin-bottom: 30px;
}

.showing-content {
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

.info {
  margin-top: 10px;
}

.title {
  font-size: 15px;
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
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 15px;
  }
}

@media (max-width: 500px) {
  .showing-container {
    padding: 12px;
  }
  .media-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
}
</style>
