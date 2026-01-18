const { Publisher, Subject } = require("test_swe_common")

// CHILDREN CLASS
class DocumentCreatedPub extends Publisher {
  subject = Subject.DOCUMENT_UPLOADER_CREATED
}

exports.DocumentCreatedPub = DocumentCreatedPub
