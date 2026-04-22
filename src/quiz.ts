import { Hono } from 'hono';
import * as jose from 'jose';
import { database, JWT_SECRET } from './configs';

export const quizApp = new Hono();

const VALID_OPTIONS = ['a', 'b', 'c', 'd'] as const;

// ─── Helper: verify token and return user record ─────────────────────────────

async function getAuthUser(token: string) {
  const email = (await jose.jwtVerify(token, JWT_SECRET)).payload.email as string;
  const db = database();
  return db.selectFrom('users').selectAll()
    .where('email', '=', email)
    .executeTakeFirst();
}

// ─── POST /quiz/create ───────────────────────────────────────────────────────

quizApp.post('/quiz/create', async (c) => {
  const body = await c.req.json();
  const { token, title, questions, description } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors can create quizzes' }, 403);

  if (!title || typeof title !== 'string' || !title.trim())
    return c.json({ error: 'Quiz title is required' }, 400);

  if (!Array.isArray(questions) || questions.length < 1)
    return c.json({ error: 'At least one question is required' }, 400);

  for (const q of questions) {
    if (!q.question_text || !q.option_a || !q.option_b || !q.option_c || !q.option_d)
      return c.json({ error: 'Each question must have question_text and options a–d' }, 400);
    
    q.correct_option = typeof q.correct_option === 'string' ? q.correct_option.toLowerCase() : q.correct_option;

    if (!VALID_OPTIONS.includes(q.correct_option))
      return c.json({ error: `correct_option must be one of: ${VALID_OPTIONS.join(', ')}` }, 400);
  }

  const db = database();
  const domain = user.program;

  const result = await db.insertInto('quizzes')
    .values({ 
      title: title.trim(), 
      domain, 
      created_by: user.id as number,
      is_active: 1
    })
    .returning('quiz_id')
    .executeTakeFirst();

  if (!result) return c.json({ error: 'Failed to create quiz' }, 500);
  const quiz_id = result.quiz_id as number;

  await db.insertInto('quiz_questions')
    .values(questions.map((q: any) => ({
      quiz_id,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      marks: typeof q.marks === 'number' ? q.marks : 1
    })))
    .execute();

  return c.json({ quiz_id, message: 'Quiz created successfully' }, 201);
});

// ─── GET /quiz/list ─────────────────────────────────────────────────────────

quizApp.get('/quiz/list', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!user) return c.json({ error: 'User not found' }, 401);

  const db = database();
  const role = user.role ?? 'mentee';

  if (role === 'mentor') {
    const quizzes = await db.selectFrom('quizzes').selectAll()
      .where('created_by', '=', user.id as number)
      .selectAll()
      .execute();

    const enriched = await Promise.all(quizzes.map(async (quiz) => {
      const countRow = await db.selectFrom('quiz_questions').selectAll()
        .where('quiz_id', '=', quiz.quiz_id as number)
        .select(db.fn.count('question_id').as('question_count'))
        .executeTakeFirst();
        
      const attemptsCount = await db.selectFrom('quiz_attempts').selectAll()
        .where('quiz_id', '=', quiz.quiz_id as number)
        .where('is_submitted', '=', 1)
        .select(db.fn.count('user_id').distinct().as('mentee_count'))
        .executeTakeFirst();

      return {
        quiz_id: quiz.quiz_id,
        title: quiz.title,
        domain: quiz.domain,
        created_at: quiz.created_at,
        is_active: quiz.is_active,
        question_count: Number(countRow?.question_count ?? 0),
        total_mentees_attempted: Number(attemptsCount?.mentee_count ?? 0)
      };
    }));
    return c.json(enriched, 200);
  }

  // Mentee: return active quizzes
  const quizzes = await db.selectFrom('quizzes').selectAll()
    .where('domain', '=', user.program)
    .where('is_active', '=', 1)
    .selectAll()
    .execute();

  const enriched = await Promise.all(quizzes.map(async (quiz) => {
    const countRow = await db.selectFrom('quiz_questions').selectAll()
      .where('quiz_id', '=', quiz.quiz_id as number)
      .select(db.fn.count('question_id').as('question_count'))
      .executeTakeFirst();

    const attempt = await db.selectFrom('quiz_attempts').selectAll()
      .where('quiz_id', '=', quiz.quiz_id as number)
      .where('user_id', '=', user!.id as number)
      .select('is_submitted')
      .executeTakeFirst();

    return {
      quiz_id: quiz.quiz_id,
      title: quiz.title,
      domain: quiz.domain,
      created_at: quiz.created_at,
      question_count: Number(countRow?.question_count ?? 0),
      attempted: attempt?.is_submitted === 1,
    };
  }));

  return c.json(enriched, 200);
});

