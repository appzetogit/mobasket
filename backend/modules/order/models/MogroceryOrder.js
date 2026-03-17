import mongoose from 'mongoose';
import Order from './Order.js';

const mogroceryOrderSchema = Order.schema.clone();
mogroceryOrderSchema.clearIndexes();
mogroceryOrderSchema.set('autoIndex', false);
mogroceryOrderSchema.set('autoCreate', false);

const MogroceryOrder =
  mongoose.models.MogroceryOrder ||
  mongoose.model('MogroceryOrder', mogroceryOrderSchema, 'mogroceryorder');

export default MogroceryOrder;
