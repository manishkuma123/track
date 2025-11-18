const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const auths = require('../middleware/auth');

router.post('/create-trial', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const existingSubscription = await Subscription.findOne({ user_id: userId });
    if (existingSubscription) {
      return res.status(400).json({ 
        error: 'Subscription already exists',
        subscription: existingSubscription
      });
    } 
    if(!userId){
        return res.status(400).json({
            error:"user id not found"
        })
    }
    
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);
    
    const subscription = new Subscription({
      user_id: userId,
      plan_type: 'trial',
      status: 'trial',
      is_trial: true,
      trial_end_date: trialEndDate,
      end_date: trialEndDate,
      features: Subscription.getPlanFeatures('trial')
    });
    
    await subscription.save();
    
    res.json({
      message: '5-day trial activated successfully!',
      subscription,
      trial_days_remaining: 5
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to create trial subscription', 
      details: err.message 
    });
  }
});

// router.post('/change-plan', auths(), async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { plan_type, billing_cycle } = req.body;

//     if (!['starter', 'pro', 'exclusive'].includes(plan_type)) {
//       return res.status(400).json({ error: 'Invalid plan type' });
//     }

//     const subscription = await Subscription.findOne({ user_id: userId });
//     if (!subscription) {
//       return res.status(404).json({ error: 'No active subscription found' });
//     }

//     if (subscription.plan_type === plan_type) {
//       return res.status(400).json({ error: 'You are already on this plan' });
//     }

//     // Schedule the plan change for after current plan ends
//     subscription.next_plan = plan_type;
//     subscription.next_plan_billing_cycle = billing_cycle;
//     await subscription.save();

//     res.json({
//       message: `Your plan will change to ${plan_type} after the current plan ends on ${subscription.end_date.toDateString()}`,
//       subscription
//     });

//   } catch (err) {
//     res.status(500).json({ error: 'Failed to schedule plan change', details: err.message });
//   }
// });

// router.get('/current', auths(), async (req, res) => {
//   try {
//     const userId = req.user.id;
// console.log("user id from token",userId)
// if(!userId){
//     return res.status(400).json({
//         error:"user id not found"
//     })
// }
//     const subscription = await Subscription.findOne({ user_id: userId });
//     const plan_type= subscription ? subscription.plan_type:'none';

//     console.log("plan type trial plan only for 5 days",plan_type)
//     if (!subscription) {
//       return res.status(404).json({ 
//         error: 'No subscription found',
//         message: 'Start your 5-day free trial!'
//       });
//     }
    
//     const now = new Date();
//     const endDate = subscription.is_trial ? subscription.trial_end_date : subscription.end_date;
//     const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    
//     res.json({
//       subscription,
//       days_remaining: Math.max(0, daysRemaining),
//       is_active: subscription.isActive() || subscription.isTrialActive()
//     });
//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Failed to fetch subscription', 
//       details: err.message 
//     });
//   }
// });

router.post('/subscribe', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan_type, billing_cycle } = req.body;
    
    if (!['starter', 'pro', 'exclusive'].includes(plan_type)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const amount = Subscription.getPlanPricing(plan_type, billing_cycle);

    res.json({
      message: 'Please complete payment to activate subscription',
      plan: plan_type,
      amount: amount,
      billing_cycle: billing_cycle,
      redirect: '/payment/create-order',
      note: 'Call /api/payment/create-order to initiate Razorpay payment'
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to initiate subscription', 
      details: err.message 
    });
  }
});

// router.post('/cancel', auths(), async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const subscription = await Subscription.findOne({ user_id: userId });
 
//     if (!subscription) {
//       return res.status(404).json({ error: 'No subscription found' });
//     }
//     subscription.status = 'cancelled';
//     subscription.auto_renew = false;
//     await subscription.save();
//     res.json({
//       message: 'Subscription cancelled successfully',
//       subscription,
//       note: 'Your subscription will remain active until the end date'
//     });
//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Failed to cancel subscription', 
//       details: err.message 
//     });
//   }
// });
// router.post('/cancel', auths(), async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // Find the user's subscription
//     const subscription = await Subscription.findOne({ user_id: userId });
//     if (!subscription) {
//       return res.status(404).json({ error: 'No subscription found' });
//     }

//     // Mark the subscription as cancelled but let the user use it until it naturally expires
//     subscription.status = 'cancelled';
//     subscription.auto_renew = false;

