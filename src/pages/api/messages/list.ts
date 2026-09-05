import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { conversations, messages, users } from '../../../db/schema';
import { eq, or, desc, inArray, sql } from 'drizzle-orm';

export const GET: APIRoute = async (context) => {
  const payload = context.locals.user;
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const db = getDb();
    
    // Find all conversations where the user is a participant
    const userConversations = await db.select()
      .from(conversations)
      .where(
        or(
          eq(conversations.participant1Id, payload.userId),
          eq(conversations.participant2Id, payload.userId)
        )
      )
      .orderBy(desc(conversations.updatedAt))
      .all();

    if (userConversations.length === 0) {
       return new Response(JSON.stringify({ success: true, conversations: [] }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
       });
    }

    // Get the latest message for each conversation to display in the list
    // SQLite D1 lacks distinct on, so we'll fetch them individually or use a subquery. 
    // Since this is a simple app, doing multiple small queries or fetching all and reducing is fine.
    // For better performance, let's fetch users in bulk.
    
    const userIds = new Set<string>();
    userConversations.forEach(c => {
       userIds.add(c.participant1Id);
       userIds.add(c.participant2Id);
    });
    
    const participants = await db.select({
       id: users.id,
       firstName: users.firstName,
       lastName: users.lastName,
       avatarUrl: users.avatarUrl
    }).from(users).where(inArray(users.id, Array.from(userIds))).all();
    
    const userMap = new Map(participants.map(u => [u.id, u]));

    const result = [];
    for (const conv of userConversations) {
       const otherUserId = conv.participant1Id === payload.userId ? conv.participant2Id : conv.participant1Id;
       const otherUser = userMap.get(otherUserId);
       
       // Get latest message
       const latestMessage = await db.select()
         .from(messages)
         .where(eq(messages.conversationId, conv.id))
         .orderBy(desc(messages.createdAt))
         .limit(1)
         .get();
         
       result.push({
          conversationId: conv.id,
          otherUser,
          updatedAt: conv.updatedAt,
          latestMessage: latestMessage ? {
             content: latestMessage.content,
             senderId: latestMessage.senderId,
             isRead: latestMessage.isRead,
             createdAt: latestMessage.createdAt
          } : null
       });
    }

    return new Response(JSON.stringify({ success: true, conversations: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('List messages error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
