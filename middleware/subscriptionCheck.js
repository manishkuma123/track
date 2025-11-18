const Subscription = require('../models/Subscription');

const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    const subscription = await Subscription.findOne({ user_id: userId });
    
    if (!subscription) {
      return res.status(403).json({ 
        error: 'No subscription found. Please subscribe to a plan.',
        redirect: '/pricing'
      });
    }
    
    const isTrialActive = subscription.isTrialActive();
    const isSubscriptionActive = subscription.isActive();
    
    if (!isTrialActive && !isSubscriptionActive) {
      return res.status(403).json({ 
        error: 'Your subscription has expired. Please renew to continue.',
        redirect: '/pricing'
      });
    }
    
    req.subscription = subscription;
    next();
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to check subscription', 
      details: err.message 
    });
  }
};

const checkFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    try {
      const subscription = req.subscription;
      
      if (!subscription) {
        return res.status(403).json({  
          error: 'Subscription information not found',
          redirect: '/pricing'
        });
      }
      
      if (!subscription.features[featureName]) {
        return res.status(403).json({ 
          error: `This feature requires a higher plan. Current plan: ${subscription.plan_type}`,
          feature: featureName,
          current_plan: subscription.plan_type,
          redirect: '/pricing',
          upgrade_required: true
        });
      }
      
      next();
    } catch (err) {
      res.status(500).json({ 
        error: 'Failed to check feature access', 
        details: err.message 
      });
    }
  };
};

const checkBoxLimit = async (req, res, next) => {
  try {
    const subscription = req.subscription;
    const boxCount = req.body.boxes?.length || 0;
    
    if (!subscription.features.unlimited_boxes && boxCount > subscription.features.max_boxes) {
      return res.status(403).json({ 
        error: `Box limit exceeded. Your plan allows up to ${subscription.features.max_boxes} boxes.`,
        current_count: boxCount,
        max_allowed: subscription.features.max_boxes,
        upgrade_required: true,
        redirect: '/pricing'
      });
    }
    
    next();
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to check box limit', 
      details: err.message 
    });
  }
};

const trackUsage = async (req, res, next) => {
  try {
    const subscription = req.subscription;
    
    const now = new Date();
    const lastReset = new Date(subscription.usage_stats.last_reset_date);
    const monthDiff = (now.getFullYear() - lastReset.getFullYear()) * 12 + 
                      (now.getMonth() - lastReset.getMonth());
    
    if (monthDiff >= 1) {
      subscription.usage_stats.boxes_used_this_month = 0;
      subscription.usage_stats.calculations_this_month = 0;
      subscription.usage_stats.last_reset_date = now;
    }
    
    subscription.usage_stats.calculations_this_month += 1;
    subscription.usage_stats.boxes_used_this_month += req.body.boxes?.length || 0;
    
    await subscription.save();
    
    next();
  } catch (err) {
    console.error('Failed to track usage:', err);
    next();
  }
};

module.exports = {
  checkSubscription,
  checkFeatureAccess,
  checkBoxLimit,
  trackUsage
};