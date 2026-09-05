import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { conversations, messages, users } from '../../../db/schema';
import { eq, and, or, asc } from 'drizzle-orm';

export const GET: APIRoute = async (context) => {
  const payload = context.locals.user;
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { conversationId } = context.params;
  
  if (!conversationId) {
    return new Response(JSON.stringify({ error: 'Conversation ID is required' }), { status: 400 });
  }

  try {
    const db = getDb();
    
    // Ensure user is part of the conversation
    const conv = await db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
    if (!conv) {
       return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }
    
    if (conv.participant1Id !== payload.userId && conv.participant2Id !== payload.userId) {
       return new Response(JSON.stringify({ error: 'Unauthorized to view this conversation' }), { status: 403 });
    }

    // Fetch messages
    const convMessages = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .all();
      
    // Mark messages from other user as read
    const unreadFromOther = convMessages.filter(m => m.senderId !== payload.userId && !m.isRead);
    if (unreadFromOther.length > 0) {
       await db.update(messages)
         .set({ isRead: true })
         .where(
            and(
               eq(messages.conversationId, conversationId),
               eq(messages.senderId, conv.participant1Id === payload.userId ? conv.participant2Id : conv.participant1Id)
            )
         );
    }
    
    const otherUserId = conv.participant1Id === payload.userId ? conv.participant2Id : conv.participant1Id;
    const otherUser = await db.select({
       id: users.id,
       firstName: users.firstName,
       lastName: users.lastName,
       avatarUrl: users.avatarUrl
    }).from(users).where(eq(users.id, otherUserId)).get();

    return new Response(JSON.stringify({ success: true, messages: convMessages, otherUser }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Get conversation messages error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
