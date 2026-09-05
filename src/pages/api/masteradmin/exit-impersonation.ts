import type { APIRoute } from "astro";

export const ALL: APIRoute = async ({ cookies, redirect }) => {
  const originalToken = cookies.get("original_masteradmin_token")?.value;

  if (originalToken) {
    // Restore original MasterAdmin auth token
    cookies.set("auth_token", originalToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
  }

  // Clear impersonation markers
  cookies.delete("original_masteradmin_token", { path: "/" });
  cookies.delete("impersonated_by", { path: "/" });

  return redirect("/masteradmin");
};
