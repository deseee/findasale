import { GuideEntry } from '../index';

const entry: GuideEntry = {
  slug: 'message-templates',
  title: 'Message Templates',
  audience: 'both',
  format: 'written',
  priority: 2,
  relatedGuides: [],
  videoUrl: undefined,
  body: `# Message templates and the built-in inbox

Templates are saved replies you write once and reuse every time you need to send the same message.
The inbox is where every shopper conversation lives, filtered by sale.
Together they cut the back-and-forth down to a few taps.

This guide explains how to create templates, how to use one inside a conversation, and what shoppers see when you message them.

---

## Message templates

### Create a template

Go to \`/organizer/message-templates\` and tap **New Template**.

Give it a short name for your own reference — you're the only one who sees the name.
Write the message text.
Save it.

That's all. The template is now available inside any message thread.

### Use a template in a conversation

Open \`/organizer/messages\`.
Find the shopper's thread and tap into it.
Tap the **Templates** icon (looks like a stack of lines) above the text field.
Your saved templates appear in a list.
Tap one to load it into the text box.
Edit if needed — maybe swap out a time or item name.
Tap Send.

The shopper sees a normal message. It doesn't say "template" anywhere on their end.

---

## The inbox

\`/organizer/messages\` shows all shopper conversations, sorted by most recent.
Use the sale filter at the top to narrow it down to a specific sale.

Each thread shows:
- Shopper name
- Last message (theirs or yours)
- Unread indicator if they replied and you haven't seen it

Tap a thread to open it. Replies are text — back and forth, same as a text message.

What shoppers see: messages arrive as app notifications (or browser notifications if they're not using the app). They can reply from the notification or from their message tab. Responses land back in your inbox.

---

## Templates worth creating first

These cover most of what organizers message about:

**Hold confirmed.** "Your hold on [item] is confirmed. Please pick it up by [time/date]. Message me if you need to adjust."

**Hold expired.** "Your hold on [item] has expired. The item is back on the floor. Let me know if you'd like to arrange another time."

**Item sold before arrival.** "I'm sorry — [item] sold before you arrived. I'll keep an eye out for something similar and let you know. Thanks for your patience."

Use these as starting points and adjust the wording to match how you talk.

---

## Common questions

**Can I use a template for hold approval notifications?**
Yes. When you approve a hold from \`/organizer/holds\`, you can trigger a message to the shopper. If you've saved a hold confirmation template, it loads automatically. Edit and send.

**Do templates support variables like [item name]?**
You can include placeholder text like \`[item]\` or \`[time]\` — but the app doesn't fill them in automatically. You fill them in before sending. It's still faster than typing the whole message.

**Can I have different templates for different sales?**
Templates are account-wide, not sale-specific. Name them clearly so you know which ones fit which situation.

**What if a shopper messages me outside sale hours?**
You'll see it in your inbox the next time you check. There's no auto-responder, so if response time matters to you, set expectations in your sale description ("I check messages between 8am–8pm").

**Can multiple staff check the inbox?**
Yes. Any staff member with organizer access can view and reply in the inbox. Threads don't lock to one person.

**Can I delete a message thread?**
Threads archive automatically after a sale closes. You can't delete individual messages, but you can archive a thread from the inbox.

---

## Related guides

- [Run the POS: take payments in person](/guides/run-the-pos)
- [The line queue: manage walk-up traffic](/guides/line-queue)
- [Manage holds: approve, extend, cancel](/guides/manage-holds-approve-extend-cancel)`,
};

export default entry;
