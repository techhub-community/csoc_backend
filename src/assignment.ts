import { Hono } from 'hono';
import * as jose from 'jose';
import { database, JWT_SECRET } from './configs';

export const assignmentApp = new Hono();

// ─── Helper: verify token and return user record ─────────────────────────────

async function getAuthUser(token: string) {
  const email = (await jose.jwtVerify(token, JWT_SECRET)).payload.email as string;
  const db = database();
  return db.selectFrom('users').selectAll()
    .where('email', '=', email)
    .executeTakeFirst();
}

// ─── POST /assignment/create ─────────────────────────────────────────────────

assignmentApp.post('/assignment/create', async (c) => {
  const body = await c.req.json();
  const { token, title, description, due_date, reference_link } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors can create assignments' }, 403);

  if (!title || typeof title !== 'string' || !title.trim())
    return c.json({ error: 'Assignment title is required' }, 400);
  if (!description || typeof description !== 'string' || !description.trim())
    return c.json({ error: 'Assignment description is required' }, 400);

  const db = database();
  const domain = user.program;

  const result = await db.insertInto('assignments')
    .values({ 
      title: title.trim(), 
      description: description.trim(), 
      domain, 
      created_by: user.id as number,
      due_date: typeof due_date === 'number' ? due_date : undefined,
      reference_link: typeof reference_link === 'string' ? reference_link.trim() : undefined
    })
    .returning('assignment_id')
    .executeTakeFirst();

  if (!result) return c.json({ error: 'Failed to create assignment' }, 500);

  return c.json({ assignment_id: result.assignment_id, message: 'Assignment created successfully' }, 201);
});

// ─── GET /assignment/list ────────────────────────────────────────────────────

assignmentApp.get('/assignment/list', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);

  const db = database();
  const role = user.role ?? 'mentee';

  if (role === 'mentor') {
    const assignments = await db.selectFrom('assignments')
      .where('created_by', '=', user.id as number)
      .select(['assignment_id', 'title', 'description', 'domain', 'created_at', 'due_date', 'reference_link'])
      .execute();

    return c.json(assignments, 200);
  }

  // Mentee: return assignments for their domain with submitted flag
  const assignments = await db.selectFrom('assignments')
    .where('domain', '=', user.program)
    .select(['assignment_id', 'title', 'description', 'domain', 'created_at', 'due_date', 'reference_link'])
    .execute();

  const enriched = await Promise.all(assignments.map(async (asgn) => {
    const sub = await db.selectFrom('assignment_submissions').selectAll()
      .where('assignment_id', '=', asgn.assignment_id as number)
      .where('user_id', '=', user!.id as number)
      .select('submission_id')
      .executeTakeFirst();

    return { ...asgn, submitted: !!sub };
  }));

  return c.json(enriched, 200);
});

// ─── POST /assignment/:assignment_id/submit ──────────────────────────────────

assignmentApp.post('/assignment/:assignment_id/submit', async (c) => {
  const body = await c.req.json();
  const { token, github_link, text_answer } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentee') return c.json({ error: 'Only mentees can submit assignments' }, 403);

  const assignment_id = Number(c.req.param('assignment_id'));
  if (isNaN(assignment_id)) return c.json({ error: 'Invalid assignment ID' }, 400);

  if (!github_link && !text_answer)
    return c.json({ error: 'At least one of github_link or text_answer must be provided' }, 400);

  const db = database();
  const assignment = await db.selectFrom('assignments').selectAll()
    .where('assignment_id', '=', assignment_id)
    .select(['domain'])
    .executeTakeFirst();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);
  if (assignment.domain !== user.program)
    return c.json({ error: 'You do not have access to this assignment' }, 403);

  const existing = await db.selectFrom('assignment_submissions').selectAll()
    .where('assignment_id', '=', assignment_id)
    .where('user_id', '=', user.id as number)
    .select('submission_id')
    .executeTakeFirst();

  if (existing) return c.json({ error: 'You have already submitted this assignment' }, 403);

  await db.insertInto('assignment_submissions')
    .values({
      assignment_id,
      user_id: user.id as number,
      github_link: github_link ?? null,
      text_answer: text_answer ?? null,
    })
    .execute();

  return c.json({ message: 'Assignment submitted successfully' }, 201);
});

