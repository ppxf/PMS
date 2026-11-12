# Global toast notifications

`App.vue` mounts one `Toaster` for the whole application, including route changes.
Pages only need to import the notification API:

```ts
import { toast } from '@/components/ui/toast'

toast.success('Invitation queued', 'The invitation is queued for email delivery.')
toast.error('Unable to send invitation', 'Please try again.')
toast.warning('Invitation created', 'Refresh the page to update the invitation list.')
```

The second argument is optional. Notifications use plain text, show at the bottom
right on desktop, and fit the viewport on mobile. Up to three are visible at once;
each closes after 6.5 seconds or when its dismiss button is clicked.

Errors use an assertive alert; success and warning messages use polite status
announcements. No external toast dependency is required.