// ─── GET /quiz/:quiz_id/questions ────────────────────────────────────────────

quizApp.get('/quiz/:quiz_id/questions', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentee') return c.json({ error: 'Only mentees view questions' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  if (isNaN(quiz_id)) return c.json({ error: 'Invalid quiz ID' }, 400);

  const db = database();
  const quiz = await db.selectFrom('quizzes').selectAll()
    .where('quiz_id', '=', quiz_id)
    .selectAll()
    .executeTakeFirst();

  if (!quiz || quiz.is_active !== 1) return c.json({ error: 'Quiz not available' }, 404);
  if (quiz.domain !== user.program) return c.json({ error: 'You do not have access to this quiz' }, 403);

  const attempt = await db.selectFrom('quiz_attempts').selectAll()
    .where('quiz_id', '=', quiz_id)
    .where('user_id', '=', user.id as number)
    .select(['attempt_id', 'is_submitted'])
    .executeTakeFirst();

  if (!attempt) return c.json({ error: 'Start the quiz first' }, 403);
  if (attempt.is_submitted === 1) return c.json({ error: 'Already submitted' }, 403);

  const questions = await db.selectFrom('quiz_questions').selectAll()
    .where('quiz_id', '=', quiz_id)
    .select(['question_id', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'marks'])
    .execute();

  return c.json({ title: quiz.title, questions }, 200);
});

// ─── POST /quiz/:quiz_id/start ───────────────────────────────────────────────

quizApp.post('/quiz/:quiz_id/start', async (c) => {
  const body = await c.req.json();
  const { token } = body;
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch { return c.json({ error: 'Invalid token' }, 401); }
  if (!user) return c.json({ error: 'Not found' }, 401);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();
  const quiz = await db.selectFrom('quizzes').selectAll().where('quiz_id', '=', quiz_id).executeTakeFirst();
  if (!quiz || quiz.is_active !== 1) return c.json({ error: 'Not available' }, 404);

  const exist = await db.selectFrom('quiz_attempts').selectAll()
    .where('quiz_id', '=', quiz_id)
    .where('user_id', '=', user.id as number)
    .executeTakeFirst();
  
  if (exist) return c.json({ message: 'Already started' }, 200);

  await db.insertInto('quiz_attempts')
    .values({ quiz_id, user_id: user.id as number, total_score: 0, is_submitted: 0 })
    .execute();
    
  return c.json({ message: 'Quiz started' }, 201);
});

// ─── POST /quiz/:quiz_id/submit ──────────────────────────────────────────────

quizApp.post('/quiz/:quiz_id/submit', async (c) => {
  const body = await c.req.json();
  const { token, answers } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(token); } catch { return c.json({ error: 'Invalid token' }, 401); }
  if (!user) return c.json({ error: 'User not found' }, 401);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();

  const attempt = await db.selectFrom('quiz_attempts').selectAll()
    .where('quiz_id', '=', quiz_id)
    .where('user_id', '=', user.id as number)
    .executeTakeFirst();

  if (!attempt) return c.json({ error: 'Start quiz first' }, 403);
  if (attempt.is_submitted === 1) return c.json({ error: 'Already submitted' }, 403);

  const questions = await db.selectFrom('quiz_questions').selectAll().where('quiz_id', '=', quiz_id).execute();
  
  let total_score = 0;
  let answersToInsert: any[] = [];

  for (const q of questions) {
    let chosen = answers[String(q.question_id)];
    if (typeof chosen === 'string') chosen = chosen.toLowerCase();
    
    const is_correct = chosen === q.correct_option ? 1 : 0;
    if (is_correct) total_score += q.marks;

    answersToInsert.push({
      attempt_id: attempt.attempt_id as number,
      question_id: q.question_id as number,
      selected_option: chosen ?? null,
      is_correct
    });
  }

  if (answersToInsert.length > 0) {
    await db.insertInto('quiz_answers').values(answersToInsert).execute();
  }

  await db.updateTable('quiz_attempts')
    .set({ is_submitted: 1, submitted_at: Math.floor(Date.now() / 1000), total_score })
    .where('attempt_id', '=', attempt.attempt_id as number)
    .execute();

  return c.json({ message: 'Submitted', total_score }, 200);
});

// ─── GET /quiz/:quiz_id/result ───────────────────────────────────────────────

