const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const razorpayInstance = require('../config/razorpay');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const auths = require('../middleware/auth');

router.post('/create-order', auths(), async (req, res) => {
  try {
    const { plan_type, billing_cycle } = req.body;
    const userId = req.user.id;

    if (!['starter', 'pro', 'exclusive'].includes(plan_type)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const amount = Subscription.getPlanPricing(plan_type, billing_cycle);
    
    if (!amount || amount === 0) {
      return res.status(400).json({ error: 'Invalid pricing configuration' });
    }

    const options = {
      amount: amount * 100,
      currency: 'INR',
    //   receipt: `order_${userId}_${Date.now()}`,
      receipt: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,


  
      notes: {
        user_id: userId.toString(),
        plan_type,
        billing_cycle
      }
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    const payment = new Payment({
      user_id: userId,
      razorpay_order_id: razorpayOrder.id,
      amount: amount,
      currency: 'INR',
      status: 'created',
      plan_type,
      billing_cycle
    });

    await payment.save();

    res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: amount,
      currency: 'INR',
      key_id: process.env.RAZORPAY_KEY_ID,  
      payment_id: payment._id,
      plan_type,
      billing_cycle,
      user: {
        name: req.user.name || req.user.username,
        email: req.user.email
      }
    });

  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ 
      error: 'Failed to create payment order', 
      details: err.message 
    });
  }
});

