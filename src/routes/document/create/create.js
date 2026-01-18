const express = require("express")
const db = require("mongoose")
const { nanoid } = require("nanoid")

// IMPORT LIBRARY AND MODELS
const { Import, BadRequestError, DatabaseConnectionError } = require("test_swe_common")
const Document = Import("Document", "uploader")
const Batch = Import("Batch", "uploader")

// IMPORT SERVICES
const { storage } = require("../../../services/googleStorage")

// IMPORT EVENTS
const { NatsWrapper } = require("../../../services/natsWrapper")
const { DocumentCreatedPub } = require("../../../events/publishers/documentCreatedPub")
const { BatchUpdatedPub } = require("../../../events/publishers/batchUpdatedPub")

const router = express.Router()

// @route  POST /api/uploader/document/create/:batchId
// @desc   Create a document upload request
// @access Private
router.post("/api/uploader/document/create/:batchId", async (req, res) => {
  const { batchId } = req.params
  const { projectId, userId, originalPath, fileName, contentType, sizeBytes } = req.body
  let signedUrl

  // SIMPLE VALIDATION
  if (!batchId || !projectId || !userId) throw new BadRequestError("batchId/projectId/userId missing")
  if (!originalPath || !fileName) throw new BadRequestError("originalPath/fileName missing")
  if (!contentType) throw new BadRequestError("contentType missing")

  // GET BATCH VALIDATIONS
  const batch = await Batch.findOne({ _id: batchId, _project: projectId, _user: userId })
  if (!batch) throw new BadRequestError("Batch not found")
  if (batch.totals.receivedFiles >= batch.totals.expectedFiles) throw new BadRequestError("Batch already reached expectedFiles")

  // GENERATE STORAGE KEY
  const safeName = String(fileName).replace(/[^\w.\-]+/g, "_")
  const key = `projects/${projectId}/batches/${batchId}/${nanoid()}-${safeName}`

  // GENERATE DOCUMENT FIELDS
  const documentFields = {
    _project: projectId,
    _batch: batchId,
    _user: userId,
    originalPath,
    fileName,
    storage: { provider: "GCS", key, sizeBytes, contentType },
    uploadStatus: "URL_ISSUED",
    processStatus: "PENDING"
  }

  // GENERATE SIGNED URL
  try {
    const signedUrlOptions = { version: "v4", action: "write", expires: Date.now() + 15 * 60 * 1000, contentType }
    await storage.bucket(process.env.GOOGLE_STORAGE_BUCKET).setCorsConfiguration([
      {
        origin: [`https://${req.headers["host"]}`],
        responseHeader: ["Content-Type", "Access-Control-Allow-Origin", "X-Requested-With", "x-goog-resumable"],
        method: ["PUT", "POST"],
        maxAgeSeconds: 3600
      }
    ])
    signedUrl = await storage.bucket(process.env.GOOGLE_STORAGE_BUCKET).file(key).getSignedUrl(signedUrlOptions)
  } catch (err) {
    throw new BadRequestError(`The creation of the prefetched url failed: ${err}`)
  }

  // GENERATE TRANSACTION
  const SESSION = await db.startSession()
  try {
    SESSION.startTransaction()
    const document = await new Document(documentFields).save()
    await batch.set({ status: "UPLOADING", "totals.receivedFiles": (batch.totals.receivedFiles += 1) }).save()

    await new DocumentCreatedPub(NatsWrapper).publish(document)
    await new BatchUpdatedPub(NatsWrapper).publish(batch)
    await SESSION.commitTransaction()

    return res.status(201).json({ success: true, document, batch, url: signedUrl?.[0] })
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
