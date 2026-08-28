import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import Delivery from '../../delivery/models/Delivery.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * List cash limit settlement (deposit) transactions
 * GET /api/admin/cash-limit-settlement
 * Query: search, page, limit, fromDate, toDate
 */
export const getCashLimitSettlements = asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 50, fromDate, toDate } = req.query;
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * limitNum;

    // Filtering, sorting and paging all run in the database. Loading every
    // wallet and slicing in JavaScript grew with total partners x lifetime
    // transactions and blocked the event loop while it ran.
    const transactionMatch = { 'transactions.type': 'deposit' };
    if (fromDate || toDate) {
      transactionMatch['transactions.createdAt'] = {};
      if (fromDate) transactionMatch['transactions.createdAt'].$gte = new Date(fromDate);
      if (toDate) transactionMatch['transactions.createdAt'].$lte = new Date(toDate);
    }

    const pipeline = [
      { $match: { 'transactions.0': { $exists: true } } },
      { $unwind: '$transactions' },
      { $match: transactionMatch },
      {
        $lookup: {
          from: Delivery.collection.name,
          localField: 'deliveryId',
          foreignField: '_id',
          as: 'delivery',
        },
      },
      { $unwind: { path: '$delivery', preserveNullAndEmptyArrays: true } },
    ];

    const term = String(search || '').trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'delivery.name': rx },
            { 'delivery.deliveryId': rx },
            { 'delivery.phone': rx },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { 'transactions.createdAt': -1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limitNum }],
          total: [{ $count: 'count' }],
        },
      },
    );

    const [result] = await DeliveryWallet.aggregate(pipeline);
    const total = result?.total?.[0]?.count || 0;

    const transactions = (result?.rows || []).map((row) => {
      const t = row.transactions || {};
      const d = row.delivery || {};
      const meta = t.metadata || {};

      return {
        id: t._id,
        amount: t.amount,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
        razorpayOrderId: meta.razorpayOrderId,
        razorpayPaymentId: meta.razorpayPaymentId,
        deliveryId: d._id,
        deliveryName: d.name || '—',
        deliveryIdString: d.deliveryId || (d._id ? String(d._id) : '—'),
        phone: d.phone || '—',
      };
    });

    return successResponse(res, 200, 'Cash limit settlements retrieved', {
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('Cash limit settlement error:', err?.message || err);
    return errorResponse(res, 500, err?.message || 'Failed to fetch cash limit settlements');
  }
});
