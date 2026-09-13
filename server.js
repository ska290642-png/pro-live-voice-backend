import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { WebSocketServer } from 'ws';
import http from 'http';
import { Pool } from 'pg';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const json = (res, data, status = 200) => res.status(status).json(data);

app.get('/health', (_, res) => json(res, { ok: true, service: 'pro-live-voice-api' }));

app.get('/api/config', (_, res) => json(res, {
  agencyCode: '7077',
  voiceProvider: 'livekit',
  paymentProvider: 'razorpay',
  maxSeats: 12
}));

app.post('/api/auth/request-otp', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return json(res, { error: 'phone_required' }, 400);
  // Replace with a real SMS provider before production.
  return json(res, { ok: true, message: 'OTP provider integration required' });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return json(res, { error: 'phone_required' }, 400);
  const token = jwt.sign({ phone, dev: true }, process.env.JWT_SECRET || 'DEV_ONLY_CHANGE_ME', { expiresIn: '1h' });
  return json(res, { ok: true, token, warning: 'Development authentication only' });
});

app.get('/api/rooms', async (_, res) => {
  if (!pool) return json(res, { rooms: [] });
  const r = await pool.query('select id, title, host_id, max_seats, locked, created_at from rooms order by created_at desc limit 50');
  return json(res, { rooms: r.rows });
});

app.post('/api/rooms', async (req, res) => {
  const { title, hostId, maxSeats = 12 } = req.body || {};
  if (!title || !hostId) return json(res, { error: 'title_and_host_required' }, 400);
  if (!pool) return json(res, { ok: true, id: 'DEV_ROOM', title, hostId, maxSeats, warning: 'DB not configured' });
  const r = await pool.query(
    'insert into rooms(title, host_id, max_seats) values($1,$2,$3) returning *',
    [title, hostId, Math.min(Number(maxSeats) || 12, 12)]
  );
  return json(res, { room: r.rows[0] }, 201);
});

app.post('/api/rooms/:id/join', (req, res) => {
  const { userId } = req.body || {};
  return json(res, { ok: true, roomId: req.params.id, userId, note: 'Join LiveKit after obtaining a short-lived token.' });
});

app.post('/api/livekit/token', (req, res) => {
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return json(res, { error: 'livekit_not_configured' }, 501);
  }
  // Install livekit-server-sdk and implement token generation here.
  return json(res, { error: 'livekit_server_sdk_hook_required' }, 501);
});

app.post('/api/payments/order', async (req, res) => {
  if (!razorpay) return json(res, { error: 'razorpay_not_configured' }, 501);
  const { amountPaise, receipt } = req.body || {};
  if (!amountPaise) return json(res, { error: 'amount_required' }, 400);
  const order = await razorpay.orders.create({
    amount: Number(amountPaise),
    currency: 'INR',
    receipt: receipt || `plv_${Date.now()}`,
    payment_capture: 1
  });
  return json(res, { orderId: order.id, amount: order.amount, currency: order.currency });
});

app.post('/api/payments/verify', (req, res) => {
  // IMPORTANT: implement Razorpay signature verification on the server
  // before crediting diamonds.
  return json(res, { error: 'server_side_signature_verification_required' }, 501);
});

app.post('/api/wallet/withdraw', (req, res) => {
  return json(res, { error: 'KYC_and_payout_provider_required' }, 501);
});

const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', service: 'pro-live-voice' }));
  ws.on('message', raw => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }
    for (const client of clients) {
      if (client.readyState === 1) client.send(JSON.stringify(event));
    }
  });
  ws.on('close', () => clients.delete(ws));
});

server.listen(Number(process.env.PORT || 8080), () => {
  console.log(`PRO LIVE VOICE API listening on ${process.env.PORT || 8080}`);
});
