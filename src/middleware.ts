import { defineMiddleware } from 'astro:middleware';
import { verifyToken } from './lib/auth';
import { getDb } from './lib/db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

export const onRequest = defineMiddleware(async ({ cookies, request, locals, redirect }, next) => {
  const url = new URL(request.url);

  // Check if it's an API route that requires auth, or protected pages
  const isApiRoute = url.pathname.startsWith('/api/');
  const isEmployeeRoute = url.pathname.startsWith('/jobs') || url.pathname.startsWith('/applications') || url.pathname.startsWith('/saved') || url.pathname.startsWith('/recommended') || url.pathname.startsWith('/notifications') || url.pathname.startsWith('/settings') || url.pathname.startsWith('/employee');
  const isDashboard = url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/employer') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/superadmin') || url.pathname.startsWith('/masteradmin') || isEmployeeRoute;

  // Get token from Authorization header or cookies
  const authHeader = request.headers.get('Authorization');
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = cookies.get('auth_token')?.value;
  }

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      // @ts-ignore
      locals.user = payload;
    }
  }

  if (!isApiRoute && !isDashboard) {
    // Public routes don't require auth by default
    return next();
  }

  // Allow public auth & search API routes (no auth required, but user payload attached if present)
  if (
    url.pathname === '/api/auth/login' || 
    url.pathname === '/api/auth/register' ||
    url.pathname === '/api/auth/forgot-password' ||
    url.pathname === '/api/auth/reset-password' ||
    url.pathname.startsWith('/api/external/') ||
    url.pathname.startsWith('/api/resumes/') ||
    url.pathname === '/api/payments/verify' ||
    url.pathname === '/api/jobs/search'
  ) {
    return next();
  }

  if (!locals.user) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Redirect to standard user login
    return redirect('/login');
  }

  // Strict RBAC check for admin routes
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) {
    if (locals.user?.userType !== 'admin' && locals.user?.userType !== 'superadmin' && locals.user?.userType !== 'masteradmin') {
      if (isApiRoute) {
        return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/dashboard');
    }
  }

  // Strict RBAC check for superadmin routes
  if (url.pathname.startsWith('/superadmin') || url.pathname.startsWith('/api/superadmin')) {
    if (locals.user?.userType !== 'superadmin' && locals.user?.userType !== 'masteradmin') {
      if (isApiRoute) {
        return new Response(JSON.stringify({ error: 'Forbidden: SuperAdmin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/dashboard');
    }
  }

  // Strict RBAC check for masteradmin routes
  if (url.pathname.startsWith('/masteradmin') || url.pathname.startsWith('/api/masteradmin')) {
    if (locals.user?.userType !== 'masteradmin' && locals.user?.userType !== 'superadmin') {
      if (isApiRoute) {
        return new Response(JSON.stringify({ error: 'Forbidden: MasterAdmin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/dashboard');
    }
  }



  return next();
});
