const express = require("express")
const db = require("mongoose")

// DATABASE AND LIBRARIES
const { Import, DatabaseConnectionError } = require("test_swe_common")
const Batch = Import("Batch", "uploader")

// EVENTS
const { NatsWrapper } = require("../../../services/natsWrapper")
const { BatchCreatedPub } = require("../../../events/publishers/batchCreatedPub")

const router = express.Router()

// @route  POST /api/uploader/batch/create/:projectId
// @desc   Create a batch upload request
// @access Private
router.post("/api/uploader/batch/create/:projectId", async (req, res) => {
  // TODO VALIDATION
  const { projectId } = req.params
  const { userId, expectedFiles } = req.body

  // DEFINE FIELDS
  const batchFields = {
    _project: projectId,
    _user: userId,
    totals: { expectedFiles }
  }

  // TRANSACTION
  const SESSION = await db.startSession()
  try {
    SESSION.startTransaction()
    const batch = await new Batch(batchFields).save()
    await new BatchCreatedPub(NatsWrapper).publish(batch)
    await SESSION.commitTransaction()

    res.status(201).json({ success: true, batch })
  } catch (e) {
    // CATCH ANY ERROR DUE TO TRANSACTION
    await SESSION.abortTransaction()
    console.error(e)
    throw new DatabaseConnectionError()
  } finally {
    // FINALIZE SESSION
    SESSION.endSession()
  }
})

module.exports = router
