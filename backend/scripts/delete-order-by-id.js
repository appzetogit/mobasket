/**
 * One-off script to delete an order by its orderId string (e.g. ORD-1771479927626-954832).
 * Usage: node scripts/delete-order-by-id.js ORD-1771479927626-954832
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import Order from '../modules/order/models/Order.js';
import OrderEvent from '../modules/order/models/OrderEvent.js';
import ETALog from '../modules/order/models/ETALog.js';
import OrderSettlement from '../modules/order/models/OrderSettlement.js';
import Payment from '../modules/payment/models/Payment.js';

dotenv.config();

const orderIdStr = process.argv[2] || 'ORD-1771479927626-954832';

async function run() {
  await connectDB();

  const order = await Order.findOne({ orderId: orderIdStr });
  if (!order) {
    console.log(`Order not found: ${orderIdStr}`);
    process.exit(1);
  }

  const id = order._id;
  const deletedEvents = await OrderEvent.deleteMany({ orderId: id });
  const deletedEtaLogs = await ETALog.deleteMany({ orderId: id });
  const deletedSettlements = await OrderSettlement.deleteMany({ orderId: id });
  const deletedPayments = await Payment.deleteMany({ orderId: id });
  await Order.deleteOne({ _id: id });

  console.log(`Deleted order ${orderIdStr}:`);
  console.log(`  OrderEvents: ${deletedEvents.deletedCount}, ETALogs: ${deletedEtaLogs.deletedCount}, Settlements: ${deletedSettlements.deletedCount}, Payments: ${deletedPayments.deletedCount}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
