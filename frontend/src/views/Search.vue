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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Search as SearchIcon } from '@element-plus/icons-vue';
import { searchDouban, type DoubanMedia } from '../api/douban';

const router = useRouter();
const query = ref('');
const list = ref<DoubanMedia[]>([]);
const loading = ref(false);

const handleSearch = async () => {
  if (!query.value) return;
  loading.value = true;
  try {
    list.value = await searchDouban(query.value);
  } finally {
    loading.value = false;
  }
};

const goToDetail = (item: DoubanMedia) => {
  const mediaType = item.type || 'movie';
  router.push(`/detail/${mediaType}/${item.id}`);
};
</script>

<style scoped>
.search-input {
  max-width: 600px;
  margin: 20px auto;
  display: flex;
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
  color: #909399;
}
.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
}
</style>
