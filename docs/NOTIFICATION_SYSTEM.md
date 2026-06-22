# Notification & Alert System — Developer Reference

## Architecture Overview

Two distinct layers:

| Layer | File | When to use |
|---|---|---|
| **Toast notifications** | `lib/notify.ts` → renders via `components/ui/sonner.tsx` | Transient feedback that doesn't require user acknowledgement |
| **Inline alerts** | `components/ui/form-alert.tsx` | Contextual feedback anchored to a specific form/section |

---

## Toast Notifications (`notify.*`)

Import the unified helper and call the appropriate method.  
**Never call `toast.*` from Sonner directly — always go through `notify`.**

```tsx
import { notify } from '@/lib/notify'

// ── Success ──────────────────────────────────────────────
notify.success('Student saved')
notify.success('Admission approved', {
  description: 'Approval email dispatched to guardian.',
})

// ── Error ────────────────────────────────────────────────
notify.error('Save failed', {
  description: err.message,
  duration: 8000,
})

// ── Warning ──────────────────────────────────────────────
notify.warning('Session expiring', {
  description: 'You will be logged out in 2 minutes.',
  action: { label: 'Stay logged in', onClick: refreshSession },
})

// ── Info ─────────────────────────────────────────────────
notify.info('Sync in progress', {
  description: 'Academic records are being refreshed.',
})

// ── Loading → auto-transition on promise ─────────────────
await notify.promise(
  fetch('/api/students', { method: 'POST', body }),
  'Saving student record…',
  {
    successMessage: 'Student created',
    errorMessage:   'Failed to create student',
  }
)

// ── Manual loading (dismiss by returned ID) ───────────────
const id = notify.loading('Generating report…')
// ... work ...
notify.dismiss(id)
notify.success('Report ready', { id })  // replaces loading toast
```

---

## Inline Form Alerts (`<FormAlert />`)

Import and render inside forms or dialog bodies. The component is **not** a toast — it is anchored to the DOM where placed.

```tsx
import { FormAlert, ErrorAlert, SuccessAlert, WarningAlert, InfoAlert } from '@/components/ui/form-alert'
```

### Convenience wrappers (recommended)

```tsx
// Equivalent to <FormAlert variant="error" .../>
<ErrorAlert
  title="Submission failed"
  description="Please fix the highlighted fields below."
  onDismiss={() => setError(null)}
/>

<SuccessAlert
  title="Profile updated"
  description="Your changes have been saved successfully."
/>

<WarningAlert
  title="Unsaved changes"
  description="Navigating away will discard your current edits."
  compact
/>

<InfoAlert
  title="Auto-save enabled"
  description="Your work is saved every 30 seconds."
  compact
/>
```

### Full API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'error' \| 'success' \| 'warning' \| 'info' \| 'loading'` | — | Required. Controls colour, icon, and ARIA role |
| `title` | `string` | — | Required. Short summary (bold) |
| `description` | `React.ReactNode` | — | Optional supporting text or element |
| `onDismiss` | `() => void` | — | If provided, renders a dismiss (×) button |
| `compact` | `boolean` | `false` | Reduces padding for tight layouts |
| `hidden` | `boolean` | `false` | Skips rendering when `true` |
| `className` | `string` | — | Extra classes appended to the root element |

---

## Migration from `react-hot-toast`

The `react-hot-toast` `Toaster` has been removed from `app/layout.tsx`.  
Any call sites still importing from `react-hot-toast` should be updated:

```diff
- import toast from 'react-hot-toast'
+ import { notify } from '@/lib/notify'

- toast.success('Done')
+ notify.success('Done')

- toast.error('Failed')
+ notify.error('Failed')
```
