import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import './assets/common.css'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

const storedTheme = localStorage.getItem('theme')
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
const resolvedTheme = storedTheme ?? (prefersDark ? 'dark' : 'light')

document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
document.documentElement.setAttribute('data-theme', resolvedTheme)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
})

app.mount('#app')
