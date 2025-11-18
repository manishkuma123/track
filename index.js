const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const packingRoutes = require("./routes/track");
const auth = require('./routes/user')
require("dotenv").config();
const app = express();
// const paymentorder = require("./routes/Payment")
const  PlanRoutes = require("./routes/Payment");
const subscriptionRoutes = require("./routes/subscription");
connectDB();
const auths = require("./middleware/auth");
const Chatbot = require('./routes/chat')
app.use(cors());
app.use(express.json());
app.use('/', packingRoutes);
app.use("/api", auth);
app.use('/api',Chatbot)
// app.use("/api/payment",paymentorder)
app.use("/api", PlanRoutes);
app.use("/api", subscriptionRoutes);
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is running successfully!',
    timestamp: new Date().toISOString(),
    version: '1.2'
  });
});


app.listen(process.env.PORT || 3000)

