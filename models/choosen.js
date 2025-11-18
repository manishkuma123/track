
const mongoose = require("mongoose");

const SuscribeSchema = new mongoose.Schema({

  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan',required: true },
startdate:{type :Date},
enddate:{type :Date},
}, { timestamps: true });

module.exports = mongoose.model("suscribe", SuscribeSchema);