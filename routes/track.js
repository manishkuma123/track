
const express = require("express");
const { spawn } = require("child_process");
const PackingResult = require("../models/Result");
const multer = require("multer");
const auths = require("../middleware/auth");
const router = express.Router();
const upload = multer({ dest: "uploads/" });
const mongoose = require("mongoose");
const Subscription = require('../models/Subscription');

const validatePackingInput = (req, res, next) => {
  const { container, boxes } = req.body;

  if (!container || !container.length || !container.width || !container.height) {
    return res.status(400).json({ error: "Container dimensions (length, width, height) are required" });
  }

  if (container.weight_capacity !== undefined && container.weight_capacity !== null) {
    if (typeof container.weight_capacity !== 'number' || container.weight_capacity <= 0) {
      return res.status(400).json({ error: "Container weight capacity must be a positive number" });
    }
  }

  if (!boxes || !Array.isArray(boxes) || boxes.length === 0) {
    return res.status(400).json({ error: "At least one box type is required" });
  }

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box.name || !box.length || !box.width || !box.height) {
      return res.status(400).json({
        error: `Box at index ${i} is missing required fields (name, length, width, height)`
      });
    }
    if (container.weight_capacity !== undefined && container.weight_capacity !== null) {
      if (box.weight === undefined || box.weight === null || typeof box.weight !== 'number' || box.weight <= 0) {
        return res.status(400).json({
          error: `Box at index ${i} must have a positive weight when container has weight capacity`
        });
      }
    }
    if (box.quantity !== undefined && box.quantity !== null) {
      if (!Number.isInteger(box.quantity) || box.quantity < 1) {
        return res.status(400).json({
          error: `Box at index ${i} has invalid quantity. Must be a positive integer.`
        });
      }
    }
  }

  next();
};



router.get('/resultall', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const data = await PackingResult.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await PackingResult.countDocuments();

    res.json({
      data,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_results: total,
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});


router.get('/resultall/:id', async (req, res) => {
  try {
    const result = await PackingResult.findById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Result not found' });

    const efficiencyReport = result.getEfficiencyReport();
    res.json({ ...result.toObject(), efficiency_report: efficiencyReport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch result', details: err.message });
  }
});

router.get('/results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const results = await PackingResult.find().sort({ created_at: -1 }).limit(limit);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch results', details: err.message });
  }
});


router.get('/results/:id', async (req, res) => {
  try {
    const result = await PackingResult.findById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Result not found' });

    const efficiencyReport = result.getEfficiencyReport();
    res.json({ ...result.toObject(), efficiency_report: efficiencyReport });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch result', details: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalResults = await PackingResult.countDocuments();
    const avgUtilization = await PackingResult.aggregate([
      {
        $group: {
          _id: null,
          avgSpaceUtilization: { $avg: '$space_utilization' },
          maxSpaceUtilization: { $max: '$space_utilization' },
          minSpaceUtilization: { $min: '$space_utilization' },
          avgWeightUtilization: { $avg: '$weight_utilization' },
          maxWeightUtilization: { $max: '$weight_utilization' },
          minWeightUtilization: { $min: '$weight_utilization' }
        }
      }
    ]);

    const stats = {
      total_calculations: totalResults,
      space_stats: {
        average_utilization: Math.round(avgUtilization[0]?.avgSpaceUtilization || 0),
        max_utilization: avgUtilization[0]?.maxSpaceUtilization || 0,
        min_utilization: avgUtilization[0]?.minSpaceUtilization || 0
      }
    };

    if (avgUtilization[0]?.avgWeightUtilization !== undefined) {
      stats.weight_stats = {
        average_utilization: Math.round(avgUtilization[0]?.avgWeightUtilization || 0),
        max_utilization: avgUtilization[0]?.maxWeightUtilization || 0,
        min_utilization: avgUtilization[0]?.minWeightUtilization || 0
      };
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});




router.get('/box-history', auths(), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id); // ✅ ensure ObjectId

    const uniqueBoxes = await PackingResult.aggregate([
      // ✅ Filter only the user's records
      {
        $match: {
          created_by: { $exists: true, $eq: userId }
        }
      },

      // ✅ Unwind boxes_input array to get individual boxes
      { $unwind: '$boxes_input' },

      // Group by box properties to get unique configurations
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          quantities_used: { $addToSet: '$boxes_input.quantity' }
        }
      },

      // Sort by name and last used
      {
        $sort: {
          '_id.name': 1,
          last_used: -1
        }
      },

      // Final formatting
      {
        $project: {
          _id: 0,
          name: '$_id.name',
          display_name: {
            $concat: [
              '$_id.name',
              ' (L:', { $toString: '$_id.length' },
              ' W:', { $toString: '$_id.width' },
              ' H:', { $toString: '$_id.height' },
              {
                $cond: {
                  if: { $ne: ['$_id.weight', null] },
                  then: { $concat: [' Weight:', { $toString: '$_id.weight' }] },
                  else: ''
                }
              },
              ')'
            ]
          },
          dimensions: {
            length: '$_id.length',
            width: '$_id.width',
            height: '$_id.height',
            weight: '$_id.weight'
          },
          usage_count: 1,
          last_used: 1,
          quantities_used: 1
        }
      }
    ]);

    // Format the response to show box names clearly
    const formattedBoxes = uniqueBoxes.map(box => ({
      name: box.name,
      display_text: box.display_name,
      length: box.dimensions.length,
      width: box.dimensions.width,
      height: box.dimensions.height,
      weight: box.dimensions.weight,
      usage_count: box.usage_count,
      last_used: box.last_used,
      quantities_used: box.quantities_used
    }));

    res.json({
      boxes: formattedBoxes,
      total_unique_boxes: formattedBoxes.length
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch box history',
      details: err.message
    });
  }
});


