const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const User = require("../models/user");
const auth = require("../middleware/auth");
const { storage } = require("../utils/cloudinary");
const dotenv =require("dotenv");
const  Message =  require('../models/Contact')
const nodemailer = require('nodemailer');
const Subscription = require('../models/Subscription');


dotenv.config();
const router = express.Router();
const upload = multer({ storage }); 



router.post("/send", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Please fill all required fields." });
  }

  try {
  
    const newMessage = new Message({ name, email, phone, message });
    await newMessage.save();

  
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });


    const adminMail = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `📩 New message from ${name}`,
      text: `
        Name: ${name}
        Email: ${email}
        Phone: ${phone || "Not provided"}
        Message:
        ${message}
      `,
    };


    const userMail = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "✅ Thanks for contacting DotPitch Technologies!",
      html: `
        <div style="font-family:sans-serif; padding:20px; border-radius:10px; background:#f7f7f7;">
          <h2 style="color:#2b2b2b;">Hello ${name},</h2>
          <p>Thanks for reaching out! We’ve received your message and will get back to you soon.</p>
          <p><b>Your message:</b></p>
          <blockquote style="border-left:4px solid #00bcd4; margin:10px 0; padding-left:10px;">
            ${message}
          </blockquote>
          <p>Best regards,<br><b>DotPitch Technologies</b><br>
          📧 ${process.env.EMAIL_USER}</p>
        </div>
      `,
    };

    // Send both emails
    await transporter.sendMail(adminMail);
    await transporter.sendMail(userMail);

    res.status(200).json({ success: true, message: "Message saved and emails sent successfully!" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to process request." });
  }
});




router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, mobile, companyName, industry } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !mobile) {
      return res.status(400).json({ 
        error: 'Please provide fullName, email, password, and mobile number' 
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User with this email already exists' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      fullName,
      email,
      mobile,
      password: hashedPassword,
      companyName,
      industry
    });

    await user.save();

   
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);
// trialEndDate.setMinutes(trialEndDate.getMinutes() + 1);
    const subscription = new Subscription({
      user_id: user._id,
      plan_type: 'trial',
      status: 'trial',
      is_trial: true,
      trial_end_date: trialEndDate,
      end_date: trialEndDate,
      start_date: new Date(),
      features: Subscription.getPlanFeatures('trial') // Assumes method exists
    });

    await subscription.save();

    // Generate JWT token
    const token = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const now = new Date();
    const trialDaysRemaining = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));

    res.status(201).json({
      success: true,
      message: '🎉 Registration successful! Your 5-day free trial has been activated.',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email
      },
      token,
      subscription: {
        plan: subscription.plan_type,
        status: subscription.status,
        trial_end_date: subscription.trial_end_date,
        trial_days_remaining: trialDaysRemaining,
        features: subscription.features
      }
    });

  } catch (err) {
    console.error('Registration error:', err);

    // If subscription creation fails, delete the created user
    if (err.message.includes('Subscription') && user && user._id) {
      await User.findByIdAndDelete(user._id);
    }

    res.status(500).json({ 
      error: 'Registration failed', 
      details: err.message 
    });
  }
});


// router.post('/register', async (req, res) => {
//   try {
//     const { username, email, password, name } = req.body;

//     // Validate input
//     if (!username || !email || !password) {
//       return res.status(400).json({ 
//         error: 'Please provide username, email, and password' 
//       });
//     }

//     // Check if user already exists
//     const existingUser = await User.findOne({ 
//       $or: [{ email }, { username }] 
//     });

//     if (existingUser) {
//       return res.status(400).json({ 
//         error: 'User with this email or username already exists' 
//       });
//     }

//     // Hash password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     // Create new user
//     const user = new User({
//       username,
//       email,
//       password: hashedPassword,
//       name: name || username
//     });

//     await user.save();

//     // ✅ CREATE 5-DAY TRIAL SUBSCRIPTION AUTOMATICALLY
//     const trialEndDate = new Date();
//     trialEndDate.setDate(trialEndDate.getDate() + 5); // 5 days from now

//     const subscription = new Subscription({
//       user_id: user._id,
//       plan_type: 'trial',
//       status: 'trial',
//       is_trial: true,
//       trial_end_date: trialEndDate,
//       end_date: trialEndDate,
//       start_date: new Date(),
//       features: Subscription.getPlanFeatures('trial')
//     });

//     await subscription.save();

//     // Generate JWT token
//     const token = jwt.sign(
//       { _id: user._id, email: user.email },
//       process.env.JWT_SECRET,
//       { expiresIn: '30d' }
//     );

//     // Calculate trial days remaining
//     const now = new Date();
//     const trialDaysRemaining = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));

//     res.status(201).json({
//       success: true,
//       message: '🎉 Registration successful! Your 5-day free trial has been activated.',
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email,
//         name: user.name
//       },
//       token,
//       subscription: {
//         plan: subscription.plan_type,
//         status: subscription.status,
//         trial_end_date: subscription.trial_end_date,
//         trial_days_remaining: trialDaysRemaining,
//         features: subscription.features
//       }
//     });

