
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://manishpdotpitchtechnologies:OAQV5V2rqEpFYAnG@cluster0.ooxxw1c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
      useNewUrlParser: true,
      useUnifiedTopology: true,

    });
    console.log("MongoDB connected!");
    console.log('db connected successfully')
  } catch (err) {
    console.error("DB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
