<template>
  <div class="search">
    <el-input 
      v-model="query" 
      placeholder="输入关键词搜索影视资源..." 
      class="search-input"
      @keyup.enter="handleSearch"
    >
      <template #append>
        <el-button @click="handleSearch"><el-icon><SearchIcon /></el-icon></el-button>
      </template>
    </el-input>

    <!-- 搜索历史 -->
    <div v-if="searchHistory.length > 0 && !loading" class="history-container">
      <div class="history-header">
        <span class="history-title">搜索历史</span>
        <el-button link type="danger" size="small" @click="clearHistory">清空</el-button>
      </div>
      <div class="history-tags">
        <el-tag
          v-for="tag in searchHistory"
          :key="tag"
          class="history-tag"
          closable
          @click="quickSearch(tag)"
          @close="removeHistoryItem(tag)"
        >
          {{ tag }}
        </el-tag>
      </div>
    </div>

    <div v-loading="loading" class="media-grid">
      <el-card 
        v-for="item in list" 
        :key="item.id" 
        class="media-card" 
        :body-style="{ padding: '0px' }"
        @click="goToDetail(item)"
      >
        <div class="poster-wrapper">
          <el-image :src="item.poster" fit="cover" class="poster">
            <template #error>
              <div class="image-slot">无海报</div>
            </template>
          </el-image>
          <div class="rating">{{ item.rating }}</div>
        </div>
        <div class="info">
          <div class="title">{{ item.title }}</div>
          <div class="subtitle">{{ item.card_subtitle || item.year }}</div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search as SearchIcon } from '@element-plus/icons-vue';
import { searchDouban, type DoubanMedia } from '../api/douban';

const router = useRouter();
const query = ref('');
const list = ref<DoubanMedia[]>([]);
const loading = ref(false);
const searchHistory = ref<string[]>([]);

// 根据当前登录用户生成不同的历史记录 Key
const getHistoryKey = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      // 使用用户 ID 或用户名作为后缀，确保每个用户历史记录独立
      return `horace_movie_search_history_${user.id || user.username}`;
    } catch (e) {
      return 'horace_movie_search_history_guest';
    }
  }
  return 'horace_movie_search_history_guest';
};

onMounted(() => {
  const historyKey = getHistoryKey();
  const saved = localStorage.getItem(historyKey);
  if (saved) {
    try {
      searchHistory.value = JSON.parse(saved);
    } catch (e) {
      searchHistory.value = [];
    }
  }
});

const saveHistory = (keyword: string) => {
  if (!keyword.trim()) return;
  const history = [...searchHistory.value];
  const index = history.indexOf(keyword);
  if (index > -1) {
    history.splice(index, 1);
  }
  history.unshift(keyword);
  searchHistory.value = history.slice(0, 10); // 只保留最近 10 条
  localStorage.setItem(getHistoryKey(), JSON.stringify(searchHistory.value));
};

const handleSearch = async () => {
  if (!query.value.trim()) return;
  saveHistory(query.value);
  loading.value = true;
  try {
    list.value = await searchDouban(query.value);
  } finally {
    loading.value = false;
  }
};

const quickSearch = (keyword: string) => {
  query.value = keyword;
  handleSearch();
};

const removeHistoryItem = (keyword: string) => {
  searchHistory.value = searchHistory.value.filter(item => item !== keyword);
  localStorage.setItem(getHistoryKey(), JSON.stringify(searchHistory.value));
};

const clearHistory = () => {
  searchHistory.value = [];
  localStorage.removeItem(getHistoryKey());
};

const goToDetail = (item: DoubanMedia) => {
  const mediaType = item.type || 'movie';
  const detailUrl = router.resolve(`/detail/${mediaType}/${item.id}`);
  window.open(detailUrl.href, '_blank');
};
</script>

<style scoped>
.search-input {
  max-width: 600px;
  margin: 20px auto 10px;
  display: flex;
}

.history-container {
  max-width: 600px;
  margin: 0 auto 20px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-title {
  font-size: 13px;
  color: var(--app-text-muted);
  font-weight: 500;
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.history-tag:hover {
  background-color: var(--app-primary-soft);
  border-color: var(--app-primary);
  color: var(--app-primary);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px;
  padding: 20px 0;
}
.media-card {
  cursor: pointer;
  transition: transform 0.3s;
}
.media-card:hover {
  transform: translateY(-5px);
}
.poster-wrapper {
  position: relative;
  aspect-ratio: 2/3;
}
.poster {
  width: 100%;
  height: 100%;
}
.rating {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.7);
  color: #ff9900;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.info {
  padding: 10px;
}
.title {
  font-size: 14px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subtitle {
  font-size: 12px;
  color: var(--app-text-muted);
}
.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
}
</style>
