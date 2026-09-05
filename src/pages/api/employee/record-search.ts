import type { APIRoute } from "astro";
import { getDb } from "../../../lib/db";
import { jobSearches } from "../../../db/schema";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  
  if (!user || user.userType !== "employee") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const data = await context.request.json();
    const query = data.query;

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Query too short" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const db = getDb();
    
    await db.insert(jobSearches).values({
      id: crypto.randomUUID(),
      employeeId: user.id,
      searchQuery: query.trim().toLowerCase(),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error recording search:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