router.get('/box-config/:resultId', async (req, res) => {
  try {
    const result = await PackingResult.findById(req.params.resultId);
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }

    res.json({
      container: result.container,
      boxes: result.boxes_input,
      result_date: result.created_at
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch box configuration', 
      details: err.message 
    });
  }
});

router.get('/search-boxes', async (req, res) => {
  try {
    const { name, min_length, max_length, min_width, max_width, min_height, max_height } = req.query;
    
    let matchConditions = {};
    
    if (name) {
      matchConditions['boxes_input.name'] = { $regex: name, $options: 'i' };
    }
    
    // Build dimension filters
    let dimensionFilters = {};
    if (min_length) dimensionFilters['boxes_input.length'] = { $gte: parseFloat(min_length) };
    if (max_length) dimensionFilters['boxes_input.length'] = { ...dimensionFilters['boxes_input.length'], $lte: parseFloat(max_length) };
    if (min_width) dimensionFilters['boxes_input.width'] = { $gte: parseFloat(min_width) };
    if (max_width) dimensionFilters['boxes_input.width'] = { ...dimensionFilters['boxes_input.width'], $lte: parseFloat(max_width) };
    if (min_height) dimensionFilters['boxes_input.height'] = { $gte: parseFloat(min_height) };
    if (max_height) dimensionFilters['boxes_input.height'] = { ...dimensionFilters['boxes_input.height'], $lte: parseFloat(max_height) };

    const pipeline = [
      { $unwind: '$boxes_input' },
      { $match: { ...matchConditions, ...dimensionFilters } },
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' }
        }
      },
      { $sort: { usage_count: -1, last_used: -1 } },
      {
        $project: {
          _id: 0,
          name: '$_id.name',
          length: '$_id.length',
          width: '$_id.width',
          height: '$_id.height',
          weight: '$_id.weight',
          usage_count: 1,
          last_used: 1
        }
      }
    ];

    const boxes = await PackingResult.aggregate(pipeline);
    
    res.json({
      boxes,
      total_found: boxes.length
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to search boxes', 
      details: err.message 
    });
  }
});


router.get('/popular-boxes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const popularBoxes = await PackingResult.aggregate([
      { $unwind: '$boxes_input' },
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          avg_quantity: { $avg: '$boxes_input.quantity' }
        }
      },
      { $sort: { usage_count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          name: '$_id.name',
          length: '$_id.length',
          width: '$_id.width',
          height: '$_id.height',
          weight: '$_id.weight',
          usage_count: 1,
          last_used: 1,
          avg_quantity: { $round: ['$avg_quantity', 0] }
        }
      }
    ]);

    res.json({
      boxes: popularBoxes,
      total_returned: popularBoxes.length
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch popular boxes', 
      details: err.message 
    });
  }
});

router.get('/box-config/:resultId', async (req, res) => {
  try {
    const result = await PackingResult.findById(req.params.resultId);
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }

    res.json({
      container: result.container,
      boxes: result.boxes_input,
      result_date: result.created_at
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch box configuration', 
      details: err.message 
    });
  }
});

