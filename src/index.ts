import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { testApp } from './test';
import { authApp } from './auth';
import { flowsApp } from './flows';
import { teamsApp } from './teams';
import { quizApp } from './quiz';
import { assignmentApp } from './assignment';
import { database, setAPIKey, setJWTSecret } from './configs';

const app = new Hono<{ Bindings: {
    CSOC_DB: D1Database;
    JWT_SECRET: string;
    SENDINBLUE: string;
  }
}>();

app.use('*', async (c, next) => {
  setJWTSecret(c.env.JWT_SECRET);
  setAPIKey(c.env.SENDINBLUE);
  database(c.env.CSOC_DB);
  await next();
});

app.use('*', cors({
  maxAge: 86400,
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.route("/", authApp);
app.route("/", testApp);
app.route("/", flowsApp);
app.route("/", teamsApp);
app.route("/", quizApp);
app.route("/", assignmentApp);

app.notFound((c) => c.json({
  error: 'Not found'
}, 404));

app.onError((err, c) => {
  console.log(err);
  
  return c.json({
    error: err.message || "An error occurred",
    stack: err.stack
  }, 400);
});

export default app;
