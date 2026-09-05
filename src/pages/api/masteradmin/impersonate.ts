import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { users } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const currentUser = locals.user;
  if (!currentUser || (currentUser.userType !== "masteradmin" && currentUser.userType !== "superadmin")) {
    return new Response(JSON.stringify({ error: "Unauthorized: MasterAdmin access required" }), { status: 403 });
  }

  try {
    const data = await request.json();
    const { targetUserId } = data;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Target User ID is required" }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, targetUserId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: "Target user not found" }), { status: 404 });
    }

    // Role Hierarchy Protection: SuperAdmin cannot impersonate MasterAdmin
    if (targetUser.userType === "masteradmin" && currentUser.userType !== "masteradmin") {
      return new Response(JSON.stringify({ error: "Forbidden: Cannot impersonate a MasterAdmin account" }), { status: 403 });
    }

    // Preserve original admin token
    const originalToken = cookies.get("auth_token")?.value;
    if (originalToken && !cookies.has("original_masteradmin_token")) {
      cookies.set("original_masteradmin_token", originalToken, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 8, // 8 hours
      });
    }

    // Generate token for target user
    const impersonatedToken = await signToken({
      userId: targetUser.id,
      userType: targetUser.userType as any,
      verifiedStatus: targetUser.verifiedStatus as any,
    });

    // Set new auth cookie
    cookies.set("auth_token", impersonatedToken, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
    });

    cookies.set("impersonated_by", currentUser.userId, {
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
    });

    let redirectUrl = "/dashboard";
    if (targetUser.userType === "employer") {
      redirectUrl = "/employer";
    } else if (targetUser.userType === "employee") {
      redirectUrl = "/dashboard";
    } else if (targetUser.userType === "admin") {
      redirectUrl = "/admin";
    }

    return new Response(JSON.stringify({ success: true, redirectUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Failed to impersonate user" }), { status: 500 });
  }
};
