const express = require("express")
const db = require("mongoose")

// IMPORT LIBRARY AND MODELS
const { Import, BadRequestError, DatabaseConnectionError } = require("test_swe_common")
const Project = Import("Project", "uploader")

// IMPORT EVENTS
const { NatsWrapper } = require("../../../services/natsWrapper")
const { ProjectCreatedPub } = require("../../../events/publishers/projectCreatedPub")

const router = express.Router()

// @route  POST /api/uploader/project/create
// @desc   Create a project
// @access Private
router.post("/api/uploader/project/create", async (req, res) => {
  const { userId, title } = req.body

  // SIMPLE VALIDATION
  if (!userId) throw new BadRequestError("userId missing")
  if (!title) throw new BadRequestError("title missing")

  // GENERATE PROJECT FIELDS
  const projectFields = { _user: userId, title }

  // GENERATE TRANSACTION
  const SESSION = await db.startSession()
  try {
    SESSION.startTransaction()
    const project = await new Project(projectFields).save()
    await new ProjectCreatedPub(NatsWrapper).publish(project)
    await SESSION.commitTransaction()

    return res.status(201).json({ success: true, project })
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
