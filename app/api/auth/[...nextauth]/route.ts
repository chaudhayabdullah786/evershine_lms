/**
 * NextAuth v5 Route Handler
 * Mounts all auth endpoints: GET/POST /api/auth/[...nextauth]
 * Handles: signin, signout, session, csrf, callback
 */
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
