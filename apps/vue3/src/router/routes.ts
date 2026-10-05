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
    path: '/onboarding/groups/new',
    name: 'create-group-onboarding',
    component: () => import('@/features/monitoring/views/CreateGroupView.vue'),
    meta: { title: '创建组', requiresAuth: true, layout: 'blank' },
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
          title: '首页',
          requiresAuth: true,
        },
      },
      {
        path: 'groups',
        name: 'groups',
        component: () => import('@/features/monitoring/views/GroupsView.vue'),
        meta: { title: '组', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug',
        name: 'group-detail',
        component: () => import('@/features/monitoring/views/GroupDetailView.vue'),
        meta: { title: '组详情', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/new',
        name: 'create-project',
        component: () => import('@/features/monitoring/views/CreateProjectView.vue'),
        meta: { title: '创建监控项目', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug',
        redirect: (to) => ({
          name: 'project-setup',
          params: { groupSlug: to.params.groupSlug, projectSlug: to.params.projectSlug },
        }),
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/setup',
        name: 'project-setup',
        component: () => import('@/features/monitoring/views/ProjectSetupView.vue'),
        meta: { title: '基础接入', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/setup/traces',
        name: 'project-traces-setup',
        component: () => import('@/features/monitoring/views/ProjectSetupView.vue'),
        meta: { title: 'Traces接入', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/issues',
        name: 'project-issues',
        component: () => import('@/features/monitoring/views/ProjectIssuesView.vue'),
        meta: { title: '错误列表', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/issues/:issueId',
        name: 'project-issue-detail',
        component: () => import('@/features/monitoring/views/ProjectIssueDetailView.vue'),
        meta: { title: '错误详情', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/traces',
        name: 'project-traces',
        component: () => import('@/features/monitoring/views/ProjectTracesView.vue'),
        meta: { title: 'Traces', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/metrics',
        name: 'project-metrics',
        component: () => import('@/features/monitoring/views/ProjectMetricsView.vue'),
        meta: { title: 'Metrics', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/traces/:traceId',
        name: 'project-trace-detail',
        component: () => import('@/features/monitoring/views/ProjectTraceDetailView.vue'),
        meta: { title: 'Trace 详情', requiresAuth: true },
      },
      {
        path: 'groups/:groupSlug/projects/:projectSlug/config',
        name: 'project-detail',
        component: () => import('@/features/monitoring/views/ProjectDetailView.vue'),
        meta: { title: '监控项目', requiresAuth: true },
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
