<template>
  <div class="home">
    <div v-for="section in sections" :key="section.type" class="section">
      <div class="section-header">
        <h2 class="section-title">{{ section.title }}</h2>
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
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getPopular, type DoubanMedia } from '../api/douban';

const router = useRouter();

type Category = 'movie' | 'tv' | 'variety' | 'animation';

interface Section {
  title: string;
  type: Category;
}

const sections: Section[] = [
  { title: '热门电影', type: 'movie' },
  { title: '热门电视剧', type: 'tv' },
  { title: '热门综艺', type: 'variety' },
  { title: '热门动画', type: 'animation' },
];

const data = reactive<Record<Category, DoubanMedia[]>>({
  movie: [],
  tv: [],
  variety: [],
  animation: [],
});

const loading = reactive<Record<Category, boolean>>({
  movie: false,
  tv: false,
  variety: false,
  animation: false,
});

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

const goToDetail = (item: DoubanMedia, defaultType: string) => {
  router.push(`/detail/${item.type || defaultType}/${item.id}`);
};

onMounted(() => {
  sections.forEach(s => fetchSectionData(s.type));
});
</script>

<style scoped>
.home {
  padding: 10px 0;
  max-width: 1400px;
  margin: 0 auto;
}

.section {
  margin-bottom: 0px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  margin-bottom: 15px;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
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
  background: #409eff;
  border-radius: 2px;
}

.media-row-container {
  width: 100%;
  overflow: hidden;
}

.media-row {
  display: flex;
  overflow-x: auto;
  gap: 20px;
  padding: 5px 20px 15px 20px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: #dcdfe6 transparent;
}

/* Custom scrollbar for webkit */
.media-row::-webkit-scrollbar {
  height: 6px;
}

.media-row::-webkit-scrollbar-thumb {
  background-color: #dcdfe6;
  border-radius: 3px;
}

.media-row::-webkit-scrollbar-track {
  background: transparent;
}

.media-card-mini {
  flex: 0 0 200px;
  width: 200px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
}

.media-card-mini:hover {
  transform: translateY(-8px);
}

.media-card-mini:hover .poster {
  filter: brightness(0.8);
}

.poster-wrapper {
  position: relative;
  width: 200px;
  height: 300px;
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
  line-height: 1.4;
}

.subtitle {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
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
