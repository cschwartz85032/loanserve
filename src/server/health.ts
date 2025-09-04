import { db } from '../../server/db';
import amqp from 'amqplib';

export async function healthHandler(req: any, res: any) {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unreachable' });
  }
}