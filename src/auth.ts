import { Hono } from 'hono';
import * as jose from 'jose';
import bcrypt from 'bcrypt-edge';
import { accVerifyHtml, accVerifyText } from "./templates";
import { backDomain, database, JWT_SECRET, sendMail, signPayload } from "./configs";
import { addToTeam } from './teams';

export const authApp = new Hono();
const mobileRegex = /^[0-9]{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/;

const VALID_DOMAINS = ['web', 'app', 'dsa', 'aiml', 'uiux'] as const;

authApp.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const db = database();

  if (!emailRegex.test(email)) return c.json({ error: 'Invalid email format' }, 400);
  if (!passwordRegex.test(password)) return c.json({ error: 'Invalid password format' }, 400);

  const user = await db.selectFrom('users').selectAll()
    .where('email', '=', email)
    .executeTakeFirst();
  
  if (!user || !(bcrypt.compareSync(password, user.password)))
    return c.json({ error: 'Wrong email or password' }, 401);
  const token = await signPayload({ email }, "7d");

  return c.json({
    ...(await getTeamNInviteData(user.id, user.program)),
    props: JSON.parse(user.props ?? "{}"),
    verified: user.verified,
    program: user.program,
    role: user.role ?? 'mentee',
    about: user.about,
    name: user.name,
    token,
    email
  });
});

authApp.post('/session', async (c) => {
  const { token } = await c.req.json();
  const db = database();

  try {
    const email = (await jose.jwtVerify(token, JWT_SECRET)).payload.email as string;
    const user = await db.selectFrom('users').selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    
    if (!user) return c.json({ valid: false }, 401);
    
    return c.json({
      ...(await getTeamNInviteData(user.id, user.program)),
      props: JSON.parse(user.props ?? "{}"),
      verified: user.verified,
      program: user.program,
      role: user.role ?? 'mentee',
      about: user.about,
      name: user.name,
      usn: user.usn,
      token,
      email
    });
  } catch (e) {
    return c.json({ valid: false }, 401);
  }
});

authApp.post('/register', async (c) => {
  const { name, password, email, usn: rawUsn, mobile, about, opt, program, role: rawRole, mentor_key } = await c.req.json();
  const hashedPassword = bcrypt.hashSync(password, 10);
  const db = database();

  // Validate role
  const role = rawRole === 'mentor' ? 'mentor' : 'mentee';

  // Validate program (required for both mentors and mentees)
  if (!VALID_DOMAINS.includes(program)) return c.json({ error: 'Invalid program selected. Must be one of: web, app, dsa, aiml, uiux' }, 400);

  // USN or Mentor Key validation
  let usn: string = '';
  if (role === 'mentor') {
    // Mentors use a special key instead of a USN. 
    // They can pass it as `mentor_key` or just type it into the frontend's USN field.
    const providedKey = mentor_key || rawUsn;
    if (providedKey !== 'secret_mentor_key_123') {
      return c.json({ error: 'Invalid mentor registration key' }, 403);
    }
  } else {
    usn = rawUsn as string;
    if (typeof usn !== 'string' || usn.length !== 10 || !usn.toLowerCase().startsWith('1mv2'))
      return c.json({ error: 'Invalid or Unacceptable USN' }, 400);

    if (!(usn.toLowerCase().startsWith('1mv24') || (usn.toLowerCase().startsWith('1mv23') && !['dsa', 'aiml', 'uiux'].includes(program))))
      return c.json({ error: 'First years (1mv24) can register for any program, while second years (1mv23) can only register for web or app programs' }, 400);
  }

  if (!emailRegex.test(email)) return c.json({ error: 'Invalid email format' }, 400);
  if (!mobileRegex.test(mobile)) return c.json({ error: 'Invalid mobile number' }, 400);
  if (!passwordRegex.test(password)) return c.json({ error: 'Invalid password format: must contain at least one letter and one number and be at least 8 characters long' }, 400);

  const newUser = {
    password: hashedPassword,
    verified: false,
    program,
    mobile,
    email,
    about,
    name,
    usn,
    role
  };

  try {
    await db.insertInto('users')
      .values(newUser).execute();
    const token = await signPayload({ email }, '7d');
    const verifyLink = `${backDomain}/verify-account?token=${token}`;

    await sendMail(name, email, 'Codeshack: CSOC Account Verification', {
      html: accVerifyHtml(verifyLink),
      text: accVerifyText(verifyLink)
    });

    if (opt) {
      try {
        const { email: _, sender, senderProgram } = (await jose
          .jwtVerify(opt, JWT_SECRET)).payload as {
            senderProgram: string;
            sender: number;
            email: string;
          };

        if (program !== senderProgram) return c.json({ error: 'Registration successful but Mismatching program found' }, 400);
        const idReq = await db.selectFrom('users').select('id')
          .where('email', '=', email).executeTakeFirst();
        if (!idReq) return c.json({ error: 'Registration successful but Mismatching email found' }, 400);

        if (!(await addToTeam(sender, idReq.id, program)))
          return c.json({ error: 'Registration successful but Team is already full.' }, 404);
      } catch (error) {
        console.log(error);
        return c.json({ error: 'Registration successful but unable to join team' }, 500);
      }
    }
    
    return c.json({ message: 'User registered successfully. Please check your email to verify your account.' }, 201);
  } catch (error) {
    console.log(error);
    return c.json({ error: 'Email already exists' }, 409);
  }
});

