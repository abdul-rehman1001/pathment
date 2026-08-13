'use strict';

/**
 * Deleting a conversation used to be undone by opening it again.
 *
 * `deleteConversation` marks the participant row with `leftAt`, and
 * `createOrGetDirectConversation` cleared `leftAt` to let somebody back in. It
 * cleared it for BOTH people and reset nothing else, so re-opening a deleted
 * conversation handed back every message that had been removed, still unread,
 * and quietly rejoined the other person too.
 *
 * The fix gives whoever left a fresh `joinedAt`, and every read of a
 * conversation is floored by it: the thread, the inbox preview and the unread
 * badge. These tests pin all three, plus the thing that matters most, which is
 * that none of it touches the other person's copy.
 */

const messagingService = require('../../src/services/messagingService');
const { cleanDb, createUser } = require('../helpers/seed');

/** Two mentors, because mentor to mentor messaging needs no clan or match. */
async function twoPeople() {
  const alice = await createUser({ role: 'mentor', email: 'alice@test.com', firstName: 'Alice' });
  const bob = await createUser({ role: 'mentor', email: 'bob@test.com', firstName: 'Bob' });
  return { alice, bob };
}

async function conversationFor(userId, conversationId) {
  const list = await messagingService.listConversations(userId);
  return list.find((each) => each.id === conversationId) ?? null;
}

describe('deleting a direct conversation', () => {
  let alice;
  let bob;
  let conversationId;

  beforeEach(async () => {
    await cleanDb();
    ({ alice, bob } = await twoPeople());

    const conversation = await messagingService.createOrGetDirectConversation(alice.id, bob.id);
    conversationId = conversation.id;

    await messagingService.sendMessage(alice.id, {
      conversationId,
      messageText: 'First, from Alice',
    });
    await messagingService.sendMessage(bob.id, {
      conversationId,
      messageText: 'Second, from Bob',
    });
  });

  it('shows both messages before anything is deleted', async () => {
    const messages = await messagingService.listMessages(alice.id, conversationId);
    expect(messages).toHaveLength(2);
  });

  it('does not hand the messages back when the conversation is opened again', async () => {
    await messagingService.deleteConversation(alice.id, conversationId);

    const reopened = await messagingService.createOrGetDirectConversation(alice.id, bob.id);
    // The same row, deliberately: a second conversation between the same two
    // people would split the thread in half for whoever did not delete it.
    expect(reopened.id).toBe(conversationId);

    const messages = await messagingService.listMessages(alice.id, conversationId);
    expect(messages).toEqual([]);
  });

  it('leaves the other person copy completely alone', async () => {
    await messagingService.deleteConversation(alice.id, conversationId);
    await messagingService.createOrGetDirectConversation(alice.id, bob.id);

    const messages = await messagingService.listMessages(bob.id, conversationId);
    expect(messages.map((message) => message.messageText)).toEqual([
      'First, from Alice',
      'Second, from Bob',
    ]);
  });

  it('drops the deleted conversation out of the inbox', async () => {
    await messagingService.deleteConversation(alice.id, conversationId);
    expect(await conversationFor(alice.id, conversationId)).toBeNull();
  });

  it('brings it back empty rather than with its old preview and badge', async () => {
    await messagingService.deleteConversation(alice.id, conversationId);
    await messagingService.createOrGetDirectConversation(alice.id, bob.id);

    const row = await conversationFor(alice.id, conversationId);
    expect(row).not.toBeNull();
    expect(row.lastMessage).toBeNull();
    expect(row.unreadCount).toBe(0);
  });

  it('starts counting again from the next thing they say', async () => {
    await messagingService.deleteConversation(alice.id, conversationId);
    await messagingService.createOrGetDirectConversation(alice.id, bob.id);

    await messagingService.sendMessage(bob.id, {
      conversationId,
      messageText: 'Still here',
    });

    const messages = await messagingService.listMessages(alice.id, conversationId);
    expect(messages.map((message) => message.messageText)).toEqual(['Still here']);

    const row = await conversationFor(alice.id, conversationId);
    expect(row.lastMessage.messageText).toBe('Still here');
    expect(row.unreadCount).toBe(1);
  });

  /**
   * Sending is the other way back into a conversation somebody left, and it
   * restored them with everything still in it. One reply undid a delete.
   */
  it('does not undo a delete by replying into it', async () => {
    await messagingService.deleteConversation(bob.id, conversationId);

    await messagingService.sendMessage(alice.id, {
      conversationId,
      messageText: 'One more thing',
    });

    const forBob = await messagingService.listMessages(bob.id, conversationId);
    expect(forBob.map((message) => message.messageText)).toEqual(['One more thing']);

    const row = await conversationFor(bob.id, conversationId);
    expect(row.lastMessage.messageText).toBe('One more thing');
    expect(row.unreadCount).toBe(1);

    // And Alice, who never left, still has all three.
    expect(await messagingService.listMessages(alice.id, conversationId)).toHaveLength(3);
  });

  /**
   * The other person has to be put back, or the next message would be sent
   * into a conversation they are not in and they would never see it. What they
   * must not get back is the history they deleted, and what must not happen is
   * the person who never left losing theirs.
   */
  it('puts the other person back empty handed, and leaves the sender untouched', async () => {
    await messagingService.deleteConversation(bob.id, conversationId);
    await messagingService.createOrGetDirectConversation(alice.id, bob.id);

    // Alice never left, so nothing about her copy changes.
    expect(await messagingService.listMessages(alice.id, conversationId)).toHaveLength(2);

    // Bob is reachable again, with none of what he removed.
    expect(await messagingService.listMessages(bob.id, conversationId)).toEqual([]);

    const forBob = await conversationFor(bob.id, conversationId);
    expect(forBob).not.toBeNull();
    expect(forBob.lastMessage).toBeNull();
    expect(forBob.unreadCount).toBe(0);

    await messagingService.sendMessage(alice.id, {
      conversationId,
      messageText: 'Are you there',
    });

    const delivered = await messagingService.listMessages(bob.id, conversationId);
    expect(delivered.map((message) => message.messageText)).toEqual(['Are you there']);
  });
});