router.get('/search-boxes', async (req, res) => {
  try {
    const { name, min_length, max_length, min_width, max_width, min_height, max_height } = req.query;
    
    let matchConditions = {};
    
    if (name) {
      matchConditions['boxes_input.name'] = { $regex: name, $options: 'i' };
    }

    let dimensionFilters = {};
    if (min_length) dimensionFilters['boxes_input.length'] = { $gte: parseFloat(min_length) };
    if (max_length) dimensionFilters['boxes_input.length'] = { ...dimensionFilters['boxes_input.length'], $lte: parseFloat(max_length) };
    if (min_width) dimensionFilters['boxes_input.width'] = { $gte: parseFloat(min_width) };
    if (max_width) dimensionFilters['boxes_input.width'] = { ...dimensionFilters['boxes_input.width'], $lte: parseFloat(max_width) };
    if (min_height) dimensionFilters['boxes_input.height'] = { $gte: parseFloat(min_height) };
    if (max_height) dimensionFilters['boxes_input.height'] = { ...dimensionFilters['boxes_input.height'], $lte: parseFloat(max_height) };

    const pipeline = [
      { $unwind: '$boxes_input' },
      { $match: { ...matchConditions, ...dimensionFilters } },
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' }
        }
      },
      { $sort: { usage_count: -1, last_used: -1 } },
      {
        $project: {
          _id: 0,
          name: '$_id.name',
          length: '$_id.length',
          width: '$_id.width',
          height: '$_id.height',
          weight: '$_id.weight',
          usage_count: 1,
          last_used: 1
        }
      }
    ];

    const boxes = await PackingResult.aggregate(pipeline);
    
    res.json({
      boxes,
      total_found: boxes.length
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to search boxes', 
      details: err.message 
    });
  }
});


router.get('/popular-boxes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const popularBoxes = await PackingResult.aggregate([
      { $unwind: '$boxes_input' },
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          avg_quantity: { $avg: '$boxes_input.quantity' }
        }
      },
      { $sort: { usage_count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          name: '$_id.name',
          length: '$_id.length',
          width: '$_id.width',
          height: '$_id.height',
          weight: '$_id.weight',
          usage_count: 1,
          last_used: 1,
          avg_quantity: { $round: ['$avg_quantity', 0] }
        }
      }
    ]);

    res.json({
      boxes: popularBoxes,
      total_returned: popularBoxes.length
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to fetch popular boxes', 
      details: err.message 
    });
  }
});


router.get('/box-history/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log('Searching box history for user:', userId);

    // Convert to ObjectId if possible, otherwise keep as string
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    const uniqueBoxes = await PackingResult.aggregate([
      // Filter only the specified user's records
      {
        $match: {
          $or: [
            { created_by: { $exists: true, $eq: userObjectId } },
            { created_by: { $exists: true, $eq: userId } },
            { created_by: { $exists: true, $eq: userId.toString() } }
          ]
        }
      },

      // Unwind boxes_input array to get individual boxes
      { $unwind: '$boxes_input' },

      // Group by box properties to get unique configurations
      {
        $group: {
          _id: {
            name: '$boxes_input.name',
            length: '$boxes_input.length',
            width: '$boxes_input.width',
            height: '$boxes_input.height',
            weight: '$boxes_input.weight'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          first_used: { $min: '$created_at' },
          quantities_used: { $addToSet: '$boxes_input.quantity' },
          result_ids: { $push: '$_id' } // Track all result IDs
        }
      },

      // Sort by name and last used
      {
        $sort: {
          '_id.name': 1,
          last_used: -1
        }
      },

      // Final formatting
      {
        $project: {
          _id: 0,
          box_id: { $toString: { $arrayElemAt: ['$result_ids', 0] } }, // First result ID as box ID
          name: '$_id.name',
          display_name: {
            $concat: [
              '$_id.name',
              ' (L:', { $toString: '$_id.length' },
              ' W:', { $toString: '$_id.width' },
              ' H:', { $toString: '$_id.height' },
              {
                $cond: {
                  if: { $ne: ['$_id.weight', null] },
                  then: { $concat: [' Weight:', { $toString: '$_id.weight' }, 'kg'] },
                  else: ''
                }
              },
              ')'
            ]
          },
          dimensions: {
            length: '$_id.length',
            width: '$_id.width',
            height: '$_id.height',
            weight: '$_id.weight'
          },
          usage_count: 1,
          last_used: 1,
          first_used: 1,
          quantities_used: 1,
          total_usage: { $size: '$result_ids' }
        }
      }
    ]);

    // Verify count for this user
    const verificationCount = await PackingResult.countDocuments({
      $or: [
        { created_by: userObjectId },
        { created_by: userId },
        { created_by: userId.toString() }
      ]
    });

    res.json({
      user_id: userId,
      boxes: uniqueBoxes,
      total_unique_boxes: uniqueBoxes.length,
      total_calculations_by_user: verificationCount,
      message: `Found ${uniqueBoxes.length} unique boxes for user ${userId}`,
      privacy_note: "Only showing boxes belonging to this user"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch user box history',
      details: err.message
    });
  }
});