quizApp.get('/quiz/:quiz_id/result', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(token); } catch { return c.json({ error: 'Invalid token' }, 401); }
  if (!user) return c.json({ error: 'User not found' }, 401);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();

  const attempt = await db.selectFrom('quiz_attempts').selectAll()
    .where('quiz_id', '=', quiz_id).where('user_id', '=', user.id as number)
    .executeTakeFirst();

  if (!attempt || attempt.is_submitted === 0) return c.json({ error: 'Not submitted' }, 403);

  const qData = await db.selectFrom('quiz_questions').selectAll()
    .where('quiz_id', '=', quiz_id)
    .leftJoin('quiz_answers', join => join
      .onRef('quiz_answers.question_id', '=', 'quiz_questions.question_id')
      .on('quiz_answers.attempt_id', '=', attempt.attempt_id as number)
    )
    .select([
      'quiz_questions.question_id', 'quiz_questions.question_text', 'quiz_questions.option_a', 'quiz_questions.option_b',
      'quiz_questions.option_c', 'quiz_questions.option_d', 'quiz_questions.correct_option',
      'quiz_questions.marks', 'quiz_answers.selected_option', 'quiz_answers.is_correct'
    ])
    .execute();

  const max_score = qData.reduce((acc, q) => acc + q.marks, 0);

  return c.json({ total_score: attempt.total_score, max_score, questions: qData }, 200);
});

// ─── MENTOR SPECIFIC ENDPOINTS ───────────────────────────────────────────────

quizApp.patch('/quiz/:quiz_id/active', async (c) => {
  const body = await c.req.json();
  const { token, is_active } = body;
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(token); } catch { return c.json({ error: 'Invalid token' }, 401); }
  if ((user?.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Forbidden' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();
  const quiz = await db.selectFrom('quizzes').selectAll().where('quiz_id', '=', quiz_id).executeTakeFirst();
  if (!quiz || quiz.created_by !== (user!.id as number)) return c.json({ error: 'Forbidden' }, 403);

  await db.updateTable('quizzes').set({ is_active: is_active ? 1 : 0 }).where('quiz_id', '=', quiz_id).execute();
  return c.json({ message: 'Toggled' }, 200);
});

quizApp.get('/quiz/:quiz_id/attempts', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(token); } catch { return c.json({ error: 'Invalid token' }, 401); }
  if ((user?.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Forbidden' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();
  const quiz = await db.selectFrom('quizzes').selectAll().where('quiz_id', '=', quiz_id).executeTakeFirst();
  if (!quiz || quiz.created_by !== (user!.id as number)) return c.json({ error: 'Forbidden' }, 403);

  const attempts = await db.selectFrom('quiz_attempts').selectAll()
    .innerJoin('users', 'quiz_attempts.user_id', 'users.id')
    .where('quiz_id', '=', quiz_id)
    .where('is_submitted', '=', 1)
    .select(['attempt_id', 'users.id as mentee_id', 'users.name as mentee_name', 'users.email as mentee_email', 'total_score', 'submitted_at'])
    .execute();

  return c.json(attempts, 200);
});

quizApp.get('/quiz/:quiz_id/attempts/:mentee_id', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try { user = await getAuthUser(token); } catch { return c.json({ error: 'Invalid token' }, 401); }
  if ((user?.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Forbidden' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  const mentee_id = Number(c.req.param('mentee_id'));
  const db = database();
  
  const quiz = await db.selectFrom('quizzes').selectAll().where('quiz_id', '=', quiz_id).executeTakeFirst();
  if (!quiz || quiz.created_by !== (user!.id as number)) return c.json({ error: 'Forbidden' }, 403);

  const attempt = await db.selectFrom('quiz_attempts').selectAll().where('quiz_id', '=', quiz_id).where('user_id', '=', mentee_id).executeTakeFirst();
  if (!attempt) return c.json({ error: 'No attempt' }, 404);

  const qData = await db.selectFrom('quiz_questions').selectAll()
    .where('quiz_id', '=', quiz_id)
    .leftJoin('quiz_answers', join => join
      .onRef('quiz_answers.question_id', '=', 'quiz_questions.question_id')
      .on('quiz_answers.attempt_id', '=', attempt.attempt_id as number)
    )
    .select([
      'quiz_questions.question_id', 'quiz_questions.question_text', 'quiz_questions.correct_option', 'quiz_questions.marks',
      'quiz_answers.selected_option', 'quiz_answers.is_correct'
    ])
    .execute();

  return c.json({ mentee_id, total_score: attempt.total_score, submitted_at: attempt.submitted_at, answers: qData }, 200);
});

quizApp.delete('/quiz/:quiz_id', async (c) => {
  const body = await c.req.json();
  const { token } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors delete quizzes' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  const db = database();
  const quiz = await db.selectFrom('quizzes').selectAll().where('quiz_id', '=', quiz_id).select(['created_by']).executeTakeFirst();

  if (!quiz || quiz.created_by !== (user.id as number)) return c.json({ error: 'Forbidden' }, 403);

  await db.deleteFrom('quizzes').where('quiz_id', '=', quiz_id).execute();

  return c.json({ message: 'Quiz deleted' }, 200);
});
