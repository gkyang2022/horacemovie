import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'
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

app.use(createPinia())
app.use(router)

app.mount('#app')