router.post('/get-my-boxes', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required',
        example: { userId: "your_user_id" }
      });
    }

    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    // Get ONLY this user's box records
    const boxRecords = await PackingResult.find({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    })
    .select('boxes_input created_at')
    .sort({ created_at: -1 });

    // Process and group unique boxes
    const uniqueBoxes = [];
    const seen = new Set();

    boxRecords.forEach(record => {
      record.boxes_input.forEach(box => {
        const key = `${box.name}_${box.length}_${box.width}_${box.height}_${box.weight || 'null'}`;
        
        if (!seen.has(key)) {
          seen.add(key);
          uniqueBoxes.push({
            name: box.name,
            display_name: `${box.name} (${box.length}×${box.width}×${box.height}${box.weight ? `, Weight: ${box.weight}kg` : ''})`,
            dimensions: {
              length: box.length,
              width: box.width,
              height: box.height,
              weight: box.weight
            },
            last_used: record.created_at
          });
        }
      });
    });

    // Sort by name
    uniqueBoxes.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      user_id: userId,
      boxes: uniqueBoxes,
      total_unique_boxes: uniqueBoxes.length,
      total_records: boxRecords.length,
      security: "✅ Only showing boxes for the specified user"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to get user box history',
      details: err.message
    });
  }
});

router.get('/debug-user-boxes/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    // Check all box records for this user
    const userBoxRecords = await PackingResult.find({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    })
    .select('boxes_input created_by created_at')
    .sort({ created_at: -1 })
    .limit(10);

    // Flatten all boxes used by this user
    const allBoxes = [];
    userBoxRecords.forEach(record => {
      record.boxes_input.forEach(box => {
        allBoxes.push({
          ...box,
          record_date: record.created_at,
          created_by: record.created_by
        });
      });
    });

    // Check total count
    const totalCount = await PackingResult.countDocuments({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    });

    res.json({
      user_id: userId,
      total_records: totalCount,
      recent_boxes: allBoxes.slice(0, 20), // Show first 20 boxes
      total_boxes_used: allBoxes.length,
      message: `Debug box info for user ${userId}`,
      note: "This shows raw box data to help debug box history issues"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Box debug failed',
      details: err.message
    });
  }
});

router.get('/container-history-by-name', auths(), async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const containers = await PackingResult.aggregate([
      {
        $match: {
          created_by: { $exists: true, $eq: userId }
        }
      },
      {
        $group: {
          _id: '$container.name', // Group only by container name
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          // Get the most recent container dimensions for this name
          recent_dimensions: { $last: '$container' }
        }
      },
      { $sort: { last_used: -1 } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ['$_id', 'Unnamed Container'] },
          usage_count: 1,
          last_used: 1,
          length: '$recent_dimensions.length',
          width: '$recent_dimensions.width',
          height: '$recent_dimensions.height',
          weight_capacity: '$recent_dimensions.weight_capacity'
        }
      }
    ]);

    res.json({
      containers,
      total_unique_containers: containers.length
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch container history by name',
      details: err.message
    });
  }
});
router.get('/containerdata',async(req,res)=>{
  try{

  }catch(err){
    
  }
})


const getPlanLimits = (planType) => {
  const limits = {
    trial: {
      max_boxes: 3,
      csv_upload: false,
      pdf_export: false,
      weight_constraints: false,
      advanced_optimization: false
    },
    starter: {
      max_boxes: 10,
      csv_upload: false,
      pdf_export: false,
      weight_constraints: true,
      advanced_optimization: false
    },
    pro: {
      max_boxes: 10,
      csv_upload: true,
      pdf_export: true,
      weight_constraints: true,
      advanced_optimization: false
    },
    exclusive: {
      max_boxes: 100,
      csv_upload: true,
      pdf_export: true,
      weight_constraints: true,
      advanced_optimization: true
    }
  };
  return limits[planType] || limits.trial;
};

