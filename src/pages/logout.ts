import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ cookies, redirect }) => {
  // Delete the auth cookie to log the user out
  cookies.delete('auth_token', { path: '/' });
  
  // Wait, some browsers might retain the cookie if not explicitly expired correctly depending on domain matching, 
  // but Astro's cookies.delete usually handles it fine. Let's make sure by also adding a client side script if we did it via Astro page, 
  // but an API route is cleaner.
  return redirect('/');
};
