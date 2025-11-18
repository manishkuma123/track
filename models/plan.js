
const mongoose = require("mongoose");

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  feature: { type: String, required: true, unique: true },
  plan:{type:String,required:true},
  price: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  stateDate: { type: Date},
  endDate: { type: Date },
 

}, { timestamps: true });

module.exports = mongoose.model("paln", PlanSchema);
