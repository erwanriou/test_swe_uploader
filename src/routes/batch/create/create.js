const express = require("express")

// DATABASE AND LIBRARIES
const { Import } = require("test_swe_common")
const Batch = Import("Batch", "uploader")

const router = express.Router()

// @route  GET /api/uploader/batch/create/:projectId
// @desc   Create a batch upload request
// @access Private
router.get("/api/uploader/batch/create/:projectId", async (req, res) => {
  res.status(200).json({ success: true })
})

module.exports = router
