const express = require("express");
const router = express.Router();

// ✅ node-fetch for CommonJS
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

router.post("/recommend", async (req, res) => {
  try {
    const response = await fetch("http://127.0.0.1:5001/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "AI service connection failed",
      error: error.toString(),
    });
  }
});

module.exports = router;