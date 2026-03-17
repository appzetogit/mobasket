import mongoose from 'mongoose';
import Order from './Order.js';

const mofoodsOrderSchema = Order.schema.clone();
mofoodsOrderSchema.clearIndexes();
mofoodsOrderSchema.set('autoIndex', false);
mofoodsOrderSchema.set('autoCreate', false);

const MofoodsOrder =
  mongoose.models.MofoodsOrder ||
  mongoose.model('MofoodsOrder', mofoodsOrderSchema, 'mofoodsorder');

export default MofoodsOrder;