//     // Ensure is_active reflects whether the subscription is still valid
//     const now = new Date();
//     subscription.is_active = now < subscription.end_date;

//     await subscription.save();

//     res.json({
//       message: 'Subscription cancelled successfully',
//       subscription,
//       note: 'Your subscription will remain active until the end date'
//     });
//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Failed to cancel subscription', 
//       details: err.message 
//     });
//   }
// });


router.get('/current', auths(), async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ user_id: userId });

    if (!subscription) {
      return res.status(404).json({ 
        error: 'No subscription found'
      });
    }

    const now = new Date();
    const endDate = subscription.end_date;
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const isActive = now < endDate;

    const response = {
      subscription: {
        plan_type: subscription.plan_type,
        status: subscription.status,
        is_active: isActive && subscription.status !== 'cancelled',
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        days_remaining: Math.max(0, daysRemaining),
        billing_cycle: subscription.billing_cycle
      }
    };

    // ✅ Add scheduled change info if exists
    if (subscription.next_plan_type && subscription.plan_change_scheduled_for) {
      response.scheduledChange = {
        nextPlanType: subscription.next_plan_type,
        startsOn: subscription.plan_change_scheduled_for,
        scheduledAt: subscription.plan_change_scheduled_at,
        daysUntilChange: Math.ceil(
          (new Date(subscription.plan_change_scheduled_for) - now) / (1000 * 60 * 60 * 24)
        )
      };
    }

    res.json(response);

  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch subscription', 
      details: err.message 
    });
  }
});


// 3. UPDATE: Cancel Subscription with Scheduled Change Handling
router.post('/cancel', auths(), async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ user_id: userId });
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const now = new Date();
    subscription.status = 'cancelled';
    subscription.auto_renew = false;
    subscription.is_active = now < subscription.end_date;

    // ✅ Clear any scheduled plan changes when cancelling
    subscription.next_plan_type = null;
    subscription.plan_change_scheduled_at = null;
    subscription.plan_change_scheduled_for = null;

    await subscription.save();

    res.json({
      message: 'Subscription cancelled successfully',
      subscription,
      note: subscription.is_active 
        ? `Your subscription will remain active until ${subscription.end_date.toLocaleDateString()}`
        : 'Your subscription has expired'
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to cancel subscription', 
      details: err.message 
    });
  }
});


router.post('/change-plan', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { newPlanType } = req.body;

    if (!['starter', 'pro', 'exclusive'].includes(newPlanType)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const subscription = await Subscription.findOne({ user_id: userId });
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Can't change to the same plan
    if (subscription.plan_type === newPlanType) {
      return res.status(400).json({ 
        error: 'You are already on this plan' 
      });
    }

    // Schedule the plan change for after current plan ends
    subscription.next_plan_type = newPlanType;
    subscription.plan_change_scheduled_at = new Date();
    subscription.plan_change_scheduled_for = subscription.end_date;
    
    await subscription.save();

    const daysRemaining = Math.ceil(
      (subscription.end_date - new Date()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      success: true,
      message: `Your plan will change to ${newPlanType} on ${subscription.end_date.toLocaleDateString()}`,
      currentPlan: subscription.plan_type,
      nextPlan: newPlanType,
      nextPlanStartDate: subscription.end_date,
      daysUntilChange: daysRemaining
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to schedule plan change', 
      details: err.message 
    });
  }
});


// router.get('/current', auths(), async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const subscription = await Subscription.findOne({ user_id: userId });

//     if (!subscription) {
//       return res.status(404).json({ 
//         error: 'No subscription found'
//       });
//     }

//     const now = new Date();
//     const endDate = subscription.end_date;
//     const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
//     const isActive = now < endDate;

//     // Prepare response with scheduled change info
//     const response = {
//       subscription: {
//         plan_type: subscription.plan_type,
//         status: subscription.status,
//         is_active: subscription.status === 'active' || subscription.status === 'cancelled' && isActive,
//         start_date: subscription.start_date,
//         end_date: subscription.end_date,
//         days_remaining: Math.max(0, daysRemaining)
//       }
//     };

//     // Add scheduled plan change if exists
//     if (subscription.next_plan_type && subscription.plan_change_scheduled_for) {
//       response.scheduledChange = {
//         nextPlanType: subscription.next_plan_type,
//         startsOn: subscription.plan_change_scheduled_for,
//         scheduledAt: subscription.plan_change_scheduled_at
//       };
//     }

