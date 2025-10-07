// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema({
//   fullName: { type: String, required: true },
//   email: { type: String, required: true, unique: true },
//   mobile: { type: String, required: true },
//   password: { type: String, required: true },
//   companyName: { type: String },
//   industry: {
//     category: { type: String }  
//   },
//   role: { type: String, enum: ["user", "admin"], default: "user" }
// }, { timestamps: true });

// module.exports = mongoose.model("User", userSchema);
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  profile: {
    url: { type: String },         // URL of the image stored in Cloudinary
    public_id: { type: String }   // Cloudinary public ID for managing/deleting images
  },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  companyName: { type: String },
  industry: {
    category: { type: String }
  },
  role: { type: String, enum: ["user", "admin"], default: "user" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
