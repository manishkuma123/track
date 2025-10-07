// const express = require("express");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const User = require("../models/user");
// const auth = require("../middleware/auth");

// const router = express.Router();


// router.post("/register", async (req, res) => {
//   const { fullName, email, mobile, password, companyName, industry, role } = req.body;

//   try {
//     let user = await User.findOne({ email });
//     if (user) return res.status(400).json({ error: "User already exists" });

//     const hashedPassword = await bcrypt.hash(password, 10);

//     user = new User({
//       fullName,
//       email,
//       mobile,
//       password: hashedPassword,
//       companyName,
//       industry,
//       role: role || "user"
//     });

//     await user.save();
//     res.status(201).json({ message: "User registered successfully" });
//   } catch (err) {
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });


// router.post("/login", async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     const user = await User.findOne({ email });
//     if (!user) return res.status(400).json({ error: "Invalid credentials" });

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

//     const payload = {
//       id: user._id,
//       role: user.role,
//       email: user.email
//     };

//     const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

//     res.json({ token ,payload});
//   } catch (err) {
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });


// router.get("/profile", auth(), async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ error: "User not found" });
//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });

// router.put("/updateprofile", auth(), async (req, res) => {
//   const disallowedFields = ["email", "password"];


//   const attemptedFields = Object.keys(req.body);
//   const hasDisallowed = attemptedFields.some(field => disallowedFields.includes(field));

//   if (hasDisallowed) {
//     return res.status(400).json({ error: "Email and password cannot be updated" });
//   }


//   const allowedUpdates = ["fullName", "mobile", "companyName", "industry"];
//   const updates = {};

//   for (const field of allowedUpdates) {
//     if (req.body[field] !== undefined) {
//       updates[field] = req.body[field];
//     }
//   }

//   try {
//     const updatedUser = await User.findByIdAndUpdate(
//       req.user.id,
//       { $set: updates },
//       { new: true, runValidators: true }
//     ).select("-password");

//     if (!updatedUser) return res.status(404).json({ error: "User not found" });

//     res.json({ message: "Profile updated successfully", user: updatedUser });
//   } catch (err) {
//     res.status(500).json({ error: "Server error", details: err.message });
//   }
// });


// router.get("/admin", auth("admin"), async (req, res) => {
//   res.json({ message: "Welcome Admin!", user: req.user });
// });

// module.exports = router;
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const User = require("../models/user");
const auth = require("../middleware/auth");
const { storage } = require("../utils/cloudinary");

const router = express.Router();
const upload = multer({ storage }); 


router.post("/register", upload.single("profile"), async (req, res) => {
  const { fullName, email, mobile, password, companyName, industry, role } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Convert industry string to object if needed
    const industryData =
      typeof industry === "string"
        ? { category: industry }
        : industry;

    // Handle profile image if uploaded
    let profile = {};
    if (req.file) {
      profile = {
        url: req.file.path,
        public_id: req.file.filename,
      };
    }

    // Create new user
    const newUser = new User({
      fullName,
      email,
      mobile,
      password: hashedPassword,
      companyName,
      industry: industryData,
      role: role || "user",
      profile,
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});


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

module.exports = router;