router.post('/calculate', auths(), validatePackingInput, async (req, res) => {
  try {
    // 1️⃣ GET USER ID (matching your subscription route pattern)
    const userId = req.user.id; // ✅ Changed to match your pattern
    
    console.log("🔍 User ID from token:", userId);
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID not found',
        message: 'Authentication token is invalid'
      });
    }

    // 2️⃣ GET USER SUBSCRIPTION
    const subscription = await Subscription.findOne({ user_id: userId });
    const planType = subscription ? subscription.plan_type : 'trial';
    
    console.log("📊 Plan type:", planType);
    console.log("📦 Subscription details:", subscription);

    // 3️⃣ CHECK IF SUBSCRIPTION EXISTS AND IS ACTIVE
    let isActive = false;
    
    if (!subscription) {
      // No subscription found - treat as trial with limits
      console.log("⚠️ No subscription found - using trial limits");
      isActive = false; // User needs to create trial or subscribe
      
      return res.status(403).json({
        error: 'No subscription found',
        message: 'Please start your 5-day free trial or subscribe to use this feature.',
        upgrade_required: true,
        current_plan: 'none',
        suggested_action: 'create_trial',
        trial_endpoint: '/api/subscription/create-trial'
      });
    }
    
    // Check if subscription is active
    isActive = subscription.isActive() || subscription.isTrialActive();
    
    if (!isActive) {
      const now = new Date();
      const endDate = subscription.is_trial ? subscription.trial_end_date : subscription.end_date;
      const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      
      return res.status(403).json({
        error: 'Subscription expired',
        message: `Your ${planType} subscription has expired.`,
        days_since_expiry: Math.abs(daysRemaining),
        upgrade_required: true,
        current_plan: planType,
        suggested_action: 'renew_subscription'
      });
    }

    const planLimits = getPlanLimits(planType);
    
    console.log("✅ Plan limits:", planLimits);

    // 4️⃣ VALIDATE BOX COUNT LIMIT 🚨 CRITICAL
    const boxCount = req.body.boxes?.length || 0;
    
    console.log(`📦 Box count: ${boxCount}/${planLimits.max_boxes}`);
    
    if (boxCount > planLimits.max_boxes) {
      return res.status(403).json({
        error: 'Box limit exceeded',
        message: `Your ${planType} plan allows maximum ${planLimits.max_boxes} boxes. You tried to pack ${boxCount} boxes.`,
        current_plan: planType,
        max_allowed: planLimits.max_boxes,
        boxes_submitted: boxCount,
        boxes_exceeded: boxCount - planLimits.max_boxes,
        upgrade_required: true,
        suggested_plans: planType === 'trial' ? ['starter', 'pro', 'exclusive'] : 
                        planType === 'starter' ? ['pro', 'exclusive'] : 
                        ['exclusive']
      });
    }

    // 5️⃣ CHECK CSV UPLOAD FEATURE 🚨 HIGH PRIORITY
    const isCsvUpload = req.body.is_csv_upload || false;
    
    if (isCsvUpload && !planLimits.csv_upload) {
      return res.status(403).json({
        error: 'CSV upload not allowed',
        message: `CSV upload is not available in your ${planType} plan. Upgrade to Pro or Exclusive to use this feature.`,
        current_plan: planType,
        feature_required: 'csv_upload',
        upgrade_required: true,
        suggested_plans: ['pro', 'exclusive']
      });
    }

    // 6️⃣ CHECK WEIGHT CONSTRAINTS FEATURE 🚨 MEDIUM PRIORITY
    const hasWeightConstraints = req.body.container?.weight_capacity != null;
    
    if (hasWeightConstraints && !planLimits.weight_constraints) {
      return res.status(403).json({
        error: 'Weight constraints not available',
        message: `Weight constraints are not available in your ${planType} plan. Upgrade to Starter or higher.`,
        current_plan: planType,
        feature_required: 'weight_constraints',
        upgrade_required: true,
        suggested_plans: ['starter', 'pro', 'exclusive']
      });
    }

    // 7️⃣ SELECT ALGORITHM BASED ON PLAN
    const useAdvancedAlgorithm = planLimits.advanced_optimization;
    
    console.log(`✅ Plan Validation Passed:`, {
      user_id: userId,
      plan: planType,
      is_active: isActive,
      boxes_count: boxCount,
      max_allowed: planLimits.max_boxes,
      advanced_algo: useAdvancedAlgorithm,
      csv_upload: isCsvUpload,
      weight_constraints: hasWeightConstraints
    });

    // 8️⃣ PREPARE DATA FOR PYTHON SCRIPT
    const pythonInput = {
      ...req.body,
      use_advanced_algorithm: useAdvancedAlgorithm,
      plan_type: planType
    };

    // 9️⃣ CALL PYTHON PACKING ALGORITHM
    const python = spawn('python', ['packer.py']);

    let data = '';
    let errorData = '';

    python.stdout.on('data', chunk => {
      data += chunk.toString();
    });

    python.stderr.on('data', err => {
      errorData += err.toString();
    });

    python.on('close', async code => {
      if (code !== 0) {
        console.error('❌ Python script failed:', errorData);
        return res.status(500).json({ 
          error: 'Packing calculation failed', 
          code, 
          stderr: errorData 
        });
      }

      try {
        const parsed = JSON.parse(data);
        const total_boxes = parsed.box_summary.reduce((sum, box) => sum + box.count, 0);
        const total_weight = parsed.total_weight || 0;

        // 🔟 SAVE RESULT TO DATABASE
        const result = new PackingResult({
          container: req.body.container,  
          boxes_input: req.body.boxes,
          total_boxes,
          total_weight,
          created_by: userId,
          container_full: parsed.container_full,
          weight_limit_reached: parsed.weight_limit_reached || false,
          space_utilization: parsed.space_utilization,
          weight_utilization: parsed.weight_utilization || 0,
          box_summary: parsed.box_summary,
          plan_used: planType,
          algorithm_type: useAdvancedAlgorithm ? 'advanced' : 'basic',
          created_at: new Date()
        });

        await result.save();
        
        console.log('✅ Result saved to database:', result._id);

        // 1️⃣1️⃣ UPDATE USAGE STATS
        if (subscription) {
          subscription.usage_stats = subscription.usage_stats || {};
          subscription.usage_stats.calculations_count = (subscription.usage_stats.calculations_count || 0) + 1;
          subscription.usage_stats.last_calculation_date = new Date();
          subscription.usage_stats.total_boxes_packed = (subscription.usage_stats.total_boxes_packed || 0) + total_boxes;
          await subscription.save();
          
          console.log('✅ Usage stats updated');
        }

        const efficiencyReport = result.getEfficiencyReport ? result.getEfficiencyReport() : null;

        // ✅ SEND RESPONSE WITH PLAN INFO
        res.json({
          ...parsed,
          efficiency_report: efficiencyReport,
          result_id: result._id,
          plan_info: {
            current_plan: planType,
            is_trial: subscription.is_trial,
            days_remaining: Math.max(0, Math.ceil((subscription.is_trial ? subscription.trial_end_date : subscription.end_date - new Date()) / (1000 * 60 * 60 * 24))),
            boxes_used: boxCount,
            boxes_limit: planLimits.max_boxes,
            algorithm_used: useAdvancedAlgorithm ? 'advanced' : 'basic',
            features_available: planLimits,
            calculations_count: subscription.usage_stats?.calculations_count || 1
          }
        });
      } catch (err) {
        console.error('❌ Failed to process result:', err);
        res.status(500).json({
          error: 'Failed to process packing result',
          details: err.message,
          raw_output: data
        });
      }
    });

    python.on('error', err => {
      console.error('❌ Failed to start Python:', err);
      res.status(500).json({ 
        error: 'Failed to start packing algorithm', 
        details: err.message 
      });
    });

    python.stdin.write(JSON.stringify(pythonInput));
    python.stdin.end();

  } catch (err) {
    console.error('❌ Calculate route error:', err);
    res.status(500).json({
      error: 'Server error',
      details: err.message
    });
  }
});

