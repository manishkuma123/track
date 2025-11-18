
const mongoose = require("mongoose");

const FeaturesSchema = new mongoose.Schema({
  featurename: { type: String, required: true }


  
 
}, { timestamps: true });

module.exports = mongoose.model("Features", FeaturesSchema);