// ─── GET /assignment/:assignment_id/submissions ──────────────────────────────

assignmentApp.get('/assignment/:assignment_id/submissions', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors can view submissions' }, 403);

  const assignment_id = Number(c.req.param('assignment_id'));
  if (isNaN(assignment_id)) return c.json({ error: 'Invalid assignment ID' }, 400);

  const db = database();
  const assignment = await db.selectFrom('assignments').selectAll()
    .where('assignment_id', '=', assignment_id)
    .select(['created_by'])
    .executeTakeFirst();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);
  if (assignment.created_by !== (user.id as number))
    return c.json({ error: 'You can only view submissions for your own assignments' }, 403);

  const submissions = await db.selectFrom('assignment_submissions').selectAll()
    .innerJoin('users', 'assignment_submissions.user_id', 'users.id')
    .where('assignment_id', '=', assignment_id)
    .select([
      'assignment_submissions.submission_id',
      'users.name as user_name',
      'users.email as user_email',
      'assignment_submissions.github_link',
      'assignment_submissions.text_answer',
      'assignment_submissions.submitted_at',
      'assignment_submissions.grade',
      'assignment_submissions.remarks'
    ])
    .execute();

  return c.json(submissions, 200);
});

// ─── DELETE /assignment/:assignment_id ───────────────────────────────────────

assignmentApp.delete('/assignment/:assignment_id', async (c) => {
  const body = await c.req.json();
  const { token } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors can delete assignments' }, 403);

  const assignment_id = Number(c.req.param('assignment_id'));
  if (isNaN(assignment_id)) return c.json({ error: 'Invalid assignment ID' }, 400);

  const db = database();
  const assignment = await db.selectFrom('assignments').selectAll()
    .where('assignment_id', '=', assignment_id)
    .select(['created_by'])
    .executeTakeFirst();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);
  if (assignment.created_by !== (user.id as number))
    return c.json({ error: 'You can only delete your own assignments' }, 403);

  await db.deleteFrom('assignments')
    .where('assignment_id', '=', assignment_id)
    .execute();

  return c.json({ message: 'Assignment deleted' }, 200);
});

// ─── GET /assignment/:assignment_id/submission ───────────────────────────────

assignmentApp.get('/assignment/:assignment_id/submission', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!user) return c.json({ error: 'User not found' }, 401);

  const assignment_id = Number(c.req.param('assignment_id'));
  if (isNaN(assignment_id)) return c.json({ error: 'Invalid ID' }, 400);

  const db = database();
  const sub = await db.selectFrom('assignment_submissions').selectAll()
    .where('assignment_id', '=', assignment_id)
    .where('user_id', '=', user.id as number)
    .selectAll()
    .executeTakeFirst();

  if (!sub) return c.json({ message: 'Not submitted yet' }, 404);
  return c.json(sub, 200);
});

// ─── PATCH /assignment/:assignment_id/submissions/:submission_id/grade ───────

assignmentApp.patch('/assignment/:assignment_id/submissions/:submission_id/grade', async (c) => {
  const body = await c.req.json();
  const { token, grade, remarks } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors grade' }, 403);

  const assignment_id = Number(c.req.param('assignment_id'));
  const submission_id = Number(c.req.param('submission_id'));
  if (isNaN(assignment_id) || isNaN(submission_id)) return c.json({ error: 'Invalid IDs' }, 400);

  const db = database();
  const assignment = await db.selectFrom('assignments').selectAll()
    .where('assignment_id', '=', assignment_id)
    .select(['created_by'])
    .executeTakeFirst();

  if (!assignment || assignment.created_by !== (user.id as number))
    return c.json({ error: 'Forbidden' }, 403);

  await db.updateTable('assignment_submissions')
    .set({
      grade: typeof grade === 'string' ? grade : undefined,
      remarks: typeof remarks === 'string' ? remarks : undefined
    })
    .where('submission_id', '=', submission_id)
    .where('assignment_id', '=', assignment_id)
    .execute();

  return c.json({ message: 'Graded successfully' }, 200);
});