router.post('/pdf-generate',auths(),async(req,res)=>{
  
})
router.post('/export-pdf', auths(), async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID not found' 
      });
    }

    const subscription = await Subscription.findOne({ user_id: userId });
    
    if (!subscription) {
      return res.status(404).json({ 
        error: 'No subscription found',
        message: 'Please subscribe to use PDF export feature'
      });
    }
    
    const planType = subscription.plan_type;
    const planLimits = getPlanLimits(planType);

    // CHECK PDF EXPORT PERMISSION
    if (!planLimits.pdf_export) {
      return res.status(403).json({
        error: 'PDF export not available',
        message: `PDF export requires Pro or Exclusive plan. Your current plan: ${planType}`,
        current_plan: planType,
        upgrade_required: true,
        suggested_plans: ['pro', 'exclusive']
      });
    }

    // ✅ PDF export is allowed
    res.json({
      message: 'PDF export feature available',
      plan: planType,
      note: 'Implement PDF generation logic here'
    });

  } catch (err) {
    res.status(500).json({
      error: 'PDF export failed',
      details: err.message
    });
  }
});

router.post('/calculate-no-auth', validatePackingInput, (req, res) => {
  // Require userId in request body
  if (!req.body.userId) {
    return res.status(400).json({ error: 'userId is required in request body' });
  }

  const python = spawn('python', ['packer.py']);

  let data = '';
  let errorData = '';

  python.stdout.on('data', chunk => {
    data += chunk.toString();
  });

  python.stderr.on('data', err => {
    errorData += err.toString();
  });

  python.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Python script failed', code, stderr: errorData });
    }

    try {
      const parsed = JSON.parse(data);
      const total_boxes = parsed.box_summary.reduce((sum, box) => sum + box.count, 0);
      const total_weight = parsed.total_weight || 0;

      const result = new PackingResult({
        container: req.body.container,
        boxes_input: req.body.boxes,
        total_boxes,
        total_weight,
        created_by: req.body.userId, // Direct from request body
        container_full: parsed.container_full,
        weight_limit_reached: parsed.weight_limit_reached || false,
        space_utilization: parsed.space_utilization,
        weight_utilization: parsed.weight_utilization || 0,
        box_summary: parsed.box_summary,
        created_at: new Date()
      });

      await result.save();
      const efficiencyReport = result.getEfficiencyReport();

      res.json({
        ...parsed,
        efficiency_report: efficiencyReport,
        result_id: result._id
      });
    } catch (err) {
      res.status(500).json({
        error: 'Invalid JSON from Python or MongoDB save error',
        details: err.message,
        raw_output: data
      });
    }
  });

  python.on('error', err => {
    res.status(500).json({ error: 'Failed to start Python process', details: err.message });
  });

  python.stdin.write(JSON.stringify(req.body));
  python.stdin.end();
});