router.post('/verify-payment', auths(), async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      plan_type,
      billing_cycle
    } = req.body;
    const userId = req.user.id;

    const payment = await Payment.findOne({ razorpay_order_id });

    if (!payment) {
      return res.status(404).json({ 
        success: false,
        error: 'Payment record not found' 
      });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      payment.status = 'failed';
      payment.error_message = 'Payment signature verification failed';
      await payment.save();

      return res.status(400).json({ 
        success: false,
        error: 'Payment verification failed - Invalid signature' 
      });
    }

    // Update payment record
    payment.razorpay_payment_id = razorpay_payment_id;
    payment.razorpay_signature = razorpay_signature;
    payment.status = 'success';
    payment.paid_at = new Date();

    // Fetch payment details from Razorpay
    try {
      const razorpayInstance = require('../config/razorpay');
      const paymentDetails = await razorpayInstance.payments.fetch(razorpay_payment_id);
      payment.payment_method = paymentDetails.method;
    } catch (err) {
      console.error('Error fetching payment details:', err);
    }

    await payment.save();

    // ========== MAIN LOGIC: Check existing subscription ==========
    let subscription = await Subscription.findOne({ user_id: userId });
    const now = new Date();
    const features = Subscription.getPlanFeatures(payment.plan_type);
    
    let planChangeScheduled = false;
    let scheduledChange = null;
    let immediate = false;

    if (subscription) {
      // ========== CASE 1: User has existing subscription ==========
      const currentEndDate = new Date(subscription.end_date);

      if (now < currentEndDate) {
        // ✅ CASE 1A: Current plan is still ACTIVE
        // Schedule the new plan to start after current plan ends
        console.log(`📅 Current plan active until ${currentEndDate.toLocaleDateString()}`);
        console.log(`📅 Scheduling ${payment.plan_type} plan for ${currentEndDate.toLocaleDateString()}`);

        subscription.next_plan_type = payment.plan_type;
        subscription.next_billing_cycle = payment.billing_cycle;
        subscription.plan_change_scheduled_at = new Date();
        subscription.plan_change_scheduled_for = currentEndDate;
        subscription.payment_details = {
          transaction_id: razorpay_payment_id,
          amount: payment.amount,
          currency: payment.currency,
          payment_method: payment.payment_method,
          payment_date: payment.paid_at
        };

        await subscription.save();

        planChangeScheduled = true;
        scheduledChange = {
          nextPlanType: payment.plan_type,
          startsOn: currentEndDate,
          scheduledAt: new Date(),
          daysUntilChange: Math.ceil((currentEndDate - now) / (1000 * 60 * 60 * 24))
        };

        console.log('✅ Plan change scheduled successfully');

      } else {
        // ✅ CASE 1B: Current plan has EXPIRED
        // Activate new plan immediately
        console.log('Current plan has expired. Activating new plan immediately.');

        const newEndDate = new Date();
        if (payment.billing_cycle === 'annually') {
          newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        } else {
          newEndDate.setMonth(newEndDate.getMonth() + 1);
        }

        subscription.plan_type = payment.plan_type;
        subscription.status = 'active';
        subscription.is_active = true;
        subscription.billing_cycle = payment.billing_cycle;
        subscription.start_date = now;
        subscription.end_date = newEndDate;
        subscription.is_trial = false;
        subscription.trial_end_date = null;
        subscription.features = features;
        subscription.payment_details = {
          transaction_id: razorpay_payment_id,
          amount: payment.amount,
          currency: payment.currency,
          payment_method: payment.payment_method,
          payment_date: payment.paid_at
        };
        subscription.auto_renew = true;
        
        // Clear any scheduled changes
        subscription.next_plan_type = null;
        subscription.next_billing_cycle = null;
        subscription.plan_change_scheduled_at = null;
        subscription.plan_change_scheduled_for = null;

        await subscription.save();

        immediate = true;
        console.log('✅ New plan activated immediately');
      }

    } else {
      // ========== CASE 2: User has NO existing subscription ==========
      // Create new subscription immediately
      console.log('No existing subscription. Creating new subscription.');

      const newEndDate = new Date();
      if (payment.billing_cycle === 'annually') {
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      } else {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
      }

      subscription = new Subscription({
        user_id: userId,
        plan_type: payment.plan_type,
        status: 'active',
        is_active: true,
        billing_cycle: payment.billing_cycle,
        start_date: now,
        end_date: newEndDate,
        is_trial: false,
        features,
        payment_details: {
          transaction_id: razorpay_payment_id,
          amount: payment.amount,
          currency: payment.currency,
          payment_method: payment.payment_method,
          payment_date: payment.paid_at
        },
        auto_renew: true
      });

      await subscription.save();

      immediate = true;
      console.log('✅ New subscription created and activated');
    }

    // Link subscription to payment
    payment.subscription_id = subscription._id;
    await payment.save();

    // ========== RETURN RESPONSE WITH SCHEDULING INFO ==========
    res.json({
      success: true,
      message: planChangeScheduled 
        ? `Your ${payment.plan_type} plan is scheduled to start on ${new Date(scheduledChange.startsOn).toLocaleDateString()}`
        : immediate 
        ? 'Payment verified and subscription activated successfully!'
        : 'Payment verified',
      planChangeScheduled,
      immediate,
      payment: {
        id: payment._id,
        amount: payment.amount,
        status: payment.status,
        payment_id: razorpay_payment_id
      },
      subscription: {
        id: subscription._id,
        plan: subscription.plan_type,
        status: subscription.status,
        billing_cycle: subscription.billing_cycle,
        start_date: subscription.start_date || new Date(),
        end_date: subscription.end_date,
        features: subscription.features
      },
      // ✅ Add scheduling details if applicable
      ...(planChangeScheduled && { scheduledChange }),
      // Info about current plan if still active
      ...(planChangeScheduled && {
        currentPlanInfo: {
          plan: subscription.plan_type,
          endsOn: subscription.end_date,
          daysRemaining: Math.ceil((new Date(subscription.end_date) - now) / (1000 * 60 * 60 * 24))
        }
      })
    });

  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify payment', 
      details: err.message 
    });
  }
});

// router.post('/verify-payment', auths(), async (req, res) => {
//   try {
//     const { 
//       razorpay_order_id, 
//       razorpay_payment_id, 
//       razorpay_signature,
//       plan_type,
//       billing_cycle
//     } = req.body;
//     const userId = req.user.id;

//     const payment = await Payment.findOne({ razorpay_order_id });

//     if (!payment) {
//       return res.status(404).json({ 
//         success: false,
//         error: 'Payment record not found' 
//       });
//     }

//     const generatedSignature = crypto
//       .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//       .digest('hex');

//     if (generatedSignature !== razorpay_signature) {
//       payment.status = 'failed';
//       payment.error_message = 'Payment signature verification failed';
//       await payment.save();

//       return res.status(400).json({ 
//         success: false,
//         error: 'Payment verification failed - Invalid signature' 
//       });
//     }

