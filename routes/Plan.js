// 1. POST /api/auth/register

// Registers a user and activates a 5-day trial plan automatically.

// 🔹 2. GET /api/subscription/current

// Returns the user's current subscription details (plan, status, limits).

// 🔹 3. POST /api/calculate

// Performs a calculation. Enforces limits based on the user's plan.

// 🔹 4. GET /api/subscription/plans

// Lists all available subscription plans, features, and pricing.

// 🔹 5. POST /api/payment/create-order

// Creates a Razorpay order to start a paid subscription (e.g., Pro Monthly).

// 🔹 6. (Frontend only)

// User completes payment using Razorpay checkout popup.

// 🔹 7. POST /api/payment/verify-payment

// Verifies Razorpay payment and activates the paid plan for the user.

// 🔹 8. GET /api/subscription/current

// Check again — now it shows the upgraded subscription.

// 🔹 9. POST /api/calculate

// Same as #3, but now allows more advanced usage after upgrade.

// 🔹 10. GET /api/payment/history

// Returns the user's payment history and subscription invoices.