router.get('/container-history', auths(), async (req, res) => {
  try {
    // Get user ID from multiple sources
    let userId;
    if (req.user && req.user._id) {
      userId = new mongoose.Types.ObjectId(req.user._id);
    } else {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('Container history - looking for userId:', userId);

    const containers = await PackingResult.aggregate([
      {
        $match: {
          $or: [
            { created_by: { $exists: true, $eq: userId } },
            { created_by: { $exists: true, $eq: userId.toString() } }
          ]
        }
      },
      {
        $group: {
          _id: {
            name: '$container.name',
            length: '$container.length',
            width: '$container.width',
            height: '$container.height',
            weight_capacity: '$container.weight_capacity'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' }
        }
      },
      { $sort: { last_used: -1 } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ['$_id.name', 'Unnamed Container'] },
          display_name: {
            $concat: [
              { $ifNull: ['$_id.name', 'Unnamed Container'] },
              ' (L:', { $toString: '$_id.length' },
              ' W:', { $toString: '$_id.width' },
              ' H:', { $toString: '$_id.height' },
              {
                $cond: {
                  if: { $ne: ['$_id.weight_capacity', null] },
                  then: { $concat: [' Weight:', { $toString: '$_id.weight_capacity' }] },
                  else: ''
                }
              },
              ')'
            ]
          },
          length: '$_id.length',
          width: '$_id.width',
          height: '$_id.height',
          weight_capacity: '$_id.weight_capacity',
          usage_count: 1,
          last_used: 1
        }
      }
    ]);

    res.json({
      containers,
      total_unique_containers: containers.length,
      debug_info: {
        searched_for_user_id: userId,
        user_id_type: typeof userId
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch container history',
      details: err.message
    });
  }
});

router.get('/auth-debug', auths(), (req, res) => {
  res.json({
    user: req.user,
    user_id: req.user ? req.user._id : null,
    user_id_type: req.user ? typeof req.user._id : null,
    headers: req.headers,
    auth_header: req.headers.authorization
  });
});

router.get('/test-db', async (req, res) => {
  try {
    const count = await PackingResult.countDocuments();
    const sample = await PackingResult.findOne().select('created_by container.name created_at');
    
    res.json({
      message: 'Database connection OK',
      total_records: count,
      sample_record: sample
    });
  } catch (err) {
    res.status(500).json({
      error: 'Database connection failed',
      details: err.message
    });
  }
});

router.get('/container-history/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log('Searching containers for user:', userId);

    // Convert to ObjectId if possible, otherwise keep as string
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    // Find ALL containers for this specific user ONLY
    const userContainers = await PackingResult.aggregate([
      {
        // ✅ STRICT FILTER - Only this user's data
        $match: {
          $or: [
            { created_by: { $exists: true, $eq: userObjectId } },
            { created_by: { $exists: true, $eq: userId } },
            { created_by: { $exists: true, $eq: userId.toString() } }
          ]
        }
      },
      {
        // Group by unique container configurations
        $group: {
          _id: {
            name: '$container.name',
            length: '$container.length',
            width: '$container.width',
            height: '$container.height',
            weight_capacity: '$container.weight_capacity'
          },
          usage_count: { $sum: 1 },
          last_used: { $max: '$created_at' },
          first_used: { $min: '$created_at' },
          result_ids: { $push: '$_id' } // Track all result IDs
        }
      },
      {
        // Sort by most recently used
        $sort: { last_used: -1 }
      },
      {
        $project: {
          _id: 0,
          container_id: { $toString: { $arrayElemAt: ['$result_ids', 0] } }, // First result ID as container ID
          name: {
            $cond: {
              if: { $ne: ['$_id.name', null] },
              then: '$_id.name',
              else: {
                $concat: [
                  'Container_',
                  { $toString: '$_id.length' }, 'x',
                  { $toString: '$_id.width' }, 'x',
                  { $toString: '$_id.height' }
                ]
              }
            }
          },
          display_name: {
            $concat: [
              {
                $cond: {
                  if: { $ne: ['$_id.name', null] },
                  then: '$_id.name',
                  else: {
                    $concat: [
                      'Container_',
                      { $toString: '$_id.length' }, 'x',
                      { $toString: '$_id.width' }, 'x',
                      { $toString: '$_id.height' }
                    ]
                  }
                }
              },
              ' (', { $toString: '$_id.length' },
              '×', { $toString: '$_id.width' },
              '×', { $toString: '$_id.height' },
              {
                $cond: {
                  if: { $ne: ['$_id.weight_capacity', null] },
                  then: { $concat: [', Weight: ', { $toString: '$_id.weight_capacity' }, ' kg'] },
                  else: ''
                }
              },
              ')'
            ]
          },
          dimensions: {
            length: '$_id.length',
            width: '$_id.width',
            height: '$_id.height'
          },
          weight_capacity: '$_id.weight_capacity',
          usage_count: 1,
          last_used: 1,
          first_used: 1,
          total_calculations: { $size: '$result_ids' }
        }
      }
    ]);

    // Double-check: Verify all containers belong to this user
    const verificationCount = await PackingResult.countDocuments({
      $or: [
        { created_by: userObjectId },
        { created_by: userId },
        { created_by: userId.toString() }
      ]
    });

    res.json({
      user_id: userId,
      containers: userContainers,
      total_unique_containers: userContainers.length,
      total_calculations_by_user: verificationCount,
      message: `Found ${userContainers.length} unique containers for user ${userId}`,
      privacy_note: "Only showing containers belonging to this user"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch user containers',
      details: err.message
    });
  }
});


