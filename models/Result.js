// const mongoose = require('mongoose');
// const { type } = require('os');

// const boxSchema = new mongoose.Schema({
//   x: { type: Number, required: true },
//   y: { type: Number, required: true },
//   z: { type: Number, required: true },
//   length: { type: Number, required: true },
//   width: { type: Number, required: true },
//   height: { type: Number, required: true },
//   weight: { type: Number, default: 0 }
// });

// const boxSummarySchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   length: { type: Number, required: true },
//   width: { type: Number, required: true },
//   height: { type: Number, required: true },
//   weight: { type: Number, default: 0 },
//   requested_quantity: { type: Number, default: 0 },   
//   count: { type: Number, required: true },
//   not_placed: { type: Number, default: 0 },
//   boxes: [boxSchema]
// });

// const containerSchema = new mongoose.Schema({
//   length: { type: Number, required: true },
//   width: { type: Number, required: true },
//   height: { type: Number, required: true },
//   weight_capacity: { 
//     type: Number, 
//     required: false,
//     min: 0,
//     validate: {
//       validator: function(v) {
//         return v == null || (typeof v === 'number' && v > 0);
//       },
//       message: 'Weight capacity must be a positive number if provided'
//     }
//   }
// });
// const inputBoxSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   length: { type: Number, required: true },
//   width: { type: Number, required: true },
//   height: { type: Number, required: true },
//   weight: { 
//     type: Number, 
//     default: 0,
//     min: 0,
//     validate: {
//       validator: function(v) {
//         return v == null || (typeof v === 'number' && v >= 0);
//       },
//       message: 'Weight must be a non-negative number if provided'
//     }
//   },
//   quantity: { 
//     type: Number, 
//     required: false,  
//     min: 1,           
//     validate: {
//       validator: function(v) {
//         return v == null || (Number.isInteger(v) && v > 0);
//       },
//       message: 'Quantity must be a positive integer if provided'
//     }
//   }
// });

// const packingResultSchema = new mongoose.Schema({
//   container: { type: containerSchema, required: true },
//   boxes_input: [inputBoxSchema],
//   total_boxes: { type: Number, required: true },
//   total_weight: { type: Number, default: 0 },
//   container_full: { type: Boolean, required: true },
//   weight_limit_reached: { type: Boolean, default: false },
//   space_utilization: { type: Number, default: 0 },
//   weight_utilization: { type: Number, default: 0 },
//   box_summary: [boxSummarySchema],
//   created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

//   created_at: { type: Date, default: Date.now, index: true },
//   algorithm_version: { type: String, default: 'v1.2' } 
// });

// packingResultSchema.methods.getEfficiencyReport = function() {
//   const totalRequested = this.box_summary.reduce((sum, box) => sum + (box.requested_quantity || 0), 0);
//   const totalPlaced = this.box_summary.reduce((sum, box) => sum + box.count, 0);
//   const totalNotPlaced = this.box_summary.reduce((sum, box) => sum + box.not_placed, 0);
  
//   const report = {
//     total_requested: totalRequested,
//     total_placed: totalPlaced,
//     total_not_placed: totalNotPlaced,
//     placement_success_rate: totalRequested > 0 ? ((totalPlaced / totalRequested) * 100).toFixed(2) : 0,
//     space_utilization: this.space_utilization,
//     total_weight: this.total_weight
//   };

//   if (this.container.weight_capacity) {
//     report.weight_capacity = this.container.weight_capacity;
//     report.weight_utilization = this.weight_utilization;
//     report.weight_limit_reached = this.weight_limit_reached;
//     report.remaining_weight_capacity = this.container.weight_capacity - this.total_weight;
//   }
//   return report;
// };

// packingResultSchema.index({ created_at: -1 });
// packingResultSchema.index({ space_utilization: -1 });
// packingResultSchema.index({ weight_utilization: -1 });
// packingResultSchema.index({ total_boxes: -1 });
// packingResultSchema.index({ total_weight: -1 });

// module.exports = mongoose.model('PackingResult', packingResultSchema);


const mongoose = require('mongoose');

// Box inside the packed summary (after optimization)
const boxSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  z: { type: Number, required: true },
  length: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  weight: { type: Number, default: 0 },
  container_name: { type: String }  // ✅ Added to track which container it was placed in
});

// Summary of how many boxes of each type were placed
const boxSummarySchema = new mongoose.Schema({
  name: { type: String, required: true },
  length: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  weight: { type: Number, default: 0 },
  requested_quantity: { type: Number, default: 0 },   
  count: { type: Number, required: true },
  not_placed: { type: Number, default: 0 },
  boxes: [boxSchema]
});

// Container dimensions (input)
const containerSchema = new mongoose.Schema({
    name: { type: String, required: false, trim: true, default: null },
  length: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  weight_capacity: { 
    type: Number, 
    required: false,
    min: 0,
    validate: {
      validator: function(v) {
        return v == null || (typeof v === 'number' && v > 0);
      },
      message: 'Weight capacity must be a positive number if provided'
    }
  }
});

// Boxes input (before optimization)
const inputBoxSchema = new mongoose.Schema({
  name: { type: String, required: true },
  length: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  weight: { 
    type: Number, 
    default: 0,
    min: 0,
    validate: {
      validator: function(v) {
        return v == null || (typeof v === 'number' && v >= 0);
      },
      message: 'Weight must be a non-negative number if provided'
    }
  },
  quantity: { 
    type: Number, 
    required: false,  
    min: 1,           
    validate: {
      validator: function(v) {
        return v == null || (Number.isInteger(v) && v > 0);
      },
      message: 'Quantity must be a positive integer if provided'
    }
  }
});

// Final result schema
const packingResultSchema = new mongoose.Schema({
  container: { type: containerSchema, required: true },
  boxes_input: [inputBoxSchema],
  total_boxes: { type: Number, required: true },
  total_weight: { type: Number, default: 0 },
  container_full: { type: Boolean, required: true },
  weight_limit_reached: { type: Boolean, default: false },
  space_utilization: { type: Number, default: 0 },
  weight_utilization: { type: Number, default: 0 },
  box_summary: [boxSummarySchema],
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  created_at: { type: Date, default: Date.now, index: true },
  algorithm_version: { type: String, default: 'v1.2' } 
});


packingResultSchema.methods.getEfficiencyReport = function() {
  const totalRequested = this.box_summary.reduce((sum, box) => sum + (box.requested_quantity || 0), 0);
  const totalPlaced = this.box_summary.reduce((sum, box) => sum + box.count, 0);
  const totalNotPlaced = this.box_summary.reduce((sum, box) => sum + box.not_placed, 0);
  
  const report = {
    total_requested: totalRequested,
    total_placed: totalPlaced,
    total_not_placed: totalNotPlaced,
    placement_success_rate: totalRequested > 0 ? ((totalPlaced / totalRequested) * 100).toFixed(2) : 0,
    space_utilization: this.space_utilization,
    total_weight: this.total_weight
  };

  if (this.container.weight_capacity) {
    report.weight_capacity = this.container.weight_capacity;
    report.weight_utilization = this.weight_utilization;
    report.weight_limit_reached = this.weight_limit_reached;
    report.remaining_weight_capacity = this.container.weight_capacity - this.total_weight;
  }
  return report;
};

packingResultSchema.index({ created_at: -1 });
packingResultSchema.index({ space_utilization: -1 });
packingResultSchema.index({ weight_utilization: -1 });
packingResultSchema.index({ total_boxes: -1 });
packingResultSchema.index({ total_weight: -1 });

module.exports = mongoose.model('PackingResult', packingResultSchema);
