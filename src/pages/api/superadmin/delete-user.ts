import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { users, applications, jobPostings, recommendations, posts, notifications } from "../../../db/schema";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  
  if (!user || (user.userType !== "superadmin" && user.userType !== "masteradmin")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await context.request.formData();
  const userIdToDelete = formData.get("userId")?.toString();

  if (!userIdToDelete) {
    return new Response("User ID is required", { status: 400 });
  }

  // Prevent user from deleting themselves
  if (userIdToDelete === user.id) {
    return new Response("Cannot delete your own account", { status: 403 });
  }

  try {
    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userIdToDelete)).get();

    if (!targetUser) {
      return new Response("User not found", { status: 404 });
    }

    // Role Hierarchy Enforcement: Only masteradmin can delete a masteradmin account
    if (targetUser.userType === 'masteradmin' && user.userType !== 'masteradmin') {
      return new Response("Forbidden: Only MasterAdmin can delete a MasterAdmin account", { status: 403 });
    }
    
    // Manual Cascade Delete
    
    // 1. Delete Notifications sent to this user
    await db.delete(notifications).where(eq(notifications.userId, userIdToDelete));
    
    // 2. Delete Posts authored by this user
    await db.delete(posts).where(eq(posts.authorId, userIdToDelete));
    
    // 3. Delete Recommendations for this user (if employee)
    await db.delete(recommendations).where(eq(recommendations.employeeId, userIdToDelete));
    
    // 4. Delete Applications (if user is applicant or employer)
    await db.delete(applications).where(eq(applications.applicantId, userIdToDelete));
    await db.delete(applications).where(eq(applications.employerId, userIdToDelete));
    
    // 5. Delete Job Postings (if user is employer)
    await db.delete(jobPostings).where(eq(jobPostings.employerId, userIdToDelete));
    
    // 6. Finally, delete the User
    await db.delete(users).where(eq(users.id, userIdToDelete));

    return context.redirect("/superadmin/users?success=UserDeleted");
  } catch (error) {
    console.error("Error deleting user:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
