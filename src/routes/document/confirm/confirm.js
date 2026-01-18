const express = require("express")
const db = require("mongoose")

// IMPORT LIBRARY AND MODELS
const { Import, BadRequestError, DatabaseConnectionError } = require("test_swe_common")
const Document = Import("Document", "uploader")
const Batch = Import("Batch", "uploader")

// IMPORT SERVICES
const { storage } = require("../../../services/googleStorage")

// IMPORT EVENTS
const { NatsWrapper } = require("../../../services/natsWrapper")
const { DocumentUpdatedPub } = require("../../../events/publishers/documentUpdatedPub")
const { BatchUpdatedPub } = require("../../../events/publishers/batchUpdatedPub")

const router = express.Router()

// @route  POST /api/uploader/document/confirm/:documentId
// @desc   Confirm document is uploaded to GCS and update statuses
// @access Private
router.post("/api/uploader/document/confirm/:documentId", async (req, res) => {
  const { documentId } = req.params
  const { userId, projectId, batchId } = req.body
  let gcsMetadata

  // SIMPLE VALIDATION
  if (!documentId) throw new BadRequestError("documentId missing")
  if (!batchId || !projectId || !userId) throw new BadRequestError("batchId/projectId/userId missing")

  // GET DOCUMENT
  const document = await Document.findOne({ _id: documentId, _project: projectId, _batch: batchId, _user: userId })
  if (!document) throw new BadRequestError("Document not found")
  if (!document?.storage?.key) throw new BadRequestError("Document missing storage.key")

  // GET BATCH
  const batch = await Batch.findOne({ _id: batchId, _project: projectId, _user: userId })
  if (!batch) throw new BadRequestError("Batch not found")

  // CHECK IF FILE EXIST IN GCS
  try {
    const file = storage.bucket(process.env.GOOGLE_STORAGE_BUCKET).file(document.storage.key)
    const [exists] = await file.exists()
    if (!exists) throw new BadRequestError("File not found in bucket yet")
    const [metadata] = await file.getMetadata()
    gcsMetadata = metadata
  } catch (err) {
    throw new BadRequestError(`The verification of the uploaded file failed: ${err?.message || err}`)
  }

  // VERIFICATIONS
  const gcsSize = gcsMetadata?.size ? Number(gcsMetadata.size) : undefined
  const gcsType = gcsMetadata?.contentType
  if (document?.storage?.sizeBytes && gcsSize && gcsSize !== document.storage.sizeBytes) {
    throw new BadRequestError(`Size mismatch (gcs=${gcsSize}, expected=${document.storage.sizeBytes})`)
  }
  if (document?.storage?.contentType && gcsType && gcsType !== document.storage.contentType) {
    throw new BadRequestError(`ContentType mismatch (gcs=${gcsType}, expected=${document.storage.contentType})`)
  }

  // GENERATE TRANSACTION
  const SESSION = await db.startSession()
  try {
    SESSION.startTransaction()

    // UPDATE DOCUMENT STATUS
    await document.set({ uploadStatus: "UPLOADED" }).save()
    await new DocumentUpdatedPub(NatsWrapper).publish(document)

    // IF ALL URLS WERE ISSUED, SWITCH TO FINALIZING
    if (batch.totals.receivedFiles >= batch.totals.expectedFiles) {
      await batch.set({ status: "FINALIZING" }).save()
      await new BatchUpdatedPub(NatsWrapper).publish(batch)
    }

    await SESSION.commitTransaction()
    return res.status(200).json({ success: true, document, batch, gcs: { sizeBytes: gcsSize, contentType: gcsType } })
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