//   } catch (err) {
//     console.error('Registration error:', err);
    
//     // If subscription creation fails, delete the created user
//     if (err.message.includes('Subscription')) {
//       await User.findByIdAndDelete(user._id);
//     }

//     res.status(500).json({ 
//       error: 'Registration failed', 
//       details: err.message 
//     });
//   }
// });


router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const payload = {
      id: user._id,
      role: user.role,
      email: user.email,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ token, payload });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});


router.get("/profile", auth(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.put("/updateprofile", auth(), upload.single("profile"), async (req, res) => {
  const disallowedFields = ["email", "password"];
  const attemptedFields = Object.keys(req.body);
  const hasDisallowed = attemptedFields.some(field => disallowedFields.includes(field));

  if (hasDisallowed) {
    return res.status(400).json({ error: "Email and password cannot be updated" });
  }

  const allowedUpdates = ["fullName", "mobile", "companyName", "industry"];
  const updates = {};

  for (const field of allowedUpdates) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  try {
    if (req.file) {
      updates.profile = {
        url: req.file.path,
        public_id: req.file.filename,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});


router.get("/admin", auth("admin"), async (req, res) => {
  res.json({ message: "Welcome Admin!", user: req.user });
});





router.get("/my-services", auth(), async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user details
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user subscription
    const subscription = await Subscription.findOne({ user_id: userId });
    
    if (!subscription) {
      return res.status(404).json({
        error: "No subscription found",
        message: "Please start your 5-day free trial to access services",
        user: {
          fullName: user.fullName,
          email: user.email
        },
        subscription_status: "none",
        available_services: []
      });
    }

    // Check if subscription is active
    const isActive = subscription.isActive() || subscription.isTrialActive();
    const now = new Date();
    const endDate = subscription.is_trial ? subscription.trial_end_date : subscription.end_date;
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    // Get plan features
    const planFeatures = subscription.features;
    const planType = subscription.plan_type;

    // Define service availability based on plan
    const services = {
      basic_packing: {
        name: "Basic Packing Algorithm",
        available: true,
        description: "Standard 3D bin packing optimization",
        icon: "📦"
      },
      box_limit: {
        name: "Box Limit",
        available: true,
        limit: planFeatures.max_boxes,
        description: `Pack up to ${planFeatures.max_boxes} boxes per calculation`,
        icon: "📊"
      },
      three_d_view: {
        name: "3D Visualization",
        available: planFeatures.three_d_view,
        description: "Interactive 3D view of packed containers",
        icon: "🎨"
      },
      csv_upload: {
        name: "CSV Upload",
        available: planFeatures.csv_upload,
        description: "Bulk upload box data via CSV files",
        icon: "📄",
        upgrade_required: !planFeatures.csv_upload
      },
      pdf_export: {
        name: "PDF Export",
        available: planFeatures.pdf_export,
        description: "Export packing results to PDF reports",
        icon: "📑",
        upgrade_required: !planFeatures.pdf_export
      },
      container_customization: {
        name: "Container Customization",
        available: planFeatures.container_customization,
        description: "Custom container sizes and weight limits",
        icon: "⚙️",
        upgrade_required: !planFeatures.container_customization
      },
      advanced_optimization: {
        name: "Advanced Optimization",
        available: planFeatures.advanced_optimization,
        description: "AI-powered packing algorithms for better space utilization",
        icon: "🤖",
        upgrade_required: !planFeatures.advanced_optimization
      },
      animated_visualizer: {
        name: "Animated Packing Process",
        available: planFeatures.animated_visualizer,
        description: "Watch boxes being packed in real-time animation",
        icon: "🎬",
        upgrade_required: !planFeatures.animated_visualizer
      },
      unlimited_boxes: {
        name: "Unlimited Boxes",
        available: planFeatures.unlimited_boxes,
        description: "Pack unlimited number of boxes",
        icon: "♾️",
        upgrade_required: !planFeatures.unlimited_boxes
      },
      premium_support: {
        name: "Premium Support",
        available: planFeatures.premium_support,
        description: "Priority customer support via email and chat",
        icon: "🎧",
        upgrade_required: !planFeatures.premium_support
      },
      history_access: {
        name: "Calculation History",
        available: true,
        description: "Access your previous packing calculations",
        icon: "📚"
      },
      box_library: {
        name: "Box Library",
        available: true,
        description: "Save and reuse your frequently used box sizes",
        icon: "🗂️"
      }
    };

    // Build available and locked services lists
    const availableServices = [];
    const lockedServices = [];

    Object.entries(services).forEach(([key, service]) => {
      if (service.available) {
        availableServices.push({
          id: key,
          name: service.name,
          description: service.description,
          icon: service.icon,
          limit: service.limit || null
        });
      } else {
        lockedServices.push({
          id: key,
          name: service.name,
          description: service.description,
          icon: service.icon,
          upgrade_required: true,
          available_in: getAvailablePlans(key, planType)
        });
      }
    });

    // Calculate usage statistics
    const usageStats = {
      calculations_count: subscription.usage_stats?.calculations_count || 0,
      calculations_this_month: subscription.usage_stats?.calculations_this_month || 0,
      boxes_used_this_month: subscription.usage_stats?.boxes_used_this_month || 0,
      last_calculation: subscription.usage_stats?.last_calculation_date || null
    };

    // Response
    res.json({
      success: true,
      user: {
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        companyName: user.companyName,
        industry: user.industry?.category || null
      },
      subscription: {
        plan_type: planType,
        plan_name: getPlanDisplayName(planType),
        status: isActive ? (subscription.is_trial ? 'trial' : 'active') : 'expired',
        is_active: isActive,
        is_trial: subscription.is_trial,
        days_remaining: Math.max(0, daysRemaining),
        start_date: subscription.start_date,
        end_date: endDate,
        billing_cycle: subscription.billing_cycle,
        auto_renew: subscription.auto_renew
      },
      services: {
        available: availableServices,
        locked: lockedServices,
        total_available: availableServices.length,
        total_locked: lockedServices.length
      },
      usage_stats: usageStats,
      upgrade_info: lockedServices.length > 0 ? {
        message: `Upgrade to unlock ${lockedServices.length} additional features`,
        recommended_plans: getRecommendedUpgrades(planType)
      } : null
    });

  } catch (err) {
    console.error("Error fetching user services:", err);
    res.status(500).json({
      error: "Failed to fetch user services",
      details: err.message
    });
  }
});

function getPlanDisplayName(planType) {
  const names = {
    trial: "5-Day Free Trial",
    starter: "Starter Plan",
    pro: "Pro Plan",
    exclusive: "Exclusive Plan"
  };
  return names[planType] || planType;
}

function getAvailablePlans(featureKey, currentPlan) {
  const featureAvailability = {
    csv_upload: ['pro', 'exclusive'],
    pdf_export: ['pro', 'exclusive'],
    container_customization: ['pro', 'exclusive'],
    advanced_optimization: ['exclusive'],
    animated_visualizer: ['exclusive'],
    unlimited_boxes: ['exclusive'],
    premium_support: ['exclusive']
  };
  
  const plans = featureAvailability[featureKey] || [];
  return plans.filter(p => p !== currentPlan).map(p => getPlanDisplayName(p));
}

function getRecommendedUpgrades(currentPlan) {
  const upgrades = {
    trial: [
      { plan: 'starter', name: 'Starter Plan', price: '₹199/month' },
      { plan: 'pro', name: 'Pro Plan', price: '₹299/month', recommended: true },
      { plan: 'exclusive', name: 'Exclusive Plan', price: '₹499/month' }
    ],
    starter: [
      { plan: 'pro', name: 'Pro Plan', price: '₹299/month', recommended: true },
      { plan: 'exclusive', name: 'Exclusive Plan', price: '₹499/month' }
    ],
    pro: [
      { plan: 'exclusive', name: 'Exclusive Plan', price: '₹499/month', recommended: true }
    ]
  };
  
  return upgrades[currentPlan] || [];
}

router.get("/service/:serviceId", auth(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { serviceId } = req.params;

    const subscription = await Subscription.findOne({ user_id: userId });
    
    if (!subscription) {
      return res.status(404).json({
        error: "No subscription found"
      });
    }

    const serviceDetails = {
      csv_upload: {
        name: "CSV Upload",
        description: "Upload multiple box configurations at once using CSV files",
        benefits: [
          "Bulk upload hundreds of boxes",
          "Save time on data entry",
          "Import from Excel or Google Sheets",
          "Automatic validation"
        ],
        available_in: ['pro', 'exclusive'],
        demo_csv: "name,length,width,height,weight,quantity\nSmall Box,10,10,10,5,100\nMedium Box,20,15,15,10,50"
      },
      pdf_export: {
        name: "PDF Export",
        description: "Generate professional PDF reports of your packing results",
        benefits: [
          "Professional layout reports",
          "Include 3D visualizations",
          "Share with team members",
          "Print-ready format"
        ],
        available_in: ['pro', 'exclusive']
      },
      advanced_optimization: {
        name: "Advanced AI Optimization",
        description: "Use machine learning algorithms for maximum space efficiency",
        benefits: [
          "Up to 25% better space utilization",
          "Considers box weight distribution",
          "Stability analysis",
          "Multiple loading patterns"
        ],
        available_in: ['exclusive']
      }
      // Add more service details as needed
    };

    const service = serviceDetails[serviceId];
    
    if (!service) {
      return res.status(404).json({
        error: "Service not found"
      });
    }

    const isAvailable = subscription.features[serviceId] || false;
    const planType = subscription.plan_type;

    res.json({
      service: {
        id: serviceId,
        ...service,
        available: isAvailable,
        current_plan: planType
      },
      access: isAvailable ? {
        status: "available",
        message: "This service is included in your plan"
      } : {
        status: "upgrade_required",
        message: `Upgrade to ${service.available_in.join(' or ')} to unlock this feature`,
        upgrade_options: getRecommendedUpgrades(planType)
      }
    });

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch service details",
      details: err.message
    });
  }
});

module.exports = router;
