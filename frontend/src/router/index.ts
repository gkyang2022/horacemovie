import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';

const routes = [
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: Home
      },
      {
        path: 'search',
        name: 'Search',
        component: () => import('../views/Search.vue')
      },
      {
        path: 'detail/:type/:id',
        name: 'Detail',
        component: () => import('../views/Detail.vue')
      },
      {
        path: 'explore',
        name: 'Explore',
        component: () => import('../views/Explore.vue')
      },
      {
        path: 'showing',
        name: 'MovieShowing',
        component: () => import('../views/MovieShowing.vue')
      },
      {
        path: 'documentary',
        name: 'MovieDocumentary',
        component: () => import('../views/MovieDocumentary.vue')
      },
      {
        path: 'animation',
        name: 'MovieAnimation',
        component: () => import('../views/MovieAnimation.vue')
      },
      {
        path: 'variety',
        name: 'MovieVariety',
        component: () => import('../views/MovieVariety.vue')
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue')
      },
      {
        path: 'tracker',
        name: 'Tracker',
        component: () => import('../views/Tracker.vue')
      }
    ]
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const user = localStorage.getItem('user');
  if (to.path !== '/login' && !user) {
    next('/login');
  } else {
    next();
  }
});

export default router;
