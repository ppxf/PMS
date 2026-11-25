export const profilesZhCN: Record<string, string> = {
  'Grouped by root function. Each group uses its own scale; compare groups using sampled time and global share.':
    '按根函数分组展示，各组使用独立刻度；跨组请比较采样时长和全局占比。',
  'Global share': '全局占比',
  'Named sampled time': '有函数名的采样总时长',
  'Expand all calls': '展开全部',
  'Collapse root branches': '收起分支',
  'Function / call hierarchy': '函数 / 调用层级',
  'View sampled time for {name}': '查看 {name} 的采样耗时',
  'Only named calls are shown in their parent-child hierarchy. Expand branches to follow the stack.':
    '按父子层级展示有名称的调用，自动跳过空白栈帧。可展开或收起分支查看调用关系。',
  'Calls are aggregated by stack path with idle gaps removed. Width shows accumulated sampled time. Click a function to inspect details.':
    '按调用路径聚合同类调用，已移除空闲间隔；宽度表示累计采样时长。点击函数查看详情。',
  'Named calls fill the sampled range. Click a frame to inspect its details without changing the chart.':
    '默认铺满有效采样区间，仅显示有名称的调用。点击函数查看详情，图表范围保持不变。',
  'Named sampled call stacks. Select a function below for keyboard navigation.':
    '有名称的采样调用栈。可使用下方函数按钮通过键盘选择。',
  'Select function (keyboard accessible)': '选择函数（支持键盘）',
  'Sampled intervals': '采样区间数',
  'Average duration': '平均时长',
  'Representative source': '代表区间来源',
  'Focus longest interval': '聚焦最长区间',
  'Named functions are merged across stack levels. Counts represent sampled intervals, not exact invocation counts.':
    '仅显示有名称的函数，同名函数合并展示；数量为采样区间数，并非真实调用次数。',
  'Back to previous focus': '返回上一级焦点',
  'Profile view': '剖析视图',
  'Call tree': '调用树',
  'Sampled coverage': '有效采样占比',
  'Sampled calls': '采样调用',
  'Capture share': '占采集时长',
  'Time interval': '时间区间',
  'Focus sampled range': '聚焦有效调用区间',
  'Focus this call': '在火焰图中聚焦',
  'Toggle child calls for {name}': '展开或收起 {name} 的子调用',
  'Expand calls to follow the stack. Select a function to inspect its details.':
    '展开层级查看调用关系，点击函数查看完整名称、来源与耗时。',
  'Width shows sampled interval; rows show call depth. Click a frame to zoom in.':
    '横向宽度表示采样时长，纵向层级表示调用深度。点击色块可放大查看。',
  'No matching function calls': '未找到匹配的函数调用',
  'No sampled function calls': '暂无可用的函数调用栈',
  'Show more calls': '显示更多调用',
  'Intervals are estimates from samples, not precise CPU time. Parent intervals include child calls; percentages must not be added together.':
    '时长由采样估算，并非精确 CPU 耗时。父调用包含子调用时长，占比不能相加。',
  Profile: '性能剖析',
  'Profile analysis': '性能剖析分析',
  'Profile details': '性能剖析详情',
  'Profiles SDK setup': '性能剖析 SDK 接入',
  'Profiles setup instructions': '性能剖析接入说明',
  'View Profiles setup instructions': '查看性能剖析接入说明',
  'Find expensive browser functions from sampled call stacks.':
    '通过采样调用栈查找浏览器中耗时较高的函数。',
  'Search profiles': '搜索性能剖析',
  'Search transactions and profile names…': '搜索事务与性能剖析名称…',
  'No profiles found.': '未找到性能剖析。',
  'No sampled stacks found': '未找到采样调用栈',
  'No samples recorded': '暂无采样记录',
  'Retry profile': '重试加载性能剖析',
  'Retry statistics': '重试加载统计',
  'Profiles pagination': '性能剖析分页',
  'Open profile': '打开性能剖析',
  'Profile flame chart': '性能剖析火焰图',
  'Flame chart': '火焰图',
  'Aggregate Flamegraph': '聚合火焰图',
  Function: '函数',
  Functions: '函数',
  'Function / resource': '函数 / 资源',
  'Function ranking': '函数排名',
  'Selected function': '所选函数',
  'Function time metric': '函数耗时指标',
  'Total sampled time': '采样总时长',
  'Sampled time': '采样时长',
  'Self (ms, estimated)': '自身耗时（ms，估算）',
  'Total (ms, estimated)': '总耗时（ms，估算）',
  'Total capture time:': '总采集时长：',
  'Self time': '自身耗时',
  'Total time': '总耗时',
  'self time': '自身耗时',
  'total time spent': '总耗时',
  Unsampled: '未采样',
  'Most Improved Functions': '改善最多的函数',
  'Most Regressed Functions': '退化最多的函数',
  'P95 self time compared with the previous equal time period.':
    '将 P95 自身耗时与前一个等长时间段进行比较。',
  'Grouped by profile name. Percentiles measure capture duration across matching profiles.':
    '按性能剖析名称分组，百分位统计匹配记录的采集时长。',
  'Estimated sampled time · Function percentiles are calculated per profile where the function was observed.':
    '估算采样时长 · 函数百分位按观测到该函数的各条性能剖析记录计算。',
  'Estimated sampled time is weighted by the interval until the next sample or capture end. It is not precise CPU time. Self excludes child calls; Total includes child calls and counts recursive functions once per sample. Unsampled:':
    '估算采样时长按距下一次采样或采集结束的间隔加权，并非精确 CPU 时间。自身耗时不含子调用，总耗时包含子调用；每个样本中的递归函数只统计一次。未采样：',
  'Call stacks merged by function and source location. Width represents estimated sampled time across all matching profiles; this is not a timeline.':
    '调用栈按函数与源码位置合并。宽度表示所有匹配记录的估算采样时长，并非时间线。',
  'Sampled call stacks over time. Use focus function buttons below for keyboard navigation.':
    '按时间展示采样调用栈，可使用下方聚焦函数按钮进行键盘导航。',
  'Hover to inspect': '悬停查看详情',
  'Find frames': '查找栈帧',
  'Find frames…': '查找栈帧…',
  'Reset flame chart': '重置火焰图',
  'Reset focus': '重置焦点',
  'Focus function (keyboard accessible)': '聚焦函数（支持键盘）',
  'Select a frame to inspect its function and source.': '选择栈帧查看函数与源码信息。',
  'Slowest functions sorted by': '耗时最高的函数，排序依据：',
  'SDK / dependency functions hidden': '已隐藏 SDK / 依赖函数',
  'This capture was truncated at the collection limit. It may not include the complete interaction.':
    '此次采集达到限制后被截断，可能不包含完整交互。',
  'profiles ·': '性能剖析 ·',
  'comparison profiles · Comparison:': '条对比记录 · 对比时段：',
  'ms interval': 'ms 间隔',
  'ms duration': 'ms 时长',
  'ms · Unsampled:': 'ms · 未采样：',
  'ms. Function names are shown without Source Map processing.': 'ms。函数名未经 Source Map 还原。',
  'Enable Profiles for this project, then install': '为此项目启用性能剖析，然后安装',
  'Configure the HTML response header': '配置 HTML 响应头',
  'Trace mode collects during sampled root spans and requires browserTracingIntegration. Manual mode works independently of trace sampling. Session sampling is decided once at SDK initialization; lower profileSessionSampleRate in production. Captures are bounded to 30 seconds.':
    '链路模式在采样的根 Span 期间采集，需配置 browserTracingIntegration。手动模式独立于链路采样。会话采样在 SDK 初始化时决定一次，生产环境请降低 profileSessionSampleRate。单次采集最长 30 秒。',
  "is an HTTP response header sent by the server hosting the application you monitor. Configure it on that application's HTML document, including direct visits to client-side routes. Adding it to SDK upload requests or only to the PMS API response does not grant profiling permission. The SDK cannot add this header to an already loaded document.":
    '是由被监控应用的服务器发送的 HTTP 响应头。请为该应用的 HTML 文档配置此头，包括直接访问前端路由的场景。将其加在 SDK 上报请求或仅加在 PMS API 响应中，不会授予性能剖析权限。SDK 无法为已经加载的文档添加此响应头。',
  'For Vite development and local preview, merge these options into your existing configuration, then restart the server and reload the application page:':
    'Vite 开发和本地预览环境中，将以下选项合并到现有配置，然后重启服务并刷新应用页面：',
  "Vite's server and preview settings apply to their respective servers. A production":
    'Vite 的 server 和 preview 设置分别作用于对应服务。生产环境',
  'requires the deployed web server, CDN or reverse proxy to send the header. For Nginx, add the following to the server block serving the HTML, reload Nginx, and refresh cached HTML at the CDN when applicable. If a location block has its own':
    '需要由部署的 Web 服务器、CDN 或反向代理发送该响应头。使用 Nginx 时，将以下配置添加到提供 HTML 的 server 块，重载 Nginx，并按需刷新 CDN 的 HTML 缓存。如果 location 块自行配置了',
  'directives, ensure the document response still includes this policy.':
    '指令，请确保文档响应仍包含此策略。',
}
