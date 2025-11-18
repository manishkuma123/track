// const Razorpay = require('razorpay');

// const razorpayInstance = new Razorpay({
//   key_id:'rzp_test_RRjhtGeKDCH8kg',
//   key_secret:'ljFrxTWiOaxH2Uyu8oeplBEX'
// });

// module.exports = razorpayInstance;
require('dotenv').config(); // Add this line at the top

const Razorpay = require('razorpay');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = razorpayInstance;



// rzp_test_RRjhtGeKDCH8kg       ljFrxTWiOaxH2Uyu8oeplBEX    rzp_test_RRjhtGeKDCH8kg