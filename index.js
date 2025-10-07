const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const packingRoutes = require("./routes/track");
const auth = require('./routes/user')
require("dotenv").config();
const app = express();


connectDB();
const auths = require("./middleware/auth");

app.use(cors());
app.use(express.json());
app.use('/', packingRoutes);
app.use("/api", auth);
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is running successfully!',
    timestamp: new Date().toISOString(),
    version: '1.2'
  });
});

// app.listen(port, () => {
//   console.log(`🚀 Server running at http://localhost:${port}`);
// });

app.listen(process.env.PORT || 3000)

