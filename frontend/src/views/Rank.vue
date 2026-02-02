<template>
  <div class="rank-container">
    <div class="rank-header">
      <div class="filters-section">
        <div class="filter-group">
          <div class="filter-label">类型</div>
          <div class="filter-options">
            <span
              v-for="item in typeOptions"
              :key="item.value"
              class="filter-item"
              :class="{ active: selectedType === item.value }"
              @click="handleTypeChange(item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>
        <div class="filter-group">
          <div class="filter-label">分数</div>
          <div class="filter-options">
            <span
              v-for="item in scoreOptions"
              :key="item.value"
              class="filter-item"
              :class="{ active: selectedScore === item.value }"
              @click="handleScoreChange(item.value)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="rank-content" v-loading="loading">
      <div v-if="items.length > 0" class="media-grid">
        <div 
          v-for="item in items" 
          :key="item.id" 
          class="media-card" 
          @click="goToDetail(item)"
        >
          <div class="poster-wrapper">
            <el-image :src="item.poster" fit="cover" class="poster" loading="lazy">
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
      <el-empty v-else description="暂无内容" />
    </div>

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
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { getTopList, type DoubanMedia } from '../api/douban';

interface OptionItem {
  label: string;
  value: string;
}

const typeOptions: OptionItem[] = [
  { label: '剧情', value: '11' },
  { label: '喜剧', value: '24' },
  { label: '动作', value: '5' },
  { label: '爱情', value: '13' },
  { label: '科幻', value: '17' },
  { label: '动画', value: '25' },
  { label: '悬疑', value: '10' },
  { label: '惊悚', value: '19' },
  { label: '恐怖', value: '20' },
  { label: '纪录片', value: '1' },
  { label: '短片', value: '23' },
  { label: '情色', value: '6' },
  { label: '音乐', value: '14' },
  { label: '歌舞', value: '7' },
  { label: '家庭', value: '28' },
  { label: '儿童', value: '8' },
  { label: '传记', value: '2' },
  { label: '历史', value: '4' },
  { label: '战争', value: '22' },
  { label: '犯罪', value: '3' },
  { label: '西部', value: '27' },
  { label: '奇幻', value: '16' },
  { label: '冒险', value: '15' },
  { label: '灾难', value: '12' },
  { label: '武侠', value: '29' },
  { label: '古装', value: '30' },
  { label: '运动', value: '18' },
  { label: '黑色电影', value: '31' }
];

const scoreOptions: OptionItem[] = Array.from({ length: 10 }, (_, index) => {
  const start = 90 - index * 10;
  const end = start + 10;
  return { label: `${start}-${end}`, value: `${start}-${end}` };
});

const selectedType = ref(typeOptions[0]?.value ?? '24');
const selectedScore = ref(scoreOptions[0]?.value ?? '90-100');
const loading = ref(false);
const loadingMore = ref(false);
const noMore = ref(false);
const start = ref(0);
const count = 20;
const items = ref<DoubanMedia[]>([]);
const route = useRoute();
const router = useRouter();

const getStateKey = () => `horace_movie_list_state_${route.fullPath}`;

const restoreState = async () => {
  const saved = localStorage.getItem(getStateKey());
  if (!saved) return false;
  try {
    const state = JSON.parse(saved);
    selectedType.value = state.selectedType ?? selectedType.value;
    selectedScore.value = state.selectedScore ?? selectedScore.value;
    items.value = Array.isArray(state.items) ? state.items : [];
    start.value = Number.isFinite(state.start) ? state.start : items.value.length;
    noMore.value = Boolean(state.noMore);
    await nextTick();
    window.scrollTo(0, Number(state.scrollY) || 0);
    return items.value.length > 0;
  } catch (e) {
    return false;
  }
};

const saveState = () => {
  const payload = {
    selectedType: selectedType.value,
    selectedScore: selectedScore.value,
    items: items.value,
    start: start.value,
    noMore: noMore.value,
    scrollY: window.scrollY
  };
  localStorage.setItem(getStateKey(), JSON.stringify(payload));
};

const handleTypeChange = (value: string) => {
  if (selectedType.value === value) return;
  selectedType.value = value;
  refreshData();
};

const handleScoreChange = (value: string) => {
  if (selectedScore.value === value) return;
  selectedScore.value = value;
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
    const [scoreStart, scoreEnd] = selectedScore.value.split('-').map(Number);
    const interval_id = Number.isFinite(scoreStart) && Number.isFinite(scoreEnd) ? `${scoreEnd}:${scoreStart}` : '100:90';
    const res = await getTopList({
      type: selectedType.value,
      interval_id,
      start: start.value,
      count
    });
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
    console.error('Failed to fetch rank list:', error);
    items.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const goToDetail = (item: DoubanMedia) => {
  router.push(`/detail/${item.type || 'movie'}/${item.id}`);
};

onBeforeRouteLeave(() => {
  saveState();
});

onMounted(async () => {
  const restored = await restoreState();
  if (!restored) {
    fetchData();
  }
});
</script>

<style scoped>
.rank-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.rank-header {
  margin-bottom: 30px;
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

.rank-content {
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
  position: relative;
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
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
</style>
