const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan_type: {
    type: String,
    enum: ['trial', 'starter', 'pro', 'exclusive'],
    default: 'trial',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'trial'],
    default: 'trial'
  },
  billing_cycle: {
    type: String,
    enum: ['monthly', 'annually'],
    default: 'monthly'
  },
  start_date: {
    type: Date,
    default: Date.now
  },
  end_date: {
    type: Date,
    required: true
  },
  trial_end_date: {
    type: Date
  },
  is_trial: {
    type: Boolean,
    default: true
  },
  features: {
    max_boxes: {
      type: Number,
      default: 10
    },
    csv_upload: {
      type: Boolean,
      default: false
    },
    container_customization: {
      type: Boolean,
      default: false
    },
    pdf_export: {
      type: Boolean,
      default: false
    },
    unlimited_boxes: {
      type: Boolean,
      default: false
    },
    advanced_optimization: {
      type: Boolean,
      default: false
    },
    animated_visualizer: {
      type: Boolean,
      default: false
    },
    premium_support: {
      type: Boolean,
      default: false
    },
    three_d_view: {
      type: Boolean,
      default: true
    }
  },
  payment_details: {
    transaction_id: String,
    amount: Number,
    currency: {
      type: String,
      default: 'INR'
    },
    payment_method: String,
    payment_date: Date
  },
  auto_renew: {
    type: Boolean,
    default: true
  },
  usage_stats: {
    boxes_used_this_month: {
      type: Number,
      default: 0
    },
    calculations_this_month: {
      type: Number,
      default: 0
    },
    last_reset_date: {
      type: Date,
      default: Date.now
    }
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

subscriptionSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

subscriptionSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && this.end_date > now;
};

subscriptionSchema.methods.isTrialActive = function() {
  if (!this.is_trial) return false;
  const now = new Date();
  return this.trial_end_date && this.trial_end_date > now;
};

subscriptionSchema.statics.getPlanFeatures = function(planType) {
  const plans = {
    trial: {
      max_boxes: 10,
      csv_upload: true,
      container_customization: true,
      pdf_export: true,
      unlimited_boxes: true,
      advanced_optimization: true,
      animated_visualizer: true,
      premium_support: true,
      three_d_view: true
    },
    starter: {
      max_boxes: 10,
      csv_upload: false,
      container_customization: false,
      pdf_export: false,
      unlimited_boxes: false,
      advanced_optimization: false,
      animated_visualizer: false,
      premium_support: false,
      three_d_view: true
    },
    pro: {
      max_boxes: 10,
      csv_upload: true,
      container_customization: true,
      pdf_export: true,
      unlimited_boxes: false,
      advanced_optimization: false,
      animated_visualizer: false,
      premium_support: false,
      three_d_view: true
    },
    exclusive: {
      max_boxes: 100,
      csv_upload: true,
      container_customization: true,
      pdf_export: true,
      unlimited_boxes: true,
      advanced_optimization: true,
      animated_visualizer: true,
      premium_support: true,
      three_d_view: true
    }
  };
  
  return plans[planType] || plans.trial;
};

subscriptionSchema.statics.getPlanPricing = function(planType, billingCycle = 'monthly') {
  const pricing = {
    starter: { monthly: 199, annually: 1990 },
    pro: { monthly: 299, annually: 2990 },
    exclusive: { monthly: 499, annually: 4990 }
  };
  
  return pricing[planType]?.[billingCycle] || 0;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);