//     res.json(response);

//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Failed to fetch subscription', 
//       details: err.message 
//     });
//   }
// });


router.post('/cancel-scheduled-change', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await Subscription.findOne({ user_id: userId });

    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    if (!subscription.next_plan_type) {
      return res.status(400).json({ 
        error: 'No scheduled plan change to cancel' 
      });
    }

    // Clear scheduled change
    subscription.next_plan_type = null;
    subscription.plan_change_scheduled_at = null;
    subscription.plan_change_scheduled_for = null;

    await subscription.save();

    res.json({
      success: true,
      message: 'Scheduled plan change cancelled',
      currentPlan: subscription.plan_type
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to cancel scheduled change', 
      details: err.message 
    });
  }
});

router.post('/apply-scheduled-change', auths(), async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ user_id: userId });

    if (!subscription) {
      return res.status(404).json({ 
        success: false,
        error: 'No subscription found' 
      });
    }

    // Check if there's a scheduled change
    if (!subscription.next_plan_type || !subscription.plan_change_scheduled_for) {
      return res.status(400).json({ 
        success: false,
        error: 'No scheduled plan change found' 
      });
    }

    const now = new Date();
    const scheduledDate = new Date(subscription.plan_change_scheduled_for);

    // Verify that scheduled date has passed
    if (now < scheduledDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Scheduled date has not reached yet',
        scheduledFor: scheduledDate,
        daysRemaining: Math.ceil((scheduledDate - now) / (1000 * 60 * 60 * 24))
      });
    }

    // ========== APPLY THE SCHEDULED PLAN CHANGE ==========
    const newPlanType = subscription.next_plan_type;
    const newBillingCycle = subscription.next_billing_cycle || subscription.billing_cycle || 'monthly';

    const newEndDate = new Date(scheduledDate);
    if (newBillingCycle === 'annually') {
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
    } else {
      newEndDate.setMonth(newEndDate.getMonth() + 1);
    }

    const newFeatures = Subscription.getPlanFeatures(newPlanType);

    subscription.plan_type = newPlanType;
    subscription.status = 'active';
    subscription.is_active = true;
    subscription.billing_cycle = newBillingCycle;
    subscription.start_date = scheduledDate;
    subscription.end_date = newEndDate;
    subscription.features = newFeatures;
    
    // Clear scheduled change info
    subscription.next_plan_type = null;
    subscription.next_billing_cycle = null;
    subscription.plan_change_scheduled_at = null;
    subscription.plan_change_scheduled_for = null;

    await subscription.save();

    console.log(`✅ Plan upgraded from ${subscription.plan_type} to ${newPlanType}`);

    res.json({
      success: true,
      message: `Your subscription has been upgraded to ${newPlanType}`,
      subscription: {
        id: subscription._id,
        plan: subscription.plan_type,
        status: subscription.status,
        billing_cycle: subscription.billing_cycle,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        features: subscription.features
      },
      newEndDate,
      message: `Plan successfully upgraded to ${newPlanType} starting ${scheduledDate.toLocaleDateString()}`
    });

  } catch (err) {
    console.error('Apply scheduled change error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to apply scheduled plan change', 
      details: err.message 
    });
  }
});




router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        name: 'Starter',
        type: 'starter',
        pricing: {
          monthly: 199,
          annually: 1990
        },
        features: Subscription.getPlanFeatures('starter')
      },
      {
        name: 'Pro',
        type: 'pro',
        pricing: {
          monthly: 299,
          annually: 2990
        },
        features: Subscription.getPlanFeatures('pro')
      },
      {
        name: 'Exclusive',
        type: 'exclusive',
        pricing: {
          monthly: 499,
          annually: 4990
        },
        savings: 60,
        features: Subscription.getPlanFeatures('exclusive')
      }
    ];
    
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch plans', 
      details: err.message 
    });
  }
});

router.get('/usage', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const subscription = await Subscription.findOne({ user_id: userId });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No subscription found' });
    }
    
    res.json({
      plan: subscription.plan_type,
      usage_stats: subscription.usage_stats,
      limits: {
        max_boxes: subscription.features.max_boxes,
        unlimited_boxes: subscription.features.unlimited_boxes
      }
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch usage statistics', 
      details: err.message 
    });
  }
});

module.exports = router;