router.post('/get-my-containers', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required',
        example: { userId: "your_user_id" }
      });
    }

    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    // Get ONLY this user's containers
    const containers = await PackingResult.find({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    })
    .select('container created_at')
    .sort({ created_at: -1 });

    // Group unique containers
    const uniqueContainers = [];
    const seen = new Set();

    containers.forEach(record => {
      const key = `${record.container.length}_${record.container.width}_${record.container.height}_${record.container.weight_capacity || 'null'}_${record.container.name || 'unnamed'}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        uniqueContainers.push({
          name: record.container.name || `Container_${record.container.length}x${record.container.width}x${record.container.height}`,
          display_name: `${record.container.name || 'Container'} (${record.container.length}×${record.container.width}×${record.container.height}${record.container.weight_capacity ? `, Weight: ${record.container.weight_capacity}kg` : ''})`,
          dimensions: {
            length: record.container.length,
            width: record.container.width,
            height: record.container.height
          },
          weight_capacity: record.container.weight_capacity,
          last_used: record.created_at
        });
      }
    });

    res.json({
      user_id: userId,
      containers: uniqueContainers,
      total_unique_containers: uniqueContainers.length,
      total_records: containers.length,
      security: "✅ Only showing containers for the specified user"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to get user containers',
      details: err.message
    });
  }
});

router.get('/debug-user-containers/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (e) {
      userObjectId = userId;
    }

    // Check all records for this user
    const userRecords = await PackingResult.find({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    })
    .select('container.name container.length container.width container.height container.weight_capacity created_by created_at')
    .sort({ created_at: -1 })
    .limit(10);

    // Check total count
    const totalCount = await PackingResult.countDocuments({
      $or: [
        { created_by: userObjectId },
        { created_by: userId }
      ]
    });

    res.json({
      user_id: userId,
      total_records: totalCount,
      recent_containers: userRecords,
      message: `Debug info for user ${userId}`,
      note: "This shows raw data to help debug container history issues"
    });

  } catch (err) {
    res.status(500).json({
      error: 'Debug failed',
      details: err.message
    });
  }
});
module.exports = router;

