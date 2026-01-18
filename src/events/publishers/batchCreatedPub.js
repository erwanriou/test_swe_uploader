const { Publisher, Subject } = require("test_swe_common")

// CHILDREN CLASS
class BatchCreatedPub extends Publisher {
  subject = Subject.BATCH_UPLOADER_CREATED
}

exports.BatchCreatedPub = BatchCreatedPub
