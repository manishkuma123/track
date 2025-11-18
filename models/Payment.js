const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscription_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  razorpay_order_id: {
    type: String,
    required: true,
    unique: true
  },
  razorpay_payment_id: {
    type: String
  },
  razorpay_signature: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'pending', 'success', 'failed', 'refunded'],
    default: 'created'
  },
  plan_type: {
    type: String,
    enum: ['starter', 'pro', 'exclusive'],
    required: true
  },
  billing_cycle: {
    type: String,
    enum: ['monthly', 'annually'],
    required: true
  },
  payment_method: {
    type: String
  },
  error_message: {
    type: String
  },
  refund_id: {
    type: String
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  paid_at: {
    type: Date
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

paymentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);