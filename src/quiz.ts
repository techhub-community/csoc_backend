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
  const { token, title, questions } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
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
    if (!VALID_OPTIONS.includes(q.correct_option))
      return c.json({ error: `correct_option must be one of: ${VALID_OPTIONS.join(', ')}` }, 400);
  }

  const db = database();
  const domain = user.program;

  const result = await db.insertInto('quizzes')
    .values({ title: title.trim(), domain, created_by: user.id as number })
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
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);

  const db = database();
  const role = user.role ?? 'mentee';

  if (role === 'mentor') {
    // Return all quizzes created by this mentor
    const quizzes = await db.selectFrom('quizzes')
      .where('created_by', '=', user.id as number)
      .selectAll()
      .execute();

    const enriched = await Promise.all(quizzes.map(async (quiz) => {
      const countRow = await db.selectFrom('quiz_questions')
        .where('quiz_id', '=', quiz.quiz_id as number)
        .select(db.fn.count('question_id').as('question_count'))
        .executeTakeFirst();
      return {
        quiz_id: quiz.quiz_id,
        title: quiz.title,
        domain: quiz.domain,
        created_at: quiz.created_at,
        question_count: Number(countRow?.question_count ?? 0),
      };
    }));

    return c.json(enriched, 200);
  }

  // Mentee: return all quizzes for their domain with attempted flag
  const quizzes = await db.selectFrom('quizzes')
    .where('domain', '=', user.program)
    .selectAll()
    .execute();

  const enriched = await Promise.all(quizzes.map(async (quiz) => {
    const countRow = await db.selectFrom('quiz_questions')
      .where('quiz_id', '=', quiz.quiz_id as number)
      .select(db.fn.count('question_id').as('question_count'))
      .executeTakeFirst();

    const attempt = await db.selectFrom('quiz_attempts')
      .where('quiz_id', '=', quiz.quiz_id as number)
      .where('user_id', '=', user!.id as number)
      .select('attempt_id')
      .executeTakeFirst();

    return {
      quiz_id: quiz.quiz_id,
      title: quiz.title,
      domain: quiz.domain,
      created_at: quiz.created_at,
      question_count: Number(countRow?.question_count ?? 0),
      attempted: !!attempt,
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
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentee') return c.json({ error: 'Only mentees can view quiz questions' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  if (isNaN(quiz_id)) return c.json({ error: 'Invalid quiz ID' }, 400);

  const db = database();
  const quiz = await db.selectFrom('quizzes')
    .where('quiz_id', '=', quiz_id)
    .selectAll()
    .executeTakeFirst();

  if (!quiz) return c.json({ error: 'Quiz not found' }, 404);
  if (quiz.domain !== user.program) return c.json({ error: 'You do not have access to this quiz' }, 403);

  const attempt = await db.selectFrom('quiz_attempts')
    .where('quiz_id', '=', quiz_id)
    .where('user_id', '=', user.id as number)
    .select('attempt_id')
    .executeTakeFirst();

  if (attempt) return c.json({ error: 'You have already attempted this quiz' }, 403);

  const questions = await db.selectFrom('quiz_questions')
    .where('quiz_id', '=', quiz_id)
    // Never send correct_option to the client before submission
    .select(['question_id', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d'])
    .execute();

  return c.json({ title: quiz.title, questions }, 200);
});

// ─── POST /quiz/:quiz_id/submit ──────────────────────────────────────────────

quizApp.post('/quiz/:quiz_id/submit', async (c) => {
  const body = await c.req.json();
  const { token, answers } = body;

  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let user: Awaited<ReturnType<typeof getAuthUser>>;
  try {
    user = await getAuthUser(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 401);
  if ((user.role ?? 'mentee') !== 'mentee') return c.json({ error: 'Only mentees can submit quizzes' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  if (isNaN(quiz_id)) return c.json({ error: 'Invalid quiz ID' }, 400);

  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    return c.json({ error: 'answers must be an object mapping question_id to chosen option' }, 400);

  const db = database();
  const quiz = await db.selectFrom('quizzes')
    .where('quiz_id', '=', quiz_id)
    .selectAll()
    .executeTakeFirst();

  if (!quiz) return c.json({ error: 'Quiz not found' }, 404);
  if (quiz.domain !== user.program) return c.json({ error: 'You do not have access to this quiz' }, 403);

  const existingAttempt = await db.selectFrom('quiz_attempts')
    .where('quiz_id', '=', quiz_id)
    .where('user_id', '=', user.id as number)
    .select('attempt_id')
    .executeTakeFirst();

  if (existingAttempt) return c.json({ error: 'You have already attempted this quiz' }, 403);

  const questions = await db.selectFrom('quiz_questions')
    .where('quiz_id', '=', quiz_id)
    .selectAll()
    .execute();

  const total = questions.length;
  let score = 0;

  const results = questions.map((q) => {
    const chosen = answers[String(q.question_id)];
    const is_correct = chosen === q.correct_option;
    if (is_correct) score++;
    return {
      question_id: q.question_id,
      question_text: q.question_text,
      chosen_option: chosen ?? null,
      correct_option: q.correct_option,
      is_correct,
    };
  });

  await db.insertInto('quiz_attempts')
    .values({
      quiz_id,
      user_id: user.id as number,
      score,
      total,
      answers: JSON.stringify(answers),
    })
    .execute();

  return c.json({ score, total, results }, 200);
});

// ─── DELETE /quiz/:quiz_id ───────────────────────────────────────────────────

quizApp.delete('/quiz/:quiz_id', async (c) => {
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
  if ((user.role ?? 'mentee') !== 'mentor') return c.json({ error: 'Only mentors can delete quizzes' }, 403);

  const quiz_id = Number(c.req.param('quiz_id'));
  if (isNaN(quiz_id)) return c.json({ error: 'Invalid quiz ID' }, 400);

  const db = database();
  const quiz = await db.selectFrom('quizzes')
    .where('quiz_id', '=', quiz_id)
    .select(['created_by'])
    .executeTakeFirst();

  if (!quiz) return c.json({ error: 'Quiz not found' }, 404);
  if (quiz.created_by !== (user.id as number)) return c.json({ error: 'You can only delete your own quizzes' }, 403);

  await db.deleteFrom('quizzes')
    .where('quiz_id', '=', quiz_id)
    .execute();

  return c.json({ message: 'Quiz deleted' }, 200);
});
