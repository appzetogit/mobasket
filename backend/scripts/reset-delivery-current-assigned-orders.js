import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import Delivery from '../modules/delivery/models/Delivery.js';

dotenv.config();

async function run() {
  try {
    await connectDB();

    const result = await Delivery.updateMany(
      {},
      {
        $set: {
          currentAssignedOrders: 0,
        },
      }
    );

    console.log(
      `Reset currentAssignedOrders to 0 for ${result.modifiedCount ?? 0} delivery records.`
    );
  } catch (error) {
    console.error('Failed to reset currentAssignedOrders:', error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

run();
