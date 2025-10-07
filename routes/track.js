
const express = require("express");
const { spawn } = require("child_process");
const PackingResult = require("../models/Result");
const multer = require("multer");
const auths = require("../middleware/auth");
const router = express.Router();
const upload = multer({ dest: "uploads/" });
const mongoose = require("mongoose");

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


// router.post('/calculate', auths(), validatePackingInput, (req, res) => {
//   const python = spawn('python', ['packer.py']);

//   let data = '';
//   let errorData = '';

//   python.stdout.on('data', chunk => {
//     data += chunk.toString();
//   });

//   python.stderr.on('data', err => {
//     errorData += err.toString();
//   });

//   python.on('close', async code => {
//     if (code !== 0) {
//       return res.status(500).json({ error: 'Python script failed', code, stderr: errorData });
//     }

//     try {
//       const parsed = JSON.parse(data);
//       const total_boxes = parsed.box_summary.reduce((sum, box) => sum + box.count, 0);
//       const total_weight = parsed.total_weight || 0;

//       const result = new PackingResult({
//         container: req.body.container,
//         boxes_input: req.body.boxes,
//         total_boxes,
//         total_weight,
//         //  created_by: req.user._id,
// created_by: req.body.userId,
//         container_full: parsed.container_full,
//         weight_limit_reached: parsed.weight_limit_reached || false,
//         space_utilization: parsed.space_utilization,
//         weight_utilization: parsed.weight_utilization || 0,
//         box_summary: parsed.box_summary,
//         created_at: new Date()
//       });

//       await result.save();
//       const efficiencyReport = result.getEfficiencyReport();

//       res.json({
//         ...parsed,
//         efficiency_report: efficiencyReport,
//         result_id: result._id
//       });
//     } catch (err) {
//       res.status(500).json({
//         error: 'Invalid JSON from Python or MongoDB save error',
//         details: err.message,
//         raw_output: data
//       });
//     }
//   });

//   python.on('error', err => {
//     res.status(500).json({ error: 'Failed to start Python process', details: err.message });
//   });

//   python.stdin.write(JSON.stringify(req.body));
//   python.stdin.end();
// });


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




// Add these new routes to your existing router

// Get unique box configurations from user's history
// router.get('/box-history', async (req, res) => {
//   try {
//     const uniqueBoxes = await PackingResult.aggregate([
//       // Unwind the boxes_input array to get individual boxes
//       { $unwind: '$boxes_input' },
      
//       // Group by box properties to get unique configurations
//       {
//         $group: {
//           _id: {
//             name: '$boxes_input.name',
//             length: '$boxes_input.length',
//             width: '$boxes_input.width',
//             height: '$boxes_input.height',
//             weight: '$boxes_input.weight'
//           },
//           usage_count: { $sum: 1 },
//           last_used: { $max: '$created_at' },
//           // Keep track of different quantities used
//           quantities_used: { $addToSet: '$boxes_input.quantity' }
//         }
//       },
      
//       // Sort by most recently used
//       { $sort: { last_used: -1 } },
      
//       // Reshape the output
//       {
//         $project: {
//           _id: 0,
//           name: '$_id.name',
//           length: '$_id.length',
//           width: '$_id.width',
//           height: '$_id.height',
//           weight: '$_id.weight',
//           usage_count: 1,
//           last_used: 1,
//           quantities_used: 1
//         }
//       }
//     ]);

//     res.json({
//       boxes: uniqueBoxes,
//       total_unique_boxes: uniqueBoxes.length
//     });
//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Failed to fetch box history', 
//       details: err.message 
//     });
//   }
// });


// Add these new routes to your existing router

// Get unique box configurations from user's history

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

// Search boxes by name or dimensions
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
// Get box configurations from a specific result
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


router.post('/calculate', auths(), validatePackingInput, (req, res) => {
  // Debug logging
  console.log('req.user:', req.user);
  console.log('req.body.userId:', req.body.userId);

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

      // ✅ FIXED: Use fallback for created_by
      let createdBy = null;
      if (req.user && req.user._id) {
        createdBy = req.user._id;
      } else if (req.body.userId) {
        createdBy = req.body.userId;
      } else {
        return res.status(400).json({ 
          error: 'User ID not found. Please ensure authentication is working properly.' 
        });
      }

      const result = new PackingResult({
        container: req.body.container,  
        boxes_input: req.body.boxes,
        total_boxes,
        total_weight,
        created_by: createdBy,
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
        result_id: result._id,
        debug_info: {
          created_by: createdBy,
          user_from_auth: req.user ? req.user._id : null,
          user_from_body: req.body.userId || null
        }
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
