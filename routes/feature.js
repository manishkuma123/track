const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const router = express.Router();



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

module.exports = router;