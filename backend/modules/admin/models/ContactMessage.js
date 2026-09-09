import mongoose from 'mongoose';

/**
 * A customer enquiry or complaint submitted from the Contact Us page.
 *
 * Kept separate from DeliverySupportTicket, which covers delivery partners and
 * carries its own workflow.
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      maxlength: 20,
    },
    subject: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    // Set when the sender was signed in, so admin can see the account behind an
    // enquiry without relying on a typed email matching.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['New', 'In Progress', 'Resolved'],
      default: 'New',
      index: true,
    },
    // Internal only; never returned by the public endpoint.
    adminNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    handledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Admin inbox is read newest first, usually filtered by status.
contactMessageSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ContactMessage', contactMessageSchema);