authApp.post('/reset-password', async (c) => {
  const { token, newPassword } = await c.req.json();
  const db = database();

  try {
    const email = (await jose.jwtVerify(token, JWT_SECRET)).payload.email as string;
    if (!passwordRegex.test(newPassword)) return c.json({ error: 'Invalid password format' }, 400);
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    await db.updateTable('users')
      .where('email', '=', email)
      .set({ password: hashedPassword }).execute();

    return c.json({ message: 'Password reset successfully.' }, 200);
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 400);
  }
});

authApp.post('/update-password', async (c) => {
  const { token, oldPass, newPass } = await c.req.json();
    if (!passwordRegex.test(newPass))
      return c.json({ error: 'Invalid password format' }, 400);
  
    const db = database();

  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    const { email } = payload as { email: string };

    // Find user by email
    const user = await db.selectFrom('users').selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!user || !(bcrypt.compareSync(oldPass, user.password)))
      return c.json({ error: 'Invalid old password' }, 401);

    // Update user's password
    const hashedNewPassword = bcrypt.hashSync(newPass, 10);
    await db.updateTable("users").set({ password: hashedNewPassword })
      .where('email', '=', email)
      .execute();
    
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

async function getTeamNInviteData(userId: number, program: string) {
  const db = database();

  const suggestions = (await db.selectFrom('users')
    .select('email').where(qb =>
      qb('program', '=', program)
      .and("id", "!=", userId)
    ).execute()).map(u => u.email);

  const inviteRec = await db.selectFrom("requests")
    .innerJoin("users", "sender_id", "users.id")
    .select([
      "users.name as sender_name",
      "users.email as sender_email"
    ])
    .where("receiver_id", "=", userId)
    .executeTakeFirst();

  const pendings = await db.selectFrom("requests")
    .innerJoin("users", "receiver_id", "users.id")
    .select([ "users.email as receiver" ])
    .where("sender_id", "=", userId)
    .execute();

  const invite = inviteRec ? {
    email: inviteRec.sender_email,
    name: inviteRec.sender_name
  } : null;

  const teamRec = await db.selectFrom('teams')
    .leftJoin('users as member1', 'teams.member1_id', 'member1.id')
    .leftJoin('users as member2', 'teams.member2_id', 'member2.id')
    .leftJoin('users as leader', 'teams.leader_id', 'leader.id')
    .select([
      "member1.email as member1_email",
      "member2.email as member2_email",
      "leader.email as leader_email",
      "leader_id"
    ])
    .where(qb => qb('leader_id', '=', userId)
      .or('member1_id', '=', userId)
      .or('member2_id', '=', userId)
    ).executeTakeFirst();

  const type = teamRec
    ? teamRec.leader_id === userId
      ? 'leader'
      : 'member'
    : 'solo';

  const team = teamRec ? {
    m1: teamRec.member1_email,
    m2: teamRec.member2_email,
    l: teamRec.leader_email
  } : null;

  return { invite, type, team, pendings, suggestions };
}
