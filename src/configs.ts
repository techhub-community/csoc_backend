import juice from 'juice';
import * as jose from 'jose';
import { Kysely } from 'kysely';
import { Database } from './model';
import { D1Dialect } from 'kysely-d1';

type Content = {
  html?: string;
  text: string;
}

let _db: Kysely<Database>;

export let API_KEY = "";
export let JWT_SECRET = new TextEncoder().encode('');
export const frontDomain = 'https://csoc.codeshack.in' as const;
export const backDomain = 'https://csoc_backend.avinashpal24013.workers.dev' as const;

export async function signPayload(payload: any, expireIn: string = "1h") {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expireIn)
    .sign(JWT_SECRET);
}

export function database(set?: D1Database) {
  if (set) _db = new Kysely<Database>({
    dialect: new D1Dialect({ database: set }),
  });;

  return _db;
}

export function setJWTSecret(secret: string) {
  JWT_SECRET = new TextEncoder().encode(secret);
}

export function setAPIKey(key: string) {
  API_KEY = key;
}

export async function sendMail(name: string, to: string, subject: string, body: Content) {
  const data = {
    sender: {
      name: "TechHub Team",
      email: "techhub@040203.xyz"
    },
    to: [
      {
        email: to,
        name
      }
    ],
    subject,
    textContent: body.text,
    htmlContent: body.html ? juice(body.html) : undefined
  };

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    body: JSON.stringify(data),
    method: 'POST',
    headers: {
      'api-key': API_KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  console.log(await resp.text());
  return resp.status < 400;
}
