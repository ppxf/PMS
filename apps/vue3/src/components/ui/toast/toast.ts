import { readonly, ref } from 'vue'

type ToastKind = 'success' | 'error' | 'warning'
interface ToastMessage {
  id: number
  kind: ToastKind
  title: string
  description?: string
}
const messages = ref<ToastMessage[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextId = 0
export const toastMessages = readonly(messages)
export function dismissToast(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  messages.value = messages.value.filter((message) => message.id !== id)
}
function show(kind: ToastKind, title: string, description?: string) {
  const oldest = messages.value[0]
  if (messages.value.length >= 3 && oldest) dismissToast(oldest.id)
  const id = ++nextId
  messages.value.push({ id, kind, title, description })
  timers.set(
    id,
    setTimeout(() => dismissToast(id), 6500),
  )
}
export const toast = {
  success: (title: string, description?: string) => show('success', title, description),
  error: (title: string, description?: string) => show('error', title, description),
  warning: (title: string, description?: string) => show('warning', title, description),
}
