<script setup lang="ts">
import { clearInvitationRedirect } from '@/features/auth/model/invitation-redirect'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http } from '@/services/http'
import { Button } from '@/components/ui/button'
const route = useRoute()
const router = useRouter()
const preview = ref<{projectName:string; email:string; permissions:string[]} | null>(null)
const error = ref('')
const busy = ref(false)
const token = String(route.query.token ?? '')
onMounted(async () => { try { preview.value = await http.get('/project-invitations/preview', { params: { token } }) } catch { error.value = 'This invitation is unavailable or belongs to another email address.' } })
async function accept() {
 busy.value = true
 try { const result = await http.post<{groupSlug:string;projectSlug:string}, {token:string}>('/project-invitations/accept', {token}); clearInvitationRedirect(); sessionStorage.removeItem('project-invitation-redirect'); await router.replace(`/groups/${result.groupSlug}/projects/${result.projectSlug}`) }
 catch { error.value = 'Unable to accept this invitation. It may have expired or been revoked.' }
 finally { busy.value = false }
}
</script>
<template><main class="mx-auto max-w-xl space-y-5 p-8"><h1 class="text-2xl font-semibold">Project invitation</h1><p v-if="error" role="alert">{{ error }}</p><template v-if="preview"><p>Join {{ preview.projectName }} as {{ preview.email }}</p><ul><li v-for="permission in preview.permissions" :key="permission">{{ permission }}</li></ul><Button :disabled="busy" @click="accept">Accept invitation</Button></template></main></template>
