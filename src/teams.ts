import { database, frontDomain, JWT_SECRET, sendMail, signPayload } from "./configs";
import { inviteHtml, inviteText } from "./templates";
import * as jose from 'jose';
import { Hono } from 'hono';

export const teamsApp = new Hono();

teamsApp.post('/send-invite', async (c) => {
  const { token, receiverEmails } = await c.req.json();
  const { email: senderEmail } = (await jose.jwtVerify(token, JWT_SECRET))
    .payload as { email: string };
  const db = database();

  if (!Array.isArray(receiverEmails) || receiverEmails.length === 0 || receiverEmails.length > 2)
    return c.json({ error: 'Invalid request. Sender emails must be an array with a maximum length of 2.' }, 400);

  const sender = await db.selectFrom('users').selectAll()
    .where('email', '=', senderEmail)
    .executeTakeFirst();
  
  if (!sender) return c.json({ error: 'Sender not found.' }, 404);

  const existingTeam = await db.selectFrom('teams').selectAll()
    .where(qb => qb('leader_id', '=', sender.id)
      .or('member1_id', '=', sender.id)
      .or('member2_id', '=', sender.id)
    ).executeTakeFirst();
  
  if (existingTeam && (existingTeam.leader_id !== sender.id || existingTeam.filled))
    return c.json({ error: 'You are not allowed to send invites.' }, 400);

  const pendingInvites = await db.selectFrom('requests').selectAll()
    .where("receiver_id", '=', sender.id)
    .executeTakeFirst();

  if (pendingInvites) return c.json({ error: 'Reject or cancel pending invites before sending new ones.' }, 400);
  const invitees = [];

  for (const receiverEmail of receiverEmails) {
    const receiver = await db.selectFrom('users').selectAll()
      .where('email', '=', receiverEmail)
      .executeTakeFirst();

    let url = `${frontDomain}/auth`;
    
    if (!receiver) {
      const tempName = (receiverEmail as string).split('@')[0];
      url += `?register=true&program=${sender.program}&email=${receiverEmail}&opt=${await signPayload({
        asl: Math.random() * 100000000,
        senderProgram: sender.program,
        email: receiverEmail,
        sender: sender.id
      }, '14d')}`;

      await sendMail(
        tempName, receiverEmail,
        'Codeshack: Register now to join a CSOC Team!',
        {
          text: inviteText(sender.name, sender.email, url),
          html: inviteHtml(sender.name, sender.email, url)
        }
      );

      invitees.push(receiverEmail);
      continue;
    }

    if (receiver.program !== sender.program) continue; // Program should be same for all team members
    if (sender.id === receiver.id) continue; // Can't invite yourself

    const hasInvites = await db.selectFrom('requests').selectAll()
      .where("receiver_id", '=', receiver.id)
      .executeTakeFirst();
    
    if (hasInvites) continue; // Already has an invite so can't send a new one

    const teamJoined = await db.selectFrom('teams').selectAll()
      .where(qb => qb('leader_id', '=', receiver.id)
        .or('member1_id', '=', receiver.id)
        .or('member2_id', '=', receiver.id)
      ).executeTakeFirst();

    if (teamJoined) continue; // Already in a team

    // Let's first cancel all outgoing request for this receiver
    await db.deleteFrom("requests")
      .where('sender_id', '=', receiver.id)
      .execute();

    await sendMail(
      receiver.name,
      receiver.email,
      'Codeshack: Join a CSOC Team!', {
        text: inviteText(sender.name, sender.email, url),
        html: inviteHtml(sender.name, sender.email, url)
      }
    );

    await db.insertInto('requests').values({
      receiver_id: receiver.id,
      sender_id: sender.id
    }).execute();

    invitees.push(receiver.email);
  }

  if (invitees.length === 0) return c.json({ error: 'No valid receivers.' }, 400);
  return c.json({ message: 'Invites sent to ' + invitees.join(' & ') }, 200);
});

teamsApp.post('/process-invite', async (c) => {
  const { token, accepted } = await c.req.json();
  const { email: receiverEmail } = (await jose.jwtVerify(token, JWT_SECRET))
    .payload as { email: string };
  const db = database();

  const receiver = await db.selectFrom('users').selectAll().where('email', '=', receiverEmail).executeTakeFirst();
  if (!receiver) return c.json({ error: 'Receiver not found.' }, 404);

  const pendingRequest = await db.selectFrom('requests').selectAll()
    .where('receiver_id', '=', receiver.id)
    .executeTakeFirst();
  
  if (!pendingRequest) return c.json({ error: 'No pending invite found.' }, 404);
  await db.deleteFrom('requests').where('request_id', '=', pendingRequest.request_id).execute();

  if (accepted) {
    const sender = await db.selectFrom('users').selectAll().where('id', '=', pendingRequest.sender_id).executeTakeFirst();
    if (!sender) return c.json({ error: 'Sender not found.' }, 404);

    if (!(await addToTeam(sender.id, receiver.id, sender.program)))
      return c.json({ error: 'Team is already full.' }, 400);
    return c.json({ message: 'Team joined successfully.' }, 200);
  }

  return c.json({ message: 'Invite rejected successfully.' }, 200);
});

export async function addToTeam(sender: number, receiver: number, program: string) {
  const db = database();

  const team = await db.selectFrom('teams').selectAll()
    .where(qb => qb('leader_id', '=', sender)
      .or('member1_id', '=', sender)
      .or('member2_id', '=', sender)
    ).executeTakeFirst();

  if (team) {
    if (team.filled) return false;

    let query = db.updateTable('teams').set({ member1_id: receiver });
    if (team.member1_id) query = db.updateTable('teams')
      .set({
        member2_id: receiver,
        filled: true
      });

    await query.where('team_id', '=', team.team_id).execute();
  } else {
    await db.insertInto('teams').values({
      member1_id: receiver,
      team_type: program,
      leader_id: sender
    }).execute();
  }

  return true;
}
