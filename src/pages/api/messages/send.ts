import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { conversations, messages, users, notifications, plans } from '../../../db/schema';
import { eq, or, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export const POST: APIRoute = async (context) => {
  const payload = context.locals.user;
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const db = getDb();
    
    // Feature Gating Check
    const userRecord = await db.select({ planFeatures: plans.features }).from(users).leftJoin(plans, eq(users.planId, plans.planId)).where(eq(users.id, payload.userId)).get();
    if (userRecord && userRecord.planFeatures) {
      const featureFlags = typeof userRecord.planFeatures === 'string' ? JSON.parse(userRecord.planFeatures) : userRecord.planFeatures;
      if (featureFlags && featureFlags.hasOwnProperty('messaging') && featureFlags.messaging === false) {
        return new Response(JSON.stringify({ error: 'Messaging is not enabled on your current plan' }), { status: 403 });
      }
    }

    const body = await context.request.json();
    const { receiverId, content, conversationId } = body;

    if (!content || content.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message content is required' }), { status: 400 });
    }

    if (!receiverId && !conversationId) {
       return new Response(JSON.stringify({ error: 'Receiver ID or Conversation ID is required' }), { status: 400 });
    }

    let targetConversationId = conversationId;
    let targetReceiverId = receiverId;

    if (!targetConversationId && receiverId) {
       // Find existing conversation
       const existingConv = await db.select().from(conversations)
          .where(
             or(
                and(eq(conversations.participant1Id, payload.userId), eq(conversations.participant2Id, receiverId)),
                and(eq(conversations.participant1Id, receiverId), eq(conversations.participant2Id, payload.userId))
             )
          ).get();
          
       if (existingConv) {
          targetConversationId = existingConv.id;
       } else {
          // Create new conversation
          targetConversationId = uuidv4();
          await db.insert(conversations).values({
             id: targetConversationId,
             participant1Id: payload.userId,
             participant2Id: receiverId
          });
       }
    } else if (targetConversationId && !targetReceiverId) {
       const conv = await db.select().from(conversations).where(eq(conversations.id, targetConversationId)).get();
       if (conv) {
          targetReceiverId = conv.participant1Id === payload.userId ? conv.participant2Id : conv.participant1Id;
       }
    }

    // Insert message
    const newMessage = {
       id: uuidv4(),
       conversationId: targetConversationId,
       senderId: payload.userId,
       content: content.trim()
    };
    
    await db.insert(messages).values(newMessage);
    
    // Update conversation updatedAt
    await db.update(conversations)
       .set({ updatedAt: new Date() })
       .where(eq(conversations.id, targetConversationId));

    // Send notification to the recipient
    if (targetReceiverId && targetReceiverId !== payload.userId) {
       try {
          const sender = await db.select().from(users).where(eq(users.id, payload.userId)).get();
          const senderName = sender?.companyName || `${sender?.firstName} ${sender?.lastName}`.trim() || 'A user';
          const snippet = content.trim().length > 80 ? `${content.trim().slice(0, 80)}...` : content.trim();

          await db.insert(notifications).values({
             id: uuidv4(),
             userId: targetReceiverId,
             title: `New message from ${senderName}`,
             message: `"${snippet}" — Click to open and reply in Messages.`,
             type: 'message',
             isRead: false,
             createdAt: new Date(),
          });
       } catch (notifErr) {
          console.error('Failed to insert message notification:', notifErr);
       }
    }

    return new Response(JSON.stringify({ success: true, message: newMessage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