//     // Update payment record
//     payment.razorpay_payment_id = razorpay_payment_id;
//     payment.razorpay_signature = razorpay_signature;
//     payment.status = 'success';
//     payment.paid_at = new Date();

//     // Fetch payment details from Razorpay
//     try {
//       const razorpayInstance = require('../config/razorpay');
//       const paymentDetails = await razorpayInstance.payments.fetch(razorpay_payment_id);
//       payment.payment_method = paymentDetails.method;
//     } catch (err) {
//       console.error('Error fetching payment details:', err);
//     }

//     await payment.save();

//     // Update or create subscription
//     let subscription = await Subscription.findOne({ user_id: userId });

//     const endDate = new Date();
//     if (payment.billing_cycle === 'annually') {
//       endDate.setFullYear(endDate.getFullYear() + 1);
//     } else {
//       endDate.setMonth(endDate.getMonth() + 1);
//     }

//     const features = Subscription.getPlanFeatures(payment.plan_type);

//     if (subscription) {
//       // Update existing subscription
//       subscription.plan_type = payment.plan_type;
//       subscription.status = 'active';
//       subscription.billing_cycle = payment.billing_cycle;
//       subscription.end_date = endDate;
//       subscription.is_trial = false;
//       subscription.trial_end_date = null;
//       subscription.features = features;
//       subscription.payment_details = {
//         transaction_id: razorpay_payment_id,
//         amount: payment.amount,
//         currency: payment.currency,
//         payment_method: payment.payment_method,
//         payment_date: payment.paid_at
//       };
//       subscription.auto_renew = true;
//     } else {
//       // Create new subscription
//       subscription = new Subscription({
//         user_id: userId,
//         plan_type: payment.plan_type,
//         status: 'active',
//         billing_cycle: payment.billing_cycle,
//         end_date: endDate,
//         is_trial: false,
//         features,
//         payment_details: {
//           transaction_id: razorpay_payment_id,
//           amount: payment.amount,
//           currency: payment.currency,
//           payment_method: payment.payment_method,
//           payment_date: payment.paid_at
//         },
//         auto_renew: true
//       });
//     }

//     await subscription.save();

//     // Link subscription to payment
//     payment.subscription_id = subscription._id;
//     await payment.save();

//     // ✅ Return success response
//     res.json({
//       success: true,
//       message: 'Payment verified and subscription activated successfully!',
//       payment: {
//         id: payment._id,
//         amount: payment.amount,
//         status: payment.status,
//         payment_id: razorpay_payment_id
//       },
//       subscription: {
//         id: subscription._id,
//         plan: subscription.plan_type,
//         status: subscription.status,
//         billing_cycle: subscription.billing_cycle,
//         start_date: subscription.start_date || new Date(),
//         end_date: subscription.end_date,
//         features: subscription.features
//       }
//     });

//   } catch (err) {
//     console.error('Payment verification error:', err);
//     res.status(500).json({ 
//       success: false,
//       error: 'Failed to verify payment', 
//       details: err.message 
//     });
//   }
// });
router.post('/payment-failed', auths(), async (req, res) => {
  try {
    const { razorpay_order_id, error } = req.body;

    const payment = await Payment.findOne({ razorpay_order_id });

    if (payment) {
      payment.status = 'failed';
      payment.error_message = error?.description || 'Payment failed';
      await payment.save();
    }

    res.json({
      success: false,
      message: 'Payment failed',
      error: error?.description || 'Payment was not completed'
    });

  } catch (err) {
    console.error('Payment failure handler error:', err);
    res.status(500).json({ 
      error: 'Failed to handle payment failure', 
      details: err.message 
    });
  }
});

router.get('/history', auths(), async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const payments = await Payment.find({ user_id: userId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('subscription_id', 'plan_type status');

    const total = await Payment.countDocuments({ user_id: userId });

    res.json({
      payments,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_payments: total,
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1
      }
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch payment history', 
      details: err.message 
    });
  }
});


