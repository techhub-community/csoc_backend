import { database, frontDomain, JWT_SECRET, sendMail, signPayload } from './configs';
import { forgotHtml, forgotText } from './templates';
import * as jose from 'jose';
import { Hono } from 'hono';

export const flowsApp = new Hono();

flowsApp.post('/forgot-password', async (c) => {
  const { email } = await c.req.json();
  const db = database();

  const user = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
  if (!user) return c.json({ message: 'If this email is registered, you will receive a password reset link.' }, 200);

  const token = await signPayload({ email }, '1h');
  const resetLink = `${frontDomain}/reset-password?token=${token}`;
  
  await sendMail(user.name, email, 'Codeshack: Password Reset', {
    html: forgotHtml(resetLink),
    text: forgotText(resetLink)
  });

  return c.json({ message: 'If this email is registered, you will receive a password reset link.' }, 200);
});

flowsApp.post('/update-name', async (c) => {
  const { token, name } = await c.req.json();
  const db = database();

  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    const { email } = payload as { email: string };

    // Update user's name
    await db.updateTable("users").set({ name })
      .where('email', '=', email)
      .execute();
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

flowsApp.post('/update-about', async (c) => {
  const { token, about } = await c.req.json();
  const db = database();

  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);

    const { email } = payload as { email: string };

    // Update user's about information
    await db.updateTable("users").set({ about })
      .where('email', '=', email)
      .execute();
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

flowsApp.post('/update-usn', async (c) => {
  return c.json({ error: 'Change of USN is not allowed' }, 400);
  const { token, usn } = await c.req.json();
  const db = database();

  try {
    if (typeof usn !== "string" || usn.length !== 10 || !usn.toLowerCase().startsWith("1mv2"))
      return c.json({ error: "Invalid or Unacceptable USN" }, 400);

    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    const { email } = payload as { email: string };

    // Update user's usn information
    await db.updateTable("users").set({ usn })
      .where('email', '=', email)
      .execute();
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

flowsApp.post('/send-message', async (c) => {
  const { name, email, subject, message } = await c.req.json();
  const db = database();

  // Validation for name
  if (name.length < 2 || name.length > 32)
    return c.json({ error: 'Name must be between 2 and 32 characters long!' }, 400);

  // Validation for email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return c.json({ error: 'Invalid email format!' }, 400);

  // Validation for subject
  if (subject.length < 2 || subject.length > 64)
    return c.json({ error: 'Subject must be between 1 and 64 characters long!' }, 400);

  // Validation for message
  if (message.length < 1 || message.length > 2048)
    return c.json({ error: 'Message must be between 1 and 2048 characters long!' }, 400);

  await db.insertInto('messages').values({ name, email, subject, message }).execute();
  return c.json({ message: 'Message sent successfully.' }, 200);
});
