<template>
  <div class="home">
    <el-tabs v-model="activeType" @tab-change="handleTabChange">
      <el-tab-pane label="热门电影" name="movie"></el-tab-pane>
      <el-tab-pane label="热门电视剧" name="tv"></el-tab-pane>
    </el-tabs>

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
import { getPopular, type DoubanMedia } from '../api/douban';

const router = useRouter();
const activeType = ref<'movie' | 'tv'>('movie');
const list = ref<DoubanMedia[]>([]);
const loading = ref(false);

const fetchData = async () => {
  loading.value = true;
  try {
    list.value = await getPopular(activeType.value);
  } finally {
    loading.value = false;
  }
};

const handleTabChange = () => {
  fetchData();
};

const goToDetail = (item: DoubanMedia) => {
  router.push(`/detail/${item.type || activeType.value}/${item.id}`);
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
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
  overflow: hidden;
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
  font-weight: bold;
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
  margin-top: 4px;
}
.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
  font-size: 12px;
}
</style>
