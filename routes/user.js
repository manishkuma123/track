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
const dotenv =require("dotenv");
const  Message =  require('../models/Contact')
const nodemailer = require('nodemailer');

dotenv.config();
const router = express.Router();
const upload = multer({ storage }); 



router.post("/send", async (req, res) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Please fill all required fields." });
  }

  try {
    // Save message in MongoDB
    const newMessage = new Message({ name, email, phone, message });
    await newMessage.save();

    // Create mail transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Admin email (to you)
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

    // Auto-reply to user
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