router.get('/payments/:id', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    const paymentId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in token' });
    }

    let payment;

    if (paymentId === 'current') {
      // Handle 'current' keyword by fetching the most recent payment
      payment = await Payment.findOne({ user_id: userId })
        .sort({ createdAt: -1 }); // or use `payment_date` if you have that
    } else {
      // Validate that paymentId is a valid Mongo ObjectId
      if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return res.status(400).json({ error: 'Invalid payment ID' });
      }

      // Fetch specific payment by ID
      payment = await Payment.findOne({ _id: paymentId, user_id: userId });
    }

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ payment });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch payment details',
      details: err.message
    });
  }
});
router.post('/refund/:paymentId', auths(), async (req, res) => {
  try {
    const userId = req.user._id;
    const payment = await Payment.findOne({ 
      _id: req.params.paymentId,
      user_id: userId 
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'success') {
      return res.status(400).json({ error: 'Only successful payments can be refunded' });
    }

    if (payment.status === 'refunded') {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    const refund = await razorpayInstance.payments.refund(
      payment.razorpay_payment_id,
      {
        amount: payment.amount * 100,
        speed: 'normal',
        notes: {
          reason: req.body.reason || 'Customer requested refund'
        }
      }
    );

    payment.status = 'refunded';
    payment.refund_id = refund.id;
    await payment.save();

    if (payment.subscription_id) {
      const subscription = await Subscription.findById(payment.subscription_id);
      if (subscription) {
        subscription.status = 'cancelled';
        subscription.auto_renew = false;
        await subscription.save();
      }
    }

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund_id: refund.id,
      amount: payment.amount
    });

  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ 
      error: 'Failed to process refund', 
      details: err.message 
    });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (generatedSignature !== webhookSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    console.log('Webhook event received:', event);

    switch (event) {
      case 'payment.authorized':
        await Payment.updateOne(
          { razorpay_payment_id: paymentEntity.id },
          { status: 'pending' }
        );
        break;

      case 'payment.captured':
        await Payment.updateOne(
          { razorpay_payment_id: paymentEntity.id },
          { 
            status: 'success',
            paid_at: new Date()
          }
        );
        break;

      case 'payment.failed':
        await Payment.updateOne(
          { razorpay_order_id: paymentEntity.order_id },
          { 
            status: 'failed',
            error_message: paymentEntity.error_description
          }
        );
        break;

      case 'refund.processed':
        const refundEntity = req.body.payload.refund.entity;
        await Payment.updateOne(
          { razorpay_payment_id: refundEntity.payment_id },
          { 
            status: 'refunded',
            refund_id: refundEntity.id
          }
        );
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true });

  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
// router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   try {
//     const webhookSignature = req.headers['x-razorpay-signature'];
//     const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

//     const generatedSignature = crypto
//       .createHmac('sha256', webhookSecret)
//       .update(JSON.stringify(req.body))
//       .digest('hex');

//     if (generatedSignature !== webhookSignature) {
//       return res.status(400).json({ error: 'Invalid webhook signature' });
//     }

//     const event = req.body.event;
//     const paymentEntity = req.body.payload.payment.entity;

//     console.log('Webhook event received:', event);

//     switch (event) {
//       case 'payment.authorized':
//         await Payment.updateOne(
//           { razorpay_payment_id: paymentEntity.id },
//           { status: 'pending' }
//         );
//         break;

//       case 'payment.captured':
//         await Payment.updateOne(
//           { razorpay_payment_id: paymentEntity.id },
//           { 
//             status: 'success',
//             paid_at: new Date()
//           }
//         );
//         break;

//       case 'payment.failed':
//         await Payment.updateOne(
//           { razorpay_order_id: paymentEntity.order_id },
//           { 
//             status: 'failed',
//             error_message: paymentEntity.error_description
//           }
//         );
//         break;

//       case 'refund.processed':
//         const refundEntity = req.body.payload.refund.entity;
//         await Payment.updateOne(
//           { razorpay_payment_id: refundEntity.payment_id },
//           { 
//             status: 'refunded',
//             refund_id: refundEntity.id
//           }
//         );
//         break;

//       default:
//         console.log('Unhandled webhook event:', event);
//     }

//     res.json({ success: true });

//   } catch (err) {
//     console.error('Webhook error:', err);
//     res.status(500).json({ error: 'Webhook processing failed' });
//   }
// });

module.exports = router;