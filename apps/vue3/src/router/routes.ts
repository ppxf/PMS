import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/features/auth/views/LoginView.vue'),
    meta: {
      title: '登录',
      requiresAuth: false,
      layout: 'blank',
    },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/features/auth/views/RegisterView.vue'),
    meta: { title: '注册', requiresAuth: false, layout: 'blank' },
  },
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('@/features/auth/views/VerifyEmailView.vue'),
    meta: { title: '邮箱验证', requiresAuth: false, layout: 'blank' },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/features/auth/views/ForgotPasswordView.vue'),
    meta: { title: '忘记密码', requiresAuth: false, layout: 'blank' },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/features/auth/views/ResetPasswordView.vue'),
    meta: { title: '重置密码', requiresAuth: false, layout: 'blank' },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    meta: {
      title: '管理后台',
      requiresAuth: true,
      layout: 'app',
    },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/features/dashboard/views/DashboardView.vue'),
        meta: {
          title: '工作台',
          requiresAuth: true,
        },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/features/users/views/UsersView.vue'),
        meta: {
          title: '用户管理',
          requiresAuth: true,
          permissions: ['user:read'],
        },
      },
    ],
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/features/auth/views/ForbiddenView.vue'),
    meta: {
      title: '无权访问',
      requiresAuth: true,
      layout: 'blank',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
    meta: {
      title: '页面跳转',
    },
  },
]
